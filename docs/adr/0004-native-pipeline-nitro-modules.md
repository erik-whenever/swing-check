# ADR-0004 — Native-pipelinen: egna Nitro-moduler för pose, shaft och capture

- **Status:** Antagen
- **Datum:** 2026-10-24 (tillägg samma dag: `capture` och pixelformat, se *Tillägg*)

Numret följer `docs/decisions/` (ADR-002, ADR-003), som delar nummerserie med den här katalogen.

## Kontext
F6 är beslutat: React Native (Expo med dev client och VisionCamera) för iOS och Android, med pose
och skaftinferens i native-moduler och domänlogiken i `@swingcheck/core`. N-2 bekräftade att det
håller (iPhone 16 Pro: pose lite 17,3 ms och full 19,2 ms per ruta, skaftparitet ≤ 0,45 px). N-2
visade också fyra saker som styr hur modulerna ska byggas:

1. **MediaPipe och fast-tflite kan inte länkas in i samma iOS-binär.** Båda bär TFLite:s C-API, och
   EAS-bygget `60a0c910…` gav 54 dubbla `TfLite*`-symboler. Spiken fick byggas i två varianter.
2. **Inget färdigt MediaPipe-paket håller på VisionCamera 5.** Alla är v4-plugins, och den enda som
   höll 30 fps (`react-native-mediapipe-pose-plugin`) är låst till SDK 54 / VC 4.
3. **Spikens JS-förbehandling av skaftrutorna tog 37 ms per ruta.** Letterbox som en JS-loop över
   uint8 i workleten. Den ska göras natively.
4. **fast-tflite tål inte att samma modellinstans körs i både JS-tråden och kameratråden.**
   Pariteten fick en egen instans.

VisionCamera 5 bygger på Nitro: en frame processor-plugin är en Nitro-modul vars spec tar VC:s
`Frame`.

## Beslut
**Två egna Nitro-moduler, `pose` och `shaft`, i `apps/mobile/modules/`. Varje modul har ett enda
TS-gränssnitt (`.nitro.ts`), och samma gränssnitt implementeras i Kotlin och i Swift.** Kotlin skrivs
först, eftersom Android inte kräver Mac. Swift kommer i N-3.8.

- **`pose`** (`PoseDetector`): MediaPipe Pose Landmarker i VIDEO-läge, `lite` eller `full`, valbart
  vid körning. `detect(frame)` ger 33 landmärken i normaliserade, upprätta koordinater, med samma
  fält som cores `NormalizedLandmark`. JS-sidan bygger alltså `PoseSample` utan konvertering.
  Android använder `com.google.mediapipe:tasks-vision` 0.10.35, samma version som webben. 1.x drar in
  `litertlm-android` (cirka 20 MB LLM-runtime) som Pose inte använder.
- **`shaft`** (`ShaftDetector`): `detect(frame)` gör rotation, färgordning och letterbox natively
  och kör modellen. Resultatet är rå utdata `[1, 11, 18900]` plus letterboxen (cores
  `LetterboxTransform`-fält). **Avkodning och NMS stannar i core** (`shaftPostprocess`), så att iOS
  och Android delar dem (G2). Android kör LiteRT 1.4.2 (Interpreter-API:t) med GPU-delegaten, alltså
  samma grafväg som N-2 mätte via fast-tflite. iOS kör Core ML direkt på en `.mlpackage` (N-3.7).
- **Ingen fast-tflite på någon plattform:**
  - iOS: TFLite krockar med MediaPipe (punkt 1).
  - Ett gränssnitt: samma spec och samma resultattyp på båda plattformarna, i stället för
    fast-tflite på Android och en egen modul på iOS.
  - Förbehandlingen görs natively i modulen (punkt 3). fast-tflite tar en färdig tensor.
  - Modulen äger sina instanser. Ingen begränsning till en instans per tråd (punkt 4).
- **Takt:** pose körs live i 30 fps på kameratråden. Core (`liveSwingDetector`, `poseSegments`,
  `poseEnvelope`) matas i 15 fps tills N-4 har omkalibrerat konstanterna för 30 fps (S-49 §6).
  Skaftet körs inte live utan på cirka 26 rutor per sving efter slaget.
- **Rututtaget** görs av en tredje modul, `capture` (se *Tillägg*). Underlaget är
  [rututtag.md](../native/rututtag.md).
- Varje modul har `runtimeInfo()`, som laddar sitt native-bibliotek och namnger det. Det är en
  felsökningskontroll av att runtimen är länkad och går att ladda.

## Alternativ som övervägdes
- **fast-tflite för skaftet, egen modul bara för pose:** ger två TFLite-kopior i iOS-binären
  (punkt 1). Två olika gränssnitt och JS-förbehandling.
- **En gemensam modul för pose och shaft:** kopplar ihop två oberoende livscykler (pose live,
  skaftet i burst efter slaget) och gör att ett native-beroende inte kan bytas utan att det andra
  följer med.
- **Pose-plugin från npm:** inget håller på VC5 (punkt 2), och flera stryper till 15 fps.
- **Avkodning av skaftet natively:** snabbare med några ms, men då finns `shaftPostprocess` i tre
  kopior (TS för webben, Kotlin, Swift), och utslagen kan börja skilja sig mellan plattformarna.
- **LiteRT 2.x (`CompiledModel`) på Android:** ett nyare API, men inte mätt med shaft-v2. Kan prövas
  i N-3.3 om GPU-delegaten i 1.4.2 inte räcker.

## Konsekvenser
- Två native-implementationer per modul. Det är bara förbehandling och inferens; logiken ligger i core.
- Specerna är kontraktet. Ändras en spec körs `npm run specs` (nitrogen) i `apps/mobile`, och
  genererad kod checkas in.
- Android kan inte få samma krock som iOS: MediaPipe bär sin TFLite statiskt i
  `libmediapipe_tasks_jni.so`, LiteRT ligger i `libtensorflowlite_jni.so`, och Java-paketen
  överlappar inte (`com.google.mediapipe` mot `org.tensorflow.lite`). N-3.1 verifierar det med ett
  bygge och genom att ladda båda biblioteken i samma process.
- **Omprövning** om Core ML direkt inte når skaftets paritet på iOS (N-3.7/N-3.8), eller om LiteRT
  GPU inte klarar burst 26 på Android (N-3.3).

## Tillägg 2026-10-24 — `capture`, pixelformat och klockan

Underlagen [pose-android.md](../native/pose-android.md) och [rututtag.md](../native/rututtag.md) skrevs
parallellt och krockade på två punkter: pixelformatet och vem som äger rutornas tid. Det här avgör båda.

### En tredje modul: `capture`
`capture` (`apps/mobile/modules/capture`) äger den hårdvarukodade ringen, klippet vid detektion och
avkodningen av rutorna ur klippet ([rututtag.md](../native/rututtag.md), väg 3). Den har två
HybridObjects i en spec, `Capture` (ring, klocka, klipp) och `FrameExtractor` (rutor ur en MP4 på givna
tider). De delar kodek och livscykel, och extraktorn används också för uppladdning ur Bilder senare. Väg 3:s
grind, värme under en hel session (rututtag.md, risk 1), mäts i N-3.4. Faller den blir det väg 1 (rå ring
i 540p), och modulen och specen står kvar: väg 1 behöver också en kodare för historikvideon.

**Följder för de andra modulerna:**
- **Skaftet matas ur klippet, inte ur kameran.** `FrameExtractor` avkodar rutan och ritar letterboxen
  efter geometrin från cores `computeLetterbox`. `shaft` tar emot den färdiga 960×960-bufferten och kör
  bara modellen. Stubbens `detect(frame: Frame)` byts i N-3.3 mot `detect(input)` på extraktorns buffert,
  och `ShaftFrameResult.letterbox` försvinner, eftersom core redan har geometrin. Avkodning och NMS
  stannar i core som förut.
- **`capture` äger klockan.** `append(frame)` läser rutans native-PTS och returnerar `t`, alltså sekunder
  sedan sessionens första ruta. JS sätter samma `t` på rutans `PoseSample`, eftersom båda anropen görs i
  samma worklet på samma ruta. `pose.detect(frame)` tar ingen tid som argument. Den returnerar
  `frameTimeSec` (kamerans klocka i sekunder) bara för diagnostik (pose-android.md §7, test T).
- **`pose`-specen tas i N-3.2 från [pose-android.md §6](../native/pose-android.md)** och ersätter stubbens.
  Landmärkena kommer som en Float32-`ArrayBuffer` (33 × 4) i stället för 33 objekt, och JS packar upp
  bara de rutor som går till core. `detect` returnerar `status` i stället för att kasta, `configure` tar
  modell och delegat, och `convertMs` mäter konverteringen (nedan). Fälten i landmärkena är fortfarande
  cores `NormalizedLandmark`.

### Pixelformat per plattform
| | Android | iOS |
|---|---|---|
| `useFrameOutput({ pixelFormat })` | `'yuv'` (CameraX `YUV_420_888`) | `'rgb'` (VC5 ger `kCVPixelFormatType_32BGRA`; VC5 har inget `'bgra'`-värde) |
| Kodaren i `capture` | `MediaCodec`, YUV-planen kopieras till `getInputImage()` (`YUV420Flexible`) | `VTCompressionSession` tar BGRA och konverterar själv till 4:2:0 |
| `pose` | Skalar ned, roterar och konverterar natively till upprätt RGBA i 720×1280 (libyuv) → `ByteBufferImageBuilder(…, IMAGE_FORMAT_RGBA)` | `MPImage` direkt på rutans `CVPixelBuffer` (BGRA) |
| `shaft` | Rutor ur MP4:n (`FrameExtractor`), inte ur kameran | Samma; Core ML `ImageType` tar BGRA |

Skäl, prövat mot källorna:
- **MediaPipe på Android tar inte YUV.** `AndroidPacketCreator.createImage` godtar `android.media.Image`
  bara i RGBA_8888, `Bitmap` bara i ARGB_8888 och `ByteBuffer` i RGBA, RGB eller ALPHA. Med `'yuv'` går det
  alltså inte att slå in `ImageProxy.image` direkt, som pose-android.md §2 gjorde med `'rgb'`. Modulen gör
  konverteringen själv och lämnar en `ByteBuffer`.
- **En Android-kodare vill ha YUV.** `MediaCodec` tar `YUV420Flexible` eller en `Surface`, inte RGBA. Med
  `'rgb'` hade kodaren behövt en konvertering tillbaka till YUV i full upplösning per ruta.
- **Konverteringen blir billigare i pose-modulen än i CameraX.** CameraX konverterar hela 1080p-rutan till
  RGBA. Pose-modulen konverterar till 720×1280, samma upplösning som webben matar MediaPipe med
  (`useCamera.ts`: `ideal 1280×720`). Det är också bättre för pariteten mot webbens trösklar. VC5:s egna
  dokument säger att `'rgb'` drar cirka 2,6 gånger mer bandbredd än `'yuv'`.
- **Rotationen görs i samma pass.** `enablePhysicalBufferRotation` stängs av på Android. Kodaren får
  sensorns orientering och skriver den i MP4:n (`MediaMuxer.setOrientationHint`), och pose-modulen roterar
  den nedskalade rutan med libyuv. MediaPipe ser då en upprätt bild, och pose-android.md:s osäkra reservväg
  via `ImageProcessingOptions.setRotationDegrees` behövs inte.
- **iOS behåller BGRA.** MediaPipe Tasks för iOS kräver `kCVPixelFormatType_32BGRA` för `MPImage` ur en
  pixelbuffert eller ett sample buffer, och Core ML tar BGRA till en RGB-`ImageType`. Konverteringen
  hamnar i VideoToolbox, som inte kan ta nollkopian av 4:2:0 som rututtag.md räknade med.

// OSÄKER: konverteringens kostnad på Android (YUV → nedskalad, roterad RGBA) är inte mätt. Den ligger på
kameratråden före inferensen. Uppskattningsvis några ms på Galaxy A16 4G (Helio G99). Den mäts i N-3.2 som
eget fält (`convertMs`). libyuv finns inte i NDK:ns publika API: modulen bygger in den (BSD-3) via CMake.
Paketeringen avgörs i N-3.2.
// OSÄKER: kostnaden för VideoToolboxs BGRA → 4:2:0 ovanpå pose under en hel session är inte mätt på
iPhone. Den hör till väg 3:s värmegrind i N-3.4. Om den syns, kan iOS köra `'yuv'` till kodaren och
konvertera till BGRA för MediaPipe i pose-modulen, alltså samma mönster som Android.

### Specen för `capture`
Kontraktet för N-3.4 (Kotlin först, Swift i N-3.8). Det ersätter förslaget i rututtag.md.

```ts
// apps/mobile/modules/capture/src/specs/Capture.nitro.ts
import type { HybridObject } from 'react-native-nitro-modules'
import type { Frame } from 'react-native-vision-camera'

export type VideoCodec = 'hevc' | 'h264'

export interface CaptureConfig {
  /** iOS 'hevc', Android 'h264' (HEVC-kodare saknas på en del enheter). */
  codec: VideoCodec
  /** 10e6 för HEVC, 14e6 för H.264, nära iPhone-kamerans egna, som träningsdatat kom ur. */
  bitrateBps: number
  /** 0,5: styr hur långt före en vald tidpunkt avkodningen måste börja. */
  keyframeIntervalSec: number
  /** 12: minst 5,6 s behövs (rututtag.md). Marginalen kostar ~1,5 MB/s. */
  retentionSec: number
  /** Katalog för svingfiler: appens dokumentkatalog, inte cache, eftersom det är historiken. */
  clipDirectory: string
}

export interface CaptureStats {
  running: boolean
  /** UPPRÄTT storlek efter rotation, som planCrop och computeLetterbox räknar mot. */
  width: number
  height: number
  framesIn: number
  /** Rutor kodaren inte hann ta emot (mottryck). Ska vara 0. */
  framesDropped: number
  ringStartSec: number
  ringEndSec: number
  ringBytes: number
  appendMsP95: number
}

export interface SwingClip {
  path: string
  /** Sessionstid för filens första ruta (nyckelrutan ≤ begärd start). */
  startSec: number
  endSec: number
  /** Sessionstid för varje ruta i filen, i avkodningsordning. Facit för ruta ↔ tid. */
  frameTimesSec: number[]
  truncatedStart: boolean
  truncatedEnd: boolean
  bytes: number
}

export interface Capture extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  start(config: CaptureConfig): void
  /**
   * Anropas i frame-workleten för VARJE ruta, före pose. Läser rutans native-PTS, lämnar bufferten
   * till kodaren och returnerar t = sekunder sedan sessionens första ruta. Samma t sätts på rutans
   * PoseSample. Blockerar aldrig på kodaren: vid mottryck räknas rutan i framesDropped, och t
   * returneras ändå. Kastar aldrig per ruta.
   */
  append(frame: Frame): number
  stop(): void
  readonly stats: CaptureStats
  /** Skriv [startSec, endSec] som MP4 (remux, ingen omkodning). Anropas VID DETEKTION. */
  cutWindow(startSec: number, endSec: number, maxWaitSec: number): Promise<SwingClip>
}

/** Källrektangel i UPPRÄTTA pixlar: planCrop(...).rect. */
export interface CropRect { x: number; y: number; width: number; height: number }

export interface VisionOutput {
  /** Saknas → hela rutan. */
  crop?: CropRect
  outputWidth: number
  outputHeight: number
  jpegQuality: number
}

/** computeLetterbox(width, height, 960) + PAD_VALUE. Geometrin räknas i core, inte natively. */
export interface ShaftOutput {
  size: number
  drawWidth: number
  drawHeight: number
  padX: number
  padY: number
  padValue: number
}

export interface ExtractRequest {
  path: string
  /** SwingClip.frameTimesSec. Saknas (uppladdad fil) → filens egna PTS används. */
  frameTimesSec?: number[]
  /** Sessionstider att ta ut. Närmaste ruta väljs. */
  timesSec: number[]
  vision?: VisionOutput
  shaft?: ShaftOutput
}

/** Plattformens modellformat: Android RGB (LiteRT), iOS BGRA (Core ML ImageType via CVPixelBuffer). */
export type ShaftPixelLayout = 'rgb' | 'bgra'

export interface ExtractedFrame {
  requestedSec: number
  /** Den faktiska rutans tid. |frameSec − requestedSec| ≤ en halv ruta. */
  frameSec: number
  /** Ren base64-JPEG, satt när vision begärts. */
  visionJpegBase64?: string
  /** uint8, HWC, size×size, upprätt, letterboxad. Satt när shaft begärts. Går till shaft.detect. */
  shaftPixels?: ArrayBuffer
  shaftPixelLayout?: ShaftPixelLayout
}

export interface FrameExtractor extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  /** Sekventiell avkodning från nyckelrutan före den första tiden. Rör aldrig ringen. */
  extract(request: ExtractRequest): Promise<ExtractedFrame[]>
}
```

Ändrat mot rututtag.md:s förslag:
- `pose.detect(frame, t)` blir `pose.detect(frame)`, och `t` kommer från `append` (se ovan).
- `shaftRgb` blir `shaftPixels` + `shaftPixelLayout`, så att iOS kan ge Core ML BGRA utan en extra
  konvertering.

// OSÄKER: att en `ArrayBuffer` från `capture` kan gå till `shaft` utan kopia bygger på Nitros
ArrayBuffer-ägarskap och är inte prövat. En kopia kostar 2,8–3,7 MB per ruta och är acceptabel för 26 rutor.
