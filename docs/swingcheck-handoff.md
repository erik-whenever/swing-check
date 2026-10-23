# SwingCheck — Handoff / Överlämning

> Aktuell kontext för en ny session. Läs tillsammans med [BACKLOG.md](BACKLOG.md) (auktoritativ för gjort/kvar).
> Stabil arkitektur: [../KONTEXT.md](../KONTEXT.md). Senast uppdaterad: 2026-10-23.
>
> **Senast (2026-10-23, stream-native):** N-2: pose lite på iPhone 16 Pro **klarar grinden**: 17,3 ms
> median och 18,7 ms vid p95, 0,15 % tappade rutor (bara under uppvärmningen), thermal `nominal` i 3 min.
> Kvar: pose full, skaft och Android.
>
> **Före det:** N-2 fortsätter med delad spike (Eriks beslut). Byggen:
> `pose-lite`, `pose-full` och `shaft` (eas.json). Appen väljer variant via sitt bundle-id. Skaftbygget har
> **Burst 26** för produktens mönster. F6 och N-3 noterar: skaftet körs i Core ML direkt på iOS, eftersom
> TFLite krockar med MediaPipe. **Nästa:** Erik bygger `pose-lite` för iOS.
>
> **Före det (2026-10-23):** N-2 stoppad vid första iOS-bygget. MediaPipe och
> fast-tflite länkar båda in TFLite:s C-API: 54 dubbla `TfLite*`-symboler mellan `TensorFlowLiteC` 2.17.0 och
> `libMediaPipeTasksCommon_device_graph.a` (bygge `60a0c910…`). Inte lappat. **Väntar på Eriks beslut**,
> se rapporten i sessionen och BACKLOG N-2.
>
> **Före det (2026-10-23):** N-2 pågår (`[~]`). Erik valde SDK 54 + VC4 +
> `react-native-mediapipe-pose-plugin` i `apps/spike`. Steg 4 är klart: `training/export_tflite.py`,
> där TFLite-CPU har 0,000 px avvikelse mot ONNX. Spiken är byggd och verifierad lokalt (prebuild,
> bundling, tsc/eslint). **Nästa:** Erik kör `eas login`, enhetsregistreringen och `eas build` för
> `development` (lite) och `development-full`, iPhone först. Mät enligt `apps/spike/README.md`. Om
> bygget fallerar på dubbla TFLite-symboler: stoppa och rapportera, lappa inte. Modellen och
> paritetsbilden är gitignorerade, och Metro serverar dem från Eriks dator under mätningen.
>
> **Före det (2026-10-23):** N-2 stoppad i steg 3 enligt uppdraget. Inget färdigt
> MediaPipe Pose-bibliotek för VisionCamera på iOS håller på Expo SDK 58 / VisionCamera 5, och ingen kod
> är skriven. Alla VisionCamera-posepaket är v4-plugins (detaljer i BACKLOG N-2). Närmast är
> `react-native-mediapipe-pose-plugin`: synkront, ingen fps-strypning, validerad på iPhone med SDK 54 /
> VC 4.7.3. **Väntar på Eriks beslut:** lås spiken till SDK 54 + VC4 med det paketet, eller skriv en egen
> Nitro-modul för VC5. **Risk oavsett väg:** MediaPipe och `react-native-fast-tflite` kan krocka på
> dubbla TFLite-symboler vid länkning.
>
> **Före det (2026-10-23, stream-native):** N-1b klar. Poseenvelope-kedjan, `fromDetection`, `api.ts`,
> `sessionStats`, `phaseQuota` och `datasetTypes` ligger i `@swingcheck/core`, med tester och fixtures
> (`packages/core/src/lib/__fixtures__/`). Loggern är delad: core har nivåer, konsol och ringbuffert och tar
> miljö och sinks via `configureLogger`/`addLogSink`. `src/lib/logger.ts` är webbskalet (fjärrloggning,
> `window.onerror`) och re-exporterar kärnans API. `api.ts` konfigureras via `src/lib/coreSetup.ts`, som
> importeras först i `main.tsx`. **Spärren "rör inte `frameExtractor` före Ström A" är upphävd.** A-3–A-5
> är `[-]`, ersatta av ström N (F6). Kvar i `src/lib`: bara filer med direkt webbruntime (se BACKLOG N-1b).
> Känt sedan tidigare: `scripts/*.test.mjs` (3 filer) laddar inte i vitest. Det gällde även före N-1.
>
> **Före det (2026-10-23, stream-native):** F6 beslutad (React Native). Ny ström N i BACKLOG.
> **`stream-shaft` är fryst:** `stream-native` grenades från den, och fortsatt skaftarbete sker där.
> N-1 klar: `packages/core` (`@swingcheck/core`, npm-workspace, ren TS utan byggsteg) har 30 filer:
> `types.ts`, `ruleLibrary`, `prompt`, `cameraAngle`, `shaft/measure` utom `fromDetection`, `letterbox`,
> `shaftPostprocess`, `mp4Probe`, `slowmo`, `zip` m.fl. Webben importerar `@swingcheck/core/lib/…`.
> Tester 438 före och efter. Kvar i webben trots ren logik: hela poseenvelope-kedjan (typ-import av
> `PoseSample` från `poseTrajectory` och `SwingPhase` från `frameExtractor`) och `api.ts` (logger och
> `import.meta.env`). `npm run lint` har 2 fel sedan tidigare (`FrameLightbox`, `useHistory`).
>
> **Före det (2026-10-23, stream-shaft):** S-49 **stängd som känd begränsning** (Eriks val iii).
> 15 fps: kort finish mot topp-som-finish. 30 fps löser 4613/5406, och det är nu underlag under F6
> (2× poseinferens, kräver omkalibrering). Variant (ii) hade enligt en read-out räddat båda, men den
> är inte mätt på resten. 3587 är topp-som-finish i 30 fps, och webbklippen är inte mätta i 30 fps.
> [shaft/fps-missed-swings.md](shaft/fps-missed-swings.md) §7.
>
> **Före det (2026-10-23, stream-shaft):** S-49 fixförsök **stoppat** (`[~]`). En fps-oberoende
> finishgrind (hållkrav 0,1 s, 30 fps-ekvivalent utjämning, förregistrerad i `c1fd057`) räddar
> 4613/5406 och håller S-45-facit (0 slag förlorade, falska 10 → 10). Men den flyttar 90 av 101
> webbenvelopes, tappar en S-32-sving (`072`) och gör toppvila till finish (`062`, `070`, 3587 i
> 15 fps). session-multi-testet faller med 2,05 rutor. `poseEnvelope.ts` är orörd, ändringen ligger
> som patch. Beslut (i/ii/iii) väntar: [shaft/fps-missed-swings.md](shaft/fps-missed-swings.md) §6.
>
> **Före det (2026-10-23, stream-shaft):** S-49 (diagnos, klar): 4613, 5063 och 5406 får 0 svingar i
> appens 15 fps-kedja. Alla tre fälls av `clipped tail`, och alla tre är sannolikt slag. 4613 och 5406
> beror på **fps**: `peakSpeed` krymper till ~0,6× i 15 fps medan rörelsen efter finishen inte gör
> det, och hållkravet är 3 sampel. Därför klarar inte en kort hållen finish settle-grinden. 5063
> beror på **spåraren**: WASM-PoseLandmarker ger falska detektioner när golfaren gått ur bild, och
> interpolationen gör dem till en skenrörelse. Python accepterar 5406 bara på en kameraartefakt.
> Ingen tröskel ändrad, inget beslut. [shaft/fps-missed-swings.md](shaft/fps-missed-swings.md).
>
> **Före det (2026-10-23, stream-shaft):** S-13 stängd (`[x]`) — Erik iPhone-verifierade shaft-v2
> (preview-deploy, `IMG_5765`): load 606 ms, inferens median 83 ms (76–95), preprocess 35,5 ms,
> 1 sving / 26 frames. Punkterna verifierade mot Python inom 1 px på desktop, inte okulärt på iPhone.
> Känd brist (ej prioriterad, F6): `ShaftPreviewView` laddar om till startsidan vid skroll efter
> resultat, även efter `3e2ee68`; ingen JetsamEvent. `shaft-v1.onnx` kvar — används av
> `training/prelabel_batch.py` (`GEOMETRY_REFERENCE_MODEL`); radering väntar på Eriks beslut.
>
> **Före det (2026-10-22, stream-shaft):** S-45 steg 3 avbrutet efter 4 av 90 Vision-anrop. Bollfrågan är
> obesvarad (n = 1, rätt). Fynd → **S-48:** produktionens anrop med 7 DTL-regler klipps vid
> `max_tokens` i quick-läge (600) **utan** tillägg, och i detaljerat läge (2000). Ogiltig JSON blir
> ett betalt, misslyckat anrop. Bildrutor för alla 81 finns i `data/shaft/practice-review/vision/frames/`.
> 86 anrop återstår av godkännandet men kräver nytt ja. [shaft/practice-review/vision-ball.md](shaft/practice-review/vision-ball.md).
>
> **Före det (2026-10-22, stream-shaft):** S-45 steg 2 (`[~]`, väntar på beslut) — poängsatt. 10 av 81
> accepterade svingar är falska (9 provsving, 1 ingen sving, 12 %). Ingen körtidssignal i grinden
> skiljer dem (bästa kandidat: 5/10 mot 6/71 slag, klippsammanblandad). Ingen tröskel vald.
> Rekommendation: ingen grind nu. Vid behov: be Vision om boll vid adress/finish.
> [shaft/practice-review/resultat.md](shaft/practice-review/resultat.md).
>
> **Före det (2026-10-22, stream-shaft):** S-13 (`[~]`) — iPhone-försök via preview-deploy: shaft-v2
> kör (load 606 ms, inferens median 83 ms) men dev-vyn gav svarta bildrutor + flikomladdning. Orsak:
> 26 fullupplösta JPEG:er i state/`<img>`. Dev-vyn visar nu ~360 px thumbnails, detektion oförändrad
> på full upplösning. **Återstår: Erik ser punkterna på iPhone** (ny preview-deploy). Ny öppen post
> S-47: modellen är gitignorerad → ingen git-build har den (modellhosting, inget beslut).
>
> **Före det (2026-10-22, stream-shaft):** S-45 steg 1 (`[~]`) — bedömningspaket slag vs provsving.
> Produktionens segmenterare (dev-appen, puppeteer, 15 fps WASM) på 70 egna klipp → **81 svingar i
> 59 klipp, 11 klipp med 0**. Blind vy: `start data\shaft\practice-review\erik\index.html`, frö
> `0x45a1c0de`, nyckel `data/shaft/practice-review/key.json` (öppnas efter svaren). Återstår: Eriks
> svar (`svar-erik.json`), sedan poängsättning. [shaft/practice-review/README.md](shaft/practice-review/README.md).
>
> **Före det (2026-10-22, stream-shaft):** S-46 (klar) — Slo-Mo-flaggan i `extractDataset`, bara för
> klipp som aldrig exporterats: `frozenClips.ts` fryser alla 152 exporterade klipp (batch-01…03 och
> evalset kan inte byta id). Oflaggade klipp: manifest-poster och JPEG byte-identiska före/efter.
> **När en ny export annoteras: lägg dess klipp i `frozenClips.ts`.**
>
> **Före det (2026-10-22, stream-shaft):** S-44 (klar, `[x]`) — Eriks beslut: 3550/3575 rätt avvisade
> (saknar adress) → 5 av 5 räddningsbara med rätt antal; 3587 topp-som-finish = känd begränsning
> (shaft/STATUS.md §7); provsvingar → S-45 (öppen, ingen kod). Produktionens uppladdning kör inte
> segmenteraren — felet slog mot dataset-extraktionen och dev-vyerna, inte uppladdande användare.
> Ingen merge till main. Tidigare text: sträckta Slo-Mo-klipp i segmenteraren.
> `readTimeStretch` (intent 0 + < 90 fps) → `STRETCH_MAX_FACTOR = 8` på `MAX_ENVELOPE_SEC`,
> `MAX_BURST_SEC`, `MAX_DOWNSWING_SEC`. Egna klipp: 78 → 84 svingar, 61 oflaggade byte-identiska;
> 4 av 7 missade räddas rent, 3587 med fel gränser (envelope slutar vid toppen), 3550/3575 kan inte
> räddas utan undre gränser, 3597 får en provsving. Produktionens uppladdning kör inte segmenteraren
> (frameExtractor låst) — fixen syns i Segmentation View och märker `SessionSwing.timeStretched`.
>
> **Före det (2026-10-22, stream-shaft):** S-43 (klar) — **intervall + faktor finns INTE som uppgift i
> filen.** Bara implicit, i tidtagningen hos telemetrispåret `scene-illuminance` (exakt 4×-platå + ramper
> i 3 av 11 egna klipp), och det spåret saknas i telefonens väljar-fil `IMG_3584` och i 8 av 11 lokala.
> Ljudets tonhöjdsfall är näst bästa signal men för brusigt som detektor. Panelen visar nu sträcknings-
> profil, mebx-värden och ljudprofil. Detektor att bygga på: `full-frame-rate-playback-intent` (S-42).
>
> **Före det (2026-10-22, stream-shaft):** S-42 (klar — nyckeln överlever väljaren; iOS kodar om
> `hvc1`→`avc1`) — telefontest bekräftade att iOS-väljaren
> lämnar ut den tidssträckta Slo-mo-filen (burst 6,85 s > `MAX_BURST_SEC`, 0 svingar). Ny dev-panel
> **Container metadata** i Frame Preview (`mp4Probe.ts` + `Mp4MetaPanel.tsx`, bakom
> `VITE_DEV_PREVIEW`) visar `mvhd` vs `video.duration`, spår/stts-fps och alla
> `com.apple.quicktime.*`-nycklar för den File som faktiskt nådde `<input type=file>`. Verifierad
> mot alla 70 egna klipp (census exakt som [shaft/slowmo-diagnosis.md](shaft/slowmo-diagnosis.md)).
> Återstår: Eriks avläsning på iPhone via preview-deployen av `stream-shaft`. Ingen fix, ingen
> tröskel ändrad.
>
> **Senast (2026-09-20, stream-shaft):** S-41 (klar, `[x]`) — **grov läsning av toppens
> skaftriktning: den stabiliserar inte, och grinden blir sämre.** Read-only, ingen ny estimator,
> ingen tröskel, ingen klassificerare, ingen kalibrering, inget skift, ingen produktionskod
> skriven, S-30:s spärr kvar. `ON_PLANE_BAND_DEG` och `NEAR_VERTICAL_GATE_DEG` är **lästa, aldrig
> ändrade**. Rapport: [shaft/top-review/coarse-tso.md](shaft/top-review/coarse-tso.md), skript
> [coarse_tso.py](shaft/top-review/coarse_tso.py). **S-39:s brygga är orörd och återanvänd** — den
> här omgången skriver ingen egen, den importerar `verdict_sensitivity.py`:s `payload_for`,
> `load_dense`, `clip_landmarks`, `build_bridge`, `run_bridge` och `verdict`.
> **GROVHETEN ÄR EN OMETIKETTERING AV PRODUKTIONENS EGNA SVAR**, gjord i skriptet efter att
> `src/lib/shaft/measure/` svarat — så den kan per konstruktion bara ta bort byten, och skriptet
> **stannar** om en grov läsning byter där den fina inte gör det. Allt mäts VARMT. **Den fina
> läsningen är kontrollen och reproducerar S-39 värde för värde** (9/100, 11/93, 11/95, 12/91,
> 13/101, 65/91, 38/44, 27/47, och svar/tystnad 2/100, 5/91, 6/101, 3/93, 6/95); kontrollraden
> reproducerar S-32…S-40.
> **PRAKTISKT, OCH DET SPARAR TRE TIMMAR NÄSTA GÅNG: underlaget ligger nu under
> `data/shaft/top-review/`** (gitignorerat via `data/shaft/*`) i stället för i `<tmp>` — `pose/`
> (103 kalla envelopebanor), `clippose/` (81 varma helklippsbanor), `dense/` (103 detektorbanor,
> **6 548 rutor**), `manifests/`, `work/` och ett `.venv/` med samma pinnar S-33…S-40 körde
> (mediapipe 1.0.1, opencv-python 5.0.0.93, numpy 2.4.6). Allt kördes om från noll den här
> omgången och reproducerade exakt. Kommandon i rapportens *Kör om*.
> **1 — GROVHETEN KÖPER NÄSTAN INGENTING.** `top-shaft-orientation` byter mellan **kall och varm
> spårare** på **9 → 9 av 100**, mellan **spannets ändar** på **12 → 11 av 91**, mellan **E3 och
> E4** på **13 → 11 av 101**, Erik **11 → 11 av 93**, Lisa **11 → 10 av 95**. **Tvåvägs ger exakt
> samma täljare som trevägs i alla fem raderna.** *Bland de svarande*, med läsningens egen nämnare,
> blir grovheten **sämre**: spannet 18,2 % (12/66) → **20,4 %** (11/54) trevägs, **20,8 %** (11/53)
> tvåvägs — nämnaren faller snabbare än täljaren. **En kontrolläsning som slår ihop bara
> tystnadsskälen och behåller `cannot-determine` ger identiskt samma tal som den fina i varenda
> cell**, alltså tar den sammanslagningen bort **noll** byten; hela vinsten är `cannot-determine`.
> **RENA TECKENBYTEN across ↔ laid-off ÄR 0 UNDER SAMTLIGA FEM STÖRNINGAR** (n = 100, 93, 95, 91,
> 101) — iakttagelsen vid −1 ruta håller mycket bredare. Men av spannets elva kvarvarande byten går
> **nio mellan tystnad och en kallad riktning** och två över `ON_PLANE_BAND_DEG`:s kant. **Det
> instabila är tystnadskanten, inte kategoriupplösningen och inte riktningen.**
> **2 — PRISET ÄR 40 AV 91 RADER i 33 av 73 klipp (44 %).** På E4:s ruta förlorar de en distinktion
> den fina kategorin bar: **`cannot-determine` 20** rader (17 klipp), **`phase-missing` 13** (12),
> **`camera-angle-mismatch` 7** (6). I coachingtermer tre besked med tre olika åtgärder — *"din
> topp är för upprätt för att ha en sida"* (som `derived.ts` uttryckligen kallar ett **resultat om
> svingen**, där *"nothing about the footage could be improved"*), *"filma om"* och *"filma
> bakifrån"* — som blir ett enda blankt. **Trevägs och tvåvägs kostar exakt lika mycket**, för
> `on-plane` inträffar på **0 av 91** rader på E4:s ruta och på **20 av 1 756** besvarade
> kandidatrutor i rundan (1,1 %). **Mellankategorin är i praktiken tom**, så uppgiftens två grova
> läsningar är samma läsning på det här underlaget.
> **3 — E4 GROVT MOT FACIT: 65 → 68 av 91 (71,4 % → 74,7 %), tvåvägs 69 (75,8 %).** n = 91 rader i
> 73 klipp. E4 **inne** i spannet: 38 → 40 av 44 (86,4 % → 90,9 %); **utanför**: 27 → 28 av 47
> (57,4 % → 59,6 %), tvåvägs 29 (61,7 %). `cd`-kontrollen ger oförändrat 65. Av de 23 kvarvarande
> skillnaderna går **18 mellan tystnad och ett svar** och **4 är riktiga teckenoenigheter**
> (`S32-009`, `S32-012`, `S32-063`, `S32-100`) — samma fyra som S-39, och grovheten kan per
> konstruktion inte laga dem.
> **4 — GRINDEN HÅLLER INTE LIKA BRA GROVT.** Svar/tystnad går från **2/100 → 9/100**,
> **5/91 → 9/91** (tvåvägs 11), **6/101 → 11/101**, Erik 3/93 → 9/93, Lisa 6/95 → 8/95, och
> täckningen halveras: **52 av 101** mot den finas **73** (51,5 % mot 72,3 %). Mekanismen är
> `cannot-determine` på tystnadssidan: de två ändarna skiljer sig fint *och* en av dem är
> `cannot-determine` på 7/100, 6/91, 9/101, 6/93, 4/95. `NEAR_VERTICAL_GATE_DEG` är satt medvetet
> brett för att **hellre** svara `cannot-determine`, så den grova grinden ärver spärrens egen
> kantkänslighet. **Kollapsen i sig kräver ingen tröskeländring** — den är en ometikettering i
> konsumenten — men att skeppa den vore att skeppa en grind som flippar på var tionde sving under
> störningar som inte betyder någonting och tiger på 48 %.
> **5 — APPEN KAN INTE LEVERERA EN OBSERVERAD TOPP ALLS, och det saknas inte en flagga utan en
> kedja.** `phaseSource`, `'observed'`, `DetectedFrame`, `buildShaftSwingSeries` och
> `buildShaftMeasurements` har **noll träffar i `src/`** utanför `src/lib/shaft/measure/` och dess
> tester — **adaptern har ingen producent**. De två faslägg­arna (`labelPhase()`, `derivePhase()`)
> är båda tidsjämförelser mot `envelope.impact.topSec`, och `derivePhaseWithSource()` returnerar
> per konstruktion `envelope-impact`/`envelope-fallback`. **`topSec` finns bara i grenen med säkert
> nedslag** (`topIdx` = minsta y före `impactIdx`): **83 av 103 svingar (80,6 %)**; på de övriga
> **20** finns ingen `top`-etikett alls. Toleransen är `max(POINT_TOL_SEC 0,06, sampleDt)` med
> `sampleDt` från en **15 fps**-bana (~2 videobildrutor vid 30 fps). Rutan måste dessutom ha
> avkodats — S-40 §3 mätte E4:s ruta bland produktionens 32 på **39 av 101**. Plus `handedness`
> (`unknown` på 103 av 103, avvisar TSO rakt av) och `cameraAngle` (`dtl` krävs; i appen ofta
> `null` → `uncertain`, alltså **mildare** än rundans grind). **Att låta en estimator sätta
> `observed` är en omdefinition av vad flaggan betyder, inte en tröskeländring** — det är hela
> S-30:s öppna fråga. Nytt i [shaft/STATUS.md](shaft/STATUS.md) §6.
> **ÖPPET EFTER S-41:** ingen läsning är vald och ingen föreslagen. Det finns fortfarande **inget
> facit för kategorin** (bedömarna ritade toppens bildruta, inte dess `across`/`laid-off`), så
> "rätt" i §3 betyder bara "vad enrutan vid människornas mittruta sade". Andra kollapser är
> oprövade (t.ex. `cannot-determine` som en egen synlig text, eller tystnadsskälen åtskilda mot
> användaren). `on-plane`-bandets **läge** är omätt — 1,1 % säger bara att det sällan nås.
> Grov läsning är **inte** kombinerad med fönsterläsning; korsningen är omätt. De två tysta
> mätvärdena är inte lästa grovt (de har ingen kategori). Face-on är tyst rakt igenom.
> Händighet antagen `right`. Kvar oprövat även varmt: 15 fps mot 30, delegat, avkodare, livevägen.
>
> **Dessförinnan (2026-09-20, stream-shaft):** S-40 (klar, `[x]`) — **fönsterläsning av toppen: vad
> aggregering köper och vad den betalar.** Read-only, ingen ny estimator, ingen tröskel, ingen
> klassificerare, ingen kalibrering, inget skift, **ingen bredd vald**, ingen produktionskod
> skriven, S-30:s spärr kvar. Rapport:
> [shaft/top-review/windowed-tso.md](shaft/top-review/windowed-tso.md), skript
> [windowed_tso.py](shaft/top-review/windowed_tso.py) +
> [windowed_outcomes.ts](shaft/top-review/windowed_outcomes.ts). **S-39:s brygga är orörd** —
> den här omgången har en egen, så `verdict_sensitivity.py` kör vidare på exakt sin egen kod.
> `src/lib/shaft/measure/`, `frameExtractor.ts` och `poseEnvelopeSelection.ts` är **importerade
> och anropade**, aldrig återimplementerade. Allt mäts VARMT. **Bredd 1 är kontrollen och
> reproducerar S-39 värde för värde** (9/100, 13/101, 11/93, 11/95, 12/91, 65/91, och samma
> fördelning på E4:s ruta); kontrollraden reproducerar S-32…S-39.
> **KONSTRUKTIONEN ÄR PRODUKTIONENS EGEN.** `shaftAngleByPhase` aggregerar redan `top`-hinken med
> `circularMedianDeg`; märks ett fönster som `top`/`observed` räknar produktionen fram medianen
> själv. Medoiden **pekar ut en bildruta**, som lämnas tillbaka som enda observerad topp — så
> närlodrätt-spärren, on-plane-bandet, kameragrinden och S-30:s regel körs oförändrade.
> **1 — JA, FÖNSTRET STABILISERAR, MONOTONT MED BREDDEN (1/3/5/7).** `top-shaft-orientation`
> byter mellan **kall och varm spårare** på **9 → 7 → 2 → 2 av 100**, mellan **E3 och E4** på
> **13 → 10 → 5 → 2 av 101**, och mellan **spannets ändar** på **12 → 10 → 10 → 5 av 91** (bland
> de svarande 18,2 % → 6,1 %). **MEN MEKANISMEN ÄR ÖVERLAPP, INTE OMRÖSTNING:** vid bredd 7 läser
> spannets två ändar **samma bildruta på 46 av 91** mot 3 av 91 vid bredd 1, och medianen röstade
> bort en riktad avvikare på bara **0/0/6/9** av 101 fönster. Nämnaren växer dessutom (66 → 82
> svarande). Majoritetsröst som kontrollaggregator rör sig åt samma håll — **riktningen hänger
> inte på aggregatorn.** Och raderna är ingen delmängd: av spannets 12 bytare vid bredd 1 är bara
> **2** kvar bland de 5 vid bredd 7; **3 av 5 är rader fönstret självt brutit**, och 4 av 5 korsar
> `NEAR_VERTICAL_GATE_DEG`.
> **2 — KOSTNADEN ÄR ENTYDIG OCH ENKELRIKTAD.** Mot S-39:s egen referens (enrutan vid
> människornas mittruta) faller E4:s överensstämmelse från **65 av 91** till 60 / 59 / **55**.
> Bokfört: fönstret **tappar 6 / 7 / 11** rätta rader och **rättar 1** — netto −5 / −6 / **−10**,
> och den tappade mängden är **nästlad**. Fönstret flyttar också referensen själv: vid
> människornas mittruta ger bredd 7 ett annat utfall än enrutan på **35 av 91 (38 %)**. Läst mot
> en referens av *samma* bredd blir talet 82 av 91 — **cirkulärt**, 6 av 7 rutor delade, och står
> med bara för att inte utelämnas. **Stabiliteten är konvergens mot samma ruta, inte mot rätt.**
> **3 — FÖNSTRET FINNS INTE I PRODUKTIONENS RUTNÄT, och "~20 rutor" är inaktuellt.**
> `ANALYSIS_FRAME_COUNT` är **32** sedan 2026-08-11 (10 → 20 → 32) → median 27 picks och **26
> distinkta bildrutor**. Klippvägen skickar **inga** `clusterPhases`, så klustret ligger på
> **nedslaget** och toppen får bara den uniforma baslinjen: steget kring E4 är median **3
> bildrutor** (p90 6, max 16), och E4:s egen ruta är en vald ruta på bara **39 av 101**.
> **Rutnätet rymmer hela fönstret på 2 av 101 vid bredd 3 och 0 av 101 vid bredd 5 och 7.**
> Nya rutor att detektera: median **2 / 3 / 4** per sving (p90 2 / 4 / 6), 6 / 9 / 12 % av
> budgeten, 183 / 298 / 409 totalt — och budgeten är inte fri (`fittable()` kapar redan).
> **Djupare gräns:** envelopen och varje fas lokaliseras på en **15 fps**-bana (`SAMPLE_FPS`), så
> ett fönster centrerat på en 30 fps-bildruta är finare än den upplösning toppen hittas i.
> **Och mätlagret körs inte alls i produktion:** `buildShaftMeasurements`, `buildShaftSwingSeries`
> och `checkShaftSeries` har **noll anrop** utanför `src/lib/shaft/measure/`; `detectShaft` körs
> bara i den dev-only förhandsvisningen. Nytt §6 i [shaft/STATUS.md](shaft/STATUS.md).
> **4 — DE TVÅ TYSTA MÄTVÄRDENA ÄR INTE STABILARE, DE HAR MINDRE ATT SÄGA.** På svar/tystnad —
> den enda axel alla tre har — ligger de på samma tal som `top-shaft-orientation`: 2 av 100,
> 5 av 91, 6 av 101 vid bredd 1 (`top`-hinken 7 vid E3/E4; dess svarsmängd är inte riktigt de
> andras) och 0–1 vid bredd 7. **Hela `top-shaft-orientation`:s överskott ligger i KATEGORIN**
> (9 / 13 / 12 mot 2 / 6 / 5), och kategorin är det en regel skulle läsa. **Att koppla dem kräver
> fyra saker, och händighet är inte den bindande:** (i) en konsument finns inte alls; (ii) en
> **observerad** topp — `fromDetection.ts` skriver själv att appens väg *"never `observed`"*, så
> S-30:s spärr tystar dem på varje sving i appen; (iii) `shaft-position-p4` kräver dessutom
> `cameraAngle: 'dtl'` + fyra landmärken (i appen ofta `null` → `uncertain`, inte `rejected`);
> (iv) **ett band** — båda returnerar tal utan kalibrerad gräns någonstans i repot. Fönstrets enda
> oomstridda vinst är **täckning**: `shaft-position-p4` svarar 73 → 86 av 101, `top`-hinken
> 78 → 92, `phase-missing` 18 → 5. **Men §2 mäter vad det svarar.**
> **ÖPPET EFTER S-40:** ingen bredd vald och ingen föreslagen — netto −10 rader vid bredd 7 är
> priset, och ingen har avgjort om det är värt täckningen. Jämna bredder och bredder > 7 är
> omätta. **Det finns fortfarande inget facit för kategorin** (bedömarna ritade toppens bildruta,
> inte dess `across`/`laid-off`), så "rätt" i §2 betyder bara "vad enrutan vid människornas
> mittruta sade". Face-on är tyst rakt igenom (10 rader, kameragrinden). Händighet antagen
> `right`. Produktionens rutnät är **återspelat** ur registret, inte observerat. Kvar oprövat även
> varmt: 15 fps mot 30, delegat, avkodare, och livevägen.
>
> **Dessförinnan (2026-09-19, stream-shaft):** S-39 (klar, `[x]`) — **från bildrutefel till
> utfallsfel, och 3,0-buggens spridning.** Read-only, ingen ny estimator, ingen tröskel, ingen
> klassificerare, ingen kalibrering, inget skift, ingen produktionskod skriven, S-30:s spärr kvar.
> Rapport: [shaft/top-review/verdict-sensitivity.md](shaft/top-review/verdict-sensitivity.md),
> skript [verdict_sensitivity.py](shaft/top-review/verdict_sensitivity.py) +
> [verdict_outcomes.ts](shaft/top-review/verdict_outcomes.ts). **`src/lib/shaft/measure/` är
> importerat och anropat, aldrig återimplementerat** — ett utfall är vad produktionskoden säger att
> det är. Allt mäts VARMT; kontrollraden reproducerar S-32 till S-38 exakt. **Nytt underlag:**
> `run_dense.py` (S-28, oförändrad) kör `shaft-v2.onnx` på **alla 6 548 envelope-bildrutor**,
> kontrollerat mot registrets `frameTimes`.
> **INVÄNDNINGEN FÖRST: bara ETT av de tre toppankrade mätvärdena har ett pass/fail i koden.**
> `top-shaft-orientation`:s `category`. `shaft-position-p4` och `top`-hinken returnerar tal som
> **ingen regel i `src/` läser**, så deras enda kodade utfall är svar↔tystnad. Ingen tröskel
> uppfanns för att tillverka ett tredje.
> **1 — ETT BILDRUTEFEL ÄR ETT UTFALLSFEL (n = 101 rader / 79 klipp).** Vid ±1 ruta byter
> `top-shaft-orientation` på **23 (−1) / 22 (+1) av 101**, minst ett av dem på **37 av 101 (37 %)**;
> kumulativt ±2/±3/±5: 50 / 59 / 68. `shaft-position-p4` 20 av 101 och `top`-hinken 23 av 101 vid
> ±1. **57 % av bytena vid −1 är kategori mot kategori**, inte tystnad. Rena teckenbyten
> (across ↔ laid-off): 0 vid −1, 3 vid +1, 9 vid −5.
> **KONTROLLEN ÄR DET VIKTIGASTE TALET:** kall mot varm spårare — samma modell, samma vikter, samma
> bildrutor — byter utfall på **9 av 100 (9 %)**, och E3 mot E4 (≤ 1 ruta isär per konstruktion) på
> **13 av 101 (13 %)**. **Utfallet är alltså inte reproducerbart ens vid noll bildrutors fel**, så
> frågan "duger E4" är felställd: en estimator på den här posebanan ärver ett utfallsgolv på 9 %
> från spårartillståndet ensamt.
> **2 — MÄNNISKORNAS EGET SPANN RÄCKER OCKSÅ.** Topp på intervallets första mot sista ruta byter
> `top-shaft-orientation` på **11 av 93 (Erik)**, **11 av 95 (Lisa)**, **12 av 91 (unionen)** —
> 16–18 % bland de svarande, vid median **2 rutors** bredd. Av unionens 12: 5 korsar
> `NEAR_VERTICAL_GATE_DEG`, 2 korsar `ON_PLANE_BAND_DEG`, 5 är svar↔tystnad, **0 byter tecken**.
> De två tysta mätvärdena byter på 3–6 rader, alla svar↔tystnad. Underskattning: 24 av Eriks 93
> rader har ett enrutersintervall och kan per konstruktion inte byta något.
> **3 — E4 MOT EN TOPP MITT I SPANNET (n = 91 / 73 klipp): samma utfall 65 av 91 (71 %)** för
> `top-shaft-orientation`, **79 av 91 (87 %)** för de två andra. E4 inne i spannet: 38 av 44 (86 %);
> **utanför: 27 av 47 (57 %)**. Av de 26 skiljande raderna är 14 kallat-mot-kallat, 12 svar↔tystnad
> och **4 rena teckenbyten** (`S32-009`, `S32-012`, `S32-063`, `S32-100`). För de två tysta
> mätvärdena är varenda skiljande rad svar↔tystnad — 87 % betyder "lika ofta tyst", inte "lika ofta
> rätt".
> **4 — DE 4 OFÖRKLARADE KÄRNRADERNA: `S32-009`, `S32-013`, `S32-023`, `S32-080`** (4 klipp), två
> mönster som är varandras motsatser. `S32-013`/`S32-080`: den rätta växlingen finns inne i spannet,
> men E3 armar och löser ut 17–26 rutor tidigare — `e3_signflip` tar den **första** armade, inte den
> närmaste. `S32-009`/`S32-023`: rätt växling **och** rätt ankare, och missar ändå — den ena på
> avrundningen kring ett tvårutersspann, den andra på att handleden rör sig **0,005 bildhöjder** över
> 17 rutor (S-31:s platå, i tal). Beskrivning, ingen regel, ingen bildruta öppnad.
> **5 — 3,0-BUGGENS SPRIDNING: 8 rapporter (S-31…S-38) + STATUS.md, samtliga rättade.**
> Identiteten reproducerades först (`slowmo` == `suspectMultiSwing` == envelope > 3,0 s, 15 av 103,
> noll undantag) — skriptet stannar annars. Etiketterna är utbytta i texten, **inga siffror ändrade**,
> och varje dokument bär ett rättelseblock som pekar på originalordalydelsen i git-historiken.
> Kodnamn och hard-core.md §5:s egen diagnos är orörda. Två slutsatser läser annorlunda efteråt:
> subframe.md §7:s "svansens starkaste signal" är ett påstående om **envelopelängd**, och
> envelope-audit.md §5:s "ligger också alla över `MAX_ENVELOPE_SEC`" följer av definitionen.
> **ÖPPET EFTER S-39:** produktionsvägen kör inte detektorn tätt (~20 valda rutor), så ett
> ±1-rutors skift är inte ens representerbart där — den här omgången kör `run_dense.py`:s
> konfiguration. Händighet (`right`) och kameravinkel (registrets `viewBucket`) är antaganden.
> Ingen regel läser något av de tre mätvärdena, så 22 % är ett mått på mätvärdet och inte på
> produkten.
>
> **Dessförinnan (2026-09-19, stream-shaft):** S-38 (klar, `[x]`) — **den varma baslinjen, den hårda
> kärnan, taket och flaggbuggen.** Read-only, ingen ny estimator, ingen tröskel, ingen
> klassificerare, ingen kalibrering, inget skift, ingen produktionskod skriven, S-30:s spärr kvar.
> Rapport: [shaft/top-review/hard-core.md](shaft/top-review/hard-core.md), skript
> [hard_core.py](shaft/top-review/hard_core.py). **Allt mäts VARMT** (`run_pose_clip.py`, S-37:s
> slutsats om produktionens konfiguration); den kalla körningen används bara till kontrollraden,
> som reproducerar S-32 till S-37 exakt.
> **NY BASLINJE, mot spannet (n=91 rader / 73 klipp): E4 44, E2 40, E3 27, E1 6.** Mot Erik
> (n=94/94/93/93) 5 / 32 / 23 / **37**, mot Lisa (n=95) 5 / 36 / 24 / **40**. Netto mot den kalla:
> E1 −4, E2 −5, E3 −3, **E4 +2**. **E4 är rundans bästa estimator, inte E2**, och det gäller mot
> alla tre målen. E2:s svans är värre varmt (p90 mot Erik 30 → 47, max 205 oförändrad); E3/E4:s
> spridningsmått rör sig inte alls. **Detta ersätter** `inne`-talen i resultat.md §3, subframe.md
> §3 och kontrollraderna i crossing-selection.md, multiswing.md, envelope-audit.md och
> e2-and-floor.md §0/§2, plus §3:s "19 av 91 utan ankarruta" → **23 av 91 (25 %)**. **Resten av
> det kalla biblioteket är INTE omräknat** (LOCO, interpolationens +12 rader, kandidatanalysen,
> svansraderna, tystnadstalet) — de står kvar på en konfiguration produktionen inte kör.
> **KÄRNAN (ingen av E1–E4 inne i spannet): 31 av 91 rader (34 %) i 25 av 73 klipp — men den är
> inte hård.** Bästa estimatorn ligger **1 ruta** fel på 19 av 31 (61 %), inom 3 på 94 %, max 11,
> bara 1 rad ≥10 — mot ett golv på 1 ruta och ett spann på median 2 rutor. Som *radmängd* är den
> inte reproducerbar: kall mot varm delar 23 av 31 (74 %), omsättning 15 rader. Storleken är
> stabil (30 kall, 31 varm), medlemskapet är det inte. E1 är ensam inne på 0 rader, så kärnan
> hänger inte på den.
> **Samma svingar som tidigare grupper? Till stor del ja.** 25 av 31 (81 %) saknar en växling som
> **överlappar** spannet, 19 av 31 (61 %) saknar tillåten ankarruta, och bara **4 rader** har
> ingen av de två förklaringarna. Obs: S-34/S-35:s test `lo ≤ j+1 ≤ hi` missar varje växling vars
> interpolerade svar rundar till `j+2` — därför 63 av 91 med det strikta testet mot **32 av 91**
> med överlappstestet, som är den avsedda frågan.
> **GÅR KÄRNAN ATT FÖRUTSÄGA UTAN FACIT? NEJ.** Tolv storheter, var för sig, ingen tröskel satt:
> **alla AUC 0,43–0,60.** Bäst: största rutsteget och \|E2−E4\|, båda 0,60. Pose-presence är 1,000
> i båda grupperna (0,51); antal armade växlingar exakt 0,50. **Estimatorernas egen oenighet är
> den sämsta kandidaten:** \|E3−E4\| pekar åt fel håll (0,43) och är per konstruktion kapad vid
> 1 ruta — E4 är E3:s egen bracket, så de kan bara vara oense om avrundningen — och \|E2−E4\| har
> 74 % av kärnans rader inne i restens IQR. **Det finns ingen grind att bygga.**
> **TAKET: E4 73 % (44 av 60), E2 67 % (40 av 60)** mot människornas 67–80 %. Men täljaren är
> oförändrad (44 är 44), taket förutsätter en perfekt grind som inte går att bygga, och den skulle
> kasta bort 19 svingar som ligger **en bildruta** fel.
> **FLAGGBUGGEN: tre konstanter, två begrepp, ett värde.** `MAX_ENVELOPE_SEC = 3.0`
> (`poseSegments.ts:54`, 2026-08-06) = produktionens **avvisningsgräns**;
> `SLOWMO_ENVELOPE_THRESHOLD_SEC = 3.0` (`slowmo.ts:28`, 2026-08-13) valdes **oberoende** för
> filmhastighet; `MULTI_SWING_SUSPECT_SEC = 3.0` (`datasetGate.ts:56`, 2026-09-03) är en uttalad
> **spegling** av den första. Ingen commit nämner den andra. Följder: `suspectMultiSwing` tänder
> aldrig på en production-grindad sving (**0 av 81**); 15 %-kvoten för slow-mo mäter i praktiken
> segmenteringsfel; `slowmoMode` flyttar `slowmo` men inte `suspectMultiSwing`; och varje analys
> som delat på "slow-mo" har delat på "lång envelope" — riktningen håller, orsaksnamnet inte.
> **Diagnos, ingen fix.**
>
> **Dessförinnan (2026-09-19, stream-shaft):** S-37 (klar, `[x]`) — **E2, ankaret, mätgolvet och frågan
> vilken konfiguration produktionen faktiskt kör.** Read-only, ingen ny estimator, ingen tröskel,
> ingen kalibrering, inget skift, ingen produktionskod skriven, S-30:s spärr kvar. Rapport:
> [shaft/top-review/e2-and-floor.md](shaft/top-review/e2-and-floor.md), skript
> [e2_and_floor.py](shaft/top-review/e2_and_floor.py). Sju produktionsfiler är **lästa och citerade
> rad för rad**; skriptet stannar om någon citerad rad flyttat.
> **VIKTIGAST — produktionen kör den VARMA spåraren.** `runningMode: 'VIDEO'` är ett spårningsläge
> och instansen återanvänds mellan rutor: `extractPoseTrajectory` bygger en kall spårare **en gång
> per klipp** (`resetPoseLandmarker()`, rad 69) och kör `detectForVideo` på samma instans över hela
> klippet vid 15 fps. Det är `run_pose_clip.py`:s konfiguration. `run_pose.py` — kall per **sving**,
> start envelope−0,6 s — motsvarar ingenting i produktionen, **och samtliga tal i S-31 till S-35 är
> mätta på den.** Även envelopesen i registret kommer ur den varma vägen (`extractDataset.ts:201`).
> Kvar oprövat även varmt: 15 fps mot 30, delegat, avkodare. Den levererande vägen *strömmar* inte
> kameran utan söker i det inspelade klippet; livevägen är varmare men parallell och når inte
> analysen.
> **E2 mot E3:** 45 av 91 mot 30 inne i spannet (mot Erik 36/94 mot 23/93, mot Lisa 42/95 mot
> 27/95), \|median\| 1,0 för båda men p90 26 mot 3 och max 205 mot 26; på klippnivå E2 \|median\|
> **0,0**. E2 har **ingen konstant att kalibrera** (median +0, LOCO 45 → 45) — felet är en ensidig
> svans *efter* spannet (72 %) mot E3:s mittförskjutning (89 % *före*). **Försprånget överlever
> golvet** (+15 kallt, +13 varmt; parvis 27 bara-E2 mot 12 bara-E3). **Mot E4 finns det inte:** +3
> kallt, −4 varmt — stryk "E2 är oftare inne än E4".
> **Ankaret, mätt utan att föreslås:** på **19 av 91 rader (21 %)** finns ingen ruta alls som E2:s
> bakåtsökning kan starta i och landa i spannet — 41 % bland missarna och 4 av 10 i svansen. Där
> mängden finns är den ett **sammanhängande** stycke (72 av 72) på median 6 rutor mitt i envelopen
> (0,43–0,55), som slutar 0–7 rutor efter spannet och 4–12 rutor före nedslaget. **Fart duger inte
> som kännetecken** (träffar når 1,00 × toppfarten, missar 0,31), och där den snabbaste rutan inte
> duger ligger det som skulle fungerat **före** den på 26 av 27 rader.
> **Golvet, alla fyra:** ruta lika 64–73 av ~103, omsättning **6–11 rader**, netto ±5. Rubrikmåtten
> är stabilare än raderna (E3/E4: \|median\| 1,0 / p90 3,0 / max 26,0 i båda körningarna), svansen
> som klass håller (9–10 av 10 samma rader). **Sex slutsatser stryks; två som såg små ut håller** —
> S-32 §5:s \|E3−E2\| 9,5 (median 9,5 i *båda* körningarna, n=4) och S-33 §5:s spridningsvinst, som
> ligger på subrutesskalan och inte är prövad här.
> **Flaggorna bär ingenting nytt, och det är kod:** `suspectMultiSwing` = `envelopeDuration > 3,0 s`
> (`datasetGate.ts:143`) och `slowmo` auto = `envelopeDuration > 3,0 s` (`slowmo.ts:28`) — **samma
> storhet, samma konstant, identiska mängder på alla 103 svingar.** `clippedTail` nollställer
> nedslaget (`poseEnvelope.ts:445`) och är 7 av 7 en delmängd av *utan säkert nedslag*. Nytt i
> korsningen: de flaggade raderna ÄR E2:s svans (6 av 10 mot 12 %) medan **E3 går bättre** där (inne
> 6 av 11, \|median\| 0,0, mot E2:s 1 av 11 och 36,0).
>
> **Dessförinnan (2026-09-19, stream-shaft):** S-36 (klar, `[x]`) — **diagnos: såg människorna och
> estimatorn samma bildrutor, och vad är egentligen de 16 klippen?** Read-only, ingen ny estimator,
> ingen tröskel, ingen kalibrering, ingen produktionskod ändrad, ingen ändring i envelopelogiken,
> S-30:s spärr kvar. Rapport: [shaft/top-review/envelope-audit.md](shaft/top-review/envelope-audit.md),
> skript [envelope_audit.py](shaft/top-review/envelope_audit.py). `poseEnvelope.ts` och
> `poseSegments.ts` är **lästa** för att namnge regeln som avslutar ett fönster — inte
> reimplementerade, inte ändrade, inte poängsatta.
> **Fönstren är identiska.** Bedömarvyn söker till envelopens start, estimatorn till start−0,6 s,
> men antal, första och sista ruta är lika på **103 av 103** och största tidsskillnad på någon ruta
> är **0,000e+00 s** (rutsteg 0,0333 s). 6 548 rutor i vyn, registret, på disk och i posebanan.
> **Hela E3-mätningen är jämförd mot rätt underlag.** Kvar som oprövat: bedömaren såg en nedskalad
> JPEG på 75 av 103 svingar, estimatorn den råa rutan.
> **De 16 klippen är inte 16 missade svingar:** 7 missad sving (1 marginell), **4 finishtopp utanför
> envelopen** (finishen, inte en missad sving), **2 kapad kant på själva toppen** (`001`, `011`),
> 2 rörelse efter/utanför (1 marginell), 1 ej avgörbar (pose 7 %). Klassen står på banans **form** —
> nedgången mot klippets egen svagaste registrerade nedsving — inte på amplitud, och delningen
> kapad topp / finishtopp är den som hindrar att `kapad kant` sväljer E1:s gamla fel. Slow-mo 4 av
> 16 (25 %) mot 13 av 81 (16 %); n = 4 klipp, bär ingenting.
> **B:s slutsats håller.** 10 av E4:s 49 utanför-rader (25 %) ligger i ett av de 16 mot 19 %
> basnivå, och av de 22 utan någon växling alls ligger **bara 3 (18 %)** där — lägst i tabellen,
> varav två i `finishtopp`-klipp. **Noll rader ligger i ett klipp med olika fönster.**
> **`001.mp4`:** pose på 986 av 986 rutor; handhöjden stiger monotont genom hela envelopen
> (4,07–8,33 s) till klippets högsta vändning vid **9,37 s**, utan återvändning till adresshöjd
> däremellan. Manifestet bär redan `clippedTail: true` och `suspectMultiSwing: true`. n = 1.
> **Fönstret slutar inte mitt i rörelsen:** farten vid envelopens sista ruta är median 0,055 ×
> toppfarten (finishregeln kräver under 0,20) och fördelningarna överlappar. **Det enda som skiljer
> är riktningen — banan stiger fortfarande vid slutet på 48 % av de 16 mot 26 % i de övriga, och på
> 4 av 5 av de 16:s slow-mo-svingar.** `001.mp4`:s slut ligger i en 1,90 s tyst ö.
> **Nytt fynd:** produktionen bär egna flaggor som ingen omgång läst — `clippedTail` 7 av 103 och
> **`suspectMultiSwing` 15 av 103** (multiswing.md §A:s egen flagga tänder på 7; överlapp 3).
> **VIKTIGAST — golvet.** En varm spårare i stället för kall, samma modell och samma rutor, flyttar
> E3:s ruta på **36 av 102** svingar (lika på 66, inom 1 på 88, max 19) och rubriken från **30 till
> 27 av 91**: netto −3, men **7 in→ut, 4 ut→in, 23 rader byter avstånd**. E4 RND 42 → 44.
> **E3:s hela fel mot människorna är |median| 1 ruta — och 1 ruta är vad en störning som inte borde
> betyda något flyttar.** Överlever: riktningen (−1 i båda), LOCO +23 rader, interpolationens +12.
> **Ligger i bruset: E4/E5/E6:s inbördes 3 rader, S-34:s 1 rad av 49, och S-33:s restförskjutning
> −0,24 subrutor.** Läs varje tidigare siffra med det golvet.
>
> **Dessförinnan (2026-09-19, stream-shaft):** S-35 (klar, `[x]`) — **diagnos: flera svingar i en
> envelope, armningen, och svingar utan envelope.** Read-only, ingen ny estimator, ingen tröskel,
> ingen kalibrering, ingen produktionskod rörd, S-30:s spärr kvar. Rapport:
> [shaft/top-review/multiswing.md](shaft/top-review/multiswing.md), skript
> [multiswing.py](shaft/top-review/multiswing.py), [clip_swings.py](shaft/top-review/clip_swings.py)
> och [run_pose_clip.py](shaft/top-review/run_pose_clip.py). **Facit var sett**, så flaggan är
> **räkningar** (utflykter över adresshöjd, återvändningar till den, topografisk prominens) med
> varje nivå redovisad vid tre värden bredvid varandra — **ingen sving utesluten, ingen siffra i
> resultat.md / subframe.md / crossing-selection.md omräknad.**
> **Flersvingsflaggan tänder på 7 av 103**, och bara `S32-092` (`005.mp4`, 8,5 s slow-mo) tänder på
> mer än ett kriterium — samma sving som har rundans största rutsteg i banan, så *två svingar* och
> *ett spår som hoppar* går inte att skilja åt. De sex övriga har extrautflykter 0,000–0,059 höga
> mot toppens 0,124–0,305.
> **Svansen är inte flersvingsklipp:** E2:s svans 2 av 10, E4:s utanför-rader 4 av 49 (8 %), och
> **de 23 utan armad kandidat 1 av 23 (4 %) — lägst i tabellen**. Det som skiljer E2:s svans är
> **banans stabilitet**: p90 för största rutsteget 0,197 mot rundans 0,092, och fyra av rundans fem
> största rutsteg ligger i svansen.
> **Armningen filtrerade ingenting:** på **22 av de 23** finns ingen teckenväxling alls i v_y inne i
> människornas intervall, och den närmaste är på alla 22 **E3:s egen**, median 2 rutor bort. Enda
> undantaget är `S32-038` (`064.mp4`): negativa löpan nådde −0,002 mot grinden −0,10, på en ruta.
> Kontroll: där E4 ligger inne finns en växling inom en ruta på 42 av 42. **Ingen ny tröskel.**
> **`054.mp4` rättad i [subframe.md §8](shaft/top-review/subframe.md)** — flera svingar per envelope
> är uteslutet, **slutsatsen står kvar som OHANTERAD och orsaken är okänd**. Nytt: banan gör **två
> fullständiga utflykter** inom `S32-084`; bedömarnas 17–18 ligger på toppen av den första (78 % av
> lyftet), facit 53,5 ligger 2–6 rutor in i nedgången från den andra (högsta, ruta 47), appens egen
> exportfas kallar ruta 49 `top`, och CVAT:s `f00 @ 3,327 s backswing` sitter i svackan mellan dem
> med händerna på väg ned (v_y +0,493).
> **Det motsatta felet är det verkliga:** helklippsposen (81 klipp, 28 800 rutor) visar att **16 av
> 81 klipp** har en vändning utanför varenda envelope som når klippets egen referens, **12 av dem
> minst lika stor som klippets största registrerade sving**. `054.mp4`:s missade sving ligger vid
> 10,9 s; **värst är `001.mp4`, vars enda envelope slutar ~1 s innan klippets topp** — samma sving
> (`S32-074`) där båda bedömarna satte osäker och E3 inte gav något svar alls.
> **Avvikelse redovisad:** helklippskörningen har en varm spårare (`run_pose.py` är orörd), så E3:s
> ruta är lika på 67 av 103 och inom 1 ruta på 89 av 103; del A/A2/B/C ligger helt på
> envelopekörningen.
>
> **Dessförinnan (2026-09-19, stream-shaft):** S-34 (klar, `[x]`) — **diagnos: är E3/E4:s svans en
> felvald teckenväxling? Nej för huvuddelen, ja för de tre yttersta raderna.** Read-only, ingen ny
> estimator, ingen tröskel, ingen kalibrering, ingen produktionskod rörd, S-30:s spärr kvar. Rapport:
> [shaft/top-review/crossing-selection.md](shaft/top-review/crossing-selection.md), skript
> [crossing_selection.py](shaft/top-review/crossing_selection.py) och
> [render_envelope.py](shaft/top-review/render_envelope.py). **Facit var sett**, så risken var
> anpassning: **ingen parameter svept eller justerad** — hysteresen 0,10 och fönstret 3 är E3:s egna,
> och kandidatmängden är **E3:s egen sökning med stoppet borttaget** (skriptet stannar om kandidat
> nr 1 inte är `e3_signflip`:s svar).
> **Hypotesen faller:** av de **49 rader i 40 klipp** där E4 ligger utanför spannet finns en **annan**
> växling som hade landat inne på **1 rad (2 %)** — mot Erik ensam **0 av 60** — och den valda är
> **redan den närmaste på 46 av 49 (94 %)**. **23 av 49 svingar har bara en enda kandidat i hela
> envelopen**, och 56 av 101 har det: E3 väljer inte, den tar det som finns.
> **Undantaget är svansen själv** — de tre rader som ligger längst bort (`S32-013` −26, `S32-080`
> −16, `S32-090` −9) är exakt de tre där en annan växling ligger 16–25 rutor närmare. De valda ligger
> **tidigt i envelopen** (0,03–0,25), har **brantare lutning** i alla tre och **2–8 gånger mindre
> amplitud efter** sig. **n = 3 rader i 3 klipp, ingen regel dras.**
> **Klasserna lutar åt olika håll:** slow-mo samlas i *ingen kandidat träffar* (20 % mot 4 %),
> svingar **utan säkert nedslag** (`FALLBACK_BOUNDS`) i *ingen kandidat alls* (26 % mot 12 %), och
> **alla 9 svingar Erik satte breda** ligger i den senare eller inne. Båda de bekräftat spegelvända
> ligger i *ingen kandidat träffar* — 2 rader i 1 klipp.
> **E6:s klämning är inte en felkonstruerad bracket:** varje klämd handled har en egen armad växling,
> i median **+1 ruta** från bracketen; att byta till den flyttar träffen 11→13 och 15→16.
> **`054.mp4`:** envelopens 86 bildrutor är utrullade i klippets egen upplösning under
> `data/shaft/top-round/054-inspekt/` (gitignorerat) med `RUTOR.txt` bredvid — båda bedömarna och
> Eriks pass 2 satte **rutor 17–18 (3,067–3,100 s)**, facit ligger vid ruta 53,5. **Inget är markerat
> i bild, ingen har tittat, ingen bedömning görs.**
> **Sidonot:** posebanorna fanns inte kvar och kördes om igen (`mediapipe` 1.0.1, samma modellfil);
> kontrollraden återger resultat.md:s E3-tal och subframe.md:s E4-tal exakt.
>
> **Dessförinnan (2026-09-19, stream-shaft):** S-33 (klar, `[x]`) — **mätspik: var E3:s
> enrutasförskjutning kvantisering? Ungefär hälften.** Read-only, ingen produktionskod rörd, ingen
> tröskel satt, ingen kalibrering applicerad, S-30:s spärr kvar. Rapport:
> [shaft/top-review/subframe.md](shaft/top-review/subframe.md), skript
> [subframe.py](shaft/top-review/subframe.py). **Facit var sett**, så risken var anpassning: exakt
> de tre beställda varianterna, ingen fjärde, **ingen parameter svept eller justerad mot utfallet**,
> allt anpassat leave-one-clip-out.
> **E4** (interpolerad nollgenomgång i v_y, rå serie), **E5** (samma på E3:s egen fönster-3-serie),
> **E6** (E4 på en enskild handled — E3 läser i dag *mittpunkten*, så bytet går den vägen; båda
> handlederna redovisas och **ingen väljs**, händighet är `unknown`). Nollgenomgången ligger median
> **0,43 rutor efter E3:s val** (n=91/73). Mot spannet: E3 30 av 91 → **E4 42, E5 43, E6 44–45** —
> inom 3 rader av varandra, alltså oskiljbara, och alla långt under människornas 67–80 %.
> **Ingen konstant helrutesförskjutning kvar efter interpolationen** (LOCO-skift 0, träffen rör sig
> inte), men mot vardera bedömaren för sig ligger skiftet **precis på halvrutan** — resten är mellan
> 0 och −1, inte robust noll. **Spridningen orörd:** p90 3,0 → 2,1–2,8, max 26,0 → 25,1.
> Kvantiseringen satt i mitten, aldrig i svansen. E6 ska dessutom läsas med att den är klämd mot
> bracketen på 33 respektive 45 av 101 svingar.
> **E2:s svans är en klass:** alla 10 rader (9 klipp) ligger efter spannet, 7 i åttonde tiondelen,
> **6 av 10 slow-mo mot 6 % i resten**. Bakåtgåendet är lika långt som i resten — **ankaret är
> trasigt**: envelopens snabbaste ruta ligger i tiondel 8–9, median +59 rutor efter spannet, mot +5
> i resten. Bara 3 av 10 ligger efter nedslaget.
> **De åtta gemensamt missade kontrollerna: bedömarna är eniga i 8 av 8** och pekar på samma andra
> exportruta — oenigheten går mellan människoparet och CVAT-facit. **Sju ser ut som ett för grovt
> exportrutnät**; den åttonde, **`054.mp4`**, sätter toppen 36 rutor (1,2 s) före facit och *före*
> en ruta CVAT märkt `backswing` — en annan händelse. **Ingen kontroll märks om, inget klipp har
> öppnats, ingen siffra i resultat.md räknas om.**
> **Sidonot:** S-31:s posebanor fanns inte kvar och kördes om (`mediapipe` 1.0.1, samma modellfil);
> 6 548 envelope-rutor och en kontrollrad som återger resultat.md:s E2/E3-tal exakt.
>
> **Dessförinnan (2026-09-19, stream-shaft):** S-32 (klar, `[x]`) — **den kontrollrika toppomgången är
> körd och utvärderad.** Ingen produktionskod rörd, ingen tröskel satt, inget skift applicerat:
> `src/lib/shaft/measure/`, `NEAR_VERTICAL_GATE_DEG`, `ON_PLANE_BAND_DEG`, `PhaseSource` och
> teckenkonventionen är orörda, och **S-30:s spärr ligger kvar**. Erik och Lisa bedömde **alla 103
> svingar var för sig** (olika frön, olika ordning, ingen sving på samma plats); Eriks **pass 2** på
> 35 svingar redovisas **separat som känslighetskontroll och slås aldrig ihop med pass 1**. Rapport:
> [shaft/top-review/resultat.md](shaft/top-review/resultat.md).
> **Kontrollerna bär rundan:** Erik 31/10/4, Lisa **36/9/0** av 45, båda med median 0 exportrutors
> avvikelse. **Åtta kontroller missas av båda** — det är omgångens egentliga felmått, och facit är
> alltså inte perfekt heller. Eriks två pass missar **samma fem svingar, inga nya**: sista
> tredjedelens fall är **materialet, inte trötthet** (Lisas kontrollträff *stiger* dessutom över
> hennes egen ordning, medan osäker-andelen stiger hos båda).
> **Det mänskliga golvet S-31 saknade finns nu:** av 91 svingar i 73 klipp där båda svarade
> **överlappar 90 (99 %)**, mittpunkterna ligger median 0 rutor isär utan systematisk riktning, och
> spannet (unionen) är **2 bildrutor**. Enda icke-överlappet är `046` — samma sving Erik är ensam om
> att missa som kontroll. Eriks intra-spann (0 i median, 100 % överlapp) ligger bredvid som referens
> **men passen låg ~14 h isär på samma bilder, så igenkänning kan ha bidragit — det är inte ett golv**.
> **E3 ligger inne i det mänskliga spannet i 30 av 91 (33 %)** och inne hos båda samtidigt i 19
> (21 %), \|median\| 1 ruta mot vardera bedömaren. E1 är bekräftat fel konstruktion på n=94
> (median +18); E2 träffar oftare (45 av 91) men bär p90 28–30 och max 205. **E3:s förskjutning är
> riktningskonstant** (89 %/88 % av missarna ligger *före*) och **överlever leave-one-clip-out** —
> ett skift på −1 lyfter träffen 23→44 respektive 27→53 — **men MAD står kvar på 1,0 och även
> skiftad ligger E3 inne i under hälften.** Förskjutningen är en konstant *ovanpå* en spridning, och
> **ingen kalibrering görs på det**. S-31:s sex rader omräknade: −2,0/−3,5 — rätt riktning, för stort
> belopp.
> **Nytt: tystnaden.** Oenighet och breda intervall förutsäger ingenting om E3. Men på de **5 svingar
> där båda teg** ligger E3 och E2 **9,5 rutor isär** mot 1,0 i resten, och E3 gav inget val alls på 2
> av 103 svingar — båda sådana där minst en människa också teg. **n = 5: en tystnadsregel skulle ha
> något att stå på, men var den går sägs inte här.**
> **Kovariater:** vinkeln säger ingenting (face-on = dtl, första underlaget alls på face-on men n=7),
> nedslaget säger ingenting — även på de 20 svingar utan säkert nedslag, alltså
> `FALLBACK_BOUNDS`-fallet där felet är värst. Sämsta cellen är bekräftad spegelvändning (3,5–4,0
> rutor) men den vilar på **2 svingar i ett enda klipp** (`093.mp4`).
> **Fortfarande obesvarat:** verifierat vänsterhänt, ospeglat material (spec punkt 3) finns inte i
> datasetet, och händighet står `unknown` på alla 103. **Nästa steg är inte en tröskel.**
>
> **Dessförinnan (2026-09-18, stream-shaft):** S-31 — **spike: handleden bär en observerad topp där
> skaftlinjen inte gör det.** Ingen produktionskod rörd, inget tröskelbeslut fattat. MediaPipe
> (samma `.task` som webben, `runningMode: VIDEO`, klippets egen upplösning) körd **per
> videobildruta** på samma 103 svingar som S-28/S-29. **Grinden går åt andra hållet än för
> skaftet:** 8 av 6 548 envelope-bildrutor saknar pose (0,12 %), `presence` median 0,998, 100 av
> 103 svingar utan en enda bildruta under 0,5, och pose i **7 av 7** bildrutor runt alla sex
> utpekade topparna — mot skaftets 0/1/7/7/1/4 i S-29. Bortfallet är dessutom *minst* vid 40–60 %
> av envelopen, där topparna ligger. Tre estimatorer, hållna åtskilda: **E1** (högsta händer) är
> fel konstruktion — finishen står högre än toppen, 42 av 103 val i sista tiondelen; **E2**
> (fartminimum mellan bak- och nedsving) median 1,9 bildrutor från Eriks toppintervall men
> parameterkänslig (28 av 103 svingar flyttar sig > 10 rutor); **E3** (teckenväxling i v_y med
> hysteres) median **1,5 bildrutor**, 0 av 6 val på en entydig icke-topp-rad, och **median 0
> bildrutors drift** när hysteresen sveps 20× — S-28 föll på exakt det måttet med median 8.
> **Reservationerna bär lika mycket som resultatet:** n = 6 toppar i **5 oberoende klipp**, varav
> det spegelvända `093.mp4` bidrar med två och den enda slow-mo-raden står för hela den dåliga
> svansen; E3 träffar *inne* i Eriks intervall bara 1 gång av 6 och ligger annars 1–2 rutor före;
> 97 av de 103 körda svingarna har inget facit alls. Face-on är **omätt**, inte "samma".
> Noterat på vägen: `poseEnvelope.ts` räknar redan `impact.topSec` ur samma handledsmittpunkt och
> träffar ±2 rutor på alla fem rader som har ett nedslag — men kräver just det nedslag som saknas
> på `FALLBACK_BOUNDS`-svingarna, där felet är värst. **S-30:s spärr ligger kvar; nästa steg är
> S-32 (kontrollrik toppomgång), inte en tröskel.** Rapport:
> [shaft/top-from-pose.md](shaft/top-from-pose.md), skript i `docs/shaft/top-from-pose/`.
>
> **Dessförinnan (2026-09-18, stream-shaft):** S-30 — **fasens förtroende: toppankrade mätvärden
> svarar inte längre utan observerad fas.** Första produktionsändringen i S-23-spåret.
> Ny `PhaseSource` (`observed` / `envelope-impact` / `envelope-fallback`) på varje
> `ShaftFrameSample`, obligatorisk och aldrig defaultad; `isPhaseObserved(undefined)` är
> `false`, så en post som inte säger något läses som *ingen såg det*. De två härledda hålls
> isär för att felen går åt olika håll (S-23). `derivePhaseWithSource()` rapporterar grenen
> och kan aldrig returnera `observed`.
> `topFrame` kräver observerad fas: **`shaft-position-p4`** och **`top-shaft-orientation`**
> svarar med nytt skäl **`top-phase-not-observed`** (skilt från `phase-missing`), och
> **`shaft-angle-by-phase`:s `top`-hink** omfattas — övriga hinkar orörda. Formen är den
> befintliga `reject()`-formen, **inte** kategorin `cannot-determine`; vägvalet och vad som
> krävs för att i stället bära kategorin står i rapporten.
> **Kostnad mätt över alla 205 svingar: 43 (21 %) tystnar, 109 (53 %) svarar fortfarande, 53
> var redan tysta.** Produktionsvägen på de 178 svingar som har skaftpredictions:
> `top-shaft-orientation` 51 → 29 tal, `top`-hinken 55 → 32; `shaft-position-p4` 0 → 0
> (inga pose-landmärken i `prelabel.xml`). **De 109 svarar bara för att datasetet är delvis
> annoterat — i appen finns ingen annoterad fas, så där tystnar alla 205. Det är avsikten.**
> `NEAR_VERTICAL_GATE_DEG`, `ON_PLANE_BAND_DEG`, teckenkonventionen och `plausibility.ts` är
> orörda. `docs/shaft/phase-audit/select.ts` svarar nu `productionPath: väntat 22, fick 0` —
> **alla 22 granskade bildrutor är precis de som vägras**, vilket är den renaste
> verifieringen; dess assertion beskriver en stängd omgång.
> `npm run build` rent · `npm test` 499/499 (+16) · `npm run lint` 3 fel, inget i rörd kod.
> Rapport: [shaft/phase-trust.md](shaft/phase-trust.md).
>
> **Dessförinnan (2026-09-18, stream-shaft):** S-29 — **spike: bortfallets läge bär inte toppen.**
> Analys av S-28:s banor, ingen ny detektion, ingen produktionskod rörd. Bortfallet är klumpigt men
> glesast vid 30–60 % av envelopen (där topparna ligger) och lika förhöjt vid nedslaget; toppen ligger
> i längsta luckan i 3 av 6 (2 av dem samma klipp), medianavstånd 16 bildrutor, och 3 av 6 rader
> byter utfall om luckor bryggas över en godkänd ruta. Rättar S-28 (4 av 6 → 3 av 6).
> Rapport: [shaft/top-from-dropout.md](shaft/top-from-dropout.md).
>
> **Dessförinnan (2026-09-18, stream-shaft):** S-28 — **spike: inte heller den täta skaftsignalen ger
> en läsbar topp med vändpunktsmetoden.** Detektorn körd per videobildruta på 103 av 205 svingar
> (de med lokalt klipp, nästan bara `web`). Glesheten är borta (steg > 90°: 44 % → 1,4 %), men
> valet låser på brus i platån före toppen: 0 av 6 exakta träffar (n för litet), och 4 av 6
> utpekade toppar ligger i en detektionslucka. Nästa flaskhals är detektorns täckning vid
> övergången, inte tröskeln. Rapport: [shaft/top-from-dense-signal.md](shaft/top-from-dense-signal.md).
>
> **Dessförinnan (2026-09-18, stream-shaft):** S-27 — **spike: skaftsignalen på envelope-rutorna bär
> ingen observerad topp.** Ingen produktionskod rörd. Detektorn (`shaft-v2`, produktionens
> trösklar) körd på alla 1 435 exportrutor; 66 av 205 svingar har hel bana, vändpunktsmetoden ger
> noll kandidater i 31 av dem, och mot Eriks bedömningar 2 av 5 exakt (n för litet). Toppen ligger
> på en platå inom detektorbruset; 44 % av stegen är > 90°. Kräver inte `impactSec`, men är inte
> visad att fungera med eller utan. **Tät signal (varje videobildruta, `trace_swing.py`) är
> oprövad** — det är nästa fråga om `derivePhase` ska byggas på skaftet.
> Rapport: [shaft/top-from-signal.md](shaft/top-from-signal.md).
>
> **Dessförinnan (2026-09-18, stream-shaft):** S-25 — **fasgranskningen är utvärderad, och den är
> illa: 13 av 22 toppetiketter visar inte toppen (59 %).** Ingen produktionskod rörd, **ingen fix
> byggd och ingen föreslagen** — det var uppdraget. Eriks 32 svar står ordagrant i
> [shaft/phase-audit/review.md](shaft/phase-audit/review.md) (fritext och stjärnor bevarade,
> stjärnan som eget filtrerbart fält); utvärderingen i
> [shaft/phase-audit/resultat.md](shaft/phase-audit/resultat.md).
> **Kontrollerna bär siffran: 7 träff, 0 missar, 3 `osäker`** — och på de fyra kontroller som
> bär annoterad `top` svarade han `top` två gånger och `osäker` två gånger, aldrig något annat.
> Han är alltså inte obenägen att säga `top`; det är etiketten som mäts, inte ögat.
> **De 22 i tre hinkar som inte slås ihop:** 6 rätt fas (27 %), **13 fel fas (59 %)**, 2 rätt fas
> men oklar bildruta (9 %), plus 1 `osäker` utan motivering som redovisas som rest.
> **Felet är systematiskt och byter riktning med `impactSec`:** utan den är 5 av 5 fel, alla på
> exakt envelope-andel **0,484** (rena `FALLBACK_BOUNDS`-rader); med den är 7 av 8 fel
> `backswing`, alltså etiketten för tidigt. Monotoniciteten i envelope-andelen gäller **bara**
> den impact-ankrade delmängden (fel-fas ≤ 0,444, allt ≥ 0,500 är något annat än fel);
> fallback-raderna ligger ovanför den gränsen på 0,484 och är ändå fel rakt igenom.
> **Källklipp, klipplängd, fps och DTL/face-on säger ingenting** — n för litet, konfunderat med
> källan, eller noll varians (alla rader är `dtl` per konstruktion). Det står som "n för litet" i
> rapporten, inte som en hypotes.
> **Stjärnraderna kan inte prövas här:** alla sex är kandidater, och facit för en kandidatrad är
> just den etikett omgången prövar. Klubbhuvudsavläsningen förblir en hypotes för en framtida
> kontrollrik omgång.
> Fyndet är inskrivet i [shaft/STATUS.md](shaft/STATUS.md) §3. `npm run lint` baslinjen.
>
> **Dessförinnan (2026-09-18, stream-shaft):** S-24 — **blint granskningspaket för fasen `top`.**
> Ingen produktionskod rörd och **ingen fix byggd** — det var uppdraget: felfrekvensen ska mätas
> innan något byggs på den. Paketet: [shaft/phase-audit/](shaft/phase-audit/) med `select.ts`,
> `review.md`, `facit.md`, `README.md` och `frames/` (**gitignorerad**, samma identifierbara
> personer som `data/shaft/*`).
> **De tre mängderna reproducerar rapportens tal exakt — 63 / 30 (26 + 4) / 22** — och
> **asserteras** mot [shaft/across-sign-result.md](shaft/across-sign-result.md): stämmer de inte
> stannar körningen i stället för att bygga en annan omgång än den rapporten beskriver.
> `--dry-run` skriver ut hela härledningen utan att röra en fil.
> **Rundan är 22 kandidater + 10 kontroller = 32 rader, frö `0xfa5ec0de`**, kontrollerna
> stratifierade 4 `top` / 2 `backswing` / 2 `downswing` / 2 `finish`, alla `dtl`, alla ur svingar
> där ingen kandidat ligger.
> **Underlaget tvingade fram två skärpningar av "pålitlig annoterad fas":** `batch-03` är ute
> (CVAT:s orörda förval, redan mätt i S-22), och en dubbelannoterad bildruta måste ha **eniga
> pass** — batch-01:s två pass skiljer sig på **10 av 146** bildrutor.
> **Varje rad bär kontext** (`_prev`/`_next` ur `data/shaft/exports/`, inte ur den glesare
> träningsbatchen), inte bara de rutor jag tyckte var svåra — vilka som är svåra är i sig en
> bedömning. `review.md` bär bara löpnummer, frame-id och bildsökväg, och länkar inte till facit.
> **README:t bär rundans sammansättning och säger rakt ut att det ska läsas efter review.**
> **Klipplängd och fps läses ur MP4-boxarna** — inget manifest bär dem, ingen `ffprobe` finns;
> klipp som saknas i repot får `—`, aldrig ett tal härlett ur envelopen.
> **Nästa:** Erik fyller i `review.md`; utvärderingen görs enligt README:t — kontrollerna först,
> sedan felfrekvensen bland de 22 med `osäker` som egen tredje kategori, sist klustringen.
>
> **Dessförinnan (2026-09-18, stream-shaft):** S-23 — **närlodrätt-spärren är på.**
> `NEAR_VERTICAL_GATE_DEG = 16` i `derived.ts`: inom 16° från lodrätt blir
> `top-shaft-orientation` **`cannot-determine`**, tecknet beräknas aldrig (spärren ligger före
> multiplikationen), `deviationDeg` är `null` i typen, nya `distanceToVerticalDeg` bärs på varje
> utfall och skälet `top-shaft-near-vertical` skiljer den från vy/konfidens/saknad bildruta.
> Flaggan sänks inte — "går inte att avgöra" är ett fynd, inte ett tvivel.
> **Uppgiftens två testkrav går inte att uppfylla samtidigt, och det är underlagets fel, inte
> spärrens:** två kallade rader ligger närmare lodrätt (10,86°, 11,11°) än två stoppade
> (14,17°, 16,08°). Med 16 blir det 4 av 5 stoppade och 2 av 6 kallade spärrade, och
> `img-5384` slinker igenom med 0,076°. Alla fyra fallen är pinnade i `derived.test.ts`.
> **Referensbildrutan från S-21 spärras nu själv** (13,0° från lodrätt); tecknet hålls i stället
> av blint bedömda bildrutor utanför spärren, på båda riktningarna. Vänder man konstanten faller
> **7 test** (var 4).
> **Kostnad, mätt:** 6 av 63 kandidater (10 %) går från kallat utfall till `cannot-determine`,
> räknat av `--gate-impact` som importerar konstanten ur produktionen.
> **`ON_PLANE_BAND_DEG` och fasderiveringen är orörda.** Den blinda fläcken vid horisontalen
> står som känd begränsning i nya [shaft/STATUS.md](shaft/STATUS.md), tillsammans med
> fasproblemet (30 av 63 vilar på manifestfasen, 22 är produktionsvägens val), händigheten och
> speglingen, och bladvinkeln. **Fasderiveringen är nästa egna uppgift.**
> `npm run build` rent · `npm run lint` baslinjen · `npm test` **483/483** (+11).
>
> **Dessförinnan (2026-09-17, stream-shaft):** S-22 — **kandidatbildrutor för att pröva
> across-the-line-tecknet nära vikningen**. Engångsverktyg, `scripts/across-sign-candidates.ts`,
> som **bara läser**: `git status` visar inga ändringar under `src/`, och serierna går genom
> `checkShaftSeries` → `buildShaftMeasurements` orörda. Rapport:
> [shaft/across-sign-candidates.md](shaft/across-sign-candidates.md); de 20 översta bildrutorna
> kopierade till `docs/shaft/across-sign-candidates/`, som är **gitignorerad** av samma skäl som
> `data/shaft/*` (identifierbara personer).
> **Källan är allt predictionsunderlag som finns på maskinen:** `prelabel.xml` i batch-02/03 —
> 299 bildrutor ur `public/models/shaft-v2.onnx` via `prelabel_batch.py` — joinade mot
> batch-manifesten (tid, klipp, sving, fas, envelope) och mot CVAT-exporternas `view`, unionerad
> per sving precis som i `prelabel_batch.py`. `training/runs/` är tomt och `trace-*.csv` finns
> inte här; **ingen ny modellkörning gjordes**, att köra detektorn igen hade varit att tillverka
> underlaget.
> **Tre saker källan inte bär, alla utskrivna i rapporten:** ingen keypoint-konfidens (bara
> körningens gräns ≥ 0,5 — konfidenstestet är alltså passerat *per konstruktion*, flaggorna
> vilar på geometri och grannjämförelser), `toe`/`heel` i `prelabel.xml` är **ritade** av
> `sole_points()` och inte predictions (kastas, serierna deklarerar `keypoints: 2`), och
> **ingen händighet** finns någonstans — tabellen är räknad på `handedness: 'right'`.
> **63 toppkandidater ur 166 `dtl`-svingar: 7 höger om lodrätt, 56 vänster.** Närmast vikningen
> `045-224bdedb_s00_f01` (7,8° från 90°); referensens egen sving bidrar med
> `049-88216ea7_s00_f04` (11,1°, `top`, `usable`). Referensbildrutan själv kommer **inte** med —
> ingen av fasetiketterna kallar den `top`.
> **`batch-03/annotated-v1.zip` bär `phase: address` på alla 242 bildrutor** — CVAT:s
> `default_value`, aldrig rörd (batch-01: 7 värden, batch-02: 8). Verktyget upptäcker en konstant
> fasattribut och kastar fasen därifrån men behåller `view`; att tro på den hade omdöpt varje
> topp i den största batchen till en address-bildruta.
> **En spegelvänd bildruta hittad i ögats genomgång av de 20:** `093-2c11c3c0_s00_f02` — skyltarna
> läser `TIH`/`ƎM` och distansmarkeringen `00Ɛ`. Spelaren är högerhänt, **bilden är vänsterhänt**,
> och det är bilden mätvärdet ser: raden blir `across-the-line` på `handedness: 'right'` och
> `laid-off` på bildens händighet. Varken händighet eller spegling bärs någonstans i
> datamodellen, så inversionen är osynlig hela vägen upp. Övriga 19 är högerhänta i bilden;
> **ingen verifierat vänsterhänt bildruta finns**, och `img-4982-23afcab9_s00_f02` är ingen topp
> alls (manifestet säger `top`, annotatören `finish` — annotatören har rätt).
> **Vändpunktsfallbacken mättes och valdes bort:** 118 av 178 svingar bär ingen `top`-bildruta,
> och den tidsmässigt närmaste bildrutan till en skattad vändpunkt är `downswing`/`impact` i 64
> fall av 107. 13 av dem ligger inom 20° från vikningen och hade tagit tabellens topp — en
> address- eller nedslagsbildruta står nära lodrätt av skäl som inte har med en topp att göra.
> **Kvar för att stärka tecknet:** en bedömd laid-off-topp och en verifierat vänsterhänt,
> ospeglad bildruta. Ingendera finns i materialet.
> **Blind omgång att fylla i:** `scripts/across-sign-candidates.ts --blind` skriver
> [shaft/across-sign-blind.md](shaft/across-sign-blind.md) — 12 bildrutor med **bara frame-id,
> bildlänk och tom svarskolumn**, slumpad ordning med fast frö `0x5ca1ab1e`. Facit ligger i
> [shaft/across-sign-blind-key.md](shaft/across-sign-blind-key.md) och nämns inte i den blinda
> filen. Urvalet är alla kandidater höger om lodrätt plus de 7 närmast vikningen till vänster;
> **hela klippet `093-2c11c3c0` är undantaget**, inte bara den namngivna bildrutan — `s01_f01`
> är en annan sving ur samma spegelvända inspelning och bär samma inversion. Kvar: 5 höger +
> 7 vänster. Kandidatrapporten och dess 20 bildrutor rörs inte av `--blind`.
> **Omgången är bedömd och avstämd (2026-09-18):**
> [shaft/across-sign-result.md](shaft/across-sign-result.md). **Tecknet står — 5 av 6 kallade
> rader sammanfaller, på båda sidor om lodrätt.** Den sjätte är ingen inversion (en vänd
> konstant hade fällt alla sex) utan sitter vid **horisontalen**: `040-42b11ae6_s00_f03` har
> skaftet 2,1° från horisontalen, där across/laid-off avgörs i horisontalplanet och 2D-lutningen
> inte bär svaret. `ON_PLANE_BAND_DEG` svarar `on-plane` där — första mätta belägget för att
> bandet arbetar. Inga trösklar rörda.
> **Ögats "för nära lodrätt" och mätvärdets vikning pekar på samma zon:** kallade 2,1°–79,1°,
> stoppade 73,9°–82,2°, överlapp 73,9°–79,1° — inget rent snitt, samma vinkel (73,9°) på båda
> sidor om gränsen.
> **Fas-fyndet är det tyngsta:** `img-3641-adde195e_s00_f02` bär `top` bara ur manifestet, och
> den etiketten är en proportion (`impactSec: null` → `FALLBACK_BOUNDS`, bildrutan 0,484 in i
> envelopen). Bollen ligger kvar 6,576 s och är borta 7,572 s; raden vid 7,107 s är ingen topp.
> **30 av 63 kandidater vilar på manifestfasen, 22 av dem är produktionsvägens val.**
> `plausibility.ts` har inget test som fångar en felfasad bildruta.
> **Rättelse:** facitets påstående att varje insläppt bildruta var speglingskontrollerad var
> starkare än underlaget — `img-3641` saknar både text och synlig boll i den bedömda bildrutan,
> och klippets `_f01` visar bollen på vänster sida. Vänsterhänt eller spegelvänt går inte att
> skilja där. `--blind` vägrar numera skriva över en ifylld blindfil utan `--force`.
> `npm run lint` baslinjen (2 fel i orörda `useHistory.ts`) · `npm test` **472/472**.
>
> **Dessförinnan (2026-09-17, stream-shaft):** S-21 — **teckenkonventionen för across-the-line är
> verifierad och står kvar.** `ACROSS_THE_LINE_SIGN` var angiven med `// OSÄKER:`, och
> `top-shaft-orientation` hölls därför aldrig högre än `uncertain`. Markeringen, spärren och
> skälet `sign-convention-unverified` är **borta**; mätvärdet bär numera bara kameragrinden och
> bildrutans egen flagga.
> **Referensen:** `049-88216ea7_s00_f05` (batch-03, `dtl`, högerhänt) — av Erik manuellt bedömd
> som topp av baksvingen med skaftet svagt **höger** om mållinjen sett bakifrån, alltså lätt
> across the line. Genom produktionsvägen (`buildShaftSwingSeries` → `checkShaftSeries` →
> `buildShaftMeasurements`): grepp (126,0, 194,8), hosel (155,5, 67,0), `lineOrientationDeg`
> **+77,0°** → `deviationDeg` **+77,0°** → **`across-the-line`**. Samma etikett som ögat gav.
> **`shaft-v3` finns inte på maskinen** (`training/runs/` gitignorerat och tomt), så körningen
> gjordes på `shaft-v2.onnx` — den ger `butt`/`hosel` **identiska med den manuella
> annoteringen** (konfidens 1,00), och mätvärdet läser varken `toe` eller `heel`, så en
> fyrapunktsmodell kan inte ändra tecknet. **Bildrutans automatiska fas ljuger** (manifest
> `impact`, CVAT-attribut `address`, klippet `suspectMultiSwing` utan säker `impactSec`) —
> ögats avläsning användes.
> **Underlaget är tunt och det står i både kod och dokument:** en enda bedömd bildruta, som
> dessutom ligger **13° från vikningen vid ±90°** (en topp som passerar lodrätt byter tecken
> utan varning); ingen laid-off-topp och ingen vänsterhänt bildruta är bedömd — de halvorna är
> spegelbilder per konstruktion. `ON_PLANE_BAND_DEG` är orört (77° ligger långt utanför bandet).
> **Låst av test:** referensens egna pixlar och deras spegelbild genom produktionsvägen;
> vänder man konstanten faller **4 test** (kontrollerat, inte antaget).
> `npm run build` rent · `npm run lint` 2 kvarstående fel i `src/hooks/useHistory.ts`
> (baslinjen, orörd) · `npm test` **472/472** (2 nya).
>
> **Och dessförinnan (2026-09-17, stream-shaft):** S-19 — **datamodellen för skaftmätvärden**, ny modul
> `src/lib/shaft/measure/` ([docs/shaft/datamodell.md](shaft/datamodell.md)). **Inga regler, ingen
> UI, ingen koppling till Vision-prompten.** `frameExtractor.ts`, `poseEnvelope.ts`,
> `poseSegments.ts`, `poseEnvelopeSelection.ts`, `prompt.ts`, `api.ts` och `worker/` är
> **byte-för-byte orörda** — verifierat med `git diff main`, inte antaget.
> **Tre lager med en riktning:** `shaftSeries.ts` (ren data) → `plausibility.ts` (grinden) →
> `derived.ts` (de fem mätvärden som är ärliga i 2D). Regler ligger ovanför och finns inte än.
> **Rådatalagret är ren data på riktigt** — ingen beräkning, inget beroende till
> `onnxruntime-web` eller webbläsaren, inte ens ett typimport. Sömmen ligger i
> `fromDetection.ts`, som importerar **bara typer** och tar modellens filnamn som argument i
> stället för via `MODEL_FILE` (den konstanten hade dragit in hela detektormodulen i varje
> bundle). Per sving bärs modellidentiteten (`file` + `keypoints`); per bildruta tid, fas, fyra
> punkter med konfidens, skaft- och bladvinkel, plus de sex MediaPipe-landmärken mätvärdena
> läser. Överlever plattformsbytet (*F6*) och ett detektorbyte.
> **Kontrollen är en typgrind, inte en konvention:** `derived.ts` tar en
> `CheckedShaftSwingSeries` och `checkShaftSeries` är det enda som producerar en. Varje
> bildruta får **två** flaggor (skaft resp. blad), tre nivåer, skäl på varje icke-`usable`
> flagga — och en förkastad bildruta **ligger kvar** med sina koordinater. Testad mot de tre
> mätta felmönstren: omkastade ändar (150–180°; tröskel 90°, två pass — isolerad vändning
> förkastas, ett varaktigt byte märks tvetydigt i båda ändar), bladets oro (71–78 °/s mot
> 12 °/s, kvot ~6, bar vid 3) och **separata konfidenströsklar** (solpunkter median 0,26 / max
> 0,55 mot 0,99–1,00). Ett test visar direkt att en **gemensam** ribba tömmer mätningen i
> stället för att skärpa den.
> **Bladvinkel byggdes INTE uppåt.** Den bärs i rådatalagret och mäts fullt ut av kontrollen —
> att kasta den hade gjort beslutet ofalsifierbart — men `MEASUREMENT_ASSUMPTIONS` nämner
> varken `toe` eller `heel`, så beslutet är synligt i datamodellen.
> **Fem härledda mätvärden, alla projektioner, alla med sina förutsättningar som data:**
> skaftvinkel per fas, skaftläge vid P2/P4 relativt kroppen (**torsolängder**, inte axelbredd —
> den kollapsar mot noll i `dtl`), across-the-line vs laid-off, klubbhuvudets bana (spårar
> **`hosel`**, inte huvudet), svingplanets lutning med residual. Vy som **saknas** och vy som är
> **fel** behandlas olika: `camera-angle-mismatch` → förkastat, `camera-angle-unknown` → beräknat
> och märkt.
> **`// OSÄKER:` på teckenkonventionen** för across-the-line — angiven, inte verifierad; mätvärdet
> når därför aldrig `usable`. **En** annoterad DTL-bildruta av en känd across-the-line-topp
> avgör den. **→ gjord i S-21 nedan; tecknet står, markeringen och spärren är borta.**
> **En riktig bugg fångad av ett test:** `angle_difference` i `training/evaluate.py` är rätt i
> Python men fel som direktöversättning — JS `%` är en *rest* som behåller tecknet, så uttrycket
> ger 358 där det ska ge 2, precis vid sömmen. TS-versionen gör dubbel modulo.
> **Två luckor i BACKLOG stängda samtidigt:** S-17 och S-18 (blade-stabiliteten och
> `trace_swing.py`, båda committade 2026-09-15) saknade poster och har fått dem.
> `npm run build` rent · `npm run lint` 2 kvarstående fel i orörda filer (baslinjen) ·
> `npm test` **470/470** (89 nya).
>
> **Senast (2026-09-15, stream-shaft):** S-20 — Utökar S-18. `training/trace_swing.py` kör nu spårningen
> över **flera klipp** (`--clips`) och sammanställer dem i
> [`../training/blade-usability.md`](../training/blade-usability.md). Tio klipp ur
> `data/shaft/clips/`, 4 766 bildrutor, 3 386 steg med båda vinklarna i båda ändar.
> **Frågan var vad som förutsäger den taggiga bladvinkeln — svingfasen eller modellens
> konfidens på `toe`/`heel`. Svaret är: ingendera, och skälen skiljer sig.**
> **Konfidensen har inget spann.** `min(toe, heel)` är median **0,26**, p90 0,35, **max 0,55**
> över de bildrutor som bär en bladvinkel — skaftets `min(butt, hosel)` ligger på 0,99/1,00/1,00.
> Kvoten blad/skaft är dessutom platt och icke-monoton genom hinkarna (3,42 · 4,08 · 2,94 · 2,20).
> **Ingen tröskel ger kvot ≤ 1,5**, varken över allt eller enbart inuti svingarna.
> **Men 0,3 stoppar omkastningarna:** `toe`/`heel` byter plats i 3 % av stegen i sving vid 0,1,
> 1 % vid 0,2 och **0 av 272 vid 0,3**. Grinden gör bladvinkeln *mindre farlig, inte användbar*
> — kvoten där är fortfarande 2,34 och 20 % av bildrutorna i sving återstår.
> **Fasen vänder åt andra hållet än `002.mp4` antydde:** kvoten är högst när klubban står still
> (`address` 4,30, mellan svingar 4,16) och lägst i de snabba faserna (`through` 1,69, `top` 1,87,
> `downswing` 2,30). Bladet bär ett **brusgolv** som ligger kvar när klubban stannar och drunknar
> i verklig rörelse när den går fort. `002.mp4` är urvalets ytterlighet (kvot 6,06 i sving mot
> 0,85–4,00 för de nio andra). `blur` delar inte upp materialet alls (`none` 2,09 · `mild` 6,63 ·
> `severe` 1,29, små hinkar).
> **Fasen härleds ur manifestens `envelopeSec`/`impactSec`, aldrig ur en andra pose-körning** och
> aldrig ur spårningen själv — det senare hade varit en cirkel. `start`/`impact`/`finish` är mätta,
> **toppen finns inte i manifestet**, så gränsen backsving/nedsving är typsvingens proportion ur
> `src/lib/dataset/datasetPhase.ts`. Porten håller med manifestets egen `phase` i **577/650 (89 %)**
> och varje avvikelse ligger där toppen hade avgjort; rapporten skriver ut förväxlingstabellen.
> **Urvalet står skrivet före körningen** i [shaft/blade-usability-clips.md](shaft/blade-usability-clips.md)
> (citeras ordagrant in i rapporten via `--selection-note`): 5 `dtl` + 5 `face_on`, skarpt och suddigt,
> med face_on och `severe` medvetet översamplade. Poolen är de 80 av 97 klipp som har en annoterad
> bildruta i en batch.
> `py -3.11 -m unittest discover -s training -t training` **239/239** (80 nya).
>
> **Dessförinnan (2026-09-15, stream-shaft):** `training/trace_swing.py` — **modellen körd på varje
> bildruta i ett klipp**, inte bara de envelope-valda, med skaft- och bladvinkel plottade över tid
> (`training/trace-<klipp>.png`) och rådata per bildruta (`.csv`, gitignorerat). Vid 30 fps blir
> tidssteget ~0,033 s i stället för träningsbatcharnas ~0,3 s; `measure_blade_stability.py` svarar
> på *hur snabbt* vinkeln rör sig, det här skriptet på *hur* den rör sig. Modelladdning, letterbox
> och vinkelmatte återanvänds ur `evaluate.py`/`measure_blade_stability.py` — ingen duplicerad logik,
> inga nya beroenden (matplotlib följer med ultralytics).
> **Två trösklar, inte en:** `--kpt-conf-shaft` 0,5 för `butt`/`hosel`, `--kpt-conf-blade` 0,1 för
> `toe`/`heel`, och varje vinkel släpps in på sina **egna** två punkter. En gemensam 0,5 gav 0 %
> täckning på solpunkterna och därmed ingen bladvinkel alls; 0,1 gav 80 %. En gemensam tröskel gör
> alltså inte mätningen strängare, den gör den tom.
> **Luckor bryts, aldrig interpoleras** — tomma fält i CSV:n, brott i kurvan, grå band för "ingen
> detektion" och röda märken för "detektion men punkten under tröskeln". En interpolerad bladvinkel
> hade ritat precis den jämna kurva skriptet testar efter.
> **Wrappen:** CSV:n bär rådata ovecklad, grafen visar serien **uppvecklad** (varje steg kortaste
> vägen runt cirkeln, summerat), så en passage genom ±180° ritas rak. Offseten bärs över luckor —
> ett segment efter ett långt hål kan ligga ett helt varv fel, och det står i grafens underrubrik.
> Hastighetsstatistiken räknas aldrig på den uppvecklade serien.
> **KÖRNINGEN PÅ `data/shaft/clips/002.mp4` ÅTERSTÅR: fyrapunktsvikterna finns inte på den här
> maskinen.** `training/runs/` är gitignorerat och tomt, och `public/models/` bär bara de
> tvåpunkts `shaft-v1/v2.onnx`. Röktestat end-to-end med `shaft-v2.onnx` på CPU (40 frames av
> 002.mp4): avkodning, tidsaxel, CSV, graf och sammanfattning fungerar, skafttäckning 100 %,
> bladtäckning 0 % — vilket är precis vad en tvåpunktsmodell ska ge. Kör om med `shaft-v3` när
> vikterna finns.
> `py -3.11 -m unittest discover -s training -t training` **161/161** (33 nya).
>
> **Och dessförinnan (2026-09-15, stream-shaft):** S-16 — **`toe`/`heel` levereras placerade**
> (`outside="0"` med riktiga koordinater) i stället för `outside="1"` på platshållare.
> **batch-03:s frames och urval är orörda**; omkörningen ger samma **181 av 250** och samma
> skältabell. **Skälet är CVAT:s gränssnitt, inte specen:** en punkt som aldrig dragits har
> inga koordinater, så den hamnar i bildens övre vänstra hörn i samma stund flaggan kryssas
> ur — och flaggan är asymmetrisk (`outside` **på** = tangent `O`, **ur** = musklick i
> PARTS-panelen). Normalfallet var dyrt, undantaget billigt; nu tvärtom. Specregeln är
> oförändrad: kan annotatören inte urskilja huvudet sätter hen `outside` själv.
> **Det är ett startläge, inte en förhandsmärkning** — modellen är fortfarande tvåpunkts.
> Ny `sole_points()` i `training/prelabel_batch.py`: linje ut ur `hosel`, vinkelrät mot
> `butt→hosel`, längd `SOLE_LENGTH_FRACTION = 0,09` av skaftlängden i bild — ett verkligt
> klubbhuvud mot klubbans längd minus huvudet (driver ≈ 0,10, järnsjua ≈ 0,086, wedge ≈ 0,09).
> Hälen 0,01 ut från hoseln, så punkterna går att greppa var för sig. **Sidan är godtycklig**
> och frihetsgraden läggs på att hålla båda punkterna i bild; klampning som sista utväg.
> Verifierat på filen: noll `outside="1"`, noll `0.00,0.00`, häl–tå/skaft 0,0898–0,0902,
> |cos| ≤ 0,0022, alla 362 punkter i bild — **ingen klampning behövdes**.
> `py -3.11 -m unittest discover -s training -t training` **89/89** · `npm run build` rent ·
> `npm run lint` 2 kvarstående fel i orörda filer · `npm test` 381/381.
>
> **Dessförinnan (2026-09-14, stream-shaft):** S-15 — **batch-03 dragen** (250 frames, seed `0x7ba7c0de`,
> pool 1435 → 935 efter exkludering; noll överlapp mot `reserved-ids.txt`, batch-01 och batch-02),
> **förhandsmärkt med `shaft-v2`** och **vygrinden lossad till `dtl` + `face_on`**. Ingen träning körd.
> **Fyndet som styr allt annat:** v2:s svaghet är inte en *fas*, den är `view` och `blur` —
> `face_on` **6/10 utan detektion (60 %)**, `severe blur` **5/12 (42 %)**, mot `dtl`+skarp 6/75 (8 %).
> **Manifestet bär varken `view` eller `blur`**, så batchdraget kan inte styra på någondera: mätt på
> 488 annoterade frames ger specvikterna 10,8 % `severe blur`, batch-02 10,6 % och batch-03 10,9 %.
> **Faskvoten köper alltså ingen oskärpa alls** — det står rakt ut i `summary.md` i stället för att
> gömmas i en vikttabell som ser riktad ut. Vad den *köper* är annotatörsfasen (manifestfasen är 49 %
> rätt men strukturerat fel): `address` 7,7→13,9 %, `backswing` 11,7→16,7 %, `finish` 11,2→13,9 %,
> `top` 33,6→21,4 %. Viktningen är batchspecifik i `docs/shaft/batch-03-phase-weights.json`;
> **specens målvikter är orörda**.
> **Klubbhuvudets synlighet undersöktes och valdes bort** som urvalskriterium: manifestet bär ingen
> utseendesignal, `shaft-v2` är tvåpunkts, skaftlängd som förkortningsmått är redan mätt och
> underkänt — och framför allt finns **noll `toe`/`heel` annoterade någonstans i repot**, så
> heuristiken hade varit oförfalsifierbar. Kostnaden för att låta bli är noll: ett oannoterbart
> huvud blir `outside`, inte en bortkastad frame. **När batch-03 är annoterad finns facit** och
> frågan blir mätbar; det som faktiskt når `face_on`/`severe blur` är ett urval som kör v2 över
> *poolen* och väljer det den missar — behöver inget facit, byggs inte här.
> **Vygrinden lossades på en mätning, inte på modellbytet:** v2 har noll omkastningar >90° på
> `face_on`, och dess värsta avvikelse (4,08°) är **mindre** än de fyra värsta `dtl`-avvikelserna
> (14,33°, 13,02°, 11,93°, 11,46°). Enda >90°-framen i setet är `view: other`, som fortfarande
> blockeras. `--view-gate {swing, swing+face_on, off}`, standard `swing+face_on`.
> **Utfall:** **181 av 250 (72 %)** förhandsmärkta — lossningen gav **+13** (168 → 181); av de 29
> nyinsläppta föll 16 på `no-detection`, vilket `face_on`:s 60 % täckningslucka förutsäger.
> `toe`/`heel` skrevs `outside="1"` på alla 181 — *överspelat av S-16, de levereras nu placerade.* `DEFAULT_MODEL` är nu `shaft-v2.onnx`;
> parittestet pekar på egen konstant `GEOMETRY_REFERENCE_MODEL = shaft-v1.onnx` (de pinnade
> koordinaterna är S-11:s webbläsarverifierade v1-utdata).
> Verifierat: `py -3.11 -m unittest discover -s training -t training` **81/81** (12 nya för vyhinkar
> och grindlägen).
>
> **Dessförinnan (2026-09-14, stream-shaft):** S-14 — **skaftschemat vidgat från två punkter till
> fyra**: `butt → hosel → toe → heel`. Ordningen är fast och gäller överallt — CVAT:s
> sub-etiketter, COCO-exportens keypoint-lista, kolumnerna i YOLO-etiketten, kanalerna i
> ONNX-utdatan. **Ingen träning körd, `shaft-v2.onnx` orörd**; den fortsätter köra tvåpunkts
> tills en fyrapunktsmodell finns. Schemat ligger före modellen med flit, så att annoteringen
> kan börja.
> **`toe`/`heel` är solans ändpunkter** — klubbhuvudets nedre kant, ytan som möter marken —
> valda av samma skäl som hoseln valdes framför huvudets centrum: solan syns på både driver
> och järn och slutar tydligt i båda ändar. **Häl–tå-linjen bär bladets rotation** och är hela
> skälet punkterna finns; `butt→hosel` ger skaftets riktning, `heel→toe` bladets.
> **Pekar huvudet rakt mot eller från kameran blir båda `outside`** — solan är då en punkt i
> projektion, och två punkter ovanpå varandra är en bladvinkel som inte finns.
> **Bakåtkompatibiliteten sitter på ett ställe:** `_points_of` i `training/shaft_coco.py` paddar
> en kort keypoint-lista med `v=0`, så batch-01, batch-02 och båda kalibreringspassen läses som
> fyrapunktsannoteringar vars `toe`/`heel` är `outside` — inte som fel, och inte som punkter i
> origo. `export_keypoint_names` läser COCO-kategorins egen lista, så körningen **skriver ut
> vilket schema exporten bar**; fel ordning ger en `UNEXPECTED`-varning, eftersom läsningen är
> positionell.
> **`evaluate.py` rapporterar nu bladvinkeln som eget mätvärde** vid sidan av skaftvinkeln,
> aldrig hopslagen — varje vinkel mäts bara där dess egna två punkter finns på båda sidor, och
> det finns **inget människogolv för bladvinkeln** eftersom kalibreringssetet annoterades i
> tvåpunktsschemat. **Kanalantalet är kontraktet:** `[1, 17, N]` för schemat, `[1, 11, N]` för en
> äldre modell; `shaftPostprocess.ts` läser det ur tensorn och avkodar båda, `export_onnx.py`
> säger vilket schema den exporterade grafen implementerar och vägrar allt annat.
> `ShaftDetection` bär `toe`/`heel` plus `modelKeypoints`, som skiljer *"modellen har ingen tå"*
> från *"framen har ingen synlig tå"*.
> **CVAT måste ändras för hand.** `docs/shaft/cvat-labels.json` är repots kopia — etiketterna bor
> i CVAT:s databas och läses aldrig ur repot, så `toe` och `heel` måste läggas in i
> etikettkonstruktorn, i rätt ordning, innan en task kan annoteras med fyra punkter. **Det är den
> enda åtgärd som återstår innan nästa batch kan annoteras.**
>
> **Uppdatering samma dag:** `cvat-labels.json` är nu komplett (`shaft` **plus** `frame_meta`) och
> avsedd att klistras in i CVAT:s **Raw**-flik. Tre saker, lästa ur `cvat-ai/cvat@develop` och
> beskrivna i [specen](shaft/annotation-spec.md#raw-fliken-ersätter-hela-etikettdefinitionen):
> Raw **ersätter hela** definitionen och strippar dessutom `id`-fälten ur det man klistrar in, så
> en inklistring i ett projekt som redan har `shaft` raderar etiketten *och dess annoteringar*.
> Skelettets SVG skrivs **bara vid skapandet** — ett tvåpunkts-`shaft` går alltså inte att
> uppgradera på plats; **nytt projekt eller ny task är enda vägen**. Mallen saknade `data-node-id`
> på cirklarna (kanterna hade inte följt punkterna vid ritning) — fixat. **Gå igenom checklistan i
> specen innan du klistrar in.**
> Verifierat: `npm run build` rent · `npm test` 381/381 · `npm run lint` 2 kvarstående fel i
> orörda filer · `py -3.11 -m unittest discover -s training -t training` 69/69 (ny modul
> `training/test_shaft_schema.py`).
>
> **Dessförinnan (2026-09-14, stream-shaft):** S-13 — skaftmodellen bytt till **`shaft-v2.onnx`**.
> **Ett ställe namnger modellen:** `MODEL_FILE` i `src/lib/shaft/shaftDetector.ts`; `MODEL_URL`
> härleds ur den och matar både `preflightAssets()` (via `ORT_ARTIFACTS`) och varje
> `InferenceSession.create()`. Preflightens felmeddelande och dev-vyns rubrik konsumerar samma
> konstant. **SW-regeln i `vite.config.ts` rördes inte** — den matchar `.endsWith(".onnx")`, och
> eftersom URL:en byter namn åldras en kvarliggande v1-post ut ur `shaft-runtime` i stället för att
> serveras. `training/prelabel_batch.py` kör **medvetet kvar på v1**: dess vygrind är kalibrerad mot
> v1:s ombytningsfel, och att lossa den är ett eget mätbart beslut. *(Överspelat av S-15 samma dag —
> beslutet är taget och mätt: `DEFAULT_MODEL` är v2 och grinden släpper in `face_on`.)*
> **Mätvärden mot kalibreringssetet** i [`../training/README.md` → *Levererande modell*](../training/README.md#levererande-modell-shaft-v2onnx):
> vinkelmedian **1,06°** mot människornas 0,30°, p90 6,72°, `butt` 0,54 %H, `hosel` 0,47 %H,
> `face_on` **4,32°** (v1: 158,6°), `severe blur` 3,46°, **17 av 96 frames utan detektion**.
> **Dev-vyn på `002.mp4`** (headless Chrome, WebGPU, equivalence-checken mot WASM OK): en sving,
> 29 frames, **17 med detektion** (15 med båda ändarna, 2 med bara `butt`).
> **Den ombytta 179°-hoppningen 3,83→3,93 s är borta** — 3,83/3,87 ger båda −110,8°, och 3,90/3,93
> returnerar bara `butt`. **Men serien är inte kontinuerlig:** 10 frames mellan **3,90 och 4,20 s
> saknar användbar vinkel och täcker hela impact** — felet har bytt form från *omkastade ändar* till
> *ingen detektion*, vilket är säkrare men inte löst. Dessutom en vinkelskakning ±30° kring toppen
> (3,37–3,70 s) där `hosel`-x vandrar 80 px medan `butt` står still. Det stora steget 4,37→4,53 s
> (144,8°) är däremot **äkta rörelse** — `butt`-banan är tät (41/59/25/9/4/3 px), så greppänden är
> rätt identifierad.
> **`shaft-v1.onnx` ligger kvar på disk** (båda är gitignorade) tills v2 är sedd på en **iPhone** —
> det är den enda återstående punkten i S-13.
>
> **Innan dess (2026-09-14, stream-shaft):** S-12 batch-02 + förhandsmärkning. 250 frames dragna på en
> **batchspecifik** faskvot (`--phase-weights docs/shaft/batch-02-phase-weights.json`: downswing
> 34 → 44 %, top 10 → 16 %, idle → 0 %); **specens målvikter är orörda** — filen bär en obligatorisk
> `note` som `summary.md` citerar, och vikterna måste summera exakt till 1. `training/prelabel_batch.py`
> körde `shaft-v1.onnx` över batchen och skrev `prelabel.xml` (**CVAT for images 1.1**,
> `<skeleton label="shaft">` + `<points label="butt|hosel">`, format verifierat mot CVAT:s docs för
> den självhostade utgåvan) — **118 av 250 frames (47 %) förhandsmärkta**.
> **Vygrinden är det som gör det försvarbart:** modellen kastar om ändarna vid förkortning
> (kalibreringssetet: `dtl` 50 frames medianfel **2,6°** och **noll** ombytningar, `face_on` 4 frames
> medianfel **158,6°** och 2 ombytningar), så en frame förhandsmärks bara när **varje redan annoterad
> frame ur samma sving** säger `dtl` — per sving, aldrig per klipp, eftersom klipp byter kameravinkel
> mellan svingar (`072.mp4`, `IMG_5426.MP4`, `IMG_5428.MP4`). Täckning: 187 frames ur enhälligt
> dtl-svingar, 21 ur face-on-berörda, 42 ur svingar utan annoterad vy.
> **Två heuristiker prövades mot data och förkastades** (skaftlängd — face-on-intervallet ligger helt
> inuti dtl:s; vinkelkontinuitet över svingen — 0 fångade, 24 falsklarm); skälen står i skriptets huvud
> så de inte prövas igen. `view`/`blur`/`phase`/`no_shaft` och punktflaggorna lämnas **osatta**.
> Python och inte Node för att `onnxruntime`+`cv2` redan är pinnade; priset är en andra kopia av
> letterbox/postprocessing, pinnad mot S-11:s tre dubbelverifierade frames i `test_prelabel_batch.py`.
>
> **Och dessförinnan (2026-09-14, stream-shaft):** S-11 skaftdetektorn i webbappen — `onnxruntime-web` 1.29,
> ny fristående modul `src/lib/shaft/` (`shaftDetector` · `letterbox` · `shaftPostprocess` ·
> `shaftPreview`) och en dev-vy `ShaftPreviewView` bakom `VITE_DEV_PREVIEW` (launcher "⌁ Shaft").
> **Pose-kedjan är byte-för-byte orörd** — `git diff main` är tom för `frameExtractor.ts`,
> `poseEnvelope.ts`, `poseSegments.ts`, `poseEnvelopeSelection.ts` och `api.ts`.
> **Runtimen är självhostad precis som MediaPipe-WASM:** `scripts/copy-shaft-wasm.mjs` →
> `public/ort/`, `npm run shaft:wasm`, och `prebuild` kör nu `npm run assets` (pose + shaft).
> **Modellen och runtimen precachas INTE** — 12,4 + 13,3 MB hade nära tredubblat en
> förstainstallation för en detektor bara dev-flaggan når. De laddas lazy vid första användning och
> hålls av `CacheFirst`-regeln `shaft-runtime`; motiveringen och villkoret för att ompröva står i
> `shaftDetector.ts`-huvudet och i `vite.config.ts`. Verifierat i det byggda bygget: precachen har
> 27 poster, ingen `.onnx`, inget `/ort/`; efter första hämtningen ligger båda i `shaft-runtime`.
> **Två fallgropar som bara hittades genom att köra:** (1) `wasmPaths` som *katalogprefix* får ORT
> att `import()`:a sin laddare ur `public/`, vilket Vites devserver svarar 500 på — objektformen
> `{ wasm: '/ort/…wasm' }` använder den inbakade laddaren i stället; (2) ORT-bundelns
> `new URL(…, import.meta.url)`-fallback fick Vite att emittera en **andra** kopia av 13,3 MB-
> binären i `dist/assets/`, som pluginen `ortSelfHostedWasm` nu skriver om bort.
> **Letterbox, inte utsträckning.** `export_onnx.py`s `cv2.resize` till 960² är bara den numeriska
> PyTorch↔ONNX-jämförelsen; noggrannhetsvägen (`evaluate.py` → `model.predict`) och träningen går
> båda via Ultralytics `LetterBox` (bevarad proportion, grå 114). `computeLetterbox` speglar den ned
> till `round(pad − 0.1)`, och invers­transformen är enhetstestad fram och tillbaka — inklusive ett
> test som fångar just *glömde-paddningen* (~210 px fel på en porträttframe).
> **Mätt på desktop:** median **630 ms/frame** (min 604, max 795) med 1 tråd ORT-WASM på 960²;
> preprocessing 16 ms; en sving ≈ 29 frames ≈ **19 s**. Samma modell i Python på samma maskin tar
> 65 ms — trådar plus WASM-overhead. Flertrådning kräver COOP/COEP, som appen inte sätter.
> **Verifierat mot Python:** tre kalibreringsframes genom samma `.onnx` i båda miljöerna ger
> samma detektioner inom **1 px** per punkt (konfidens skiljer ~0,02, canvas bilinjärt mot cv2
> `INTER_LINEAR`). **Öppet fynd, modellen och inte kedjan:** på `002.mp4` hittas klubban i 10 av 29
> frames — address/tidig backswing conf 0,87–0,90, nedsvinget 0,00; Python säger samma sak. Mer
> träningsdata på `downswing` hör hemma i en egen uppgift.
> **Kvar orört, medvetet:** två gamla lintfel (`FrameLightbox.tsx:27`, `useHistory.ts:93`,
> `react-hooks/set-state-in-effect`) och två fallerande test i `src/lib/dataset/phaseQuota.test.ts`
> — alla fyra finns på `main` före den här grenen och tillhör andra strömmar.
>
> **Tidigare (2026-09-13, stream-shaft):** S-10 träningsmiljö för skaftdetektorn — nytt, fristående
> spår i `training/` (Python 3.11 + CUDA, YOLOv8n-pose). **Ingen webbappskod rörd.** Ingen träning
> körd. Uppsättningen står i [../training/README.md](../training/README.md);
> `training/runs|datasets|.venv` och `__pycache__/` är gitignorade.
> **PyTorch installeras separat och FÖRE `requirements.txt`** — annars drar `ultralytics` in
> CPU-hjulet från PyPI och GPU:n används aldrig: `--index-url
> https://download.pytorch.org/whl/cu132` (CUDA 13.2, torch 2.14:s förval). **Python 3.11 är inte
> valfritt:** `onnxruntime` 1.30 kräver ≥ 3.11, `numpy` 2.5 kräver ≥ 3.12.
> `prepare_dataset.py` läser `reserved-ids.txt` och **avbryter om den saknas** (samma hårda regel som
> S-9), och kontrollerar efteråt att inget reserverat id nådde datasetet. Fasen kommer ur
> `phase-corrected.json` → annotering → manifest och hamnar i `frame-meta.json`, **aldrig i
> etiketterna**. **Boxvalet:** punkternas omslutande rektangel + marginal, med golv för det lodräta
> skaftets nollbredd; frames med bara en punkt **behålls** med kvadratisk ersättningsbox (median
> skaftlängd / √2, så boxytan — som pose-förlusten normaliserar mot — hamnar i rätt fördelning),
> eftersom bortfallet inte är slumpmässigt: en punkt är `outside` just när den är svår.
> **Spegling av i två lager** (`flip_idx: [0,1]` + `fliplr=0.0`, och `train.py` avbryter om det
> ändras) — `butt`/`hosel` är en riktad vektor, inget spegelpar. `evaluate.py` jämför mot
> **människornas samstämmighet** ur S-7 (vinkel 0,3°, butt 0,17 %H, hosel 0,13 %H) och skriver
> differensen, grupperat per `phase`/`view`/`blur` → `training/eval-report.md`.
> **Verifierat mot riktiga data:** 146 frames → 143 skrivna (3 `no_shaft`), 123 två-punkts + 20
> en-punkts, split 122/21 per sving, alla 143 etikettfiler validerade, en rad räknad för hand mot
> COCO-källan. **Ej verifierat:** ingen NVIDIA-GPU på den här maskinen och `torch`/`ultralytics` är
> inte installerade, så GPU-steget, `model.train()` och ONNX-exporten är oprövade.
>
> **Tidigare samma dag (stream-shaft):** S-9 första träningsbatchen —
> `scripts/build-training-batch.mjs` drar 150 frames ur `data/shaft/exports/` med evalsetet
> exkluderat → `data/shaft/training/batch-01/` (`batch.zip`, `ids.txt`, `prefill-phase.xml`,
> `labels-frame-meta.json`, `summary.md`). **`reserved-ids.txt` saknas ⇒ exit 1**, avsiktligt hårt.
> Nästa batch plockar automatiskt upp varje `data/shaft/training/*/ids.txt`. Draget är
> `selectCalibrationSet` återanvänd, men med specens målvikter som kvoter och egen seed
> (`0x7ba7c0de`) — delad seed hade dragit batchen mot evalsetets närmaste grannar. **CVAT-
> förifyllningen av `phase` funkar:** *CVAT for images 1.1* med `<tag label="frame_meta">` per bild,
> plus `--labels`-schemat, i ett `cvat-cli task create`. Två fallgropar står i specen — schemat kan
> inte importeras (attribut måste finnas i förväg, annars tas taggarna tyst inte emot) och
> `image/@name` måste matcha bildnamnet i tasken. Verifierat: 150 frames / 150 svingar, alla
> faskvoter exakt, 75/75 web/own, tomt snitt mot `reserved-ids.txt`, omkörning bit-identisk.
> **Bifynd [F4](oppna-fragor.md):** kalibreringssetets `PHASE_QUOTAS` matchar inte specens
> målvikter — loggat, inte rättat (setet är redan annoterat evalset).
>
> **Tidigare samma dag (stream-shaft):** S-8 skärpta annoteringsregler — enbart dokumentation i
> [shaft/annotation-spec.md](shaft/annotation-spec.md), ingen kod. **`phase` annoteras inte längre
> för hand** (fylls från `manifest.json` vid tasksskapande — 58 % enighet var mätningens lägsta
> siffra och uppgiften är omöjlig på en stillbild). **`blur`** har fått en tillämpbar regel:
> gränsen går vid **en linje eller flera**, inte vid hur ful bilden är. **`occluded` vs `visible`**
> skärpt med nyckelmeningen *occluded handlar om punkten, inte om bilden* (synligt skaft + skymd
> greppände = `visible` hosel + `occluded` butt); punkt utanför bildkanten är `outside`.
> **Hoseln** är där skaftets linje slutar vara rak, inte mitt i huvudets suddfläck. Nytt avsnitt
> om att **gå till klippet** (`data/shaft/clips/` vid `tSec`, stega bildruta för bildruta) som
> normal arbetsgång vid tvetydiga frames, plus **"Kalibreringsutfall 2026-09"** med siffrorna bakom
> besluten. **Återstår i S-8:** manuell granskning av rapportens avsnitt 5 + 7, beslut om
> skaftbreddsmålet, och de 3 kalibreringsframes som aldrig kom in i CVAT-tasken.
>
> **Tidigare samma dag (stream-shaft):** S-7 samstämmighetsmätning —
> `scripts/measure-calibration.mjs` jämför de två CVAT-exporterna (`erik.zip`, `lisa.zip`) och
> skriver `data/shaft/calibration/agreement.md`. **Utfallet: punktplaceringen håller, etiketterna
> gör det inte.** Butt median 2,5 px (0,17 % av bildhöjden), hosel 1,9 px (0,13 %), vinkelmedian
> **0,3°** / p90 1,3° / max 2,3° över 81 frames — vinkeln är det som betyder något eftersom
> reglerna mäter vinklar. Men: `phase` samma värde i bara **56/97** frames och `blur` i 76/97,
> och synlighetsflaggan skiljer i ~12 % per punkt (mest `occluded` vs `visible`). `severe blur`
> sticker ut som väntat (butt-median 0,56 % mot 0,14 % för `none`, vinkel 1,1° mot 0,2°);
> **`downswing` gör det inte**, men den hinken är bara 6 frames just för att fasetiketten är så
> omtvistad. **Nästa steg innan produktionsannotering:** skärp `phase`- och `blur`-definitionerna
> och regeln för `occluded` vs `visible` i [shaft/annotation-spec.md](shaft/annotation-spec.md) —
> det är etikettdefinitionerna som är flaskhalsen, inte annotatörernas handlag. Topplistan i
> rapportens avsnitt 7 (15 frames) och skaftlängdslistan (avsnitt 5) är det underlag som ska
> granskas för hand; `096-a36a587d_s00_f01` är värst (47 % skillnad i skaftlängd).
>
> **Tidigare (2026-09-03, stream-shaft):** S-6 kalibreringsset —
> `scripts/build-calibration-set.mjs` drar 100 frames ur ZIP:arna i `data/shaft/exports/`
> (deterministiskt: id-sorterad pool + seedad PRNG, konstanten `SELECTION_SEED`; fasfördelning
> downswing 40/impact 15/top 12/backswing 12/through 9/address 7/finish 5; max 1 frame per sving;
> ~50/50 web/own) och skriver `data/shaft/calibration/` — `calibration.zip`, `reserved-ids.txt`
> och `summary.md`. **`reserved-ids.txt` är bindande:** de 100 ids:en är permanent evalset och
> får aldrig ingå i träningsdata. Körd på riktiga data: pool 1435 frames / 205 svingar → 100
> frames, alla fasmål exakt, 100 olika svingar, 50/50 källa.
>
> **Tidigare samma dag (stream-shaft):** S-4 egen acceptansgrind för datasetextraktion
> (`src/lib/dataset/datasetGate.ts` — `isSwing` orörd, den lösare grinden omprövar bara det
> produktionen förkastade; `clippedTail` och envelopes upp till 12 s släpps in, exkursionsgolvet
> kvar, >3 s taggas `suspectMultiSwing`) och S-5 faskvot som bär över mellan svingar
> (`PhaseQuotaState` in/ut, löpande underskott över hela exporten — annars får `finish` aldrig
> en frame). Se BACKLOG Ström S.
>
> **Tidigare (2026-08-13):** S-2 klipphämtare `scripts/fetch-reddit-clips.mjs`
> (r/GolfSwing publik JSON → `data/shaft/urls.txt` + `sources.json`, för `yt-dlp -a`) och
> S-3 automatisk slow-mo per sving (härledd ur envelope-varaktighet, tröskel 3,0 s;
> `slowmo`+`envelopeDurationSec`+`slowmoMode` i manifestet, override auto/force i UI).

## Tech stack
- **Frontend:** React 19 + TypeScript + Vite 8, Tailwind v4, Zustand (vissa stores `persist`:ade).
- **Backend:** En Cloudflare Worker (`worker/worker.ts`) — proxy mot Anthropic + `/api/log` → D1.
- **AI:** Claude Sonnet 4.5 (`claude-sonnet-4-5`) med prompt caching.
- **Lagring:** IndexedDB (`idb-keyval`) som källa till sanning; Supabase valfri metadataspegling.
- **PWA:** `vite-plugin-pwa`, `registerType: 'prompt'`.

## Fungerar

- **Bildruteval via pose-envelope (Ström D, primär väg).** `frameExtractor.ts` → `selectViaPose`
  (`detectSwingEnvelope` + `selectEnvelopeFrames`). Pixel-diff (`selectViaMotion`) är **fallback**
  och triggar bara vid pose-fel eller `envelope.valid === false` — tyst för användaren, men loggad
  (`log.warn('Frame selection', {path:'pose'|'motion'})`) så fallback-frekvensen är mätbar i fält.
  **Fältverifierad på iPhone:** GPU-delegat, 14,9 fps, 18–21 ms inferens.
- Kamera/inspelning, Claude-analys via Worker-proxy med prompt caching (`api.ts`, `prompt.ts`).
- **Vidvinkel (0,5×)** — `settings.wideAngle` (persisterad) → `lib/cameraZoom.ts` sätter
  `zoom` på den **redan aktiva** videospårningen (ingen enhetsväxling; diagnostiken visar
  `min 0.5 / max 10` på bakre trippelkameran). Halverar ungefär nödvändigt avstånd på range.
  Appliceras i `useCamera` **bara när ingen inspelning pågår** — `applyConstraints` formar om
  exakt den spårning MediaRecorder läser, så ett linsbyte mitt i svingen skulle förstöra klippet.
  En växling under en session tappas inte utan **skjuts upp** till nästa inspelningsstart.
  Saknad zoom-capability = tyst hoppa över (WARN en gång). `Camera zoom applied` loggas på
  **WARN** med både begärt och faktiskt värde (`getSettings().zoom`) — Safari får acceptera
  constrainten och ändå behålla linsen, och `matched:false` är enda sättet att se det i fält.
  Toggle: `components/Camera/WideAngleToggle.tsx` (0.5× / 1×, i sökarens nedre högra hörn).
  Testad i `lib/cameraZoom.test.ts` (klampning, saknad capability, avvikande faktiskt värde).
- **Pose-styrd beskärning av analysbildrutor (E-2, sessionsvägen).** `lib/poseCropBox.ts`
  bygger **EN** låda för hela svingen — unionen av alla landmärken över envelopen, aldrig en
  låda per bildruta (rörlig inramning är svårare att bedöma, inte lättare). Marginal 20 % i
  sidled, 12 % topp, ned till markplanet via fotlandmärkena; klampad till bilden genom att
  **glida**, inte krympa.
  **Ingen aspektlåsning (2026-08-11).** Lådan låstes tidigare till källans 9:16, vilket
  gjorde beskärningen verkningslös i produktion: en golfare är hög och smal (kroppslåda
  ≈ 1142 px av 1280), och låst till 0,5625 tvingades bredden till ≈ 642 px av 720 → två
  svingar i rad med `cropAreaPct` 79,6 och 100, `cropReason 'box-too-large'`. Vision
  accepterar godtycklig aspekt; inget krävde ratiot. I stället gäller ett **golv på hur
  smal lådan får bli** — `MIN_WIDTH_TO_HEIGHT` 0,30 (bredd ≥ 0,30 × höjd), som ger klubban
  svängrum utan att dra in bakgrunden. En naturligt bredare låda lämnas orörd. Klampning
  sker per axel, så överhäng i sidled inte längre kostar höjd. **90 %-taket avvisar inte
  längre** — en låda som fyller bilden betyder bara att beskärningen inte ger något, så den
  klampas och används (`'box-too-large'` borttaget; 4 %-golvet och `'box-degenerate'` kvar).
  **Kvalitetsgrinden mäter skelettet, inte lådan:** båda axlarna, båda höfterna och minst
  en fot måste vara närvarande i ≥ 50 % av samplen och ha medelvisibility ≥ 0,6. Area
  grindar *inte* kvalitet — en liten låda är det önskade utfallet på stativavstånd — bara
  ett 4 %-nät under degenererade lådor och ett 90 %-tak. Faller något → hela bilden med
  `cropReason` + `gateDetail` loggat. `poseFrameGrab` beskär via `drawImage`-source-rect, långsida ≤ 900 px,
  quality 0,8. Per sving loggas
  `cropReason`/`cropBox`/`cropAreaPct`/`cropAspect`/`gateDetail`/`outputSize`/`savedPct` på
  `Session swing N analyzed`.
  **Klipp-vägen (`frameExtractor.ts`) är orörd** — den beskärs inte; E-1 (långside-cap) står kvar.
- **Visuell identitet "Club Cream" (2026-08-10).** Krämiga ytor, fairway-grön accent,
  pillerformer, Outfit (självhostat + precachat → identisk rendering offline). Tokens i
  `src/index.css`, primitiver i `src/components/ui/` (`Card`/`Button`/`Chip`/`Segmented`/
  `Toggle`/`ScoreRing`/`Sparkline`). Domfärger (`ok`/`bad`/`gold`/`chart-*`) är frikopplade
  från `data-accent` så "godkänd" förblir grön oavsett vald accent. Två klasser som
  användes men aldrig existerade är nu riktiga: `safe-top`/`safe-bottom` (+ `viewport-fit=cover`
  i `index.html` — utan den är `env(safe-area-inset-*)` alltid 0 på iOS) och `@keyframes fadeIn`.
  **Ej enhetsverifierad** — se [design-system.md](design-system.md) → *Kända avgränsningar*.
- **Kameravyns kontrollmodell (UI-2, 2026-08-11).** Skärmen bär tre saker: sökare,
  **ett** lägesval och inspelningsknappen. Lägesvalet är ett `Segmented`
  **"En sving | Session"** — det enda som ändrar vad inspelningsknappen gör — med en
  förklarande rad under. Att växla till "En sving" är också hur en session avslutas
  (den gamla dubbletten i actionraden är borta). Allt annat som styr *hur* en
  inspelning beter sig — nedräkning, uppläsning på/av + Kort/Detalj, hörlursstyrning —
  bor i `Camera/RecordSettingsSheet.tsx` bakom en kugge; kuggen tonas i accentfärg när
  något där inne avviker från standard. Sökaren visar bara **fångsttillstånd**
  (REC + svingantal), aldrig lägestillstånd.
  **"Hörlursläge" heter nu "Hörlursknappen styr inspelningen"** — `useRangeMode` är ren
  *inmatning* (tyst ljudloop → Media Session `play`/`pause`/`nexttrack`), inte ljud ut;
  det gamla namnet antydde motsatsen och blandades ihop med `ttsEnabled`. Switchen är
  låst på i sessionsläge eftersom `startSession()` tvingar på loopen ändå.
- Regler: egna + regelbibliotek med drills, kameravinkel-filtrering.
- Historik i IndexedDB + valfri Supabase-spegling av metadata.
- TTS-uppläsning (quick/detailed), val av röst; serialiserad kö i sessionsläge.
- Kontinuerligt sessionsläge (D-5) — se *Pågående*.
- i18n (browser-/geo-detektering), tema + accentfärg, PWA-uppdateringsbanner.

### Regressionsharness — verifiera med `npm test`, inte för hand
Frysta landmark-fixturer i `src/lib/__fixtures__/` (`dtl-full`, `dtl-clipped`, `face-on`,
`session-multi`) körs genom exakt produktionskedjan av `poseEnvelopeRegression.test.ts`,
`poseSegments.test.ts` och `liveSwingDetector.test.ts` (golden envelope/impact/frameCount,
±2 frames tolerans). **Detta ersätter den gamla manuella klippverifieringen** — kör `npm test`
före varje ändring i pose-logiken. Nya fixturer exporteras med knappen i dev-previewen
(`FramePreview.tsx`, bakom `VITE_DEV_PREVIEW`). Dok: [pose-detection.md](pose-detection.md).

## Arkitekturbeslut som styr pose-arbetet

- **[ADR-002](decisions/ADR-002-stream-d-envelope-inversion.md) — envelope som primär selektor.**
  Fas-viktad selektion var skör; envelopen (start = address-avfärd via hastighets-onset backad bakåt,
  finish = high-settle *efter* downswing-passagen) är primär. Värsta fall blir "uniform över svingen",
  aldrig "missad impact". **Impact är polish, aldrig bärande.**
- **[ADR-003](decisions/ADR-003-draft.md) — N svingar i en ström** (hela ADR:n byggd 2026-08-08).
  Segmentering (`poseSegments.ts`) wrappar envelope-logiken i stället för att skriva om den:
  stillnadsöar → burstar → `isSwing`-grind per kandidat. Tre bärande beslut:
  1. **Segmentering före envelope** — `detectSwingEnvelope` är singleton-tillstånd och kollapsar tyst
     över flera svingar; den körs oförändrat *per segment*.
  2. **Impact ingår inte i acceptanskriteriet** — grinden vilar på envelope-struktur
     (valid, ej clippedTail, varaktighet, exkursion, peak, cooldown).
  3. **Handpositionen är en visibility-viktad mittpunkt av båda handlederna.** `primary ?? backup`
     bytte handled per frame och injicerade avståndet mellan handlederna som skenbar hastighet —
     klippets högsta, tagen för impact efter varenda sving.

**Durabla principer** (dyrköpta, gäller framåt): bind gränser till svingsekvensen, aldrig till en
enkel tröskel-passage; varje gräns med ett minimum måste också ha ett maximum; kompensera aldrig en
trasig signal med lösare trösklar.

## Pågående

### Ström D — klar och mergad till `main`
Envelope-selektionen är i produktion, fältverifierad, enhetstestad och regressionsskyddad.
Detaljerad patch-för-patch-historik finns i [ADR-002](decisions/ADR-002-stream-d-envelope-inversion.md),
[ADR-003](decisions/ADR-003-draft.md) och [BACKLOG.md](BACKLOG.md) D-1…D-4 — den duplicerades inte hit.

### D-5 — kontinuerligt sessionsläge (ADR-003 §4 + §5)
- **Pass 1 klar** — `store/session.ts` bär `swings: SessionSwing[]`, en livscykel per sving.
  Den globala `isAnalyzing` är borta; det sessionsvida härleds via `selectAnySwingBusy`.
  Ett klipp = en session med exakt en sving → enkelsvingsflödet funktionellt oförändrat.
  `SwingRecord`-formatet orört, sparad historik läses som förut.
- **Pass 2 klar** — live-pose utan seek: `poseRingBuffer.ts` (bunden landmark-historik, ~30 s,
  konstant ~1,9 MB), `livePoseLoop.ts` (rAF + tvåstegstakt 5→15 fps vid rörelse),
  `liveSwingDetector.ts` (inkrementell `detectSessionSwings` + dedupe). Live ger **exakt** samma
  resultat som batch mot alla fixturer. Detektionskostnad 0,4 ms avg. Latens 0,6–1,1 s efter impact
  och det är strukturellt korrekt — grinden förkastar `clippedTail`, så finishen måste sätta sig först.
- **Pass 3 — pågående (kod committad `cbade28`, ej fältverifierad).** Kedjan
  `detektor (rAF)` → *klipp fönster ur chunk-ringen* → `analyskö (seriell)` → `TTS-kö (FIFO)`.
  `videoChunkRing.ts` (bundet ~30 s-fönster, **init-segmentet pinnas** — utan `ftyp`/`moov` är senare
  chunks obrukbara bytes), `analysisQueue.ts` (en sving i taget mot Vision, ett fel stoppar aldrig kön),
  `useSessionCapture.ts` (orkestrering), `Session/SessionSwingList.tsx` (rad per sving, status + latenskedja).
  **`// OSÄKER:`** fMP4-fönsterklippet är giltigt per konstruktion men **ej verifierat på iOS-hårdvara**
  — probe + `Session swing N captured`-loggen finns för att göra ett fel synligt i stället för tyst.
  **Kvar: Erik kör en session på iPhone, 3 svingar utan att stoppa inspelningen**, och läser talad
  feedback per sving, sessionsvyns rader, latenskedjan samt `windowMb`/`ringRetainedMb`.
  - **Avkodningsbugg fixad (2026-08-09).** Fältfallet `windowSec [3.25, 6.42] · chunks 3 ·
    headerPrepended true` gav 17 identiska adressbilder och "no visible swing movement" från Vision:
    `materialize()` valde bara de *överlappande* chunksen, och iOS Safaris ~1 s-chunks (oavsett
    `TIMESLICE_MS=100`) saknar egna nyckelbilder — de kräver kedjan från init-segmentet. Nu tas
    **alla** chunks från `chunks[0]` fram till fönstrets slut; `truncatedStart` betyder bara
    "starten är evict:ad". Kostnaden syns som `leadInChunks` i `Session swing N captured`.
    Retentionen (30 s) sätter fortfarande minnestaket.
- **Pass 4 klar (2026-08-09) — sessionssammanfattning.** `lib/sessionStats.ts` (ren
  modul-singleton, ingen ny store) samlar under sessionen och loggar **en WARN-rad
  `Session summary`** vid `endSession()`: `durationSec`, `swingsDetected/Analyzed/Failed`,
  `detectedMs`/`framesMs`/`visionMs` som `{median, p95}`, `spokenMedianMs`, `poseDetectionRate`,
  `achievedFpsMedian`, `ringEvicted`, `maxWindowMb`, `totalCostUsd`, `quickMode`,
  `medianOutputTokens`, `medianInputTokens`, `activeRuleCount`, `failureReasons`.
  **Det är raden att utvärdera ett fälttest mot** — de per-sving-rader som redan finns är rätt
  granularitet för en sving och fel för en 20-minuterssession. Livscykeln ligger i storen
  (`startSession`→`begin()`, `endSession`→`end()`, `lastSummary` för UI:t) eftersom `endSession`
  anropas från tre ställen. Additivt: `api.ts` `options.onUsage` (kostnaden var beräknad men
  aldrig returnerad) och `useLiveSwingDetection.onStats` (vidarebefordrar `LivePoseLoop.onStats`).
  Samma siffror visas på kameravyn efter avslutad session via `Session/SessionSummaryCard.tsx`.
- **Token-/kostnadsdata synlig i fält (2026-08-11).** `analyzeSwing response received` och
  `💰 Analysis cost` gick från INFO till **WARN** — logpanelen på telefonen visar bara WARN, så
  effekten av varje token-/latensoptimering var osynlig just där den mäts. Båda kör en gång per
  sving. Svarsraden bär nu även `activeRuleCount`, `frameCount` och `tokensPerFrame`
  (= `inputTokens / frameCount`; prompt + system ligger före cache-brytpunkten, så `inputTokens`
  är i praktiken bildkostnaden) bredvid befintliga `visionMs`/`outputTokens`/`maxTokens`/`quickMode`
  — generering dominerar anropet, och output skalar med regelantal och det schema `quickMode`
  väljer, så latens går inte att förklara utan requestens form. `AnalysisUsage` utökad med samma
  fyra fält; `sessionStats.recordCost(usd)` → **`recordUsage(usage)`**, och sammanfattningen bär
  `quickMode`/`medianOutputTokens`/`medianInputTokens`/`activeRuleCount` (medianer av samma skäl som
  `visionMs`; requestens form är sista sedda värdet, eftersom den kan ändras mitt i en session).
  Ingen logikändring — bara loggnivå och loggfält. `npm test` 149/149, build + lint rena.
- **Impact-grind i sessionsläget (2026-08-11).** `runSwing` analyserar bara svingar vars
  envelope bär en **bekräftad impact** (`envelope.impact !== null`) — saknas den hoppas
  bildruteextraktion, Vision-anrop och tal över helt. Fältdatan som fällde beslutet: en falsk
  detektion (någon gick förbi kameran) gav `impactSec null · verticalExcursion 0,088 ·
  peakSpeed 0,72` och kostade **$0,0408 — mer än en riktig sving**, eftersom det utsträckta
  envelope:t gav en beskärningslåda på 93,9 % av bilden. Den lade sig dessutom i den seriella
  kön framför riktiga svingar och lästes upp i hörlurarna. Samtliga falska detektioner i
  dagens loggar har `impactSec null`; riktiga svingar har bekräftad impact.
  Ny sving-status **`skipped`** (skild från `failed` — inget gick fel), nytt
  sammanfattningsfält **`swingsSkippedNoImpact`** (räknas inte som fel och syns inte under
  `failureReasons`), och WARN-raden `Session swing skipped — no confident impact` bär
  `swingIndex`/`envelopeSec`/`envelopeDurationSec`/`verticalExcursion`/`peakSpeed`
  (+ `impactReason`/`clippedTail`) — datan som avgör den **öppna** frågan om grinden avvisar
  riktiga svingar på rangen. Avstängbar via ny inställning `requireImpact` (default `true`) i
  settings-storen; ingen UI, den sätts från storen. **Klipp-vägen i `AnalysisView` är orörd** —
  där har användaren uttryckligen bett om en analys (worst-case-wins). `npm test` 164/164,
  build ren, lint 0 nya.
- **Bildrutebudget 20 → 32 + fasklustring (2026-08-11).** `ANALYSIS_FRAME_COUNT` höjd
  eftersom priset per bildruta flyttat sig: 20 sattes vid 1 229 tokens/bild, efter
  beskärningen mäter en bild 213–231. Vid ~220 blir 32 bilder ~7 000 input-tokens —
  **mindre än den dyraste sving vi mätt vid 20 bildrutor**, så budgeten är köpt ur
  beskärningen, inte lagd ovanpå. Samtidigt lade selektionen alltid klustret på impact,
  medan regler om **downswing-sekvensering** (startar höften före axlarna?) utspelar sig i
  övergången topp→downswing där nästan inga bildrutor hamnade — användaren fick
  `cannot_determine` på just den regeln i produktion. `selectEnvelopeFrames` tar nu
  `options.clusterPhases`: klusterbudgeten (fortsatt 0,4-andel) delas jämnt över de
  distinkta faser de aktiva reglerna tittar på, var och en centrerad på fasens mittpunkt i
  envelopen. **Utan `clusterPhases` är beteendet bit för bit som förut** (kluster på impact
  när impact är bekräftad) — klipp-vägen skickar inget och står därmed orörd.
  Klusterspacing 0,06 → **0,033** och `max(…, sampleDt)`-golvet borttaget: placeringen
  *härleds* ur pose (15 fps, dt 0,067) men bildrutan *hämtas* ur videon (30 fps), så golvet
  slängde halva källans tidsupplösning. Faslabel-toleransen behåller `sampleDt`-golvet — den
  frågan (*är den här rutan i toppen?*) begränsas av pose. Nytt per sving i loggen:
  `framesRequested`, `framesAfterDedupe`, `clusterPhases`, `clusterAllocation`, `allocation`.
  Ny `poseEnvelopeSelection.test.ts` (9 test); regressionsgoldens omräknade (26/25/26).
  `npm test` 187/187, build ren, lint 0 nya.

### Ström A — Voice-start
A-1 + A-2 klara (`useMicTrigger`, `EnergyTrigger` + `useEnergyTrigger`): adaptiv amplitud-trigger med
cooldown, kalibrering och TTS-ack. **Ej enhets-/fältverifierad** (mäts i A-5). Nästa: A-3 (röststart i
sessionsläge + `swingStartTimestamp`). Detaljer: [voice-start.md](voice-start.md).
> Notera: ADR-003 omdefinierar röst till **sessionskontroll** ("starta session"), inte per-slag-trigger.

### Ström S — Skaftdetektering (dataset)
S-1 klar (2026-08-12): dev-vyn **⚗︎ Dataset extractor** (`src/components/Dev/`, bakom
`VITE_DEV_PREVIEW`) kör produktionskedjan över valda videofiler och exporterar en ZIP med
frames + `manifest.json` för CVAT-annotering. Produktionskedjan är oförändrad — **två** steg är
dev-only: den lösare grinden (S-4) och cullen till 7 frames/sving mot specens fasvikter (S-5).

S-4 (2026-09-03): `datasetGate.ts` accepterar det produktionen förkastar när `envelope.valid`,
varaktigheten ligger i [0,6 s, 12,0 s] och topphastigheten klarar 0,4 × refSpeed — alltså
`clippedTail`, dålig synlighet, långa nedsving och cooldown. Exkursionsgolvet (0,08) är kvar:
bollplock är inga svingar. Envelopes > 3 s taggas `suspectMultiSwing` i stället för att delas.
`gate`/`clippedTail`/`hasConfidentImpact`/`suspectMultiSwing` per frame i manifestet.
**Kompromiss:** tre av produktionens trösklar är modulprivata och speglas i `datasetGate.ts`
(filen är låst för Ström S) — driften bevakas av bisektionstester mot riktiga `isSwing`.

S-5 (2026-09-03): faskvoten balanseras över hela exporten via `PhaseQuotaState` som trådas
in och ut ur `cullToPhaseTargets`; per sving går det inte, `finish` (6 % av 7) avrundas då
alltid till noll. Mätt över 10 svingar: max 0,9 pe från målen.

S-12 (2026-09-14): `batch-02` (250 frames) dragen med `--phase-weights` — en **committad** JSON-fil
med vikter + obligatorisk motivering, så en batchspecifik avvikelse hamnar i historiken i stället för
i ett kommandoradsminne; specens målvikttabell ändras aldrig för en enskild batch.
`training/prelabel_batch.py` förhandsmärkte 118 av dem. **Vygrinden (enhälligt `dtl` per sving) är
inte en försiktighetsåtgärd utan en mätning:** `face_on` ger 158,6° medianfel mot `dtl`:s 2,6°.

Spec + körinstruktion: [shaft/annotation-spec.md](shaft/annotation-spec.md) (→ *Förhandsmärkning med
modellen*); status: [BACKLOG.md](BACKLOG.md) Ström S.

## Öppna trådar

- **S-48 löst och Workern deployad (2026-10-23).** `api.ts` skalar `max_tokens` med antalet regler
  (`maxTokensFor`: quick `200+120·n`, detaljerat `400+250·n`, tak 4096), och klippning kastar
  `TruncatedResponseError`. Workern deployad från `main` (version `8304e1cc`, `MAX_TOKENS 4096`).
  **Taket är verifierat via config, inte via anrop:** `pinRequestBody` klampar mot `env.MAX_TOKENS`, och
  inget svar har hittills gått över 2000. Fältsignal: `analyzeSwing hit max_tokens` (ERROR). Underlag:
  [vision-max-tokens/README.md](vision-max-tokens/README.md).
- **Beskärningen är ej fältverifierad efter borttaget aspektlås (2026-08-11).** Första
  fältdatan fällde själva geometrin, inte grinden — se *Fungerar* ovan. Läs `cropReason` i
  sessionsloggen: allt annat än `ok` betyder att hela bilden skickades, och `gateDetail`
  säger vilken kroppsdel som fällde den (med siffror, även vid pass). `cropAreaPct`,
  `cropAspect` och `savedPct` visar vilka värden riktiga svingar landar på — en down-the-line-
  sving ska nu ge en hög smal låda nära golvet 0,30; kommer aspekten tillbaka nära källans
  0,5625 är det något som fortfarande fyrkantar lådan. Grindens trösklar (0,3 / 0,5 / 0,6)
  och `MIN_WIDTH_TO_HEIGHT` är valda på resonemang och ska tunas mot den datan.
- **Impact-grinden är ej fältverifierad (2026-08-11).** Den avvisar allt utan bekräftad
  impact i sessionsläge, valt på att *varje* falsk detektion i dagens loggar saknade impact —
  men inte på data om hur ofta riktiga svingar saknar den på rangen. Läs
  `Session swing skipped — no confident impact` och sammanfattningens `swingsSkippedNoImpact`:
  ligger antalet nära antalet verkliga slag är grinden för strikt → sätt `requireImpact: false`
  i settings-storen och granska `impactReason` i de skippade raderna.
- **Termik vid långa sessioner otestad.** Live-inferens + analysanrop delar GPU; ingen mätning finns
  av vad 10–20 minuters kontinuerlig session gör med telefonens temperatur och takt.
  `Live pose stats` (WARN, var 5:e sek) loggar `achievedFps`/`saturated` för just detta.
- **Pose körs två gånger per klipp** — en gång för selektionen (`poseTrajectory`) och en gång för
  skelett-overlayen i previewen. Dubbelkostnaden är känd och inte adresserad.
- **Supabase: RLS på `swing_records` är på men saknar policies** → alla läsningar nekas och faller
  tyst tillbaka till IndexedDB. **Ingen autentisering** — rader har `user_id = null`. (Ström B)
- **Namnkrock: branchen `stream-e`** användes för D-5-arbetet, men `stream-e` i BACKLOG är
  **Ström E — Vision-kostnad** (E-1 resolution-cap). Döp om branchen eller strömmen innan E-1 startar.
- **iOS Safari PWA ej verifierad** (installation/standalone/splash/safe-area). (Ström C)
- Takt-trösklarna i live-vägen är härledda ur **klipp-fixturer, inte live-kamerabrus** — `// OSÄKER:`-märkta.
- `analysisAngle` ligger fortfarande globalt, inte per sving.

## Bakgrund: varför pixel-diff inte räcker (fallback-vägen)
> Gäller nu **enbart** fallbacken. Full historik: [ADR-0001](adr/0001-motion-based-swing-detection.md).

En pixel-diff-metrik **kan inte se ballträffen**: vid impact rör sig bara en tunn, snabb klubba, så
impact ligger i en motion-*dal* medan follow-throughs kroppsrotation dominerar kurvan. "Motion-toppen
= impact" är därför fundamentalt fel. Fallbacken ankrar i stället på **address-stillheten** (längsta
stilla sekvensen; impact ≈ första rörliga bildrutan efter) och tar ett ±1,2 s-fönster runt den.
Tunables överst i `frameExtractor.ts`. Detta är precis begränsningen som motiverade Ström D.

**Verifiering:** `npm run dev` (aldrig en build — SW-cache serverar gammal kod).
`VITE_DEV_PREVIEW=true` ger bildrute-preview, segmenteringsvy, ⚗︎ Dataset extractor och
🐞 Logs-panelen (visar WARN).

## Komponentstruktur
> Endast de mest centrala filerna; full karta finns i koden.

- `src/App.tsx` — vy-routing via `session`-storens `view` (ingen router).
- `src/store/` — `session` (`swings: SessionSwing[]`, ADR-003 §5.4), `settings`, `rules`, `onboarding`, `toast`.
- `src/hooks/` — `useCamera` (`RecordMode`: klipp **och** session/chunk-ring), `useHistory`, `useRangeMode`,
  `useMicTrigger`/`useEnergyTrigger` (Ström A), `useLiveSwingDetection` (D-5 p2), `useSessionCapture` (D-5 p3).
- `src/lib/` — `frameExtractor`, `api`, `prompt`, `cameraAngle`, `cameraZoom`, `supabase`, `tts`, `i18n`, `logger`, `geo`,
  `audioTrigger`; pose: `poseDetector`/`poseTrajectory`/`poseConnections`/`poseEnvelope`/
  `poseEnvelopeSelection`/`poseSegments`/`poseFrameGrab`/`poseCropBox`; live: `poseRingBuffer`/`livePoseLoop`/
  `liveSwingDetector`; session: `videoChunkRing`/`analysisQueue`/`sessionStats`;
  `dataset/` (dev-only, skaftannotering: `extractDataset`/`datasetGate`/`phaseQuota`/`datasetPhase`/`zip`).
- `src/components/ui/` — delade primitiver (`Card`, `Button`, `Chip`/`VerdictDot`, `Segmented`,
  `Toggle`, `ScoreRing`, `Sparkline`/`VerdictBars`). Allt kortformat/pillerformat går via dessa.
- `src/components/` — `Camera/`, `Analysis/`, `Session/`, `Rules/`, `History/`, `Home/`, `Settings/`, `Onboarding/`,
  `Dev/` (dev-only: `DatasetExtractorView`, bakom `VITE_DEV_PREVIEW`).
  `Camera/RecordSettingsSheet.tsx` håller allt som styr *hur* en inspelning beter sig;
  `CameraView` håller bara lägesvalet och inspelningsknappen (UI-2).
- `worker/worker.ts` — Anthropic-proxy + `/api/log` (D1).

## Miljövariabler
| Variabel | Krävs | Syfte |
| --- | --- | --- |
| `VITE_API_URL` | ja | Worker-endpoint som proxar Anthropic. |
| `VITE_SUPABASE_URL` | nej | Cross-device-historik (med nyckeln nedan). |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | nej | Publishable key för Supabase. |
| `VITE_DEV_PREVIEW` | nej | Bildrute-preview, segmenteringsvy, ⚗︎ Dataset extractor + 🐞 Logs-panel. |
| `VITE_APP_VERSION` | nej | Sätts av bygget (`<paketversion>+<git sha>`); skrivs i skaftdatasetets `manifest.json`. |
| `ANTHROPIC_API_KEY` | ja (Worker) | Secret i Workern — når aldrig klienten. |
| `LOG_READ_KEY` | nej (Worker) | Skyddar `GET /api/log`. |
| `ALLOWED_ORIGINS` | **ja i prod** (Worker) | Kommaseparerad origin-allowlist. Osatt → endast localhost-origins ⇒ prod 403:ar. |
| `MODEL_ID` | nej (Worker) | Modellen proxyn pinnar till. Default `claude-sonnet-4-5`. |
| `MAX_TOKENS` | nej (Worker) | Tak för `max_tokens`. Default 2000. |
| `BODY_MAX_BYTES` | nej (Worker) | Body över detta → 413. Default 30 MB. |
| `DAILY_CALL_CAP` | nej (Worker) | Proxy-anrop per UTC-dygn före 429. Default 300. |

> Worker-vars sätts i `worker/wrangler.toml` (`[vars]`); secrets med
> `npx wrangler secret put <NAMN>`. Nya D1-tabellen `api_usage` kräver
> `npx wrangler d1 migrations apply swingcheck-logs --remote`.

## Säkerhetsmodell (Worker)
Worker-URL:en ligger i klartext i PWA-bundeln, så proxyn är **inte** en passthrough (W-1, stänger
[R2](reviews/ARCHITECTURE_REVIEW_2026-07.md)). Fyra lager i `worker/worker.ts`, billigast först:

1. **Origin-allowlist.** `Origin` matchas exakt mot `ALLOWED_ORIGINS` och eko:as tillbaka i
   `Access-Control-Allow-Origin` bara vid träff — annars 403 utan ACAO-header. `Vary: Origin` på
   allt; preflight följer samma regel; gäller även `/api/log`. Undantag: `GET /api/log` utan
   `Origin` (curl) släpps igenom, vaktad av `LOG_READ_KEY` i stället. **Fail-closed:** osatt
   `ALLOWED_ORIGINS` ⇒ bara localhost tillåts, prod 403:ar. Lägg in appens egen origin även när app
   och Worker delar domän — webbläsare skickar `Origin` på same-origin-POST också.
2. **Storleksgräns.** `Content-Length` och sedan faktiskt antal bytes mot `BODY_MAX_BYTES`, **före**
   `JSON.parse` → 413.
3. **Server-side-pinning.** Klientens `model` ignoreras (`MODEL_ID` används); `max_tokens` **klampas**
   till `MAX_TOKENS` (klienten får be om mindre — quick mode skickar 600 — aldrig mer).
   `system`/`messages`/`cache_control` skickas vidare **byte-för-byte**: prompt-cachningen nycklar på
   exakt prefix, så minsta omskrivning där gör varje analys till en cache-*write*. Regressionsvakt:
   `worker/worker.test.ts`.
4. **Dagligt tak.** `api_usage(day, calls)` i D1, upsert per proxy-anrop; över `DAILY_CALL_CAP` → 429
   utan upstream-anrop. **Saknad eller trasig DB → warn + släpp igenom** (avsiktligt fail-open —
   taket skyddar plånboken men får aldrig vara det som stoppar en svinganalys).

Ingen auth i proxyn — den är onödig för G1 (en användare, känd origin). För G2 (delade konton) blir
origin-kollen otillräcklig och behöver kompletteras med Supabase-session, se Ström B.

> **Pose-assets:** `public/wasm/` + `public/models/*.task` är gitignorade och byggs av
> `npm run pose:assets` (körs som `prebuild`). Saknas de i en deploy dör pose-init på båda delegaterna.
