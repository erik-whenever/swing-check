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
  - **`start`** = sustained wrist-motion-onset efter address-platån (samma som förr).
  - **`finish`** = globalt min-y efter start **med settle-krav** (`SETTLE_SPEED_FRAC` av peak, i
    `SETTLE_MIN_FRAMES` samplen efter apex). Finishen är ett *hållet* platå → tas som **tidigaste**
    frame inom `APEX_PLATEAU_TOL` av globala min-y (rå argmin driver till sista platå-framen på
    flyttalsbrus allena → död svans).
  - **Avklippt-skydd:** ingen settle-finish (video slutar mitt i rörelse) → envelope-slut = sista
    frame med signifikant wrist-rörelse (`clippedTail=true`), inte klippslut.
  - **impact (confident-only)** = snabbaste **nedåtrörelse** (`vy>0`) tillbaka nära address-höjd
    (`IMPACT_HEIGHT_TOL`), sökt inom envelopen före finishen; **top** = apex före den impacten
    (follow-through ligger efter impact → förorenar ej). Confident kräver `MIN_VERTICAL_EXCURSION`
    (verklig baksvingstopp) + `downswingSec ≥ MIN_DOWNSWING_SEC`. Annars `impact=null` + `impactReason`.
  - Ren + testbar; returnerar `{valid, startSec, finishSec, clippedTail, impact|null, impactReason}` +
    diagnostik (`trackedWrist`, `visibleFrac`, `addressY`, `apexY`, `finishY`, `peakSpeed`) + `debug`
    (per-sampel `{t,y,vy,speed}` + valda index).
- **`src/lib/poseEnvelopeSelection.ts`** — `selectEnvelopeFrames(envelope, budget, span…)`.
  **STEG 2 (baslinje):** hela budgeten uniformt i **tid** över `[start, finish]` (endpoints →
  address + finish täcks gratis). **STEG 3 (polish):** endast om `envelope.impact` är confident
  omfördelas `IMPACT_CLUSTER_BUDGET_FRAC` (0.4) av budgeten till ett tätt kluster kring impact
  (spacing `max(IMPACT_CLUSTER_SPACING_SEC 0.06, sampleDt)`), resten kvar som uniform baslinje så
  address + finish förblir täckta. `impactClusterApplied` rapporterar vilket. `!envelope.valid` →
  even-fallback över hela span (`fellBackToEven=true`). Tunbara konstanter överst.
- **`FramePreview.tsx`** — A/B-toggle nu **Even (Pass 1)** ↔ **Envelope**, default **even**.
  `EnvelopeSummary` visar envelope `[start→finish]`, impact/`impactReason`, `impactClusterApplied`,
  `clippedTail`, allokering; `PoseSelect` WARN-logg `Envelope selection` + `Envelope per-frame trace`.
- **Logik-sanity-testad** (esbuild-bundle + syntetiska banor: full sving/avklippt/statisk/endast-
  baksving) — envelope, settle, avklippt-skydd, confident-only impact och baslinje-fallback beter sig
  rätt. **Ej fältverifierad** (Eriks klipp + browser, checkpoint 2).

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
- [x] **D-2 (a)** — Självhosta WASM-runtimen (offline-först) i stället för jsDelivr-CDN:
  `scripts/copy-pose-wasm.mjs` → `public/wasm/`, `FilesetResolver.forVisionTasks('/wasm')`,
  SW-precache av modell + SIMD-wasm + runtime-cache av nosimd. Byggverifierat (precache 17.7 MB,
  19 entries; noll CDN-referenser i koden). **Ej browser-/offline-fältverifierad** (kräver `npm run
  dev` på Eriks enhet — SW-cache serverar annars gammal kod).
- [ ] Enhetstest på platå-/vändpunkts-/impact-logiken.
- [ ] Utvärdera mot `frameExtractor.ts` på riktiga klipp; besluta ersätta/komplettera *(D-3)*; vid
  grönt: wire:a phase-weighting till default-vägen *(pass 3)*.
