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
   hänvisning. `[?]` = blockerad av beslut från Erik (skriv frågan på raden, en mening). `[📱]` = kräver
   Erik fysiskt (telefontest, frames, CVAT, GPU-träning) — skriv vad som ska testas i max 3 steg.
7. **Autonoma körningar** fattar beslut enligt [PRINCIPER.md](PRINCIPER.md), hoppar över `[?]`/`[📱]` och tar
   nästa oblockerade uppgift.

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

#### [📱] N-3.2 — Pose-modul Android
**📱 Test (Erik, Galaxy A16 4G):** 1) bygg `development` för Android och öppna dev-skärmen; 2) kör Paritet och
§9.4 (lite/full × GPU/CPU, 3 min var, kall telefon, plus `rgb`); 3) dela loggen (JSON) till nästa session.
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

#### [📱] N-3.4 — Fångstkedjan
**📱 Kräver Mac + iPhone:** `capture` är en native-modul (Swift först, iOS först) och värmegrinden mäts på enhet; görs efter N-3.7/N-3.8.
Live-pose → core (`liveSwingDetector`/`poseSegments`/`poseEnvelope`), matad i 15 fps tills N-4 →
svingdetektion → rututtag för Vision + 26 skaftrutor. Rututtaget görs av modulen `capture` (väg 3 i
[rututtag.md](native/rututtag.md); spec i [ADR-0004, tillägget](adr/0004-native-pipeline-nitro-modules.md)). `capture`
äger klockan. **Grind:** värme under en hel session med pose + kodare + förhandsvisning (rututtag.md, risk 1).
Faller den, blir det väg 1 (rå ring i 540p).

#### [~] N-3.5 — Analys + lagring
2026-10-25 (dirigent): språket är en parameter (`core/language.ts`), prompten och TTS läser samma värde; språket
ligger efter cache-brytpunkten och ett test visar byte-identiskt prefix sv/en. `core/mediaRetention`: tak i bytes
(standard 300 MB), video rensas äldst först, sedan bildrutor, resultat aldrig. Appen: `coreSetup`
(`EXPO_PUBLIC_API_URL`, saknas → fel utan anrop) och `mediaStore` (faktiska filstorlekar). Detaljer:
[analys-lagring.md](native/analys-lagring.md).
**Beslut Erik 2026-10-25:** ja — `swingcheck://se.swingcheck.app` läggs i `ALLOWED_ORIGINS` i **samma Worker-deploy
som W-2:s tak** (origin skyddar inte ensam; taket gör det). Cache-mätningen (sv/en, före/efter) får göras med ≤ 10
riktiga anrop. Dirigenten bygger Worker-ändringen och skriver deploy-kommandon; **Origin deployad 2026-10-25 (version `228eee42`); 📱 kvar: cache-mätningen (≤ 10 anrop) körs av Erik lokalt**
(wrangler-uppgifterna finns bara där).
2026-10-25 (dirigent, körning 3): webbens `MAX_RECORDS` borta — `src/lib/historyRetention.ts` mäter faktiska bytes och kör
cores `planMediaRetention` (video först, sedan bildrutor, poster behålls); tak `mediaCapMb` (300 MB) i settings, `SwingCard`
visar "video rensad", Supabase-sidtak 500 (`OSÄKER`); 8 tester.
**Kvar:** deploy av Worker-ändringen (byggd i W-2, körning 3) och cache-mätningen (📱 Erik, ≤ 10 anrop). Därtill prov på enhet, UI (språk, tak-reglage, "video rensad") i N-3.6.
`core/api.ts` mot Workern; kontrollera Workerns CORS för anrop utan `Origin`. Lokalt först, Supabase no-op
utan env. **Skaftmått i prompten är utanför betan** (skär-listan 2026-10-25); `core/measure` kopplas in först om
V-1:s facit visar att det förbättrar domarna.
**Tillägg 2026-10-25 (spec, Erik):**
- **Språk som parameter** i cores prompt (svarsspråk för `observation`, `short_verdict`, `suggestion`) och i
  TTS (röst och uttal). Ett ställe bestämmer språket; prompten och TTS läser samma värde. Det statiska
  cacheprefixet ska vara språkoberoende eller cachas per språk — mät cache-träffarna innan och efter.
- **Lagring efter storlek (MB) i stället för `MAX_RECORDS = 10`** (webbens `src/hooks/useHistory.ts`): ett tak i
  MB för video och bildrutor. När taket nås rensas **video** (och sedan bildrutor) från de äldsta svingarna
  först; **resultat och metadata behålls alltid**. Historiken visar en sving utan video som "video rensad".
  Taket är en inställning med ett försiktigt standardvärde; storleken räknas på faktiska bytes, inte uppskattat.

#### [~] N-3.6 — Kärn-UI
**PRIORITET (Erik 2026-10-25): uppladdningspipelinen först** (uppladdning → analys via Workern → Resultat → Historik, på riktigt), så att en intern TestFlight-build kan tas till rangen. Livepipelinen och sessionsrader efter det.
2026-10-25 (dirigent, körning 4): **del 1** `apps/mobile/src/ui/` — tokens ljust/mörkt ur d1-v2, `ThemeProvider`/`useTheme`,
Outfit via `expo-font`, `Text`, `Card`, `Button`, `Segmented`, `Chip`, `SectionLabel`, `VerdictMark` (tre former), `ConfidenceBar`,
`BrandHeader`; nya native-beroenden (`expo-font`, `react-native-svg`) → dev-klienten måste byggas om. **del 2** `apps/mobile/src/state/`:
rena modeller (inställningar, historik med `planMediaRetention`, regelval via `recommendRules`, feltexter inkl. `UsageCapReachedError`).
2026-10-25 (dirigent, körning 5): **del 3** `src/state/`: `AppStateProvider`, hooks (`useSettings`, `useHistory`, `useRuleSelection` m.fl.), filpersistens
(expo-file-system bakom filinterface, tmp+flytt, korrupt fil kopieras undan, medietak efter varje sparning), 42 tester, [ui-komponenter.md](native/ui-komponenter.md).
**del 4–5** `src/screens/`: rena presentationsskärmar Välkommen, Uppladdning, Analys pågår, Resultat, Regler, Historik (props in, inga hooks/nät),
ren logik i `reviewLogic.ts` (13 tester); [skarmar.md](native/skarmar.md). Ej körda på enhet.
**del 6** `src/app/`: React Navigation v7 (native-stack + bottom-tabs; flikar Sving/Session/Regler/Historik, stack Analys/Resultat/Dev),
Välkommen vid första start (`welcomeSeen`), uppladdningspipeline som stubb; [navigation.md](native/navigation.md). Nya native-moduler → dev-klienten byggs om.
**del 7** `LiveSessionScreen` (alltid mörk, 3 m-läsbar, 7 trendblock) + `liveSessionLogic` (7 tester). **del 8** `src/tts/`: manusbyggare sv/en
(live/full), `Speaker`-interface, `SpeechQueue` med watchdog, 16 tester, [tts.md](native/tts.md); ingen motor än.
**del 9** `expo-speech` + `expoSpeechSpeaker` (motor injicerad, `tts/device.ts`), `SpeechProvider`/`useSpeech` (språk ur settings),
"Läs upp" på Resultat, `LiveSessionContainer` på fliken Session (Redo/Analyserar/Pausad, keep-awake, ingen pipeline); 8 tester.
**del 10–11** `RuleLibraryScreen` + `ruleLibraryLogic` (sök, fas/vinkel, val; 10 tester), modal-rutt `RuleLibrary` från "+"/Egna.
**del 12** (körning 6) uppladdningspipeline på riktigt: klippval (expo-image-picker) → 32 rutor jämnt i svingfönstret (expo-video-thumbnails +
image-manipulator, ≤1280 px, JPEG 0,8; interim tills `capture`) → core/Workern → `addSwing` (media i `documents/media/<id>/`) → Resultat.
Ren `runUploadAnalysis` (progress, avbrytbar; 8 tester), `UPLOAD_PIPELINE_AVAILABLE=true`; [uppladdning.md](native/uppladdning.md).
**Kvar:** pose-baserat svingfönster/fasurval/beskärning (N-3.4/N-3.8 ersätter `FrameSource`/`selectFrameTimes`), skaftsteg och fasbilder på Analys,
auto-vinkel, livepipeline → `enqueueLive` (N-3.4), sessionsrader/trend i Historik. **📱 Prov (Erik, iPhone):** 1) bygg om dev-klienten
(tre nya native-moduler; `EXPO_PUBLIC_API_URL` satt); 2) Sving → "Byt klipp" → kort klipp → "Bedöm svingen"; 3) kontrollera Resultat + Historik med bild, och att Avbryt mitt i inte sparar något.
**Avblockerad 2026-10-25:** D-1 v2 godkänd av Erik. Bygg efter [design/d1-v2/](design/d1-v2/README.md) (tokens,
typografi, komponenter och de sju skärmarna inkl. Välkommen); riktningen och avvikelserna i [design/d1/README.md](design/d1/README.md) gäller.
Kamera/session, resultat, regler, historik, TTS.

#### [📱] N-3.7 — shaft-v2 → `.mlpackage`
**📱 Mac:** 1) checka ut `stream-native` på Macen; 2) kör coreml-export.md §5 (paritet fp32/fp16); 3) committa siffrorna i coreml-export.md.
fp32 och fp16, samma vikter. Konverteringen görs utan Mac, pariteten mäts på Mac.
**Konverteringen är klar** (`32b2927`, [coreml-export.md](shaft/coreml-export.md)): båda paketen, spec-kontrollerade.
**Kvar:** pariteten på Mac (coreml-export.md §5). I betan används skaftet bara som visuell tracer.

#### [📱] N-3.8 — Swift-moduler: pose (MediaPipe iOS) + skaft (Core ML direkt) [Mac]
**📱 Kräver Mac** (Xcode-bygge och iPhone); förbereds inte i molnet.
I betan ritar skaftet bara en visuell tracer i resultatet; inga skaftmått till prompten.
**Från N-2:**
- **Mät om skafttiden med Core ML direkt.** Pröva också float16. TFLite med Core ML-delegaten gav 32 ms.
- **Gör förberedelsen av skaftrutorna natively** (som N-3.3).
- **Live-förbehandlingen ska verifieras med klubba i bild** på iPhone (rotation, färgordning).

#### [ ] N-3.9 — Helflöde på iPhone + Android, ta bort `apps/spike`
I betan räcker iPhone; Android-delen följer N-8.

### [📱] N-4 — 30 fps-omkalibrering (S-49 §6)
**📱 Kräver Eriks dator** (dirigent 2026-10-25): omkalibreringen körs mot posedatan i `data/shaft/fps-missed/`
(gitignorerad, finns bara lokalt) och helst mot 30 fps-pose från appen (efter N-3.4). 1) Starta en CC-session lokalt
på `stream-native`; 2) kör S-49:s uppställning (§6 (a)–(e)) med 30 fps-sampel; 3) committa konstanterna + resultat i fps-missed-swings.md.

### [📱] N-5 — Handsfree med taligenkänning på enheten
**📱 Kräver Mac + iPhone** (taligenkänning på enheten är native och provas med hörlurar); görs efter N-3.4.

### [📱] N-6 — TestFlight och Play
2026-10-25 (dirigent, körning 6): **steg 1 förberett** — `eas.json` production (store, kanal `production`, `autoIncrement`, `appVersionSource: remote`,
`EXPO_PUBLIC_API_URL` inbakad) + preview; `expo-updates`, `runtimeVersion: fingerprint`, `updates.url`, version 0.1.0. Guide: [testflight.md](native/testflight.md)
(`eas update` kräver `EXPO_PUBLIC_API_URL` inline). **📱 Erik (i `apps/mobile`, uppladdningen är nu klar):** 1) `npx eas-cli login` +
`npx eas-cli build -p ios --profile production`; 2) `npx eas-cli submit -p ios --latest`; 3) installera via TestFlight och kör en uppladdning. Steg 2 väntar på N-3.7/N-3.8 och V-1.
**Steg 1 (Erik 2026-10-25): intern TestFlight för Erik** så snart N-3.6:s uppladdningspipeline fungerar — via EAS (`eas build -p ios --profile production` + `eas submit`), ingen Mac krävs. Dirigenten förbereder `eas.json`-profil, `runtimeVersion`/EAS Update-kanal (så JS-ändringar når telefonen på rangen utan nytt bygge) och exakta kommandon; **📱 Erik kör build + submit** (Apple-inloggning).
**Steg 2: extern beta** — kräver W-2 (deployad 2026-10-25), N-3.7/N-3.8 (Mac) och V-1.
TestFlight är betan. Play är utanför betan. **Kräver W-2** (identitet per installation) innan första externa testare.

### [ ] N-8 — Android-prestanda (efter iOS-beta) — *utanför betan*
Pausad till iOS når beta (Eriks beslut 2026-10-25). Utgångsläge: N-3.2 mätning 1 och diagnosen där.
Om diagnosen visar att fixen är avgränsad (t.ex. XNNPACK med 2–4 trådar eller en inferenstråd med hög prioritet),
görs den här och inte i N-3.2. `XnnpackPoseLandmarkerOptions` är då ett diagnosverktyg som ska ersättas eller
göras robust mot MediaPipe-uppgraderingar.
Målet är N-2-grinden på Galaxy A16 4G (golvet för Android), alternativt ett belagt besked om att telefonen
inte klarar den och vad produkten då gör på Android (lägre fps till core, annan modell, annan miljö).

### [x] N-7 — Lås pose-modellens version och hash (webb + app)
2026-10-25 (dirigent): webbens `scripts/download-pose-model.mjs` läser `apps/mobile/modules/pose/models.json`
(samma tabell som Gradle och `pose_parity.py`), adress `float16/1`, sha256 kontrolleras och fel ger exit ≠ 0 utan
kvarlämnad fil; 12 vitest-tester med mockad fetch. **📱** Kör `npm run pose:model` en gång lokalt och bekräfta
"Downloaded and verified" (molnets proxy spärrar storage.googleapis.com).

---

## Ström V — Domkvalitet och kostnad (beta-punkt 5)

Ny 2026-10-25. Branch: `stream-native`. **Inget Claude-anrop körs förrän Erik har godkänt budgeten**
(antal anrop, modell, uppskattad kostnad) för varje körning. Bygger vidare på S-48:s mätskript
([vision-max-tokens/README.md](vision-max-tokens/README.md)): appens egen `analyzeSwing` via Workern, märkta anrop.

### [~] V-1 — Facit för domkvalitet
2026-10-25 (dirigent): förberedelsen klar, inga anrop. `scripts/eval/`: eval-regler (biblioteket + 9 skaftregler,
DTL 13 / face-on 12), extract/freeze/verify (sha256 per bildruta + `rulesHash`), facit-mall (CSV) + validering,
`run` med budgetspärr (dry-run standard), `score` (alla mätvärden, 38 tester). Metod och budget: [eval/v1-facit.md](eval/v1-facit.md).
**📱 Kvar (Erik):** 1) `extract` lokalt (testa ett klipp först) och välj 30–50 svingar; 2) `freeze` + fyll i
`facit.csv` blint tills `facit-check` är grön; 3) committa manifest + facit. **Budget godkänd (Erik
2026-10-25):** 120 anrop (40 × 3, `claude-sonnet-4-5`, quick) ≈ $3,9–6,6, tak `--approved-budget=8`. Gäller endast
denna baslinjekörning; körs av Erik lokalt när facit är fryst.
**Mål:** ett fryst facit som modell-, prompt- och regelval mäts mot, och som avgör om skaftmått behövs i domarna.
- **Material:** 30–50 svingar ur befintliga klipp (DTL och face-on, olika spelare och nivåer), extraherade med
  produktionens kedja så att bildrutorna är de appen skickar. Fryst urval med id och sha256 per bildruta.
- **Regler:** regelbiblioteket plus **avsiktligt många skaftberoende regler** (skaftplan, skaftlutning vid
  adress/topp/impact, across-the-line/laid-off), så att facit kan visa var Vision brister utan skaftmått.
- **Facit:** per sving och regel `pass`/`fail`/`cannot_determine`, satt av Erik (eller tränare) blint mot
  modellens svar. Facit och urval förregistreras i en commit innan första körningen.
- **Körning:** 3 körningar per sving med samma modell, prompt och bildrutor.
- **Mätvärden:** träffsäkerhet per regel (och totalt, med `cannot_determine` redovisat separat);
  **självsäkra fel** = fel dom med `confidence` ≥ 0,8, per regel; **konsistens** = andel sving × regel med samma
  dom i alla 3 körningar; **kostnad** (input/output/cachade tokens → USD) och **tid** (vägg-tid per analys,
  median och p95) per analys.
- **Budget:** antal anrop (svingar × 3) och uppskattad kostnad läggs fram för Erik; **godkänns innan något körs**.
- **Utdata:** `docs/eval/v1-facit.md` (metod, urval, resultat per regel), rådata lokalt (gitignorerat).
- **Klart när:** facit är fryst och första baslinjen (nuvarande `claude-sonnet-4-5`, nuvarande prompt) är
  mätt och rapporterad per regel.

### [ ] V-2 — Modellval för tid och kostnad
Mot V-1:s facit: jämför kandidatmodeller (och ev. `max_tokens`, bildstorlek, antal bildrutor) på
träffsäkerhet, självsäkra fel, konsistens, kostnad och tid per analys. Rekommendation med en siffra för
"skälig kostnad och tid" som betan lovar. Budget per körning godkänns av Erik. Beror på V-1.

## Ström D — Design för betan (beta-punkt 1)

Ny 2026-10-25. **Namnkrock:** arkivets pose-ström hette också D (D-1–D-5); de refereras som "arkivets D-x".

### [x] D-1 — Designspår för betan
**Godkänd av Erik 2026-10-25: v2** ([design/d1-v2/](design/d1-v2/README.md)) — "bra start, justeras vid behov senare". Granskningslistans 8 punkter godkända i sin helhet. Kvar (tokens + komponenter i `apps/mobile`) görs i N-3.6.
2026-10-25 (dirigent): skissförslaget "Cream Day / Fairway Night" — sex flöden i [design/d1/](design/d1/README.md)
(`index.html` + PNG ljust/mörkt, riktning, avvikelser från Club Cream, granskningslista med 8 punkter).
**📱 Granska (Erik):** 1) öppna `docs/design/d1/png/` (eller `index.html` lokalt); 2) visa `livesession.png` på
telefonen 3 m bort; 3) svara ja/nej på granskningslistan i README:n. Kvar efter ja: tokens och komponenter i `apps/mobile`.
**Skisser före kod.** Ta fram en visuell riktning för betans flöden: uppladdning, analys pågår, resultat per
regel (med skaftets tracer), regelval/rekommenderat regelset, livesession (hörlursläge) och historik.
Leverans: skisser/mockups som Erik godkänner, sedan tokens och komponenter i `apps/mobile`. Club Cream
([design-system.md](design-system.md)) är utgångsläge, inte krav. Ingen produktkod före godkända skisser.

## Ström F — Regelset (beta-punkt 3)

Ny 2026-10-25. Inte samma som öppna frågor F1–F9 i [oppna-fragor.md](oppna-fragor.md).

### [~] F-1 — Rekommenderat regelset
2026-10-25 (dirigent): [ADR-0005](adr/0005-rekommenderat-regelset.md) (Föreslagen) och ren `recommendRules()` i core
(vinkel + nivå + valfri målfas + V-1-karta → ordnade biblioteks-id, valideringsstatus, motiveringskoder; 12 tester).
Används ännu inte av appen. **Beslut Erik 2026-10-25:** nivåerna (nybörjare/medel/avancerad, max 3/5/6 regler)
godkända; omätta regler visas som "ej validerad" tills V-1 är kört; ADR-numret 0005 bekräftat. ADR-0005 satt till
Accepterad (körning 3). Kvar: V-1-gränser mot baslinjen (väntar på V-1), UI (väntar på D-1).
Användaren väljer regler själv **eller** får ett rekommenderat regelset. Skriv ADR för hur rekommendationen
görs (utgångsläge, kameravinkel, nivå, vad som visas och varför). **ADR-numret:** Erik skrev "ADR-004", men
0004 är native-pipelinen ([ADR-0004](adr/0004-native-pipeline-nitro-modules.md)); nästa lediga är **0005**
— bekräftas av Erik. Rekommendationen bör bara innehålla regler med godtagbar träffsäkerhet i V-1.

## Ström W — Worker

W-1 ligger i [arkivet](archive/backlog-strommar.md).

### [📱] W-2 — Identitet per installation + tak per identitet
2026-10-25 (dirigent, körning 3): **Worker-delen klar, ej deployad.** `X-SwingCheck-Install` → tak per installation och
UTC-dygn (40 anrop / 400 000 tokens, 429 `install_cap_reached`), D1 `install_usage` (migrering 0003), CORS tillåter
headern, `swingcheck://se.swingcheck.app` i `ALLOWED_ORIGINS` (N-3.5). **D1-bindningen rättad `swingcheck-logs`→`DB`**
(fel sedan `619e586`: D1-loggar och globala taket har varit avstängda i prod; slås på vid deploy). 18 nya tester.
**📱 Erik:** 1) `cd worker`, följ [identitet-w2.md → Deploy](native/identitet-w2.md#deploy-erik-kör-lokalt) (migrering + deploy);
2) kör röktesterna där; 3) bygg om dev-klienten och kör en analys på iPhone. Kvar därefter: App Attest före öppen release,
UI för taket i appen (N-3.6). Core kastar sedan körning 3 `UsageCapReachedError` (`scope` install/daily, Workerns
text som `message`) i stället för rå JSON; 3 tester.
2026-10-25 (dirigent): klientdel + spec. Core `lib/installId.ts` (UUID v4, validering, testad); appen läser/skapar
identiteten i Keychain (`expo-secure-store`, `THIS_DEVICE_ONLY`) och skickar `X-SwingCheck-Install`. Webben skickar
den inte (CORS). Spec + Worker-kodskiss: [identitet-w2.md](native/identitet-w2.md). **Beslut Erik 2026-10-25:** ja —
Workern tar emot headern med tak per identitet (40 anrop / 400 000 tokens per dygn, D1-tabell `install_usage`,
migrering 0003), i samma deploy som N-3.5:s origin. Dirigenten implementerar Worker-delen + migreringen med tester
och skriver exakta deploy-/migreringskommandon; **Deployad 2026-10-25 (Erik):** migrering 0003 applicerad, Worker-version `228eee42`, röktest a–c gröna (preflight 204 med `X-SwingCheck-Install`, `invalid_json`, `install_usage` finns). `env.DB`-bindningen fungerar nu (globalt tak + `/api/log` aktiva). Kvar därtill: ombyggd dev-klient + enhetsprov, App Attest före öppen release.
**Före N-6.** Inget inloggat konto i betan. Appen skapar en anonym identitet per installation (slumpad,
lagrad i Keychain) och skickar den till Workern. Workern begränsar per identitet (anrop och/eller tokens per
dygn) och loggar förbrukningen, så att kostnaden per analys går att följa. Native-anrop har ingen `Origin`,
som Workerns allowlist i dag avvisar: specen ska ange hur appens anrop autentiseras utan att nyckeln eller en
delad hemlighet hamnar i klienten i klartext (t.ex. App Attest), och vad som gäller tills det finns.
Webbens flöde får inte brytas.

---

## Parkerat i arkivet (öppna punkter i arkiverade strömmar)

Görs inte förrän de flyttats hit. Full text i [archive/backlog-strommar.md](archive/backlog-strommar.md).
- **B-1–B-3, G2-1–G2-2** (RLS, auth, tränarvy): inloggat konto är utanför betan. Ersätts i betan av W-2.
- **S-45** `[~]` provsvingar accepteras som svingar: berör betans "sving plockas ut". Väntar på S-48-uppföljning
  och nytt anropsgodkännande.
- **S-47** modellhosting: webbens fråga; i appen bärs modellerna i bygget (N-7 låser versionen).
- **C-2** (iOS PWA), **D-5** `[~]`, **E-1**, **S-8** `[~]`: webbspåret (PWA), inte i betan.
