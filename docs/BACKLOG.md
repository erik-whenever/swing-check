# SwingCheck — Backlog

> **Enda källa till sanning för vad som är gjort och vad som är kvar.** Status lever här + i git-historiken.
> Beta och skär-lista: [KONTEXT.md → Betan](../KONTEXT.md#betan-ios). Klara och parkerade strömmar (UI, A–G, S, W):
> [archive/backlog-strommar.md](archive/backlog-strommar.md).

## Arbetsregel för Claude Code (läs detta först, varje session)

1. **Läs** arbetsregeln här, [swingcheck-handoff.md](swingcheck-handoff.md) och den uppgift du ska göra — inte hela filen.
2. **Välj nästa obockade uppgift** i den ström du blivit ombedd att jobba i, uppifrån och ned om inget annat sägs.
3. **Implementera** enligt uppgiftens spec och acceptanskriterier.
4. **Uppdatera dokumentation i SAMMA arbete** (obligatoriskt):
   - Bocka av här (`[ ]` → `[x]`) med en kort rad om vad som gjordes och avvikelser.
   - Uppdatera `swingcheck-handoff.md` (nuläget, ≤ 60 rader; det som trängs ut flyttas till
     [archive/handoff-historik.md](archive/handoff-historik.md)).
   - Uppdatera/skapa den `docs/`-fil som uppgiften anger.
5. **Committa** på strömmens branch (nedan). Fokuserade commits.
6. **Lämna aldrig BACKLOG osynkad.** Halvgjort = `[~]` med vad som återstår. `[-]` = struken/ersatt, med
   hänvisning. `[?]` = väntar på Eriks beslut.

**Branch:** `stream-native` för ström N och de nya strömmarna V, D, F och W-2, tills Erik säger annat.
Parallella sessioner körs i egna worktrees på egna brancher (`stream-native-<ämne>`) som mergas in i
`stream-native`. Committa aldrig direkt på `main`.

**Storleksregel:** en klar uppgift krymps till 2–4 rader här; mätloggar och detaljer flyttas till uppgiftens
`docs/`-fil eller till arkivet.

---

## Ström N — React Native-migreringen (F6)

Beslut: [oppna-fragor.md F6](oppna-fragor.md) (BESLUTAD 2026-10-23). Branch: `stream-native`, grenad från
`stream-shaft` (fryst sedan 2026-10-23). Domänlogiken ligger i `packages/core`. Fullständig text för N-1, N-1b,
N-2 och N-3.1 finns i [arkivet](archive/backlog-strommar.md#ström-n--fullständig-text-för-klara-uppgifter-flyttad-2026-10-25).

### [x] N-1 — Ren domänlogik till delat paket `@swingcheck/core`
2026-10-23: npm-workspace `packages/core` (ren TS, inget byggsteg), 30 filer flyttade med `git mv`. Webben
importerar `@swingcheck/core/…`. Tester 438 före och efter.

### [x] N-1b — Poseenvelope-kedjan och `api.ts` delbara
2026-10-23: poseenvelope-kedjan, `fromDetection` och `api.ts` i core; loggern delad (`configureLogger`,
`addLogSink`), `api.ts` konfigureras via `configureApi` (`src/lib/coreSetup.ts`). `cameraZoom` stannar i webben.

### [x] N-2 — Spike: 30 fps + pose + shaft-v2 på enhet (grind för beslutet)
2026-10-23, iPhone 16 Pro: pose lite 17,3 ms och full 19,2 ms per ruta (thermal `nominal` 3 min), skaftparitet
≤ 0,45 px, skafttid 32 ms (godtagen av Erik: 26 rutor = 0,83 s). MediaPipe + fast-tflite gav 54 dubbla
`TfLite*`-symboler i iOS-binären → skaftet körs i Core ML direkt på iOS. `apps/spike` tas bort i N-3.9.

### [ ] N-3 — Kärnflödet i appen
**På iOS körs skaftet i Core ML direkt, inte via TFLite** ([F6](oppna-fragor.md)). MediaPipe Pose bär en egen
TFLite, och två TFLite-kopior i samma binär ger dubbla symboler (N-2). shaft-v2 konverteras därför till
`.mlpackage` (samma vikter) och körs i en egen Nitro-modul för VisionCamera 5.

Uppdelad 2026-10-23 i N-3.1–N-3.9, i ordning. Android först, eftersom det inte kräver Mac. iOS-modulerna
(N-3.7–N-3.8) väntar på Mac. Punkterna från N-2 är fördelade på underuppgifterna nedan.

**Ny ordning (Eriks beslut 2026-10-25): iOS slutförs först.** Android är fortfarande ett mål, men
prestandaarbetet för Android pausas efter N-3.2-diagnosen och tas upp igen när iOS når beta (N-8). Ordning i ström N:
1. N-3.2-diagnosen (rotorsaken till Android-posens tid, se N-3.2).
2. N-3.5 och N-3.6 (ren JS, utvecklas och provas på båda dev-klienterna).
3. N-3.7 och N-3.8 när Macen finns.
4. N-3.4 (capture) och resten av iOS-kedjan.
5. Android-prestandan: N-8, efter iOS-beta.

N-3.3 (skaft Android) ligger kvar men görs inom eller efter N-8.

**Betan = iOS (Eriks beslut 2026-10-25, [KONTEXT → Betan](../KONTEXT.md#betan-ios)).** Utanför betan: N-3.3, N-8,
Play-delen av N-6, skaftmått i prompten och inloggat konto. Skaftet ingår bara som visuell tracer (N-3.7/N-3.8
stannar). Om skaftmått ska in i domarna avgörs av facit (V-1).

#### [x] N-3.1 — ADR för native-pipelinen + skelett `apps/mobile` + modulstubbar + Android-länkningskontroll
2026-10-24: [ADR-0004](adr/0004-native-pipeline-nitro-modules.md); Expo 58 / RN 0.88 / VisionCamera 5.2.3 /
Nitro 0.37.1; modulerna `pose` och `shaft` (Kotlin + Swift-stubbar). Verifierat på Galaxy A16 4G (30,5 fps,
MediaPipe + LiteRT laddade, GPU stöds) och iPhone 16 Pro (30,0 fps). Bundle-id `se.swingcheck.app`. Kör bara
en Metro åt gången (spikens Metro på 8081 gav iOS-kraschen).

#### [~] N-3.2 — Pose-modul Android
MediaPipe Tasks i VIDEO-läge, lite/full valbart, rotation → `PoseSample`. Underlag:
[pose-android.md](native/pose-android.md). Specen tas från dess §6 ([ADR-0004, tillägget](adr/0004-native-pipeline-nitro-modules.md)).
Kameran går i `'yuv'`. Modulen skalar ned, roterar och konverterar natively till RGBA i 720×1280 (libyuv).
**Mät konverteringskostnaden** (`convertMs`) och jämför med CameraX:s `'rgb'` (pose-android.md §7, körning 6).
**Från N-2:** mät N-2-grinden på Android: pose 30 fps i 3 min (ms/ruta, tappade rutor, thermal).
**Mättelefon:** Samsung Galaxy A16 4G (MediaTek Helio G99), samma som N-3.1. Det är en budgettelefon och
golvet för Android. Referens för iOS är iPhone 16 Pro (N-2).

**Gjort 2026-10-24 (kod klar, Eriks mätning återstår):** detaljer och avvikelser i
[pose-android.md §8](native/pose-android.md).
- **Spec:** `PoseDetector.nitro.ts` = pose-android.md §6 plus `runtimeInfo()` (ADR-0004). Nitrogen-koden är
  incheckad. iOS-stubben ändrades bara så att den kompilerar mot specen. Ny `PoseProbe`, bara Android:
  thermal och headroom, enhet och SoC, GL-renderer, kamerans tidsstämpelkälla, klockor och `detectImage`.
- **Kotlin:** MediaPipe tasks-vision 0.10.35, synkront VIDEO-läge, lite/full och GPU/CPU vid `configure`.
  Landmarkern byggs på kameratråden och byggs om vid ny konfiguration, `reset()`, trådbyte (VC #4213/#4227) och
  tidsbas bakåt. GPU faller tillbaka till CPU. `detect` kastar aldrig per ruta. Utdata 33 × 4 Float32 i en
  `ArrayBuffer`, upprätt och ospeglad, tid i sekunder.
- **Konvertering:** ett JNI-anrop per ruta med libyuv: krominans till I420, `I420Scale` (box) till 1280 på
  långsidan, `I420Rotate`, `J420ToABGR`. libyuv är vendrad (commit `eee45979`, v1974, BSD-3) och byggs med `-O3`
  även i debug.
- **Modeller:** `modules/pose/models.json` (versionsadress + sha256). Gradle laddar ned dem och avbryter vid fel
  hash. Bibliotekets `noCompress` når inte APK:n, så modellen laddas via direkt buffert (`modelLoad` i loggen).
- **Verifierat lokalt:** fullt Android-bygge (`expo prebuild` + `:app:assembleDebug`, arm64) i Docker
  (`reactnativecommunity/react-native-android:v22.0`, NDK 27.1) går igenom. APK:n har `libSwingPose.so`,
  `libmediapipe_tasks_jni.so` och båda `.task`. tsc och eslint rena i `apps/mobile`, Metro-bundle för Android
  klar (även utan paritetsfiler). Python-referensen: lite och full hittar pose på stillbilden. Webben: 438
  tester (437 gröna, 1 skippad), lint 2 kända fel, build ren. **Inte verifierat:** körning på telefon.
- **Ändrat på vägen:** libyuvs SME-kod kompilerar inte med NDK 27 och är avstängd. CameraX läggs till som
  `compileOnly` i VC:s version (1.7.0-alpha03), eftersom VisionCamera inte exponerar den.
- **Klockan:** `t` = sekunder sedan sessionens första ruta på rutans egen tidsstämpel (`src/poseFrames.ts`,
  `sessionTime`), samma klocka och origo som `capture.append` ska ge. Byts mot `append` i N-3.4.
  Decimeringen till 15 fps för core görs i JS (`keepForCore`), tidsbaserat.
- **Dev-skärm:** skelett över förhandsvisningen via VisionCameras sensortransformer (test O), val av
  lite/full, gpu/cpu och yuv/rgb (körning 6), mätläget **30 · Starta 3 min** (per ruta `convertMs`, `inferMs`,
  `totalMs`, rotation, delegat, ålder mot båda klockorna, core-flagga; thermal och headroom per sekund; enhet
  och SoC; sammanfattning med median, p95, p99 och grinden) och **Dela logg** (JSON).
- **Paritet:** `training/pose_parity.py` (egen venv `training/.venv-pose`, mediapipe 0.10.35) kör IMG_5410 ruta 60
  (720×1280) i IMAGE-läge på CPU. Appen kör samma PNG (Metro, gitignorerad) och jämför alla 33 punkterna. Gräns:
  max |Δx|, |Δy| ≤ 0,005 och |Δvisibility| ≤ 0,02 på CPU för lite och full. GPU och en YUV-rundtur genom
  konverteringen rapporteras utan grind. Motivering: under den smalaste marginal en riktig sving har haft till
  cores `IMPACT_ADDRESS_TOL` (0,007).
- **Inte gjort:** körning 5 (ingen nedskalning) kräver en inställning som specen saknar.

**Mätning 1 — lite · gpu · yuv, Galaxy A16 4G (SM-A165F, MT6789/Helio G99, Mali-G57 MC2), person i bild,
3 min (Erik, 2026-10-25): klarar inte grinden.** 4,55 fps, 84,81 % tappade rutor, pose i 72,9 % av rutorna.
`totalMs` 190 ms i median, p95 354, p99 370. `convertMs` 5,65 ms, `inferMs` 182,94 ms i median. Thermal `none`,
headroom 0,65. **Paritet (stillbild, ingen kamera):** klarar gränsen, CPU max |Δ| 1,1e-5. Tider på stillbilden:
lite cpu 117 ms, lite gpu 308 ms, full cpu 131 ms. GPU avviker 1,9e-2 mot Python, cpu+yuv 6,9e-3.
Inferensen är ~5× långsammare än väntat för två A76 (20–40 ms). Rotorsaken utreds innan något optimeras
(diagnosen nedan). Konverteringen är inte problemet.

**Diagnos 2026-10-25 (instrumentering klar, Eriks mätning återstår):** [pose-android.md §9](native/pose-android.md).
- **Ur källkoden (MediaPipe v0.10.35):** Java-API:ts `Delegate.CPU` blir `acceleration { tflite {} }`. MediaPipe
  lägger då ingen XNNPACK-delegat och lämnar `cpu_num_thread = -1`, och TFLite:s standard-XNNPACK kör då
  (enligt min läsning, ej uppmätt) **en tråd**. MediaPipes egen XNNPACK-väg hade valt 4 trådar på G99, men den går inte att
  välja från Java (`CpuOptions` saknar fält). Paritetens 117/308 ms var en enda kall körning (uppvärmning ingår).
- **Hypoteser:** H1 en tråd på en A55, H2 GPU-vägen långsam eller delvis CPU på Mali-G57 MC2, H3 telefonens golv.
- **Instrumentering:** `wrapMs`/`detectMs`/`packMs`, kärna per ruta (kameratråd och inferenstråd, `/proc/.../stat`
  fält 39) och nice, trådrapport (alla processens trådar, 1 Hz), logcat (egna rader om TFLite/delegat),
  `cpuClusters`. Val i dev-skärmen: inferenstråd `camera`/`urgent-display`/`video` (egen tråd, landmarkern byggs
  där) och CPU-trådar `def`/1/2/4 (XNNPACK via `XnnpackPoseLandmarkerOptions` i MediaPipes paket, `// OSÄKER`).
  Paritet körs 10 varv (första + median) på vald tråd. Grindens definition är oförändrad.
- **Baslinje:** Googles `mediapipe-samples` pose_landmarker/android (`1675dd30`), byggd i samma Docker-miljö
  med tasks-vision 1.0.0 (oförändrat) och 0.10.35 (installeras bredvid). Mätsteg i §9.4.
- **Verifierat lokalt:** `:app:assembleDebug` (arm64) i Docker går igenom, och båda nya klasserna finns i dex.
  tsc och eslint är rena i `apps/mobile`. **Inte verifierat:** körning på telefon. Att XNNPACK-omskrivningen tas
  emot av C++-grafen syns först i logcat (`Created TensorFlow Lite XNNPACK delegate`) och i trådrapporten.

**Kvar (Erik, Galaxy A16 4G):** bygg `development` för Android, kontrollera overlayn stående och liggande
(test O), kör Paritet, och kör grinden: lite GPU, lite CPU, full GPU, full CPU (3 min var, kall telefon), samt
körning 6 (`rgb`). Grinden är N-2:s: p99 `totalMs` < 33 ms, tappade rutor < 1 % efter 2 s, thermal aldrig
`severe`, ingen trend > +20 % från minut 1 till 3, pose i ≥ 93 % av rutorna.

#### [ ] N-3.3 — Skaftmodul Android — *utanför betan*
LiteRT med GPU-delegaten. Skaftet tar inte kamerans ruta: `capture`/`FrameExtractor` avkodar rutan ur
svingklippet och ritar letterboxen natively efter cores geometri, och `shaft.detect` tar den bufferten
(RGB 960×960). Stubbens `detect(frame: Frame)` byts ([ADR-0004, tillägget](adr/0004-native-pipeline-nitro-modules.md)).
Innan `capture` finns (N-3.4) matas modulen med paritetsrutan och med rutor letterboxade i testkod.
**Från N-2:**
- **Gör förberedelsen av skaftrutorna natively.** Spikens JS-letterbox tog 37 ms per ruta.
- **Paritet mot Python** (gräns 2 px) och **burst 26**, på Android. **Mättelefon:** Samsung Galaxy A16 4G
  (MediaTek Helio G99, GPU-delegaten stöds enligt N-3.1). Referens: iPhone 16 Pro, 32 ms/ruta (N-2).
- **Live-förbehandlingen ska verifieras med klubba i bild:** rotation av bufferten och färgordning. Spiken
  kollade bara pariteten på en stillbild, och 3-minutersmätningen hade ingen klubba i bild.

#### [ ] N-3.4 — Fångstkedjan
Live-pose → core (`liveSwingDetector`/`poseSegments`/`poseEnvelope`), matad i 15 fps tills N-4 →
svingdetektion → rututtag för Vision + 26 skaftrutor. Rututtaget görs av modulen `capture` (väg 3 i
[rututtag.md](native/rututtag.md); spec i [ADR-0004, tillägget](adr/0004-native-pipeline-nitro-modules.md)). `capture`
äger klockan. **Grind:** värme under en hel session med pose + kodare + förhandsvisning (rututtag.md, risk 1).
Faller den, blir det väg 1 (rå ring i 540p).

#### [ ] N-3.5 — Analys + lagring
`core/api.ts` mot Workern; kontrollera Workerns CORS för anrop utan `Origin`. Lokalt först, Supabase no-op
utan env. **Skaftmått i prompten är utanför betan** (skär-listan 2026-10-25); `core/measure` kopplas in först om
V-1:s facit visar att det förbättrar domarna.

#### [ ] N-3.6 — Kärn-UI
Kamera/session, resultat, regler, historik, TTS. Club Cream-tokens.

#### [~] N-3.7 — shaft-v2 → `.mlpackage`
fp32 och fp16, samma vikter. Konverteringen görs utan Mac, pariteten mäts på Mac.
**Konverteringen är klar** (`32b2927`, [coreml-export.md](shaft/coreml-export.md)): båda paketen, spec-kontrollerade.
**Kvar:** pariteten på Mac (coreml-export.md §5). I betan används skaftet bara som visuell tracer.

#### [ ] N-3.8 — Swift-moduler: pose (MediaPipe iOS) + skaft (Core ML direkt) [Mac]
I betan ritar skaftet bara en visuell tracer i resultatet; inga skaftmått till prompten.
**Från N-2:**
- **Mät om skafttiden med Core ML direkt.** Pröva också float16. TFLite med Core ML-delegaten gav 32 ms.
- **Gör förberedelsen av skaftrutorna natively** (som N-3.3).
- **Live-förbehandlingen ska verifieras med klubba i bild** på iPhone (rotation, färgordning).

#### [ ] N-3.9 — Helflöde på iPhone + Android, ta bort `apps/spike`
I betan räcker iPhone; Android-delen följer N-8.

### [ ] N-4 — 30 fps-omkalibrering (S-49 §6)

### [ ] N-5 — Handsfree med taligenkänning på enheten

### [ ] N-6 — TestFlight och Play
TestFlight är betan. Play är utanför betan.

### [ ] N-8 — Android-prestanda (efter iOS-beta) — *utanför betan*
Pausad till iOS når beta (Eriks beslut 2026-10-25). Utgångsläge: N-3.2 mätning 1 och diagnosen där.
Om diagnosen visar att fixen är avgränsad (t.ex. XNNPACK med 2–4 trådar eller en inferenstråd med hög prioritet),
görs den här och inte i N-3.2. `XnnpackPoseLandmarkerOptions` är då ett diagnosverktyg som ska ersättas eller
göras robust mot MediaPipe-uppgraderingar.
Målet är N-2-grinden på Galaxy A16 4G (golvet för Android), alternativt ett belagt besked om att telefonen
inte klarar den och vad produkten då gör på Android (lägre fps till core, annan modell, annan miljö).

### [ ] N-7 — Lås pose-modellens version och hash (webb + app)
Webbens `scripts/download-pose-model.mjs` hämtar `…/pose_landmarker_lite/float16/latest/…` utan hashkontroll.
Spiken låser `…/float16/1/…` med sha256 (`apps/spike/plugins/withPoseLandmarker.js`: lite `59929e1d…d574a`,
full `5134a3aa…011b1`). Om Google byter `latest`, får webben och appen olika modeller utan att något larmar,
och webbens trösklar (`poseEnvelope`, `poseSegments`) gäller inte längre för appen. Lås båda vägarna mot samma
versionsadress och samma sha256, och låt nedladdningen fallera vid avvikelse. Appens modul (`modules/pose`,
N-3.2) läser samma tabell. Hittat i [pose-android.md](native/pose-android.md) §4. Rör webbkod, så den görs utanför N-3.

---

## Parkerat i arkivet (öppna punkter i arkiverade strömmar)

Görs inte förrän de flyttats hit. Full text i [archive/backlog-strommar.md](archive/backlog-strommar.md).
- **B-1–B-3, G2-1–G2-2** (RLS, auth, tränarvy): inloggat konto är utanför betan. Ersätts i betan av W-2.
- **S-45** `[~]` provsvingar accepteras som svingar: berör betans "sving plockas ut". Väntar på S-48-uppföljning
  och nytt anropsgodkännande.
- **S-47** modellhosting: webbens fråga; i appen bärs modellerna i bygget (N-7 låser versionen).
- **C-2** (iOS PWA), **D-5** `[~]`, **E-1**, **S-8** `[~]`: webbspåret (PWA), inte i betan.
