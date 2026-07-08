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

## Modell-asset
- **Fil:** `public/models/pose_landmarker_lite.task` (~5.5 MB, float16 lite).
- **Hämtas med:** `npm run pose:model` (`scripts/download-pose-model.mjs`, idempotent, `--force` för omhämtning).
- **Committas ej** — gitignorad (`public/models/*.task`); source of truth är Googles modell-bucket.
- **WASM-runtime:** laddas i detta skede från jsDelivr-CDN (`FilesetResolver.forVisionTasks`).
  Självhosting (offline-först) är ett senare pass.

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

## Arkitektur (pass 2) — fas-viktad frame-selektion

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
  - **impact** = max handhastighet efter top; giltig endast om wristen då är tillbaka nära
    address-höjd (`|y − addressY| ≤ IMPACT_HEIGHT_TOL`).
  - **follow-through-start** = strax efter impact (nästa sampel).
  - Ren + testbar. Returnerar fyra timestamps + `confident` (+ `reason`) + diagnostik
    (`trackedWrist`, `visibleFrac`, `addressY`, `apexY`, `peakSpeed`, `sampleDt`).
    `// OSÄKER:`-punkter: 15 fps i downswing är glest; impact-krav på höjd-återgång kan
    underkänna avklippta/porträtt-klipp → faller då tillbaka på jämn fördelning.
- **`src/lib/poseFrameSelection.ts`** — `selectPhaseWeightedFrames(phases, budget, span…)`.
  Tunbara vikter överst (`PHASE_WEIGHTS`): address 1, backswing 2, top 1, downswing 2,
  follow-through 1; **impact får resten** (min `IMPACT_MIN_FRAMES` = 2), taget som ett tätt
  kluster kring impact med spacing `max(MIN_FRAME_SPACING_SEC 0.06, sampleDt)` (källa ~16 fps →
  översamplar ej). Vid B = 10 → address 1, backswing 2, top 1, downswing 2, impact 3, follow 1.
  Om `!phases.confident` → **graceful fallback** till jämn fördelning över hela sampel-spannet,
  `usedPhaseWeighting=false` / `fellBackToEven=true`.
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
`allocation`, `frameTimesSec`, `usedPhaseWeighting`/`fellBackToEven`. Ögonmät impact-klustringen i
gridet mot even-strategin på samma klipp.

## Checklista
- [x] **D-1 pass 1** — Installera tasks-vision, hämta modell, `poseDetector`/`poseTrajectory`,
  skelett-overlay i dev-preview, laddnings-/inferenstid loggad. **Ej fältverifierad** (kräver
  Eriks klipp + browser; overlay-alignment vid `object-cover` på porträttklipp kan behöva ses över).
- [x] **D-2 (b) pass 2** — Härled svingfaser ur handledsbanor (`posePhases.ts`) + fas-viktad
  allokering (`poseFrameSelection.ts`) + A/B-toggle i dev-preview. **Ej fältverifierad.**
- [ ] Självhosta WASM-runtimen (offline-först) i stället för jsDelivr-CDN. *(D-2 (a))*
- [ ] Enhetstest på platå-/vändpunkts-/impact-logiken.
- [ ] Utvärdera mot `frameExtractor.ts` på riktiga klipp; besluta ersätta/komplettera *(D-3)*; vid
  grönt: wire:a phase-weighting till default-vägen *(pass 3)*.
