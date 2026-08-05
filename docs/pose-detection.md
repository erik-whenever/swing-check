# Pose-detektering (Ström D)

> Utforskar **pose-estimering** som väg till pålitlig svingfas-detektering — eskaleringsvägen
> som pekas ut i [swingcheck-handoff.md](swingcheck-handoff.md) → *Kritiskt olöst* och
> [ADR-0001](adr/0001-motion-based-swing-detection.md). Auktoritativ status: [BACKLOG.md](BACKLOG.md).

## Varför pose
Pixel-diff-metriken i `frameExtractor.ts` **kan inte se ballträffen** (tunn snabb klubba → få
pixlar → impact ligger i en motion-dal). Pose-estimering spårar kroppens 33 leder direkt, vilket
öppnar för att härleda svingfaser från handled-/axelbanor i stället för global pixelrörelse.
**Ström D rör inte `frameExtractor.ts`** — den byggs vid sidan om tills den bevisat sig.

## Bibliotek
[`@mediapipe/tasks-vision`](https://www.npmjs.com/package/@mediapipe/tasks-vision) (v0.10.35),
`PoseLandmarker`, lite-modellen. In-browser, ingen serverkostnad, ingen API-nyckel.

## Modell- & WASM-assets *(självhostade — offline-först, D-2 (a))*
- **Modell:** `public/models/pose_landmarker_lite.task` (~5.5 MB, float16 lite).
  Hämtas med `npm run pose:model` (`scripts/download-pose-model.mjs`, idempotent, `--force`).
- **WASM-runtime:** `public/wasm/` — kopieras från `node_modules/@mediapipe/tasks-vision/wasm`
  med `npm run pose:wasm` (`scripts/copy-pose-wasm.mjs`). `FilesetResolver.forVisionTasks('/wasm')`
  pekar på egen origin — **inga jsDelivr-requests**. Kopierar SIMD-bygget (används på alla
  moderna/mål-browsers) + nosimd-fallbacken; ES-modulvarianten (`*_module_*`) skippas (ej i
  FilesetResolvers default-väg).
- **Båda committas ej** — gitignorade (`public/models/*.task`, `public/wasm/`); source of truth är
  Googles modell-bucket resp. den installerade paketversionen (WASM + JS-bindings kan aldrig driva isär).
- **Kör `npm run pose:assets`** (= model + wasm) en gång innan `npm run build`/`dev`, annars saknas
  assets och SW-precachen blir tom.
- **SW-precache** (`vite.config.ts` → `workbox`): modell + SIMD-`.js`/`.wasm` precachas
  (`maximumFileSizeToCacheInBytes` höjd till 12 MB för den ~11 MB stora binären). nosimd-`.wasm`
  (~10 MB) hålls **ur** precachen och runtime-cachas (`CacheFirst`, cache `pose-wasm`) same-origin
  vid behov → även no-SIMD-browsers stannar offline efter första laddning utan att blåsa upp installen.

## Arkitektur (pass 1)
- **`src/lib/poseDetector.ts`** — singleton. `getPoseLandmarker()` bygger `PoseLandmarker` en gång
  (`runningMode:'VIDEO'`, `numPoses:1`), försöker `delegate:'GPU'` med try/catch-fallback till `'CPU'`.
  Misslyckad build cachas ej (kan retrya). Loggar laddningstid + vald delegate.
- **`src/lib/poseTrajectory.ts`** — `extractPoseTrajectory(blob)` seekar en dold `<video>` frame för
  frame (~15 fps, samma seekTo-mönster som `frameExtractor.ts`), kör `detectForVideo` med strikt
  ökande timestamps, returnerar `PoseSample[] = [{ t, landmarks }]` (alla 33 punkter; `[]` om ingen
  pose). Loggar snitt-inferenstid/frame.
- **`src/lib/poseConnections.ts`** — MediaPipes standard-topologi (33 leder) som `[start,end]`-par,
  lokalt definierad så overlayn slipper statiskt dra in hela tasks-vision-modulen i huvudbundlen.
- **`src/components/Analysis/SkeletonOverlay.tsx`** — delad overlay-komponent (SVG, `0–100` viewBox).
  `fit='cover'` → `xMidYMid slice` (grid), `fit='contain'` → `none` (lightbox). Bågar ritas som mörk
  kontur + ljus topp så de syns mot valfri bakgrund. `lib/poseSampling.ts` → `nearestSample(t)`.
- **`src/components/Analysis/FramePreview.tsx`** — bakom `VITE_DEV_PREVIEW`: kör trajektorian på
  `currentVideoBlob` (dynamisk `import()` → egen lazy chunk), ritar skelett-overlay på varje
  grid-frame via närmaste pose-sampel i tid. Statusrad visar hur många frames som fick en pose.
- **`src/components/Analysis/FrameLightbox.tsx`** — samma overlay vid inzoomad granskning
  ("en och en"); wrappern sätts till bildens aspect-ratio så overlayn matchar `object-contain`.

**Ingen fasdetektion i pass 1** — bara detektera + visualisera.

## Arkitektur (pass 3) — envelope-inversion *(ersätter pass 2 som primär pose-väg)*

> **[ADR-002](decisions/ADR-002-stream-d-envelope-inversion.md).** Tre rundor heuristik-patchning
> visade att fas-viktad klustring som **primär** väg är skör: root cause är att global min-y låser på
> follow-through-**finishen**, inte baksvingstoppen — och finishen är i själva verket den *mest*
> tillförlitliga landmarken (globalt vertikalt apex i en fullföljd sving). Vi inverterar: robust
> envelope + uniform-inom-svingen som baslinje, impact-kluster endast som **confident-only polish**.
> Värsta fall blir "uniform över svingen" (användbart), inte "missad impact" (värdelöst).

- **`src/lib/poseEnvelope.ts`** — `detectSwingEnvelope(samples)` härleder sving-envelopen ur
  handledsbanan (landmärke 15/16, bäst spårade wristen):
  - **`start` = HASTIGHETSBASERAD onset backad till avfärd från stillhet** *(start-fix
    slutlig, 2026-08-02)*. Onset = första framen `speedSm ≥ speedThresh`
    (`ADDRESS_SPEED_FRAC × peak`), sedan **backad bakåt frame för frame** så länge
    föregående frames `speedSm > START_QUIET_FLOOR` (0.04) → landar på första framen i den
    sammanhängande rörelse-körningen. Diagnostik-verifierad på DTL (144 frames): onset
    ~frame 104–105, backning → **frame 102–103 (`t≈6.78–6.85`)**; envelope-start korrekt.
    **Wrist-Y-position mot platå-medel är RETIRERAD** (`ADDRESS_DEPART_TOL`): under en
    lång adress *driftar* handleden (DTL: `0.380→0.425` över 6,9 s = 0.045 > TOL 0.03), så
    bidirektionellt `|y−addressY|>TOL` fyrar på driften (`t=1.60`) och riktat `addressY−y>TOL`
    fyrar mitt i baksvingen (`t=7.18`) — ingen TOL räddar en drift-signal, och inget
    y-baserat waggle-filter (sustain/lookahead) heller. Fem varv i följd: enkel
    hastighetströskel (för sent) → position bidir (drift) → position riktad + sustain →
    lookahead → **åter hastighet, nu onset+backning**. Hastighet mäter *att handleden börjar
    röra sig*; position mäter *var den är* — start är det förra. Early bias behållen (backa
    hellre ett par frames för långt än in i baksvingen; princip #3). `START_QUIET_FLOOR` ny
    tunbar. Se ADR-002 *Uppföljning: wrist-Y ... är oanvändbar för start* + uppdaterad
    princip #2b.
  - **finish binds till SEKVENSEN, inte till globalt min-y** *(finish-kollaps-fix, 2026-08-02)*.
    Ordning: baksvingstopp → **downswing-passage** (wrists ned nära address-höjd) → **finish**.
    Downswing-passagen hittas FÖRST (snabbaste `vy>0` nära `addressY`, över hela post-start-spannet).
    `finish` = första `FINISH_MIN_HOLD_FRAMES`-långa low-settle (`< SETTLE_SPEED_FRAC` av peak)
    **efter** passagen. Hold-kravet skiljer den hållna finishen från den korta transitionen på
    baksvingstoppen. `APEX_PLATEAU_TOL`/`SETTLE_MIN_FRAMES` utgår.
  - **Avklippt-skydd:** ingen downswing-passage, eller ingen settle efter den (video slutar mitt i
    rörelse) → envelope-slut = sista frame med signifikant wrist-rörelse (`clippedTail=true`).
  - **impact (confident-only)** = framen på nedåtpasset där wrist-Y kommer **NÄRMAST `addressY`**,
    accepterad om närmandet är inom `IMPACT_ADDRESS_TOL` (0.05) *(nearest-approach-fix, 2026-08-05)*.
    Ersätter kravet på **exakt korsning** genom `addressY` *(impact-crossing-fix, 2026-08-02)*, som
    var för strikt för **face-on**: annan kameravinkel → handlederna återvänder inte exakt till
    address-höjd vid träff, så korsningen missar knappt trots en ren sving. `IMPACT_ADDRESS_TOL`
    (0.05) är snävare än `IMPACT_HEIGHT_TOL` (0.12, grindar bara nedåtpasset) → närmandet måste vara
    genuint nära, så toleransen inte gör impact "alltid sann". `passIdx` (snabbaste nedåtframen)
    ankrar bara passet, tas ej som impact. **INGEN fallback** *(falsk-impact-fix, 2026-08-05)*: sätts
    bara av ett tillräckligt nära närmande. Tre spärrar → `impact=null` (uniform baslinje): (1)
    inget nedåtpass / närmande utanför tolerans, (2) `clippedTail=true` (avklippt sving kan aldrig ha
    verifierad impact — överrider toleransen), (3) `IMPACT_END_MARGIN_FRAMES` (2): närmande på/inom
    marginalen från envelope-slutet = cutoff-artefakt. **top** = apex före impact (follow-through
    ligger efter impact → förorenar ej). Confident kräver `MIN_VERTICAL_EXCURSION` (verklig
    baksvingstopp) + `downswingSec ≥ MIN_DOWNSWING_SEC`. Annars `impact=null` + `impactReason`.
  - Ren + testbar; returnerar `{valid, startSec, finishSec, clippedTail, impact|null, impactReason}` +
    diagnostik (`trackedWrist`, `visibleFrac`, `addressY`, `apexY`, `finishY`, `peakSpeed`) + `debug`
    (per-sampel `{t,y,vy,speed}` + valda index).
- **`src/lib/poseEnvelopeSelection.ts`** — `selectEnvelopeFrames(envelope, budget, span…)`.
  **STEG 2 (baslinje):** hela budgeten uniformt i **tid** över `[start, finish]` (endpoints →
  address + finish täcks gratis). **STEG 3 (polish):** endast om `envelope.impact` är confident
  omfördelas `IMPACT_CLUSTER_BUDGET_FRAC` (0.4) av budgeten till ett tätt kluster kring impact
  (spacing `max(IMPACT_CLUSTER_SPACING_SEC 0.06, sampleDt)`), resten kvar som uniform baslinje så
  address + finish förblir täckta. `impactClusterApplied` rapporterar vilket. `!envelope.valid` →
  even-fallback över hela span (`fellBackToEven=true`). Tunbara konstanter överst. Allt skalar
  parametriskt med `budget` — impact-klustret får alltid `IMPACT_CLUSTER_BUDGET_FRAC`.
  **Dev-preview-budgeten är EN tunbar konstant** `ENVELOPE_FRAME_BUDGET` (20), exporterad härifrån
  och konsumerad av `FramePreview` — sizer både selektionen och grid-renderingen (previewen visar
  alla 20). Oberoende av Pass-1:s even-antal (som skickas till Claude).
- **`FramePreview.tsx`** — A/B-toggle nu **Even (Pass 1)** ↔ **Envelope**, default **even**.
  `EnvelopeSummary` visar envelope `[start→finish]`, impact/`impactReason`, `impactClusterApplied`,
  `clippedTail`, allokering; `PoseSelect` WARN-logg `Envelope selection` + `Envelope per-frame trace`.
- **Logik-sanity-testad** (esbuild-bundle + syntetiska banor: full sving/avklippt/statisk/endast-
  baksving) — envelope, settle, avklippt-skydd, confident-only impact och baslinje-fallback beter sig
  rätt. **Ej fältverifierad** (Eriks klipp + browser, checkpoint 2).

**Kända svagheter (`// OSÄKER:` i koden):**
- **Downswing-passagen söks över hela klippet.** En sänkning av klubban *efter* finishen är också en
  nedåtpassage nära address-höjd; fastest-wins räddar oss så länge den passagen är långsammare än
  impact — svagt om ett klipp har en andra, snabbare nära-address-dipp efter svingen.
- **`FINISH_MIN_HOLD_FRAMES` (3 ≈ 0.2 s @ 15 fps)** kan missa en mycket snabb, knappt hållen finish →
  faller då till avklippt-skydd. Tunbar; fältkalibreras.
- **Finish-vs-baksvingstopp-diskrimineringen** vilar helt på hold-längd. Ett klipp där golfaren
  pausar länge på toppen (ovanligt) kan lura den — inte observerat, men ej uteslutet.

## Arkitektur (pass 2) — fas-viktad frame-selektion *(historik — ersatt av pass 3, se ADR-002)*

> **Premiss-rättelse (viktig):** pose driver *inte* frame-selektionen. `frameExtractor.ts`
> (pixel-diff) väljer de 10 frames som skickas till Claude — jämnt spridda över svingfönstret —
> och pose har hittills bara ritats som overlay. Pass 2 bygger den **första** pose-drivna
> selektionen som ett *alternativ*, helt vid sidan om `frameExtractor.ts`, och exponerar den bakom
> en A/B-toggle i dev-previewen. Den når **inte** default-vägen (det är pass 3).

- **`src/lib/posePhases.ts`** — `detectSwingPhases(samples)` härleder svingfas-gränser ur
  **handleds-trajektorian** (landmärke 15/16, väljer den bäst spårade wristen via visibility,
  faller tillbaka per-frame på den andra vid ocklusion, interpolerar luckor). Heuristik:
  - **address** = första ihållande låghastighets-platå (hastighet < `ADDRESS_SPEED_FRAC` × peak).
  - **backswing-start** = rörelse-onset efter address.
  - **top** = vertikal apex (**min y**, y växer nedåt i MediaPipe) efter backswing-start; kräver
    att wristen stigit ≥ `MIN_VERTICAL_EXCURSION` över address annars underkänns svingen.
  - **impact** = max handhastighet efter top **medan wristen sjunker** (`vy > 0`, dvs på väg
    ned mot address-höjd); giltig endast om wristen då är tillbaka nära address-höjd
    (`|y − addressY| ≤ IMPACT_HEIGHT_TOL`) **och** top→impact ≥ `MIN_DOWNSWING_SEC` (0.12 s).
  - **follow-through-start** = strax efter impact (nästa sampel).
  - Ren + testbar. Returnerar fyra timestamps + `confident` (+ `reason`) + diagnostik
    (`trackedWrist`, `visibleFrac`, `addressY`, `apexY`, `peakSpeed`, `sampleDt`) + `debug`
    (per-sampel `{t,y,vy,speed}` + valda index — STEG 1-instrumentering).
  - **Pass 2-buggfix (2026-07-08):** apex (min y) efter backswing-start kunde låsa på
    **follow-through-finishen** (händerna slutar högt) i stället för toppen av baksvingen →
    `top`/`impact`/`ft` kollapsade till klippslutet. Två gater: (1) impact-sökningen kräver
    nedåtrörelse (`vy > 0`), annars `fail('no descending motion after top')`; (2) minsta
    downswing-tid `MIN_DOWNSWING_SEC` — kortare → `confident=false` → uniform fallback.
    `// OSÄKER:`: finish-vs-top-hypotesen är ännu inte fältbekräftad (verifieras via `debug`-loggen).
- **`src/lib/poseFrameSelection.ts`** — `selectPhaseWeightedFrames(phases, budget, span…)`.
  Tunbara vikter överst (`PHASE_WEIGHTS`): address 1, backswing 2, top 1, downswing 2,
  follow-through 1; **impact får resten** (min `IMPACT_MIN_FRAMES` = 2), taget som ett tätt
  kluster kring impact med spacing `max(MIN_FRAME_SPACING_SEC 0.06, sampleDt)` (källa ~16 fps →
  översamplar ej). Vid B = 10 → address 1, backswing 2, top 1, downswing 2, impact 3, follow 1.
  Fallback vid `!phases.confident` **eller** degenererat top→impact-fönster
  (`< DEGENERATE_DOWNSWING_SEC` 0.12 s): fas-fönstren **kastas** och budgeten sprids
  **uniformt i tid** över svingfönstret `[backswingStart, spanEnd]` (faller till hela spannet
  om bs saknas) — aldrig över de (potentiellt noll-breda) fas-fönstren, så impact-regionen
  garanterat samplas. `usedPhaseWeighting=false` / `fellBackToEven=true`.
- **`src/lib/poseFrameGrab.ts`** — `grabFramesAtTimes(blob, times)` seekar en dold `<video>` och
  greppar JPEG-b64 per timestamp (samma mönster som `frameExtractor.ts`, men separat fil — Ström D
  rör aldrig `frameExtractor.ts`). Endast för dev-previewens A/B-visualisering.
- **`FramePreview.tsx`** — A/B-toggle **Even (Pass 1)** ↔ **Phase-weighted (Pass 2)**, default
  **even**. Summary-panel visar fas-gränser, per-fas-allokering, `usedPhaseWeighting`/fallback och
  de valda timestamparna; frame-grid + skelett-overlay återanvänds för båda strategierna.
  "Send to Claude" skickar alltid storens even-frames (phase-weighting wire:as i pass 3).

## Verifiering
`npm run dev` (ej build — SW-cache serverar annars gammal kod), `VITE_DEV_PREVIEW=true`. Spela in/
ladda en sving → preview visar skelett-overlay. 🐞 Logs, filtrera modul `PoseDetector` /
`PoseTrajectory`: `loadMs`, `delegate`, `avgInferMs`, `posesDetected`. **Pass 2:** växla toggeln till
Phase-weighted; modul `PoseSelect` loggar `Phase-weighted selection` (WARN) med `boundariesSec`,
`allocation`, `frameTimesSec`, `usedPhaseWeighting`/`fellBackToEven`, samt `Phase per-frame trace`
(STEG 1) med per-sampel `{i,t,y,vy,spd}` + valda index (`impactReason`). Scanna `spd`-kolumnen efter
den riktiga hastighetstoppen och `vy`-tecknet (up→down-flippen) för att lokalisera verklig impact vs
var detektorn placerade den. Ögonmät impact-klustringen i gridet mot even-strategin på samma klipp.

## Checklista
- [x] **D-1 pass 1** — Installera tasks-vision, hämta modell, `poseDetector`/`poseTrajectory`,
  skelett-overlay i dev-preview, laddnings-/inferenstid loggad. **Ej fältverifierad** (kräver
  Eriks klipp + browser; overlay-alignment vid `object-cover` på porträttklipp kan behöva ses över).
- [x] **D-2 (b) pass 2** — Härled svingfaser ur handledsbanor + fas-viktad allokering + A/B-toggle.
  *(Ersatt som primär väg av pass 3, ADR-002.)*
- [x] **D-2 pass 3 — envelope-inversion** — `poseEnvelope.ts` (envelope + confident-only impact) +
  `poseEnvelopeSelection.ts` (uniform-inom-svingen + impact-polish) + toggle **even ↔ envelope**.
  Logik-sanity-testad; **ej fältverifierad** (checkpoint 2). Se [ADR-002](decisions/ADR-002-stream-d-envelope-inversion.md).
- [x] **D-2 finish-kollaps-fix** *(2026-08-02)* — finish band till svingsekvensen (downswing-passage
  → high-settle) i st.f. globalt min-y; åtgärdar envelope-kollaps till baksvingen (`[6.98→7.38]`,
  "no descending pass"). `FINISH_MIN_HOLD_FRAMES` in, `APEX_PLATEAU_TOL`/`SETTLE_MIN_FRAMES` ut.
  Build+lint rena; **ej fältverifierad** (checkpoint 2). Se ADR-002 *Uppföljning: finish-kollaps*.
- [x] **D-2 start-fix** *(2026-08-02)* — start band till address-AVFÄRDEN (wrist-Y lämnar
  platå-medel > `ADDRESS_DEPART_TOL` 0.03) i st.f. backsving-hastighetströskel; åtgärdar att
  envelopen började mitt i baksvingen och missade take-away. Spegelbild av finish-buggen.
  Build+lint rena; **ej fältverifierad** (checkpoint 2). Se ADR-002 *Uppföljning: start-fyrar-för-sent*.
- [x] **D-2 start-fix (waggle)** *(2026-08-02)* — start kräver nu en IHÅLLANDE+RIKTAD
  address-avfärd (`START_MIN_SUSTAIN_FRAMES` 3 frames över platån i take-away-riktning) i
  st.f. en enkel `ADDRESS_DEPART_TOL`-passage; åtgärdar att starten fyrade ~3 waggle-frames
  före take-away på DTL-klippet `[1.60→8.38]`. Spegel av finish-fixens min-hold, riktad i
  st.f. settlad. Build rena, poseEnvelope.ts lint-ren; **ej fältverifierad** (checkpoint 2).
  Se ADR-002 *Uppföljning: start-fyrar-för-tidigt (waggle)*.
- [x] **D-2 start-fix inverterad** *(2026-08-02)* — waggle-botet överkorrigerade (start nära
  baksvingstoppen — take-away ej monoton vid 15 fps, sustain-räknaren nollställdes tills nära
  toppen). `START_MIN_SUSTAIN_FRAMES` ut → `WAGGLE_LOOKAHEAD_FRAMES` (3) in: tolerant lookahead,
  start = första avfärden såvida inte handleden är tillbaka på platån i fönstrets slut (bara
  äkta waggle-retur filtreras; hack/pauser tillåts). Bias:ar starten TIDIGT (värsta-fall:
  för-sen tappar hela take-away > för-tidig slösar billiga adress-frames). `poseEnvelope.ts`
  enbart; downswing/impact/finish orört. Build ren, poseEnvelope.ts lint-ren; **ej
  fältverifierad** (checkpoint 2). Se ADR-002 *Uppföljning: start-fyrar-för-sent igen*.
- [x] **D-2 waggle-filter revert:at** *(2026-08-02)* — `WAGGLE_LOOKAHEAD_FRAMES` gjorde starten
  katastrofalt sen igen (`[7.18→8.38]`, första framen mitt i baksvingen). I DTL rör sig take-away
  nästan rakt bakåt → y kryper knappt över tröskeln, så varje y-baserat waggle-test (sustain ELLER
  lookahead) läser take-away som waggle-retur och kapar den. `WAGGLE_LOOKAHEAD_FRAMES` ut, inget
  filter: start = första address-avfärden, ofiltrerad → `[1.60→8.38]` (hela svingen, ~3 tidiga
  adress-frames = accepterad early-bias). Y-only är fel signal för take-away-start i DTL.
  `poseEnvelope.ts` enbart. Build+lint rena; **ej fältverifierad** (checkpoint 2). Se ADR-002
  *Uppföljning: waggle-filtret revert:as*.
- [x] **D-2 start-fix slutlig — hastighetsbaserad onset + backning** *(2026-08-02)* — diagnostik-
  dump (DTL, 144 frames) avgjorde: wrist-Y mot platå-medel är oanvändbar (drift `0.380→0.425`
  under 6,9 s adress > TOL 0.03; bidir fyrar `t=1.60`, riktat `t=7.18`). SPEED separerar rent.
  Fix: `ADDRESS_DEPART_TOL`-logiken ut ur start; start = onset (`speedSm ≥ speedThresh`) backad
  bakåt medan föregående `speedSm > START_QUIET_FLOOR` (ny tunbar 0.04) → frame 102–103 (`t≈6.78–6.85`).
  Vänder tidigare "aldrig hastighet för start" — rätt slutsats: hastighet, men läs onset + backa.
  `ADDRESS_DEPART_TOL` kvar tillfälligt endast för TEMP-diagnostiken. `poseEnvelope.ts` enbart;
  downswing/finish orört. Build+lint rena; **ej fältverifierad** (checkpoint 2). Se ADR-002
  *Uppföljning: wrist-Y ... oanvändbar för start* + princip #2b.
- [x] **D-2 impact = korsning genom addressY** *(2026-08-02)* — impact togs på `passIdx` (snabbaste
  nedåtframen, mitt i passet) men händerna når address-höjd några frames senare (DTL: idx 116
  `y=0.288` vs korsning idx 117–118). Impact omdefinierad till första nedåtframen där `y` korsar
  tillbaka genom `addressY`, sökt framåt från `passIdx` (behållen för finish-sekvens). `poseEnvelope.ts`
  enbart. Build+lint rena; **ej fältverifierad**.
- [x] **D-2 falsk impact på avklippt klipp** *(2026-08-05)* — avklippt DTL-klipp (slutar före träff) gav
  `impact 4.27` = envelope-slutet (pinnades till sista framen). Root cause: impact-crossing-fixen hade
  kvar fallback `impactIdx = passIdx`. Fix (3 lager → `impact=null`): (1) ingen fallback (`impactIdx`
  startar `-1`, sätts bara av faktisk korsning inom envelopen); (2) `clippedTail=true` ⇒ aldrig verifierad
  impact; (3) `IMPACT_END_MARGIN_FRAMES` (2) — korsning vid envelope-slutet = cutoff-artefakt. Verifierat
  syntetiskt (esbuild+node): full sving → confident impact; avklippt → `clippedTail`, `impact=null`,
  uniform baslinje. `poseEnvelope.ts` enbart; `frameExtractor.ts`/`poseEnvelopeSelection.ts` orörda.
  Build+lint rena; **ej fältverifierad** (checkpoint 2). Se ADR-002 *Uppföljning: falsk impact på avklippt klipp*.
- [x] **D-2 impact nearest-approach (face-on-fix)** *(2026-08-05)* — face-on-klipp gav `[3.35→4.83] ·
  uniform baseline · no impact`; envelopen rätt, bara polishen uteblev. Root cause: exakt korsning genom
  `addressY` för strikt — annan kameravinkel → handlederna återvänder ej exakt till address-höjd vid träff.
  Fix: exakt korsning → **nearest-approach inom tolerans** (`IMPACT_ADDRESS_TOL` ny tunbar 0.05, snävare än
  `IMPACT_HEIGHT_TOL` 0.12). Alla skydd oförändrade (`clippedTail`/slut-marginal/inget pass → `impact=null`;
  toleransen gör ej impact "alltid sann" — clippedTail överrider). Verifierat syntetiskt (esbuild+node):
  full → impact, face-on (närmar 0.03) → **nu impact**, avklippt → `impact=null`, avklippt-inom-tolerans →
  `impact=null` via clippedTail. `poseEnvelope.ts` enbart; `frameExtractor.ts`/`poseEnvelopeSelection.ts`
  orörda. Build+lint rena; **ej fältverifierad** (checkpoint 2). Se ADR-002 *Uppföljning: impact missar på face-on*.
- [x] **D-2 dev-preview frame-budget → 20** *(2026-08-02)* — envelope-selektionens frame-antal höjt
  10→20 via EN exporterad konstant `ENVELOPE_FRAME_BUDGET` (poseEnvelopeSelection.ts), konsumerad av
  `FramePreview` (sizer både selektion + grid-rendering, previewen visar alla 20). Allokeringen skalar
  parametriskt; impact-klustret får fortsatt `IMPACT_CLUSTER_BUDGET_FRAC` (0.4 → 8/20). Dev-preview
  only; `frameExtractor.ts`/Vision-anropet orört. Build+lint rena.
- [x] **D-2 (a)** — Självhosta WASM-runtimen (offline-först) i stället för jsDelivr-CDN:
  `scripts/copy-pose-wasm.mjs` → `public/wasm/`, `FilesetResolver.forVisionTasks('/wasm')`,
  SW-precache av modell + SIMD-wasm + runtime-cache av nosimd. Byggverifierat (precache 17.7 MB,
  19 entries; noll CDN-referenser i koden). **Ej browser-/offline-fältverifierad** (kräver `npm run
  dev` på Eriks enhet — SW-cache serverar annars gammal kod).
- [x] **Enhetstest på platå-/vändpunkts-/impact-logiken** *(2026-08-05)* — `poseEnvelope.test.ts` (vitest,
  `npm test`): full sving, avklippt (`clippedTail`/no impact), drift-adress (start fyrar ej på driften),
  face-on (impact via nearest-approach), statisk/endast-baksving (degradering utan krasch), för-få-samples.
  Fångade latent bugg: statiskt klipp gav `valid=true` (flyttalsbrus `peakSpeed~1e-16` passerade `<=0`) →
  ny konstant `MIN_PEAK_SPEED` (1e-6). Samtidigt: TEMP-diagnostiken + `ADDRESS_DEPART_TOL` borttagna
  (checkpoint 2 godkänd på DTL/DTL-avklippt/face-on). Build+lint+test rena.
- [ ] Utvärdera mot `frameExtractor.ts` på riktiga klipp; besluta ersätta/komplettera *(D-3)*; vid
  grönt: wire:a phase-weighting till default-vägen *(pass 3)*.
