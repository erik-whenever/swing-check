# Pose-modulen på Android (förberedelse för N-3.2)

**Status:** underlag, 2026-10-24. Ingen kod är skriven. Ström N, branch `stream-native-pose`.
**Fråga:** hur bygger vi en egen Nitro-modul för MediaPipe Pose (Tasks Vision, Kotlin) som körs i
VisionCamera 5:s frame processor i 30 fps och ger utdata som exakt matchar `PoseSample`?

## Antaganden (tagna utan att fråga, eftersom Erik sov)

1. **Stacken är den som N-3.1 låser:** Expo SDK 58, VisionCamera **5.2.3** (senaste på npm 2026-10-24),
   Nitro **0.37.1**, `react-native-vision-camera-worklets` 5.2.3 och `react-native-worklets`. Läst ur
   källan i npm-paketen, inte bara ur dokumenten.
2. **Bakre kameran och ett stativ.** Främre kameran används inte för att filma svingen. Modulen hanterar
   ändå spegling (se §2), så att ett senare val inte bryter koordinaterna.
3. **Rututtaget (`docs/native/rututtag.md`) skrivs parallellt och finns inte i min worktree.** Jag antar att
   det använder samma klocka som rutorna från VisionCamera, alltså `Frame.timestamp`. §3 definierar den
   klockan så att rututtaget kan ansluta sig till den. Om rututtaget väljer en annan klocka måste en av
   filerna ändras.
4. **Telefonen är okänd.** Ingen Android-modell nämns i repot. Mätplanen (§7) kräver att modellen och
   SoC:en loggas.
5. **MediaPipe `tasks-vision` 0.10.35**, samma version som webbens `@mediapipe/tasks-vision` ^0.10.35.
   1.1.1 finns på Maven (2026-10-14), men den är yngre än två veckor och drar in `litertlm-android` 0.18.0.

## Kort svar

| Fråga | Val |
|---|---|
| Rutobjekt | `HybridFrameSpec` castas till `NativeFrame`, och `.image` ger en CameraX `ImageProxy`. Anropet sker synkront på den entrådiga executorn `com.margelo.camera.frame`. Bufferten lever tills JS anropar `frame.dispose()`. |
| Format | `pixelFormat: 'rgb'` ger RGBA_8888. `ImageProxy.image` går till `MediaImageBuilder`, utan egen kopia. YUV och `'native'` (HardwareBuffer) avvisas av MediaPipe på Android. |
| Rotation | `enablePhysicalBufferRotation: true`, så att CameraX ger en upprätt buffert och landmarks hamnar direkt i webbens koordinatsystem. Reservväg: `ImageProcessingOptions` med egen tillbakaräkning. |
| Läge | **VIDEO**, synkront. Tidsstämpeln i MediaPipe kommer från `ImageInfo.timestamp` (ns) och tvingas vara strikt växande. |
| Delegat/modell | Konfigureras från JS och byggs lazy vid första `detect()` på kameratråden. GPU med reserv till CPU. Både lite och full följer med i dev-bygget. Valet görs efter mätningen. |
| Tillbaka till JS | En Nitro-struct med en `ArrayBuffer` på Float32 33×4 (528 byte). Ingen JSON och inga 33 objekt per ruta. |
| 15 fps | Pose körs på varje ruta (30 fps). Decimeringen till 15 fps görs **i JS**, tidsbaserat, innan core. |

---

## 1. VisionCamera 5:s frame processor-API på Android

**Källa:** `react-native-vision-camera@5.2.3` (npm, 2026-08-20), filerna nedan. Guiden
[Native Frame Processor Plugins](https://visioncamera.margelo.com/docs/guides/frame-processors-plugins-overview)
säger samma sak.

- **Pluginet är en vanlig Nitro HybridObject.** Spec:en tar `Frame` från `react-native-vision-camera` som
  parameter. I Kotlin kommer den som `HybridFrameSpec`, och `(frame as NativeFrame).image` ger en
  `androidx.camera.core.ImageProxy` (`android/.../public/NativeFrame.kt`). På iOS castas den till
  `any NativeFrame` och ger `sampleBuffer: CMSampleBuffer`. Gradle behöver
  `implementation project(":react-native-vision-camera")`, och CMake behöver
  `find_package(react-native-vision-camera)`. Podspec behöver `s.dependency 'VisionCamera'`.
- **Tråd.** `useFrameOutput({ onFrame })` kör workleten på `frameOutput.thread`. På Android är det en
  `IdentifiableExecutor("com.margelo.camera.frame")`, det vill säga `Executors.newSingleThreadExecutor`
  (`utils/IdentifiableExecutor.kt`). Vårt `detect(frame)` anropas synkront från workleten och körs alltså
  på **den tråden, en ruta i taget**. Samma executor är också CameraX:s `setBackgroundExecutor`
  (`HybridFrameOutput.kt`). Konverteringen YUV→RGBA och rotationen ligger därför på samma tråd som
  inferensen, och **alla tre delar på 33 ms**.
- **Livslängd.** `HybridFrame.dispose()` anropar `image.close()`. Bufferten gäller alltså från `onFrame` tills
  JS anropar `frame.dispose()`. `detect()` får inte spara `ImageProxy`, `Image` eller `MPImage` efter att
  den har returnerat. Eftersom VIDEO-läget är synkront behövs det heller inte.
  `useFrameOutput` dokumenterar att `dispose()` ska anropas så snart rutan inte behövs, annars stannar
  kedjan.
- **Mottryck.** `dropFramesWhileBusy: true` (standard) ger `STRATEGY_KEEP_ONLY_LATEST`. En långsam ruta gör
  att nästa ruta skrivs över, utan kö. **`onFrameDropped` är inte implementerad på Android**
  (`setOnFrameDroppedCallback` är en TODO i 5.2.3). Tappade rutor måste därför räknas från luckor i
  tidsstämplarna, som spiken gör (`apps/spike/src/stats.ts`, `droppedFrames`).
- **Kända problem som rör oss:**
  - [#4213](https://github.com/margelo/react-native-vision-camera/issues/4213) (öppen): varje `FrameOutput`
    läcker sin tråd. Fixen [#4227](https://github.com/margelo/react-native-vision-camera/pull/4227) låter
    tråden **avslutas efter 5 s utan rutor**. En GPU-landmarker är bunden till den tråd som skapade den.
    **Modulen måste därför spara skapartråden och bygga om landmarkern om `detect()` anropas från en ny
    tråd.** Annars kraschar GPU-vägen efter en paus eller ett kamerabyte.
  - [#4096](https://github.com/margelo/react-native-vision-camera/issues/4096) (öppen):
    `CameraOrientation.fromDegrees` har LEFT och RIGHT omkastade på Android, och underhållaren skriver
    att orienteringen ska skrivas om. **Modulen läser därför `imageProxy.imageInfo.rotationDegrees` direkt
    och litar inte på `frame.orientation`.**
  - [#4219](https://github.com/margelo/react-native-vision-camera/issues/4219) (öppen, iOS): ett undantag i
    frame-callbacken dödar processen. `detect()` ska därför **aldrig kasta per ruta**, utan returnera
    `status: 'error'`. Kasta bara vid felaktig konfiguration.
- **Tidsstämpelns enhet skiljer sig mellan plattformarna.** Android `HybridFrame.timestamp` =
  `image.imageInfo.timestamp` i **nanosekunder**. iOS `HybridFrame.timestamp` = `metadata.timestamp.seconds`
  i **sekunder**. Modulen normaliserar till sekunder (§3), så att JS aldrig behöver känna till plattformen.

// OSÄKER: att anropa en Nitro HybridObject från VC5-workleten är dokumenterat (guidens exempel
fångar `plugin` direkt i `onFrame`). Om `react-native-worklets` kräver `NitroModules.box()` för att föra
över objektet till kamerans runtime avgörs i N-3.1-skelettet. Risken är liten, eftersom det bara är en
rad i JS.

## 2. Rutan till MPImage utan onödig kopiering

**Vad MediaPipe på Android tar emot** (källa: `AndroidPacketCreator.createImage`,
[mediapipe master](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/java/com/google/mediapipe/framework/AndroidPacketCreator.java)):
bitmap (ARGB_8888), ByteBuffer (RGBA, RGB, ALPHA) och `android.media.Image` **endast i RGBA_8888**
(`"Android media image must use RGBA_8888 config."`). YUV avvisas. Ingen HardwareBuffer- eller
texturväg finns i Tasks-API:t.

**Val: `pixelFormat: 'rgb'` och `MediaImageBuilder(imageProxy.image).build()`.**
- VC5 översätter `'rgb'` till `ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888` (`HybridFrameOutput.kt`).
  CameraX gör YUV→RGBA i libyuv, en gång per ruta. Det är den enda konverteringen vi betalar för.
- `MediaImageBuilder` slår bara in `Image` i en container utan att läsa pixlarna (`MediaImageBuilder.java`).
  `imageProxy.image` kräver `@OptIn(ExperimentalGetImage::class)`.
- **YUV avstås från.** Att konvertera själv till RGBA kostar samma pass, fast i vår kod. VC5:s egna
  dokument säger att LiteRT ändå konverterar YUV till RGB internt.
- **`'native'` (PRIVATE/HardwareBuffer) avstås från.** MediaPipe Tasks kan inte ta emot den, och
  `getPixelBuffer()` kastar på PRIVATE ([#4207](https://github.com/margelo/react-native-vision-camera/issues/4207)).

// OSÄKER: `createImage` för MEDIA_IMAGE gör sannolikt en kopia in i MediaPipes `ImageFrame`, plus en
uppladdning till GPU med GPU-delegaten. Vid 1920×1080 är det 8,3 MB per ruta. Vi kan inte undvika den
utan att gå förbi Tasks-API:t. **Upplösningen är därför den viktigaste ratten.** Pose-modellen tar
256×256, så 1280×720 räcker för pose. Upplösningen delas dock med skaftet (shaft-v2 tar 960×960, eftersom
18 900 ankare = 120² + 60² + 30²) och med rututtaget, så valet görs i N-3.4. Mät pose i både 1280×720 och
1920×1080 (§7).

**Rotation: `enablePhysicalBufferRotation: true` (huvudväg).**
- Webben matar MediaPipe med `<video>`-elementets avkodade ruta, som alltid är upprätt och aldrig
  speglad (CSS-spegling påverkar inte pixlarna). Landmarks är normaliserade mot den bildens bredd och höjd.
- Med fysisk rotation sätter VC5 `setOutputImageRotationEnabled(true)`, och CameraX levererar en upprätt
  buffert. Då är `rotationDegrees` 0, och MediaPipes utdata är redan i webbens koordinatsystem. Ingen
  egen matematik behövs, BlazePose-detektorn ser en upprätt person, och iOS kan göra exakt samma sak.
  VC5 tillåter inte detta ihop med `'native'`, men det spelar ingen roll för oss.
- Kostnaden är ett extra CPU-pass i CameraX på samma tråd (§1). Den mäts (§7).

**Reservväg om rotationen kostar för mycket (> ~3 ms vid vald upplösning):** `enablePhysicalBufferRotation:
false`. Modulen läser då `rotationDegrees` och skickar
`ImageProcessingOptions.builder().setRotationDegrees(r)` (PoseLandmarker godtar rotation men inte ROI,
enligt `PoseLandmarker.java`). Därefter räknas punkterna om till den upprätta bilden. Med `r` = den
medurs vridning som gör bufferten upprätt (CameraX-definitionen):

| r | x′ | y′ |
|---|---|---|
| 0 | x | y |
| 90 | 1 − y | x |
| 180 | 1 − x | 1 − y |
| 270 | y | 1 − x |

Därefter speglas x om `isMirrored`: x″ = 1 − x′. Spikens `x: lm.y, y: 1 - lm.x` är fallet 270.
`z` roteras inte, eftersom core inte läser `z` (grep i `packages/core`).

// OSÄKER: Det är inte dokumenterat om MediaPipe Tasks returnerar landmarks i den roterade eller den
oroterade bildens koordinater när `setRotationDegrees` används. Javadoc säger ingenting om det, och jag
hittade inget issue. Googles egna Android-exempel roterar bitmappen själva i stället. Därför är det
reservvägen, och tabellen ovan gäller bara om utdata ligger i buffertens (oroterade) koordinater.
Det avgörs på telefonen (§7, test O).

**Spegling.** På Android sätter VC5 `isMirrored = (mirrorMode == ON)`, och ImageAnalysis speglar aldrig
bufferten. Med bakre kameran och `AUTO` är `isMirrored` alltså falskt. Modulen speglar ändå tillbaka
x när flaggan är satt. Utdata gäller alltid den ospeglade bilden, liksom på webben. Vänster och höger i
MediaPipes landmarkindex (15 = vänster handled, 16 = höger) följer då samma konvention som på webben.

## 3. VIDEO eller LIVE_STREAM

**Val: VIDEO (`detectForVideo`, synkront).** Webben (`poseDetector.ts`, `livePoseLoop.ts`) och spiken
(`PoseLandmarkerFrameProcessorPlugin.kt`) använder också VIDEO.

- **LIVE_STREAM är asynkront.** Resultatet kommer i en lyssnare på MediaPipes tråd, efter att `detectAsync`
  har returnerat. Då måste `ImageProxy` hållas öppen över trådgränsen (bufferten kan inte släppas vid
  `dispose()`), och resultatet måste föras tillbaka till rätt ruta i JS. LIVE_STREAM tappar dessutom
  rutor tyst när grafen är upptagen, så "tappade rutor" i mätningen skulle bli tvetydigt.
- **VIDEO passar VC5:s modell exakt.** Ett anrop per ruta på kameratråden, resultatet i samma anrop,
  `dispose()` direkt efter. Mottrycket sköts av `KEEP_ONLY_LATEST`. Vid 17–20 ms per ruta (iPhone 16 Pro)
  finns 13–16 ms marginal till 33 ms. På Android avgörs det i §7.
- **Spårningen fungerar likadant.** I både VIDEO och LIVE_STREAM använder Pose Landmarker spårning mellan
  rutor och kör bara detektorn när personen tappas
  ([Android-guiden](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/android)).

**Tidsstämplar (ett kontrakt som rututtaget ansluter sig till):**
- **Kameraklockan** = `imageProxy.imageInfo.timestamp` (ns) på Android och `CMSampleBuffer`:s
  presentationstid (s) på iOS. Modulen returnerar den som `frameTimeSec: number` i **sekunder** på båda.
  En double rymmer ns-värden exakt upp till 2^53 ns ≈ 104 dygn sedan uppstart. Precisionen räcker.
- **`PoseSample.t` sätts i JS:** `t = frameTimeSec − originSec`. `originSec` ägs av fångstkedjan (N-3.4),
  till exempel den första rutan i sessionen eller inspelningsstarten. Det är samma princip som webbens
  `startedAt`, som gör "t = 34,2" till samma ögonblick i landmark-ringen och i videoringen
  (`livePoseLoop.ts`). Pose-modulen väljer inget origo.
- **MediaPipe-tidsstämpeln** = `round(ns / 1e6)` ms. Om den inte är större än förra, sätts den till
  förra + 1, som i spiken och webben. Om den går **bakåt** med mer än 1 s (ny session, ny tidsbas) byggs
  landmarkern om i stället för att skjuta fram den i all oändlighet. Den interna ms-stämpeln lämnar aldrig
  modulen, och `t` bygger alltid på kamerans egen tid.

// OSÄKER: CameraX dokumenterar inte vilken klocka `ImageInfo.getTimestamp()` använder. Camera2 säger att
sensorns tidsstämplar följer `SENSOR_INFO_TIMESTAMP_SOURCE`: REALTIME (`elapsedRealtimeNanos`) eller
UNKNOWN (≈ `uptime`, stannar i djupsömn). De är monotona och jämförbara mellan strömmar från samma
kamerainstans ([AOSP: Camera timestamping docs](https://android.googlesource.com/platform/frameworks/base/+/1ce3c167c5a3%5E%21/)).
**Det räcker om rututtaget också använder `Frame.timestamp`.** Om rututtaget i stället läser ur en
inspelad videofil (CameraX `Recorder`), är filens PTS relativa till inspelningsstarten, och
kopplingen till sensorklockan måste mätas på telefonen (§7, test T). Logga `SENSOR_INFO_TIMESTAMP_SOURCE`
per telefon.

## 4. Delegat, modell och var `.task` ligger

**Konfiguration från JS, bygge på kameratråden.** `configure({ model, delegate })` sparar bara valet.
Landmarkern skapas lazy vid första `detect()`, alltså på `com.margelo.camera.frame`. GPU-delegaten är
trådbunden, vilket spikens Kotlin-plugin dokumenterar och Googles exempel följer. Ombyggnad sker när
(a) konfigurationen ändras, (b) tråden byts (#4213/#4227, §1) eller (c) tidsbasen går bakåt (§3).
Bygget tar sannolikt 100–500 ms (shaderkompilering för GPU). Det loggas och räknas inte i ms/ruta.

**Delegat: GPU, med CPU som reserv om bygget kastar** (vissa Mali- och äldre Adreno-kretsar). Det är
spikens mönster. Det valda delegatet returneras i varje resultat, så att mätningen vet vad den mätte.
// OSÄKER: på Android är det inte självklart att GPU vinner för `lite`. Uppladdningen av RGBA-rutan till
GPU kostar, och XNNPACK på CPU är snabb för små modeller. Mät båda (§7) och välj ett standardval per
mätning. Gör ingen allowlist per telefon innan data finns.

**Modell: lite och full följer med i dev-bygget, och valet görs vid `configure`.** N-2 visade att båda
klarar 30 fps på iPhone och att valet avgörs av noggrannhet, inte tid. Webbens trösklar
(`poseEnvelope`, `poseSegments`) är kalibrerade mot **lite**, så **lite är standard** tills N-4
kalibrerar om. Konfidensgränserna lämnas på MediaPipes standardvärde 0,5/0,5/0,5, som webben
(`poseDetector.ts` sätter inga). Spikens plugin satte 0,3, vilket hade gett andra missar än webben.
`numPoses = 1`.

**Var filen ligger:**
- I **modulens** `android/src/main/assets/pose_landmarker_{lite,full}.task`. AAR-assets slås ihop med
  appens, så modulen blir självbärande. Filerna är gitignorerade och hämtas av ett skript med
  sha256-kontroll. Spikens tabell (`apps/spike/plugins/withPoseLandmarker.js`, `MODELS`) återanvänds:
  lite `59929e1d…574a` är byte-identisk med webbens fil. Läses med
  `BaseOptions.setModelAssetPath("pose_landmarker_lite.task")`.
- `.task` måste lagras **okomprimerad** i APK:n, så att MediaPipe kan minnesmappa den. Spiken satte
  `androidResources { noCompress += "task" }` i appens `build.gradle`.
  // OSÄKER: om `noCompress` i ett bibliotek respekteras när appen paketeras. Om inte, behåller modulens
  Expo-konfigplugin raden i appen. Alternativet är att läsa assetet till en direkt `ByteBuffer` och
  använda `setModelAssetBuffer` (fungerar även komprimerat, men kostar 5–9 MB heap).
- **Webbens nedladdningsskript (`scripts/download-pose-model.mjs`) hämtar `…/float16/latest/…`**, medan
  spiken låser `…/float16/1/…` och kontrollerar sha256. Om Google byter `latest`, får webben och appen
  olika modeller tyst. Det ska rättas i en egen uppgift, inte här (rör inte kod). Flaggas för
  BACKLOG.

**Gradle:** `implementation 'com.google.mediapipe:tasks-vision:0.10.35'`, låst och samma version som
webbens npm-paket. Spiken körde 0.10.29.
// OSÄKER: MediaPipes `.so` bär en egen statiskt länkad TFLite, och skaftmodulen tar in LiteRT. På
Android ligger de i separata `.so` och laddas var för sig, så iOS-krocken (54 dubbla `TfLite*`) uppstår
inte vid länkningen. N-3.1 kontrollerar uttryckligen att båda laddas vid körning. R8-/ProGuard-regler
för MediaPipe kontrolleras i första release-bygget (N-6).

## 5. Tillbaka till JS: 33 landmarks och visibility

**En Nitro-struct per ruta, med landmarks i en `ArrayBuffer`** (Float32, 33 × [x, y, z, visibility] =
132 tal = 528 byte):
- Kotlin: `ArrayBuffer.allocate(528)` ger en ägande buffert (Nitro 0.37.1, `ArrayBuffer.kt`). Fyll
  `getBuffer(false).order(nativeOrder()).asFloatBuffer()` direkt från `NormalizedLandmark`. Ingen boxning,
  ingen `Map<String, Any>`, ingen `Double`-konvertering. VC4-pluginets `List<Map>` tvingade fram båda.
- JS: `new Float32Array(result.landmarks)` och sedan 33 `{ x, y, z, visibility }`, **bara för rutor som
  går till core**.
- **`visibility` saknas ibland** (`Optional<Float>` i Java). Skriv 0 i så fall.
  `NormalizedLandmark.visibility` är `number` (obligatorisk) i `packages/core/src/lib/poseSample.ts`.
  // OSÄKER: att webben ger 0 och inte `undefined` när värdet saknas. För pose-modellen är visibility
  alltid satt i praktiken, men kontrollera det i paritetstestet (§7, test P).
- Koordinaterna klipps **inte** till [0, 1]. MediaPipe ger värden utanför bilden, och webben skickar dem
  vidare oförändrade.
- Ingen pose ger `status: 'no-pose'`, och JS bygger `landmarks: []`. Det är exakt webbens
  `result.landmarks?.[0] ?? []`.
- 528 byte per ruta i 30 fps är ~16 kB/s. Om allokeringen ändå syns i profilen, kan en variant skriva
  in i en buffert som JS äger (`detectInto(frame, out: ArrayBuffer)`). Det är säkert eftersom anropet är
  synkront på samma tråd. Det görs inte förrän det behövs.

**Decimeringen till 15 fps görs i JS, inte i modulen.**
- Modulen ska vara dum: ett anrop ger en inferens. Om en ruta ska poseas avgörs av den som anropar.
  Då kan cadence ändras (30 → 15 → vakt-5 som webbens `livePoseLoop`) utan att Kotlin och Swift ändras,
  och N-4 (30 fps-omkalibrering) tar bara bort ett filter i JS.
- **Grinden och N-4 kräver pose på varje ruta (30 fps).** Spårningen i VIDEO-läget blir också bättre
  med täta rutor.
- Filtret är **tidsbaserat**, inte "varannan ruta": behåll ett sampel om `t − senast ≥ 1/15 − en halv
  ruta`. Samma tanke som webbens slack i `livePoseLoop.tick`. Android-rutor kommer med jitter, och en
  tappad ruta får inte förskjuta takten.
- Bara de behållna samplen packas upp till objekt och förs över till core.

// OSÄKER: core:s trösklar är mätta på webbens 15 fps-samplade **VIDEO-ström matad i 15 fps**. Här matas
landmarkern med 30 fps och vartannat sampel behålls. MediaPipes spårning och utjämning mellan rutor kan
då ge något annorlunda punkter än webben. Risken är liten (samma modell, tätare spårning), och N-4
kalibrerar om för 30 fps. Om svingdetektionen i N-3.4 skiljer sig från webben på samma sving, är det
första stället att titta. Motåtgärden är att bara anropa `detect` i 15 fps från JS, utan ändring i
modulen.

// OSÄKER: om core körs i kamerans worklet-runtime eller på JS-tråden (sampel överförs med
`scheduleOnRN`, 15 st/s med 33 objekt) beslutas i N-3.4. Båda är billiga i den takten.

## 6. Förslag: `pose.nitro.ts`

Samma spec implementeras i Kotlin nu och i Swift (N-3.8) senare utan ändring. Inget i den är
Android-specifikt: tiden är i sekunder och koordinaterna är upprätta och ospeglade på båda plattformarna.

```ts
// packages/…/pose/src/specs/pose.nitro.ts (sökvägen beslutas i N-3.1)
import type { HybridObject } from 'react-native-nitro-modules';
import type { Frame } from 'react-native-vision-camera';

export type PoseModel = 'lite' | 'full';
export type PoseDelegate = 'gpu' | 'cpu';
export type PoseStatus = 'ok' | 'no-pose' | 'error';

export interface PoseConfig {
  model: PoseModel;
  /** Önskat delegat. 'gpu' faller tillbaka till 'cpu' om bygget misslyckas. */
  delegate: PoseDelegate;
}

export interface PoseResult {
  status: PoseStatus;
  /**
   * Rutans tid på kameraklockan, i SEKUNDER på båda plattformarna
   * (Android: ImageInfo.timestamp ns / 1e9, iOS: CMSampleBuffer-PTS).
   * PoseSample.t = frameTimeSec − origin, där origin ägs av fångstkedjan.
   */
  frameTimeSec: number;
  /**
   * Float32 × 132: [x, y, z, visibility] för MediaPipes 33 landmarks i indexordning.
   * x, y normaliserade mot den UPPRÄTTA, OSPEGLADE bilden (samma som webbens <video>).
   * Alltid 528 byte. Innehållet är odefinierat om status !== 'ok'.
   */
  landmarks: ArrayBuffer;
  /** Ren detectForVideo-tid, ms. */
  inferenceMs: number;
  /** Hela detect() inkl. MPImage-inslagning och packning, ms. */
  totalMs: number;
  /** Delegatet som faktiskt kördes. */
  delegate: PoseDelegate;
  /** Bufferns rotation (0/90/180/270) innan modulen kompenserade. 0 när fysisk rotation är på. */
  rotationDegrees: number;
}

export interface PoseLandmarker
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  /** Sparar valet. Landmarkern byggs vid nästa detect(), på kameratråden. */
  configure(config: PoseConfig): void;
  /**
   * En inferens på rutan, synkront. Kastar ALDRIG per ruta, utan returnerar status 'error'.
   * Kastar bara om configure() inte har anropats. Rutan ägs av den som anropar (dispose efteråt).
   */
  detect(frame: Frame): PoseResult;
  /** Antal ombyggnader (config, trådbyte, tidsbas bakåt) — diagnostik för mätningen. */
  readonly rebuilds: number;
  /** Släpper landmarkern. Nästa detect() bygger om. */
  reset(): void;
}
```

Användning i JS (skiss):

```ts
const pose = NitroModules.createHybridObject<PoseLandmarker>('PoseLandmarker');
pose.configure({ model: 'lite', delegate: 'gpu' });

const frameOutput = useFrameOutput({
  pixelFormat: 'rgb',
  enablePhysicalBufferRotation: true,
  targetResolution: { width: 1280, height: 720 }, // beslutas i N-3.4, se §2
  onFrame(frame) {
    'worklet';
    const r = pose.detect(frame);
    frame.dispose();
    // decimering till 15 fps + Float32Array → PoseSample här (§5)
  },
});
```

`frame.dispose()` anropas direkt efter `detect`, eftersom landmarks redan är kopierade till
`ArrayBuffer`. När skaftmodulen ska ta samma ruta (26 rutor efter slaget, N-3.4), flyttas `dispose()`
till efter båda.

## 7. Vad som bara kan avgöras på telefonen, och mätplanen för N-2-grinden

**Avgörs bara på telefonen:**
1. ms/ruta för lite/full × GPU/CPU, och vilket delegat som vinner.
2. Kostnaden för CameraX RGBA-konvertering + fysisk rotation. Den syns inte i `detect()` utan bara i
   uppnådd fps och tappade rutor, eftersom den ligger på samma tråd före `onFrame` (§1).
3. Om fysisk rotation och `MediaImageBuilder` faktiskt ger upprätta koordinater (test O).
4. Thermal över 3 min, och om GPU-bygget fungerar på just den kretsen.
5. Kameraklockans källa (`SENSOR_INFO_TIMESTAMP_SOURCE`) och, om rututtaget läser ur en fil,
   förhållandet mellan rutans tidsstämpel och videons PTS (test T).

**Bygget:** dev-skärmen från N-3.1 med pose-modulen. Ingen spike-kod. Loggen är samma JSON-format som
spiken (sammanfattning, thermal per sekund, en rad per ruta), så att `stats.ts` kan återanvändas.

**Per ruta loggas:** `frameTimeSec`, `status`, `inferenceMs`, `totalMs`, `delegate`, `rotationDegrees`,
`rebuilds`.
**Per sekund:** `PowerManager.currentThermalStatus` (API 29+, samma källa som `react-native-nitro-thermal`)
**och** `getThermalHeadroom(10)` (API 30+). Headroom varnar innan status ändras, vilket statusen ensam
missar på många telefoner.
**En gång:** `Build.MANUFACTURER`, `Build.MODEL`, `Build.SOC_MODEL` (API 31+), Android-version,
GL-renderer, `SENSOR_INFO_TIMESTAMP_SOURCE`, förhandlad upplösning (`frameOutput.currentResolution`),
fps-intervall och modellens sha256.

**Protokoll** (samma uppställning som iPhone: liggande på stativ, personen helt i bild 3–4 m bort, 30 fps,
**3 min per körning, telefonen kall** — `thermal = none` och minst 5 min vila mellan körningarna, laddare
urkopplad):

| # | Modell | Delegat | Upplösning | Syfte |
|---|---|---|---|---|
| 1 | lite | GPU | 1280×720 | grind, standardvalet |
| 2 | lite | CPU | 1280×720 | delegatval |
| 3 | full | GPU | 1280×720 | grind för full |
| 4 | full | CPU | 1280×720 | delegatval |
| 5 | bästa av 1–4 | — | 1920×1080 | upplösningens kostnad (för N-3.4) |
| 6 | som 5 | — | 1920×1080, `enablePhysicalBufferRotation: false` | rotationens kostnad |

**Grinden (samma som på iPhone):** 30 fps hålls i 3 min. **p99 `totalMs` < 33 ms**, tappade rutor
**< 1 % efter de första 2 s** (uppvärmning räknas separat, som i mätning 1–2), och thermal når aldrig
`SEVERE` (iPhone: `serious`). Medianen per minut ska vara stabil (ingen trend > +20 % från minut 1 till 3,
vilket skaftmätningen på iPhone visade är tecknet på strypning). Tappade rutor = luckor > 1,5 ×
intervallet i `frameTimeSec` (§1: `onFrameDropped` finns inte på Android). Pose hittad i ≥ 93 % av
rutorna, som på iPhone.

**Kontrolltester (korta, inte 3 min):**
- **O — orientering.** Telefonen i stående och liggande läge. Personen höjer **höger** hand. Rita punkterna
  över förhandsvisningen. Landmark 16 (höger handled) ska ligga högst och på rätt sida. Bekräftar §2 och
  avgör den OSÄKRA punkten om rotation via `ImageProcessingOptions`, om reservvägen behövs.
- **P — paritet mot webben.** Spara en RGBA-ruta + modulens landmarks från telefonen (dev-knapp). Kör
  samma PNG genom webbens MediaPipe 0.10.35, lite, IMAGE-läge. Krav: max |Δx|, |Δy| ≤ 0,01 för de punkter
  core läser (handleder, axlar, höfter). IMAGE-läge på båda sidor, eftersom VIDEO-spårningen beror på
  historiken.
- **T — klocka.** Logga `frameTimeSec` och `SystemClock.elapsedRealtimeNanos()` / `uptimeMillis()` för samma
  ruta, så att tidsbasen syns. Om rututtaget läser ur fil: klappa i bild, och jämför klappens ruta i
  pose-loggen med motsvarande PTS i filen.

**Telefon.** Mät på Eriks Android-telefon och ange modell och SoC i BACKLOG. // OSÄKER: en enda telefon
säger lite om Android-flottan. Om den är ett flaggskepp, bör grinden på sikt också köras på en
mellanklasstelefon (Snapdragon 7-serien eller Exynos 1x80). Det är inte ett krav för N-3.2, men en risk
att föra in i N-6.

---

## Källor

**I repot:** `docs/oppna-fragor.md` (F6), `docs/BACKLOG.md` (N-2, N-3), `apps/spike/README.md`,
`apps/spike/plugins/withPoseLandmarker.js`, `apps/spike/src/stats.ts`, `packages/core/src/lib/poseSample.ts`,
`poseSampling.ts`, `liveSwingDetector.ts`, `src/lib/livePoseLoop.ts`, `src/lib/poseDetector.ts`, och
`react-native-mediapipe-pose-plugin` 0.1.0 `android/…/PoseLandmarkerFrameProcessorPlugin.kt` (från
spikens `node_modules` i huvudcheckouten).

**VisionCamera 5.2.3 (npm-paketets källa):** `android/…/hybrids/instances/HybridFrame.kt`,
`hybrids/outputs/HybridFrameOutput.kt`, `public/NativeFrame.kt`, `utils/IdentifiableExecutor.kt`,
`extensions/ImageProxy+orientation.kt`, `extensions/CameraOrientation+degrees.kt`,
`extensions/ImageAnalysisBuilder+setAllowDroppingLateFrames.kt`, `ios/…/HybridFrame.swift`,
`src/hooks/useFrameOutput.ts`, `src/specs/outputs/CameraFrameOutput.nitro.ts`,
`src/specs/instances/Frame.nitro.ts`.
**Nitro 0.37.1:** `ArrayBuffer.kt`.

**Webb:**
- [VisionCamera: Native Frame Processor Plugins](https://visioncamera.margelo.com/docs/guides/frame-processors-plugins-overview)
- [Margelo: What's New in VisionCamera V5?](https://margelo.com/blog/whats-new-in-visioncamera-v5)
- [VC #4213 — FrameOutput läcker sin tråd (fix #4227: tråden avslutas efter 5 s)](https://github.com/margelo/react-native-vision-camera/issues/4213)
- [VC #4096 — `fromDegrees` LEFT/RIGHT omkastade på Android](https://github.com/margelo/react-native-vision-camera/issues/4096)
- [VC #4219 — undantag i frame-callback dödar processen (iOS)](https://github.com/margelo/react-native-vision-camera/issues/4219)
- [VC #4207 — `getPixelBuffer()` kastar för PRIVATE-rutor](https://github.com/margelo/react-native-vision-camera/issues/4207)
- [inaturalist: migrering av ett Kotlin-plugin till VC5 (PR #104)](https://github.com/inaturalist/vision-camera-plugin-inatvision/pull/104)
- [MediaPipe `AndroidPacketCreator.java` (MEDIA_IMAGE endast RGBA_8888)](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/java/com/google/mediapipe/framework/AndroidPacketCreator.java)
- [MediaPipe `MediaImageBuilder.java`](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/java/com/google/mediapipe/framework/image/MediaImageBuilder.java)
- [MediaPipe `BaseVisionTaskApi.java` (rotation → NormalizedRect, ms → µs)](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/java/com/google/mediapipe/tasks/vision/core/BaseVisionTaskApi.java)
- [MediaPipe `PoseLandmarker.java` (ingen ROI, standardkonfidens 0,5)](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/java/com/google/mediapipe/tasks/vision/poselandmarker/PoseLandmarker.java)
- [Pose landmark detection guide for Android](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/android)
- [Maven: `com.google.mediapipe:tasks-vision`-versioner](https://dl.google.com/android/maven2/com/google/mediapipe/group-index.xml)
- [AOSP: Camera timestamping docs](https://android.googlesource.com/platform/frameworks/base/+/1ce3c167c5a3%5E%21/)
