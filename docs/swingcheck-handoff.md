# SwingCheck — Handoff / Överlämning

> Aktuell kontext för en ny session. Läs tillsammans med [BACKLOG.md](BACKLOG.md) (auktoritativ för gjort/kvar).
> Stabil arkitektur: [../KONTEXT.md](../KONTEXT.md). Senast uppdaterad: 2026-07-01.

## Tech stack
- **Frontend:** React 19 + TypeScript + Vite 8, Tailwind v4, Zustand (vissa stores `persist`:ade).
- **Backend:** En Cloudflare Worker (`worker/worker.ts`) — proxy mot Anthropic + `/api/log` → D1.
- **AI:** Claude Sonnet 4.5 (`claude-sonnet-4-5`) med prompt caching.
- **Lagring:** IndexedDB (`idb-keyval`) som källa till sanning; Supabase valfri metadataspegling.
- **PWA:** `vite-plugin-pwa`, `registerType: 'prompt'`.

## Fungerar
> Funktionerna finns i kod och är mergade (PR #9–#15). Fält-/enhetsverifiering spåras i [BACKLOG.md](BACKLOG.md).

- Kamera/inspelning, **pose/envelope-baserad** bildruteval (`frameExtractor.ts`, D-3-cutover); pixel-diff-rörelse är fallback.
- Claude-analys via Worker-proxy med prompt caching (`api.ts`, `prompt.ts`).
- Regler: egna + regelbibliotek med drills, kameravinkel-filtrering.
- Historik i IndexedDB + valfri Supabase-spegling av metadata.
- TTS-uppläsning (quick/detailed), val av röst.
- Handsfri sessionsläge (autospela in nästa sving).
- i18n (browser-/geo-detektering), tema + accentfärg, PWA-uppdateringsbanner.

## Pågående

### Roadmap (2026-07-07)
- [ROADMAP.md](ROADMAP.md) sekvenserar G1 (personligt rangebruk) → G2 (instruktörssamarbete) med explicita beslutsforkar: pose time-boxad till 2026-07-31 (annars trim-slider), G1-scopefrys vid fältverifierad fångst (senast 2026-08-15), E-1 resolution-cap villkorslöst, WASM-självhost in i D-2. Prioritetsordning: A-3 → A-5/C-2 → E-1 → D-2/D-3 → B → G2. Pose omklassad till primärt G2-tillgång; G1-fångsten ankras på rösttriggern.

### Pågående: Pose-estimering (Ström D)
- **Status:** D-1 pass 1 + D-2 pass 2 (del b) klara. `@mediapipe/tasks-vision` integrerat **vid sidan om** `frameExtractor.ts` (rör den ej). `lib/poseDetector.ts` (singleton, GPU→CPU-fallback, WASM från jsDelivr-CDN), `lib/poseTrajectory.ts` (seekar dold video ~15 fps, 33 punkter/sampel), `lib/poseConnections.ts`. `FramePreview.tsx` ritar skelett-overlay bakom `VITE_DEV_PREVIEW` (dynamisk import → lazy chunk). Modell hämtas via `npm run pose:model` (gitignorad). Laddnings-/inferenstid loggas.
- **Pass 2 (fas-viktad selektion):** *Rättelse — pose drev aldrig selektionen; `frameExtractor.ts` (pixel-diff) väljer de 10 frames som skickas till Claude, pose var overlay-only.* Pass 2 bygger första pose-drivna selektionen som **alternativ**: `lib/posePhases.ts` (`detectSwingPhases` — svingfaser ur handled 15/16), `lib/poseFrameSelection.ts` (`selectPhaseWeightedFrames` — fas-viktad allokering, impact-kluster, graceful even-fallback), `lib/poseFrameGrab.ts`. A/B-toggle Even↔Phase-weighted i dev-preview (default even); summary + `PoseSelect` WARN-logg med fas-gränser/allokering/timestamps. Når **ej** default-vägen (pass 3, gated på Eriks verifiering). Bygger + lintar rent; **ej fältverifierad**.
- **Pass 2-buggfix (2026-07-08):** verkligt 30fps-klipp visade `top`/`impact`/`ft` kollapsade till klippslutet (top 3.00 · impact 3.07 · ft 3.07) → fallbacken missade impact. Leadhypotes: apex (min y) låste på follow-through-**finishen**, inte baksvingstoppen. Åtgärdat med `vy>0`-gate + min-downswing-tid + uniform fallback.
- **Pass 3 — ARKITEKTUR-INVERTERING (2026-07-14, [ADR-002](decisions/ADR-002-stream-d-envelope-inversion.md)):** tre rundor heuristik-patchning visade att fas-viktad-som-primär är skör; root cause = global min-y låser på finishen, inte toppen — och finishen är den *mest* tillförlitliga landmarken. **Fas-viktad-som-primär ersatt av envelope-som-primär.** `posePhases.ts`→`poseEnvelope.ts` (`detectSwingEnvelope`: start=baksving-onset, finish=globalt min-y+settle med avklippt-skydd, confident-only impact via nedåtpass nära address-höjd). `poseFrameSelection.ts`→`poseEnvelopeSelection.ts` (`selectEnvelopeFrames`: uniform-inom-envelopen baslinje + impact-kluster endast när confident; `impactClusterApplied`). A/B-toggle nu **even ↔ envelope** (default even). Konsekvens: värsta fall = "uniform över svingen", inte "missad impact". Bakom `VITE_DEV_PREVIEW`, `frameExtractor.ts` orörd. Logik-sanity-testad (syntetiska banor); bygger + lintar rent; **ej fältverifierad**.
- **D-2 (a) WASM-självhost klar (2026-08-02):** WASM-runtimen självhostas nu (`public/wasm/` via `npm run pose:wasm`/`scripts/copy-pose-wasm.mjs`, gitignorad); `FilesetResolver.forVisionTasks('/wasm')` → egen origin, **inga jsDelivr-requests**. `vite.config.ts`→`workbox` precachar modell + SIMD-wasm (`maximumFileSizeToCacheInBytes` 12 MB), runtime-cachar nosimd. `npm run pose:assets` (model+wasm) körs före build. Byggverifierat (precache 17.7 MB/19 entries); **ej browser-/offline-fältverifierad**.
- **Pass 3 finish-kollaps-fix (2026-08-02, ADR-002 *Uppföljning*):** verkligt DTL-klipp kollapsade envelopen till `[6.98→7.38]` (bara baksvingen, "no descending pass"). Root cause: globalt min-y har TVÅ jämförbara maxima (baksvingstopp + finish) → finishen snappade bakåt till toppen och tömde det bundna impact-fönstret. Fix (strukturell): finish binds till svingsekvensen — downswing-passagen hittas FÖRST över hela spannet, finish = high-settle EFTER den. Endast `poseEnvelope.ts`; `FINISH_MIN_HOLD_FRAMES` in, `APEX_PLATEAU_TOL`/`SETTLE_MIN_FRAMES` ut. Build+lint rena; **ej fältverifierad**.
- **Pass 3 start-fix (2026-08-02, ADR-002 *Uppföljning*):** spegelbild-bugg i andra änden — samma DTL-klipp startade envelopen mitt i baksvingen och missade take-away (klubban redan lyft). Root cause: `start` = backsving-hastighetströskel; take-away är långsam → under tröskel → start hoppade in efter take-away. Fix (strukturell): start = address-AVFÄRDEN — första framen vars wrist-Y lämnar platå-medel-Y > `ADDRESS_DEPART_TOL` (0.03). Endast `poseEnvelope.ts`; downswing/finish orört. Build+lint rena; **ej fältverifierad**. Durabel princip generaliserad: bind BÅDE start och finish till svingsekvensen, aldrig till hastighetströsklar (långsamma faser — take-away, transition — ligger under tröskel och kapas).
- **Pass 3 start-fix waggle (2026-08-02, ADR-002 *Uppföljning*):** efter start-fixen fyrade starten för TIDIGT — ~3 waggle-frames före take-away på samma DTL-klipp `[1.60→8.38]`. Root cause: `ADDRESS_DEPART_TOL` är en enkel tröskel-passage → pre-sving-jitter triggade start. Fix (samma min-hold-anda som finish-fixen): start = första framen i en körning av `START_MIN_SUSTAIN_FRAMES` (3) frames där wrist-Y ligger över platån i take-away-riktning (uppåt) > `ADDRESS_DEPART_TOL`; en blip som återgår nollställer körningen. Endast `poseEnvelope.ts`; downswing/impact/finish orört. Build ren, poseEnvelope.ts lint-ren; **ej fältverifierad**. Skärper durabel princip: bind aldrig en gräns till en enkel tröskel-passage — kräv ett ihållande, riktat skeende (min-hold i båda ändar).
- **Pass 3 start-fix inverterad → sedan REVERT:AT (2026-08-02, ADR-002 *Uppföljning*):** waggle-fixen ovan överkorrigerade (start nära baksvingstoppen; take-away ej monoton vid 15 fps). Ersattes först av `WAGGLE_LOOKAHEAD_FRAMES` (tolerant lookahead) — men det gjorde starten katastrofalt sen IGEN (`[7.18→8.38]`, första framen mitt i baksvingen). Root cause: i DTL rör sig take-away nästan rakt BAKÅT → y kryper knappt över tröskeln, så varje y-baserat waggle-test (sustain ELLER lookahead) läser take-away som waggle-retur och kapar den. **Y-only är fel signal för take-away-start i DTL.** Slutlig fix: **inget waggle-filter** — start = första address-avfärden, ofiltrerad → `[1.60→8.38]` (hela svingen, ~3 tidiga adress-frames = accepterad early-bias, princip #3). Känd svaghet: waggle kan ge några extra adress-frames tills en bättre signal (riktning i planet) finns. `poseEnvelope.ts` enbart. Build+lint rena; **ej fältverifierad**.
- **Pass 3 dev-preview frame-budget → 20 (2026-08-02):** envelope-selektionens frame-antal höjt 10→20 via EN exporterad konstant `ENVELOPE_FRAME_BUDGET` (poseEnvelopeSelection.ts), konsumerad av `FramePreview` — sizer både selektion + grid-rendering (previewen visar alla 20). Allokeringen skalar parametriskt; impact-klustret får fortsatt `IMPACT_CLUSTER_BUDGET_FRAC` (0.4 → 8/20). Dev-preview only; `frameExtractor.ts`/Vision-anropet orört. Build+lint rena.
- **Pass 3 start-fix SLUTLIG — hastighet, inte Y (2026-08-02, ADR-002 *Uppföljning: wrist-Y ... oanvändbar för start* + princip #2b):** TEMP-diagnostik (bakom `VITE_DEV_PREVIEW`, `[START-DIAG]`-loggar) på DTL-klippet (144 frames) avgjorde efter fyra gissningar. Data: 6,9 s adress där wrist-Y **driftar** `0.380→0.425` (0.045 > TOL 0.03) → bidir fyrar på driften (`t=1.60`), riktat kräver stigande händer (`t=7.18`). Wrist-SPEED separerar rent. Fix: `ADDRESS_DEPART_TOL`-logiken ut ur start; start = hastighetsbaserad onset (`speedSm ≥ speedThresh`) **backad bakåt** medan föregående `speedSm > START_QUIET_FLOOR` (ny tunbar 0.04) → frame 102–103 (`t≈6.78–6.85`). Vänder "aldrig hastighet för start" (rätt observation, fel slutsats): position mot platå-medel misslyckas fundamentalt (drift), hastighet är rätt signal — läs onset + backa. Bonus: impact = framen där y **korsar tillbaka genom addressY** (ej `passIdx`/max-vy). `ADDRESS_DEPART_TOL` + diagnostiken kvar tills Erik verifierat. `poseEnvelope.ts` enbart; downswing/finish orört. Build+lint rena; **ej fältverifierad**.
- **Pass 3 falsk impact på avklippt klipp (2026-08-05, ADR-002 *Uppföljning: falsk impact på avklippt klipp*):** avklippt DTL-klipp (slutar före träff) gav `[3.53→4.27] · clipped tail · impact 4.27` — impact pinnad till sista framen. Root cause: impact-crossing-fixen hade kvar fallback `impactIdx = passIdx`. Fix (3 lager → `impact=null` → uniform baslinje): (1) ingen fallback (`impactIdx` startar `-1`, sätts bara av faktisk korsning inom envelopen); (2) `clippedTail=true` ⇒ aldrig verifierad impact; (3) slut-marginal `IMPACT_END_MARGIN_FRAMES` (2). Verifierat syntetiskt (esbuild+node): full → confident impact, avklippt → `clippedTail`, `impact=null`. `poseEnvelope.ts` enbart; `frameExtractor.ts`/`poseEnvelopeSelection.ts` orörda. Build+lint rena; **ej fältverifierad**.
- **Pass 3 impact nearest-approach — face-on-fix (2026-08-05, ADR-002 *Uppföljning: impact missar på face-on*):** face-on-klipp gav `[3.35→4.83] · uniform baseline · no impact` — envelopen rätt, bara impact-polishen uteblev. Root cause: exakt korsning genom `addressY` för strikt (face-on återvänder ej exakt till address-höjd vid träff, annan kameravinkel). Fix: exakt korsning → **nearest-approach inom `IMPACT_ADDRESS_TOL`** (ny tunbar 0.05, snävare än `IMPACT_HEIGHT_TOL` 0.12). Alla skydd oförändrade (`clippedTail` överrider toleransen/slut-marginal/inget pass → `impact=null`). Verifierat syntetiskt: full → impact, face-on → nu impact, avklippt (även inom tolerans) → no impact. `poseEnvelope.ts` enbart; `frameExtractor.ts`/`poseEnvelopeSelection.ts` orörda. Build+lint rena; **ej fältverifierad**.
- **Pass 3 STÄDNING + inlåsning (2026-08-05) — checkpoint 2 godkänd (DTL, DTL avklippt, face-on):** TEMP-diagnostiken (`[START-DIAG]` + per-frame-trace) och `ADDRESS_DEPART_TOL` + död kod borttagna. **Enhetstest** `poseEnvelope.test.ts` (vitest, `npm test`) mot syntetiska banor: full sving (start@onset, finish efter downswing, impact), avklippt (`clippedTail`/no impact), drift-adress (start fyrar EJ på driften), face-on (impact via nearest-approach), statisk/endast-baksving (degradering utan krasch), för-få-samples. Testet fångade latent bugg: statiskt klipp gav `valid=true` (flyttalsbrus `peakSpeed~1e-16` > `0`) → ny konstant `MIN_PEAK_SPEED` (1e-6). Alla tunbara konstanter samlade + kommenterade överst. `package.json`: `test`-script + vitest devDep. `frameExtractor.ts`/`poseEnvelopeSelection.ts` orörda. Build+lint+test rena. Envelope-logiken nu **fältverifierad + enhetstestad**.
- **Regressionsharness — envelope (2026-08-06):** ersätter manuella 3-klippsrundan. Export-knapp i dev-previewen (`FramePreview.tsx`, bakom `VITE_DEV_PREVIEW`) dumpar råa landmark-serien som JSON → `src/lib/__fixtures__/` (en JSON/klipp: `dtl-full`/`dtl-clipped`/`face-on`). `poseEnvelopeRegression.test.ts` (vitest) kör `detectSwingEnvelope`+`selectEnvelopeFrames` som produktionens `selectViaPose` (budget = `ANALYSIS_FRAME_COUNT`) mot checkpoint-2-golden (envelope/impact/`impactClusterApplied`/`clippedTail`) med ±1-frame-tolerans + exakt frame-antal (budget-regressionsvakt). Saknad fixture = `todo` → grön tills fångad; **Erik exporterar de tre fixturerna en gång** för att aktivera asserterna. Dok i `docs/pose-detection.md` → *Regressionsharness*. Build+lint (ändrade filer)+test rena. **Fixturer nu incheckade (2026-08-06)** + golden `frameCount` korrigerad: verifierat att harnessen kör exakt produktionskedjan (`dtl-full` ger `[6.78→8.38]`/impact 7.85 exakt — ingen saknad förbehandling); `dtl-full`+`face-on` ger deterministiskt **16** frames (impact-kluster överlappar baslinjen på kort envelope, dedupe slår ihop → precis vad produktionen skickar), golden satt till 16; `dtl-clipped` behåller 20. Alla tre gröna.
- **D-3 CUTOVER KLAR (2026-08-05):** envelope-vägen är nu produktionens **primära** frame-selektor i `frameExtractor.ts` (`selectViaPose` → `detectSwingEnvelope` + `selectEnvelopeFrames`, `count`=10). Pixel-diff (`selectViaMotion`, orörd) är **fallback** — endast vid pose-otillgänglighet (dynamisk import/inferens-fel) eller `envelope.valid===false`. Fallback tyst för användaren men loggad: `log.warn('Frame selection', {path:'pose'|'motion', …})` (WARN surfar även i prod) → fält-fallback-frekvens mätbar. A/B-toggeln + "even"-vägen borttagna ur `FramePreview.tsx`; selektionen är nu **flagg-oberoende by construction** (dev-preview = produktion). Vision-anropet + `SwingRecord` orörda; @mediapipe i egen lazy chunk. Build+lint+test (7/7) rena. **Avvikelse:** cutover på checkpoint 2 (3 klipp) + enhetstest, ej den formella 20-klipp/±150 ms-metriken — ersatt av `path`-fält-instrumentering. Se [ADR-002](decisions/ADR-002-stream-d-envelope-inversion.md) → *Cutover (D-3)* + [BACKLOG.md](BACKLOG.md) D-3.

- **Inventering: kontinuerligt sessionsläge (2026-08-06):** utredning (ingen kodändring) av vad som krävs för produktvisionen *kameran rullar, appen hittar varje sving själv, feedback direkt efteråt*. Resultat i [ADR-003 (utkast)](decisions/ADR-003-draft.md). Kärnfynd, uppmätt med probe mot `dtl-full.json` konkatenerad ×1/×2/×3: `detectSwingEnvelope` misslyckas **tyst** på flera svingar — 2 svingar → bara sving 1 returneras (`valid:true`), 3 svingar → envelopen spänner över alla tre med `downswingSec = 20.36 s` rapporterad som *"confident"*. Root cause: globala mått (`peakSpeed = max` normaliserar alla trösklar) + singleton-tillstånd (en address-platå — `break` på första — ett `startIdx`/`passIdx`/`finishIdx`/`addressY`) + **ensidiga gränser** (`MIN_DOWNSWING_SEC` utan `MAX`). Föreslagen väg: *wrappa, skriv inte om* — segmentering på stillhet/hastighet före envelopen, `detectSwingEnvelope` oförändrad per segment, ny `isSwing()`-grind som förkastar bollplock (fel tecken vertikalt)/waggle (för kort)/gester. Ny durabel princip: **varje gräns med ett minimum måste också ha ett maximum** — ett ensidigt intervall degraderar inte, det kollapsar tyst.
- **`MAX_SAMPLES` → `MAX_ANALYSIS_SEC` (2026-08-06, `poseTrajectory.ts`):** förutsättning för ADR-003-arbetet, byggd i förväg eftersom den blockerade insamlingen av testdata. Taket flyttat från *antal sampel* (240) till *analyserad varaktighet* (300 s), så samplingstakten ligger fast på 15 fps oavsett klipplängd; tidigare fick ett 3-minutersklipp 1,3 Hz → en golfsving blev 1–2 sampel → oanvändbart för segmentering (gamla taket bet redan vid 16 s). Bortom taket **trunkeras** klippet + `log.warn('Clip truncated for pose analysis', {droppedSec, …})` — inte uttunning, eftersom tyst nedsampling är just det felläget som ska bort. Uppmätt för 4 min (3 600 sampel): **~15 MB heap** (4,3 kB/sampel), **~6,8 MB** exporterad fixture-JSON; bearbetningstid ~2–5 min på CPU-delegat är den bindande kostnaden. **Bit-identiskt beteende för klipp < 16 s** (alla verifierade klipp). Build + lint + test (10/10) rena. **Ny risk noterad i ADR-003 §Risker 7:** långa *uppladdningar* i produktion blir nu långsamma — mitigering är duration-gate i `selectViaPose`, inte ett lägre tak.
- **D-4 segmentering byggd, kedjan blockerad (2026-08-06, ADR-003 steg A + C):** ny ren modul `src/lib/poseSegments.ts` — `segmentSwingCandidates` (p95-refSpeed, QUIET/MOVING, stillnadsöar ≥ 0,3 s, burst + padding, grovgallring), `isSwing` (grind med **`MAX_DOWNSWING_SEC = 0.6`** — gränsen som stänger 20,36 s-buggen — plus envelope-varaktighet 0,7–3,0 s, vertikal exkursion 0,08, peak ≥ 0,4 × refSpeed, cooldown 2 s) och `detectSessionSwings`. `detectSwingEnvelope`, `frameExtractor.ts`, `poseEnvelopeSelection.ts` **orörda**. Ny fixture `__fixtures__/session-multi.json` (63,45 s, 953 sampel, 15 fps, 3 svingar) + harness `poseSegments.test.ts` (8 test). Build + lint (mina filer) + test 18/18 rena; `poseEnvelopeRegression.test.ts` oförändrad och grön. **Steg A fungerar** — de tre svingarna isoleras rent (peak 1,27 / 2,23 / 1,89 mot 0,30–0,95 för bollplock/waggle/uttåg). **Kedjan hittar ändå 0 svingar:** `detectSwingEnvelope` får ingen confident impact i något segment. Huvudorsak **handledsbyte-artefakt** — `primary ?? backup` byter handled per frame, och när höger handleds `visibility` oscillerar runt 0,4 i följdrörelsen (mätt 0,28→0,55) snärter serien mellan höger (x ≈ 0,43) och vänster (x ≈ 0,01) → ~0,35 hopp på en frame → skenbar hastighet **2,23**, klippets högsta, som envelopens `passIdx` tar för impact. Det händer efter varenda sving; enkelklippen träffas aldrig. Bikostnader: `IMPACT_ADDRESS_TOL = 0,05` för snäv vid 15 fps (närmaste approach 0,067/0,058/0,040) och `FINISH_MIN_HOLD_FRAMES = 3` som sving 1 aldrig når. **Verifierat recept (probe): en handled för hela klippet + `IMPACT_ADDRESS_TOL` → 0,08 + `FINISH_MIN_HOLD_FRAMES` → 2 ger 3/3 på session-multi och 1/1/0 på dtl-full/face-on/dtl-clipped** — men flyttar `dtl-full`-goldens `finishSec` 8,38 → 9,38, en verklig regressionskostnad som ska tas som eget beslut. Därför bär `poseSegments.test.ts` golden **0** med KNOWN GAP-markering. Detaljer: [ADR-003](decisions/ADR-003-draft.md) → *Mätt blockering*, BACKLOG D-4.
- **Deploy-buggfix — pose kör aldrig på Vercel (2026-08-06):** fysisk iPhone (Vercel preview) loggade `GPU delegate failed → CPU`, sen `Pose selection failed → motion` med `error:"[object Event]"` — fallbacken funkade men pose kördes aldrig. Root cause: `public/wasm/` + `public/models/*.task` är gitignorade och skapas bara av `npm run pose:assets`; ingen fanns i deployen (ingen `vercel.json`, Vite-presetens `vite build` kör ej npm-lifecycle) → 404 → init dör på båda delegaterna. `"[object Event]"` = fetch/load-fel, inte GPU-fel. Fix: (1) `prebuild`-script → `npm run pose:assets` (npm kör det före `build`); (2) `vercel.json` med explicit `buildCommand:"npm run build"` så prebuild garanterat fyrar oavsett Vercel-preset; (3) `serializeError()` i `logger.ts` — Event → `{type, targetUrl, status, targetType}` istället för `"[object Event]"`, inkopplad i `poseDetector.ts` + `frameExtractor.ts`; (4) `preflightAssets()` i `poseDetector.ts` — HEAD mot wasm-loader + modell före MediaPipe-init, loggar URL+status vid 404 och kastar tydligt fel. Build+lint (0 nya)+test (10/10) rena. **Ej verifierad på faktisk Vercel-deploy** — nästa iPhone-preview bör visa `path:'pose'` eller ett diagnostiserbart asset-fel.

### Pågående: Voice-start
- **Ström A, status:** A-1 + A-2 klara. A-1 `useMicTrigger` gör mic-capture + normaliserad RMS-energiström (0–1). A-2 lägger `EnergyTrigger` (`src/lib/audioTrigger.ts`, ren/testbar) + `useEnergyTrigger` (`src/hooks/useEnergyTrigger.ts`) ovanpå: adaptiv baslinje-trigger på amplitud-spik, cooldown, kalibrering, TTS-ack "Startar inspelning" + puls, läs/skrivbar config (`thresholdFactor`/`cooldownMs`/`absoluteFloor`). Bygger + lintar rent; **ej enhets-/fältverifierad** (iOS-tap + range-brus mäts i A-5, kräver Eriks telefon via `npm run dev`). Nästa: A-3 (integrera röststart i session-läge + `swingStartTimestamp`). Detaljer i [voice-start.md](voice-start.md).

## Kritiskt olöst

### Swing detection
> Tidigare egen handoff (`swing-detection-handoff.md`), nu inlemmad här. Senast uppdaterad: 2026-06-01.
>
> **UPPDATERING (2026-08-05, D-3-cutover):** eskaleringsvägen (pose) är genomförd. `frameExtractor.ts`
> väljer nu frames via pose-envelopen (Ström D); pixel-diff-approachen nedan lever kvar men **enbart som
> fallback** (pose otillgänglig eller envelope invalid). Address-ankringen beskriven nedan gäller alltså
> fortfarande — men bara för fallback-vägen. Kvar att bekräfta i fält: hur ofta fallbacken triggar
> (`path`-loggen mäter det).

**Mål:** `src/lib/frameExtractor.ts` ska välja 10 bildrutor som faktiskt täcker svingen
(address → backswing → top → downswing → impact → follow-through). För klipp längre än
~6 s valde den gamla logiken fel. Vald väg: **rörelsebaserad omarbetning utan nya beroenden**
(framför pose-estimering), för scenariot *en riktig sving + lång setup*. Se även [ADR-0001](adr/0001-motion-based-swing-detection.md).

**Kärninsikten (viktigast):** en pixel-diff-rörelsemetrik **kan inte se ballträffen**. Vid
impact rör sig bara en tunn, snabb klubba → få pixlar ändras → impact ligger i en motion-**dal**.
Den stora kroppsrotationen i **follow-through** dominerar metriken. Därför är "hitta motion-toppen =
impact" fundamentalt fel — den landar på follow-through. Det metriken *ser* pålitligt: **address** =
den långa stillheten före svingen; **follow-through** = den stora rörelsen efter impact; **impact** =
övergången mellan dem. → Vi ankrar på **address-stillheten**, inte motion-toppen.

**Nuvarande approach (implementerad i `frameExtractor.ts`):**
1. Nedskalad motion-canvas (~360 px) — vid full 1080p gör sensor-/codec-brus att ~12 % av pixlarna
   "ändras" varje bildruta även när allt är stilla; nedskalning medelvärdar bort det.
2. Motion-metrik = andel centrumviktade pixlar vars luma ändrats över tröskel, efter subtraktion av
   global ljusförskjutning (robust mot autoexponering/vitbalans).
3. Grov skanning av hela klippet (12 fps, capped) → utjämnad motion-kurva.
4. Address = längsta sammanhängande "stilla"-sekvens; `impact ≈ första rörliga bildrutan efter`.
   Fallback till global motion-topp om ingen tydlig stillhet finns.
5. Fönster = `[impact − 1.2 s, impact + 1.2 s]`, trimmat om rörelsen lägger sig igen.
6. 10 bildrutor jämnt spridda; närmast uppskattad impact tvingas till `impact`-etiketten.

Tunables överst i filen: `SWING_PRE_SEC`, `SWING_POST_SEC`, `MIN_STILL_SEC`, `SETTLE_SKIP_SEC`,
`MOTION_PIXEL_THRESHOLD`, `MOTION_MAX_DIM`.

**Status:** Address-ankrad detektering bygger + lintar rent, men är **inte verifierad** på testklipp
av användaren. Förväntat resultat på testklippet (9.58 s, impact ≈ 6–7 s): frames ~5.8–8.2 s.
Om den ändå missar svingen → **eskalera till pose-estimering** (MediaPipe Tasks Vision / MoveNet
in-browser) för att spåra klubba/händer och hitta impact direkt. **Denna eskalering utforskas nu i
Ström D** (byggs vid sidan om `frameExtractor.ts`); se [pose-detection.md](pose-detection.md).

**Verifiering:** `npm run dev` (ej build — SW-cache). `VITE_DEV_PREVIEW=true` visar bildrute-preview +
🐞 Logs. Ladda upp klipp, filtrera modul `FrameExtractor`, läs WARN `"Swing detection summary"`
(`impactSec`, `frameTimesSec`, `curveDigest`, `usedFallback`).

**Återstående städning:** WARN-loggarna `"Swing detection summary"` + `curveDigest` + `topPeaks` är
tuning-debug — nedgradera till `debug` eller ta bort före merge. Ändringarna lever okommittade i
working tree på `main`; gren av innan commit.

_(Övriga kritiska/olösta punkter fylls i allteftersom de uppstår.)_

## Känd teknisk skuld
> Sammanställd från [BACKLOG.md](BACKLOG.md); fylls på vid behov.

- **RLS på `swing_records` är på men saknar policies** → alla läsningar nekas, faller tyst tillbaka till IndexedDB. (Ström B)
- **Ingen autentisering** — Supabase-rader har `user_id = null`. (Ström B)
- ~~App-ikon är emoji (🏌️) med renderingsrisk per plattform.~~ **Löst (C-1):** emoji renderas till statiska PNG:er vid bygge (ingen runtime-varians); dedikerad full-bleed maskable-ikon tillagd. (Ström C)
- **iOS Safari PWA ej verifierad** (installation/standalone/splash/safe-area). (Ström C)
- **Okommitterad swingdetektering** i working tree + kvarvarande tuning-WARN-loggar (se ovan).

## Komponentstruktur
> Endast de mest centrala filerna; full karta finns i koden.

- `src/App.tsx` — vy-routing via `session`-storens `view` (ingen router).
- `src/store/` — `session`, `settings`, `rules`, `onboarding`, `toast` (Zustand).
- `src/hooks/` — `useCamera`, `useHistory`, `useRangeMode`, `useMicTrigger` (Ström A, mic-capture + RMS-energiström), `useEnergyTrigger` (Ström A, energi-trigger ovanpå A-1).
- `src/lib/` — `frameExtractor`, `api`, `prompt`, `cameraAngle`, `supabase`, `tts`, `i18n`, `logger`, `geo`, `audioTrigger` (Ström A, `EnergyTrigger`), `poseDetector`/`poseTrajectory`/`poseConnections`/`poseEnvelope`/`poseEnvelopeSelection`/`poseFrameGrab` (Ström D, pose-estimering).
- `src/components/` — `Camera/`, `Analysis/`, `Rules/`, `History/`, `Home/`, `Settings/`, `Onboarding/`.
- `src/data/ruleLibrary.ts` — fördefinierade regler + drills.
- `worker/worker.ts` — Anthropic-proxy + `/api/log` (D1).

_(Nya filer från Ström A/B/C läggs till av respektive session — t.ex. `hooks/useMicTrigger.ts`, `store/auth.ts`.)_

## Miljövariabler
| Variabel | Krävs | Syfte |
| --- | --- | --- |
| `VITE_API_URL` | ja | Worker-endpoint som proxar Anthropic. |
| `VITE_SUPABASE_URL` | nej | Cross-device-historik (med nyckeln nedan). |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | nej | Publishable key för Supabase. |
| `VITE_DEV_PREVIEW` | nej | Bildrute-preview + 🐞 Logs-panel. |
| `ANTHROPIC_API_KEY` | ja (Worker) | Secret i Workern — når aldrig klienten. |
| `LOG_READ_KEY` | nej (Worker) | Skyddar `GET /api/log`. |
