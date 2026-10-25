# Pose-modulen på Android (förberedelse för N-3.2)

**Status:** underlag, 2026-10-24. **Implementerat i N-3.2** (se §8 för vad som avgjordes och vad som avviker).
Ström N, mergad till `stream-native`.
**Avstämd 2026-10-24** mot [rututtag.md](rututtag.md) och [ADR-0004, tillägget](../adr/0004-native-pipeline-nitro-modules.md#tillägg-2026-10-24--capture-pixelformat-och-klockan).
Pixelformatet (§2), rotationen (§2) och klockan (§3) är ändrade efter det. Avsnitten är märkta *Avgjort*.
**Fråga:** hur bygger vi en egen Nitro-modul för MediaPipe Pose (Tasks Vision, Kotlin) som körs i
VisionCamera 5:s frame processor i 30 fps och ger utdata som exakt matchar `PoseSample`?

## Antaganden (tagna utan att fråga, eftersom Erik sov)

1. **Stacken är den som N-3.1 låser:** Expo SDK 58, VisionCamera **5.2.3** (senaste på npm 2026-10-24),
   Nitro **0.37.1**, `react-native-vision-camera-worklets` 5.2.3 och `react-native-worklets`. Läst ur
   källan i npm-paketen, inte bara ur dokumenten.
2. **Bakre kameran och ett stativ.** Främre kameran används inte för att filma svingen. Modulen hanterar
   ändå spegling (se §2), så att ett senare val inte bryter koordinaterna.
3. ~~Rututtaget skrivs parallellt.~~ *Avgjort:* [rututtag.md](rututtag.md) finns nu. Modulen `capture` äger
   klockan (`append(frame)` → `t`), och pose följer den (§3).
4. ~~Telefonen är okänd.~~ *Avgjort:* mättelefonen är **Samsung Galaxy A16 4G (MediaTek Helio G99)**, samma
   som i N-3.1. Det är en budgettelefon, inte ett flaggskepp (§7).
5. **MediaPipe `tasks-vision` 0.10.35**, samma version som webbens `@mediapipe/tasks-vision` ^0.10.35.
   1.1.1 finns på Maven (2026-10-14), men den är yngre än två veckor och drar in `litertlm-android` 0.18.0.

## Kort svar

| Fråga | Val |
|---|---|
| Rutobjekt | `HybridFrameSpec` castas till `NativeFrame`, och `.image` ger en CameraX `ImageProxy`. Anropet sker synkront på den entrådiga executorn `com.margelo.camera.frame`. Bufferten lever tills JS anropar `frame.dispose()`. |
| Format | *Avgjort:* `pixelFormat: 'yuv'`, eftersom kodaren i `capture` tar samma ruta och vill ha YUV. Pose-modulen skalar ned och konverterar natively (libyuv) till RGBA i 720×1280 och slår in den med `ByteBufferImageBuilder`. MediaPipe på Android tar inte YUV. |
| Rotation | *Avgjort:* `enablePhysicalBufferRotation: false`. Roteringen görs i samma libyuv-pass som nedskalningen, så MediaPipe ser en upprätt bild, och landmärkena hamnar direkt i webbens koordinatsystem. |
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

*Avgjort i N-3.1:* en HybridObject som skapas på modulnivå kan fångas direkt i `onFrame`, utan
`NitroModules.box()`. Dev-skärmen (`apps/mobile/src/DevScreen.tsx`) anropar båda stubbarna så per ruta
på Galaxy A16 4G och iPhone 16 Pro.

## 2. Rutan till MPImage utan onödig kopiering

**Vad MediaPipe på Android tar emot** (källa: `AndroidPacketCreator.createImage`,
[mediapipe master](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/java/com/google/mediapipe/framework/AndroidPacketCreator.java)):
bitmap (ARGB_8888), ByteBuffer (RGBA, RGB, ALPHA) och `android.media.Image` **endast i RGBA_8888**
(`"Android media image must use RGBA_8888 config."`). YUV avvisas. Ingen HardwareBuffer- eller
texturväg finns i Tasks-API:t.

**Avgjort (ADR-0004, tillägget): `pixelFormat: 'yuv'`, och pose-modulen konverterar själv.**
Det första valet här var `'rgb'` + `MediaImageBuilder(imageProxy.image)`, alltså CameraX:s RGBA_8888 utan
egen kopia. Det föll när rututtaget lade en hårdvarukodare på samma `Frame`:
- **Kodaren (`capture`) vill ha YUV.** `MediaCodec` tar `YUV420Flexible` eller en `Surface`, inte RGBA. Med
  `'rgb'` hade kodaren behövt konvertera tillbaka till YUV i full upplösning per ruta.
- **MediaPipe tar inte YUV.** `createImage` godtar `ByteBuffer` i RGBA, RGB eller ALPHA, och `Image` bara i
  RGBA_8888 (se ovan). Pose-modulen gör därför ett eget pass: YUV_420_888 i 1080p → nedskalad, roterad RGBA i
  **720×1280** (libyuv: skala och rotera de planara planen, sedan YUV → RGBA). Bufferten är direkt och
  återanvänds mellan rutorna. Den slås in med `ByteBufferImageBuilder(buf, 720, 1280, MPImage.IMAGE_FORMAT_RGBA)`.
- **720×1280 är webbens upplösning.** `useCamera.ts` ber om `ideal 1280×720`, och webbens trösklar är
  kalibrerade på det. Pose-modellen tar 256×256 på personens ROI, och vid 720×1280 är ROI:n fortfarande
  större än så. Kameran går i 1920×1080, eftersom rututtaget ger Vision och skaftet 1080p.
- **Billigare än CameraX:s väg.** CameraX hade konverterat hela 1080p-rutan till RGBA. Här konverteras
  44 % av pixlarna, och rotationen ingår i samma pass. VC5 anger att `'rgb'` drar ~2,6 gånger mer bandbredd
  än `'yuv'` (`CameraFrameOutput.nitro.ts`).
- **`'native'` (PRIVATE/HardwareBuffer) avstås från** som förut. MediaPipe Tasks kan inte ta emot den, och
  `getPixelBuffer()` kastar på PRIVATE ([#4207](https://github.com/margelo/react-native-vision-camera/issues/4207)).

// OSÄKER: konverteringens kostnad på Helio G99 är inte mätt. Den ligger på kameratråden före inferensen
och ingår i budgeten på 33 ms (§1). Modulen mäter den som `convertMs` (§6), och den jämförs med CameraX:s
`'rgb'`-väg i körning 6 (§7). libyuv finns inte i NDK:ns publika API och byggs in i modulen (BSD-3) via
CMake. Om den vendras som källkod eller hämtas som förbyggd AAR avgörs i N-3.2.
// OSÄKER: `createImage` för BYTEBUFFER gör sannolikt en kopia in i MediaPipes `ImageFrame`, plus en
uppladdning till GPU med GPU-delegaten. Vid 720×1280 RGBA är det 3,7 MB per ruta, mot 8,3 MB i 1080p.

**Rotation: avgjort, i libyuv-passet.** `enablePhysicalBufferRotation: false`.
- Webben matar MediaPipe med `<video>`-elementets avkodade ruta, som alltid är upprätt och aldrig
  speglad (CSS-spegling påverkar inte pixlarna). Landmarks är normaliserade mot den bildens bredd och höjd.
- Modulen läser `imageProxy.imageInfo.rotationDegrees` (inte `frame.orientation`, #4096, §1) och roterar den
  nedskalade bilden i samma pass som konverteringen. MediaPipe ser en upprätt bild, och utdata är redan i
  webbens koordinatsystem. Ingen `ImageProcessingOptions`, och ingen tillbakaräkning.
- Kodaren får sensorns orientering och skriver den i MP4:n (`MediaMuxer.setOrientationHint`). CameraX
  behöver inte rotera hela 1080p-rutan.
- Den tidigare reservvägen (`ImageProcessingOptions.setRotationDegrees` + egen tillbakaräkning, med en
  odokumenterad koordinatfråga) behövs inte längre. För att räkna om en punkt från den oroterade bufferten
  till den upprätta bilden, med `r` = den medurs vridning som gör bufferten upprätt: 90 → (1 − y, x),
  180 → (1 − x, 1 − y), 270 → (y, 1 − x). Spikens `x: lm.y, y: 1 - lm.x` är fallet 270.

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

**Tidsstämplar. *Avgjort:* `capture` äger klockan ([ADR-0004, tillägget](../adr/0004-native-pipeline-nitro-modules.md)).**
- **Kameraklockan** = `imageProxy.imageInfo.timestamp` (ns) på Android och `CMSampleBuffer`:s
  presentationstid (s) på iOS. Pose-modulen returnerar den som `frameTimeSec: number` i **sekunder** på
  båda, men **bara för diagnostik** (test T, §7). En double rymmer ns-värden exakt upp till 2^53 ns ≈ 104
  dygn sedan uppstart.
- **`PoseSample.t` = det `t` som `capture.append(frame)` returnerar för samma ruta.** `capture` läser
  samma native-PTS och räknar `t` från sessionens första ruta, och samma `t` står i klippets
  `frameTimesSec`. Båda anropen görs i samma worklet på samma `Frame`, så de kan inte glida isär. Det är
  samma princip som webbens `startedAt`, som gör "t = 34,2" till samma ögonblick i landmark-ringen och i
  videoringen (`livePoseLoop.ts`). Pose-modulen väljer inget origo och tar inget `t` som argument.
- **MediaPipe-tidsstämpeln** = `round(ns / 1e6)` ms. Om den inte är större än förra, sätts den till
  förra + 1, som i spiken och webben. Om den går **bakåt** med mer än 1 s (ny session, ny tidsbas) byggs
  landmarkern om i stället för att skjuta fram den i all oändlighet. Den interna ms-stämpeln lämnar aldrig
  modulen, och `t` bygger alltid på kamerans egen tid.

// OSÄKER: CameraX dokumenterar inte vilken klocka `ImageInfo.getTimestamp()` använder. Camera2 säger att
sensorns tidsstämplar följer `SENSOR_INFO_TIMESTAMP_SOURCE`: REALTIME (`elapsedRealtimeNanos`) eller
UNKNOWN (≈ `uptime`, stannar i djupsömn). De är monotona och jämförbara mellan strömmar från samma
kamerainstans ([AOSP: Camera timestamping docs](https://android.googlesource.com/platform/frameworks/base/+/1ce3c167c5a3%5E%21/)).
*Avgjort:* rututtaget läser samma native-PTS i `capture.append`, och det tar rutornas tid ur
`frameTimesSec`, inte ur filens tidslinje (rututtag.md, väg 3). Klockans källa spelar därför ingen roll
för kopplingen, bara för att den är monoton. Logga `SENSOR_INFO_TIMESTAMP_SOURCE` per telefon ändå.

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
  olika modeller tyst. Det rättas i
  [BACKLOG N-7](../BACKLOG.md).

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

## 6. Specen för N-3.2: `PoseDetector.nitro.ts`

Samma spec implementeras i Kotlin nu och i Swift (N-3.8) senare utan ändring. Inget i den är
Android-specifikt: tiden är i sekunder och koordinaterna är upprätta och ospeglade på båda plattformarna.

```ts
// apps/mobile/modules/pose/src/specs/PoseDetector.nitro.ts (ersätter N-3.1-stubbens spec, ADR-0004)
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
   * (Android: ImageInfo.timestamp ns / 1e9, iOS: CMSampleBuffer-PTS). Bara diagnostik:
   * PoseSample.t är det t som capture.append(frame) returnerar för samma ruta (ADR-0004).
   */
  frameTimeSec: number;
  /**
   * Float32 × 132: [x, y, z, visibility] för MediaPipes 33 landmarks i indexordning.
   * x, y normaliserade mot den UPPRÄTTA, OSPEGLADE bilden (samma som webbens <video>).
   * Alltid 528 byte. Innehållet är odefinierat om status !== 'ok'.
   */
  landmarks: ArrayBuffer;
  /** Android: YUV → nedskalad, roterad RGBA (libyuv), ms. iOS: 0 (MPImage direkt på BGRA). */
  convertMs: number;
  /** Ren detectForVideo-tid, ms. */
  inferenceMs: number;
  /** Hela detect() inkl. konvertering, MPImage-inslagning och packning, ms. */
  totalMs: number;
  /** Delegatet som faktiskt kördes. */
  delegate: PoseDelegate;
  /** Bufferns rotation (0/90/180/270), som modulen roterade bort i konverteringen. */
  rotationDegrees: number;
}

export interface PoseDetector
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
const pose = createPoseDetector(); // @swingcheck/native-pose, som i N-3.1
pose.configure({ model: 'lite', delegate: 'gpu' });

const frameOutput = useFrameOutput({
  pixelFormat: Platform.OS === 'android' ? 'yuv' : 'rgb', // iOS 'rgb' = 32BGRA (ADR-0004)
  enablePhysicalBufferRotation: false, // pose roterar i libyuv-passet, kodaren via MP4-orientering
  targetResolution: CommonResolutions.FHD_16_9, // 1080p för rututtaget; pose skalar själv till 720×1280
  onFrame(frame) {
    'worklet';
    const t = capture.append(frame); // klockan (ADR-0004)
    const r = pose.detect(frame);
    frame.dispose();
    // decimering till 15 fps på t + Float32Array → PoseSample { t, … } här (§5)
  },
});
```

`frame.dispose()` anropas efter `append` och `detect`. Kodaren har då fått sin kopia (Android) eller
behåller själv `CVPixelBuffer` (iOS, rututtag.md risk 2), och landmärkena är kopierade till `ArrayBuffer`.
Skaftet tar inte kamerans ruta. Dess rutor avkodas ur klippet (ADR-0004).

## 7. Vad som bara kan avgöras på telefonen, och mätplanen för N-2-grinden

**Avgörs bara på telefonen:**
1. ms/ruta för lite/full × GPU/CPU, och vilket delegat som vinner.
2. Kostnaden för den egna konverteringen (YUV → nedskalad, roterad RGBA), `convertMs`. Jämförs med
   CameraX:s `'rgb'` + fysisk rotation, som inte syns i `detect()` utan bara i uppnådd fps och tappade rutor,
   eftersom den ligger på samma tråd före `onFrame` (§1).
3. Om libyuv-rotationen ger upprätta koordinater i alla fyra orienteringar (test O).
4. Thermal över 3 min, och om GPU-bygget fungerar på just den kretsen.
5. Kameraklockans källa (`SENSOR_INFO_TIMESTAMP_SOURCE`) och, om rututtaget läser ur en fil,
   förhållandet mellan rutans tidsstämpel och videons PTS (test T).

**Bygget:** dev-skärmen från N-3.1 med pose-modulen. Ingen spike-kod. Loggen är samma JSON-format som
spiken (sammanfattning, thermal per sekund, en rad per ruta), så att `stats.ts` kan återanvändas.

**Per ruta loggas:** `frameTimeSec`, `status`, `convertMs`, `inferenceMs`, `totalMs`, `delegate`,
`rotationDegrees`, `rebuilds`.
**Per sekund:** `PowerManager.currentThermalStatus` (API 29+, samma källa som `react-native-nitro-thermal`)
**och** `getThermalHeadroom(10)` (API 30+). Headroom varnar innan status ändras, vilket statusen ensam
missar på många telefoner.
**En gång:** `Build.MANUFACTURER`, `Build.MODEL`, `Build.SOC_MODEL` (API 31+), Android-version,
GL-renderer, `SENSOR_INFO_TIMESTAMP_SOURCE`, förhandlad upplösning (`frameOutput.currentResolution`),
fps-intervall och modellens sha256.

**Protokoll** (samma uppställning som iPhone: liggande på stativ, personen helt i bild 3–4 m bort, 30 fps,
**3 min per körning, telefonen kall** — `thermal = none` och minst 5 min vila mellan körningarna, laddare
urkopplad):

Kameran går i 1920×1080 `'yuv'` i alla körningar (ADR-0004). Kolumnen *Pose-indata* är vad modulen
konverterar till.

| # | Modell | Delegat | Pose-indata | Syfte |
|---|---|---|---|---|
| 1 | lite | GPU | 720×1280 | grind, standardvalet |
| 2 | lite | CPU | 720×1280 | delegatval |
| 3 | full | GPU | 720×1280 | grind för full |
| 4 | full | CPU | 720×1280 | delegatval |
| 5 | bästa av 1–4 | — | 1080×1920 (ingen nedskalning) | upplösningens kostnad och nytta |
| 6 | som 1–4:s bästa | — | kamera `'rgb'` + `enablePhysicalBufferRotation: true`, `MediaImageBuilder` | jämförelse: CameraX:s konvertering mot vår |

// OSÄKER: kodaren i `capture` finns inte i N-3.2. Pose mäts alltså utan kodaren på samma tråd och
samma krets. Den samlade lasten (pose + kodare + förhandsvisning) mäts i N-3.4 (rututtag.md, risk 1).

**Grinden (samma som på iPhone):** 30 fps hålls i 3 min. **p99 `totalMs` < 33 ms**, tappade rutor
**< 1 % efter de första 2 s** (uppvärmning räknas separat, som i mätning 1–2), och thermal når aldrig
`SEVERE` (iPhone: `serious`). Medianen per minut ska vara stabil (ingen trend > +20 % från minut 1 till 3,
vilket skaftmätningen på iPhone visade är tecknet på strypning). Tappade rutor = luckor > 1,5 ×
intervallet i `frameTimeSec` (§1: `onFrameDropped` finns inte på Android). Pose hittad i ≥ 93 % av
rutorna, som på iPhone.

**Kontrolltester (korta, inte 3 min):**
- **O — orientering.** Telefonen i stående och liggande läge. Personen höjer **höger** hand. Rita punkterna
  över förhandsvisningen. Landmark 16 (höger handled) ska ligga högst och på rätt sida. Bekräftar libyuv-
  rotationen i §2 för varje `rotationDegrees` som telefonen ger.
- **P — paritet mot webben.** Spara en RGBA-ruta + modulens landmarks från telefonen (dev-knapp). Kör
  samma PNG genom webbens MediaPipe 0.10.35, lite, IMAGE-läge. Krav: max |Δx|, |Δy| ≤ 0,01 för de punkter
  core läser (handleder, axlar, höfter). IMAGE-läge på båda sidor, eftersom VIDEO-spårningen beror på
  historiken.
- **T — klocka.** Logga `frameTimeSec` och `SystemClock.elapsedRealtimeNanos()` / `uptimeMillis()` för samma
  ruta, så att tidsbasen syns. Om rututtaget läser ur fil: klappa i bild, och jämför klappens ruta i
  pose-loggen med motsvarande PTS i filen.

**Telefon: Samsung Galaxy A16 4G (MediaTek Helio G99, Mali-G57 MC2).** Det är samma telefon som N-3.1
verifierades på (30,5 fps, MediaPipe 0.10.35 och LiteRT laddade, GPU-delegaten stöds). Referens för iOS är
iPhone 16 Pro (N-2: lite 17,3 ms, full 19,2 ms). Helio G99 är en budgetkrets. Klarar den grinden, så klarar
mellanklassen den troligen också. Klarar den det inte, är det golvet för Android som flyttas, inte
nödvändigtvis designen.
// OSÄKER: att Mali-G57 MC2 vinner på GPU-delegaten för `lite` är inte givet. Uppladdningen av 3,7 MB RGBA
per ruta kan äta upp vinsten, och XNNPACK på G99:s två A76-kärnor kan vara snabbare. Därför körs 1–4.
Om GPU-bygget kastar på kretsen faller modulen tillbaka till CPU (§4), och det syns i `delegate`.

## 8. Genomfört i N-3.2 (2026-10-24)

Koden ligger i `apps/mobile/modules/pose` (Kotlin, C++) och `apps/mobile/src` (dev-skärmen). Mätningen på
Galaxy A16 4G görs av Erik, och resultatet står i BACKLOG N-3.2.

**Specen** är §6 oförändrad, plus `runtimeInfo()`, som ADR-0004 kräver av varje modul. Mätverktygen ligger i
en egen HybridObject, `PoseProbe` (`HybridObject<{ android: 'kotlin' }>`), så att de inte blir en del av
kontraktet som Swift implementerar i N-3.8: thermal och headroom (PowerManager), enhet och SoC, GL-renderer,
`SENSOR_INFO_TIMESTAMP_SOURCE` per bakre kamera, klockorna och `detectImage` för pariteten.

**Konverteringen** (`android/src/main/cpp/yuv_convert.cpp`), ett JNI-anrop per ruta i buffertar som återanvänds:
1. Krominans till planar I420 om kameran interfolierar den (pixelstride 2). `Android420ToI420Rotate` med
   `dst_y = nullptr` gör bara U och V.
2. `I420Scale` till 1280 på långsidan, i buffertens egen orientering, med `kFilterBox`.
3. `I420Rotate` med `ImageInfo.rotationDegrees` (medurs, CameraX:s konvention).
4. `J420ToABGR`: fullt omfång BT.601 (JFIF, som Camera2 anger för YUV_420_888) → R, G, B, A i minnet.

Nedskalningen görs först, så att rotation och färgkonvertering bara rör 720×1280. `'rgb'` (körning 6) går
genom `ARGBRotate`, som bara kopierar när CameraX redan har roterat.
// OSÄKER: fullt omfång antas. CameraX:s egen RGBA-väg räknar med begränsat omfång. Paritetens YUV-rundtur
(`detectImage(…, viaYuv = true)`) visar hur mycket konverteringen flyttar landmärkena.

**libyuv är vendrad** (`android/third_party/libyuv`, commit `eee45979`, 2026-10-01, version 1974, BSD-3) och
byggs av en egen `libyuv.cmake`, som speglar uppströms filistor och flaggor per arkitektur (NEON, dotprod/i8mm,
SVE2) utan verktyg, tester, JPEG och SME. SME är avstängt: uppströms kompileringstest går igenom med NDK 27:s
clang, men `rotate_sme.cc` fallerar sedan på `__arm_new("za")`, och ingen telefon vi riktar oss mot har SME. Skäl: libyuv finns inte i NDK:ns publika API,
det finns ingen officiell AAR, och googlesource ger inga stabila tarball-hashar. EAS och lokala byggen kör
samma källa utan nätverk. libyuv och konverteringen kompileras alltid med `-O3`, eftersom dev-klienten är ett
debugbygge (`-O1`) och `convertMs` mäts.

**CameraX:** `NativeFrame.image` är en `ImageProxy`, men VisionCamera har CameraX som `implementation`. Modulen
lägger därför till `androidx.camera:camera-core` som `compileOnly` i VC 5.2.3:s version (1.7.0-alpha03). Klasserna
kommer från VisionCamera vid körning, så appen får aldrig två CameraX-versioner. Byts VC-versionen, ska den
här raden följa med.

**Avvikelse från §2, spegling:** modulen speglar **inte** tillbaka x när `isMirrored` är satt. VC5 sätter
flaggan från `mirrorMode`, men `ImageAnalysis` speglar aldrig bufferten. Bufferten är alltså redan den
ospeglade bilden, och en återspegling hade spegelvänt utdata. Med bakre kameran är flaggan ändå falsk.

**Modellerna** står i `modules/pose/models.json` (versionsadress `float16/1` och sha256, samma värden som
spikens tabell). Gradle laddar ned dem till `android/build/generated/pose-models/assets` före bygget och
avbryter vid fel hash. `training/pose_parity.py` läser samma tabell. N-7 kan peka webbens nedladdning hit.
**noCompress:** biblioteket sätter `noCompress += "task"`, men det når **inte** appens APK: i det lokala
bygget ligger båda `.task` deflaterade. Modulen provar därför `AssetManager.openFd` vid körning. Går det, laddas
modellen med `setModelAssetPath` (minnesmappad), annars med `setModelAssetBuffer` från en direkt buffert (5,8 MB
lite, 9,4 MB full, utanför Java-heapen). I nuvarande bygge blir det alltså `buffer`, vilket står i
`deviceInfo().modelLoad` och i loggen. Det påverkar laddningen, inte tiden per ruta. Vill vi ha minnesmappning
behövs raden i appens `build.gradle` via en konfigplugin.

**Ombyggnad och reserv:** landmarkern byggs på den tråd som anropar `detect()` och byggs om vid ny
konfiguration, efter `reset()`, vid trådbyte (#4213) och när tidsbasen går bakåt mer än 1 s. Misslyckas
GPU-bygget, eller kastar `detectForVideo` på GPU, byggs den om på CPU, och `delegate` i resultatet säger vad som
kördes. `rebuilds` räknar alla byggen efter det första.
// OSÄKER: den gamla GPU-landmarkern stängs på den nya tråden vid trådbyte. Det är inte prövat att MediaPipe tål
det. Ett fel loggas och ignoreras.

**Klockan:** `frameTimeSec` = `ImageInfo.timestamp / 1e9`. JS räknar `t` = sekunder sedan sessionens första
ruta på den tiden (`src/poseFrames.ts`, `sessionTime`). Det är samma klocka, enhet och origo som
`capture.append(frame)` kommer att ge, och i N-3.4 byts `sessionTime` mot `append`. Varje mätrad har också
`elapsedRealtime − frameTimeSec` och `uptime − frameTimeSec` (test T): den klocka som ger en liten, stabil
ålder är den rutorna följer.

**15 fps till core** görs i JS och tidsbaserat (`keepForCore`: behåll om `t − senast ≥ 1/15 − en halv ruta`).
Bara de behållna rutorna packas upp till `PoseSample`.

**Overlayn** (`src/SkeletonOverlay.tsx`) räknar tillbaka varje punkt till den oroterade bufferten och använder
sedan VisionCameras egna transformer: buffert → sensor (`Frame.convertFramePointToCameraPoint`) och sensor →
vy (`convertCameraPointToViewPoint`). Det stämmer även när förhandsvisningen har ett annat bildformat (4:3)
än 16:9-rutan, eftersom båda går via sensorns koordinater.

**Paritet (test P, ändrat):** samma stillbild (IMG_5410 ruta 60, 720×1280, upprätt) och samma `.task` i
Python (mediapipe 0.10.35) och i appen, IMAGE-läge på båda sidor. Gräns: max |Δx|, |Δy| ≤ **0,005** över
**alla 33** punkter och |Δvisibility| ≤ 0,02, på CPU för båda modellerna. GPU och YUV-rundturen rapporteras
men grindas inte. Motivering i `apps/mobile/src/parity.ts`: 0,005 ligger under den smalaste marginal en riktig
sving har haft till en av cores rumsliga trösklar (träffen ska ligga inom `IMPACT_ADDRESS_TOL` = 0,07, och de
uppmätta träffarna låg på 0,056–0,063). Den tidigare gränsen 0,01 för bara sex punkter var lösare än det.
MediaPipe i Python skickar användningsloggar till `play.googleapis.com/log` (syns som 503-fel i utskriften).
Det påverkar inte resultatet.

**Inte gjort:** körning 5 (ingen nedskalning) kräver en inställning för långsidan, som inte finns i specen.
Den görs om körning 1–4 visar att upplösningen behöver prövas.

## 9. Diagnos: varför lite tar ~180 ms på Galaxy A16 4G (2026-10-25)

**Utgångsläge (mätning 1, BACKLOG N-3.2):** lite · gpu · yuv, `inferMs` 183 ms i median, `convertMs` 5,7 ms.
Stillbilden: lite cpu 117 ms, lite gpu 308 ms, full cpu 131 ms. Helio G99 har 2× A76 (2,2 GHz) och 6× A55
(2,0 GHz), så lite borde ta 20–40 ms. Konverteringen är 3 % av tiden och är inte problemet.

**Ingen optimering är gjord.** Avsnittet beskriver vad källkoden visar, och vilka mätningar som skiljer
hypoteserna åt. Grindens definition (§7) är oförändrad.

### 9.1 Vad källkoden visar (MediaPipe v0.10.35)

1. **Java-API:ts CPU-delegat är inte XNNPACK med trådpool.** `Delegate.CPU` blir
   `acceleration { tflite {} }` (`TaskOptions.convertBaseOptionsToProto`, kontrollerat med `javap` på
   `tasks-core-0.10.35.aar`). I `inference_calculator_cpu.cc` (`MaybeCreateDelegate`) betyder `tflite` att
   MediaPipe inte lägger till någon delegat. Tolken byggs med `cpu_num_thread`, som har standardvärdet −1
   (`inference_calculator.proto`). Tasks använder `MediaPipeBuiltinOpResolver`, som ärver
   `BuiltinOpResolver`, alltså TFLite:s standard-XNNPACK med tolkens trådantal.
   // OSÄKER: att −1 ger **en** tråd i TFLite:s standard-XNNPACK är min läsning av TFLite (trådpoolen skapas
   bara när `num_threads > 1`), inte uppmätt. Trådrapporten i 9.2 visar det direkt: en tråd nära 100 % av
   en kärna under inferensen.
   MediaPipes egen XNNPACK-väg (`acceleration { xnnpack {} }`) väljer i stället `clamp(kärnor/2, 1, 4)` = 4
   trådar på G99 (`inference_calculator_utils.cc`, `GetCpuDefaultNumThreads`). Den vägen går inte att välja
   från Java: `BaseOptions.DelegateOptions.CpuOptions` har inga fält.
2. **GPU-vägen** sätter `use_advanced_gpu_api: true`. Om OpenCL eller OpenGL ES används, och om delar av
   grafen ligger kvar på CPU, syns bara i logcat (TFLite skriver `Initialized OpenCL-based API` eller
   `…OpenGL-based API`, och `Created TensorFlow Lite XNNPACK delegate for CPU` om en del körs på CPU).
   Mali-G57 MC2 är en GPU med två kärnor. Där är det inte självklart att GPU slår fyra CPU-trådar.
3. **Paritetens tider var kalla.** `detectImage` byggde en ny landmarker och körde en enda gång, så
   117 och 308 ms innehåller uppvärmningen (XNNPACK-packning och shaderkompilering). De är inte jämförbara
   med livevärdet. Nu körs 10 varv: det första rapporteras som `firstMs`, och medianen av resten som tiden.
4. **Var inferensen körs:** `detectForVideo` är synkront, men MediaPipe-grafen kör sina kalkylatorer på sin
   egen exekutor. De trådarna och XNNPACK:s pool skapas av den tråd som bygger landmarkern, och de ärver
   dess nice-värde (Linux-trådar ärver skaparens). Kameratrådens kärna säger därför inte allt. Trådrapporten
   visar alla trådar i processen.

**Hypoteser, i den ordning mätningarna skiljer dem åt:**
- **H1, en tråd på en liten kärna:** CPU-vägen kör en tråd, och schemaläggaren lägger den på en A55. Då
  ger XNNPACK med 2–4 trådar, eller en tråd med högre prioritet, en stor sänkning. Det är en avgränsad fix.
- **H2, GPU-vägen är långsam på Mali-G57 MC2** eller faller delvis tillbaka. Logcat visar det. Fixen är
  då att använda CPU (med H1:s trådval) på den här telefonen.
- **H3, telefonen klarar inte mer:** Googles eget exempel (9.3) visar ungefär samma tid, och XNNPACK med
  4 trådar på stora kärnor ger inte under ~33 ms. Då är det telefonens golv.

### 9.2 Instrumenteringen (dev-skärmen och loggen)

- **Delad tid per ruta:** `wrapMs` (MPImage-bygget), `detectMs` (`detectForVideo` ensamt), `packMs`
  (resultatet till `ArrayBuffer`). `inferMs` behåller sin betydelse från mätning 1 (wrap + detect), så att
  körningarna går att jämföra.
- **Kärna per ruta:** `callerCpu` (kameratråden när `detect` börjar) och `inferenceCpu` (tråden som körde
  `detectForVideo`, direkt efteråt), ur fält 39 i `/proc/self/task/<tid>/stat`, plus trådens nice-värde.
  Sammanfattningen ger andelen rutor per kärna. `deviceInfo.cpuClusters` ger vilka kärnor som är stora
  (`cpuinfo_max_freq`, t.ex. `0-5:2000,6-7:2200`).
- **Trådrapport:** 1 Hz under körningen samplas alla trådar i processen (CPU-tid, nice, kärna när tråden
  körde). Loggen får `threads`: de trådar som använde ≥ 1 % av en kärna, med `cpuPct` (100 = en hel kärna)
  och kärnfördelning.
- **Logcat:** processens egna rader om TFLite, delegater och MediaPipe (en app får läsa sin egen logg utan
  `READ_LOGS`). Följer med loggen och visas med knappen **Logcat**.
- **Inferenstråd** (`camera` · `urgent-display` · `video`): `camera` är som förut. De andra kör hela
  `detect`, inklusive bygget av landmarkern, på en egen tråd med `THREAD_PRIORITY_URGENT_DISPLAY` (−8) eller
  `THREAD_PRIORITY_VIDEO` (−10). Kameratråden väntar på den. **Paritet** körs på samma tråd (med `camera`
  körs den på JS-tråden, som förut).
- **CPU-trådar** (`def` · `1` · `2` · `4`, bara med `cpu`): `def` är Java-API:ts väg. Siffran byter till
  MediaPipes XNNPACK-delegat med det trådantalet, via `XnnpackPoseLandmarkerOptions`. Den klassen ligger i
  MediaPipes paket, eftersom getterna den vidarebefordrar är paketprivata, och skriver bara om
  `acceleration` i grafens alternativ. C++-grafen kopierar den till detektor- och landmark-subgraferna.
  // OSÄKER: beror på `PoseLandmarkerOptions` form i 0.10.35. En uppgradering kan bryta bygget, men inte
  körningen i det tysta. Bara för diagnosen tills vidare.
- Byte av tråd eller trådantal bygger om landmarkern vid nästa ruta (`rebuild: … diag=true` i logcat).

### 9.3 Baslinjen: Googles exempel

`google-ai-edge/mediapipe-samples`, `examples/pose_landmarker/android` (commit `1675dd30`, 2026-10-19),
byggt oförändrat i samma Docker-miljö. Exemplet kör tasks-vision **1.0.0** (vi kör 0.10.35), CPU och
modellen full som standard, LIVE_STREAM, och CameraX `RGBA_8888` i 4:3 (640×480). Det visar
**Inference Time** i bottenpanelen. Den tiden räknas från `uptimeMillis()` före bitmap-rotationen till
resultatet, alltså rotation + inferens.
Två APK:er byggdes, debug, alla ABI och tre modeller:
`mediapipe-sample-pose-tasks-vision-1.0.0.apk` (oförändrat) och `…-0.10.35.apk` (bara versionen bytt, och
`applicationIdSuffix ".v01035"` så att båda kan installeras samtidigt). Exemplets egen kod är oförändrad
utöver det, och därför kör det också Java-API:ts CPU-väg (9.1 punkt 1). Det visar alltså vad telefonen
klarar med MediaPipe som Google levererar det, inte vad den klarar med XNNPACK och fyra trådar.
Byggändringen utöver versionen: `gradle.properties` fick `org.gradle.jvmargs=-Xmx4g`.

### 9.4 Mätstegen (Erik, Galaxy A16 4G)

Ny `development`-build krävs, eftersom native-koden är ändrad: `eas build -p android --profile development` i
`apps/mobile`, eller det lokala Docker-bygget (`:app:assembleDebug`, arm64, samma dev-klient). Kall telefon, person i bild och samma ljus
som i mätning 1. Varje livekörning kan stoppas efter 60 s med **Stopp**, och loggen skrivs ändå.
Grinden mäts inte här.

1. **Baslinjen** (före appen, så att telefonen är kall): installera båda exemplen. I bottenpanelen väljer
   du Model `Pose landmarker lite` och Delegate `CPU`. Låt den gå i 30 s och läs av **Inference Time**
   (ett typvärde, och ungefärligt min–max). Gör samma sak med `GPU`, och sedan `full` + `CPU`. Det blir sex
   värden (två versioner × tre inställningar).
2. **Appen, start:** välj lite · gpu · yuv · camera. Vänta 10 s och tryck **Logcat**. Skriv av eller
   fotografera raderna om OpenCL/OpenGL/XNNPACK/delegate. Raden med `kluster` visar vilka kärnor som är stora.
3. **Paritet ×3:** tryck **Paritet** med `camera` (den körs på JS-tråden), sedan med `urgent-display`, och
   sedan med `cpu` + `4`. Varje rad visar nu `ms (första …, kärna …)`.
4. **Live, 60 s var (Stopp, Dela logg efter varje):**
   a. lite · gpu · camera
   b. lite · cpu · camera · def
   c. lite · cpu · urgent-display · def
   d. lite · cpu · camera · 4
   e. lite · cpu · urgent-display · 4
   f. lite · cpu · urgent-display · 2
   Panelen visar `wrap · detect · pack` och `kärnor kamera … · inferens …`. Loggen har dessutom `threads`
   och `logcat`.

**Läsning:** b mot d/e visar H1 (trådantalet). b mot c visar om prioriteten flyttar arbetet till de stora
kärnorna (`threads[].cores`). a mot b med logcat visar H2. Baslinjen mot b visar om vår integration kostar
något utöver MediaPipe självt, och baslinjen mot d/e visar om H3 gäller.

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
