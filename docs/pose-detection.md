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
- **`src/components/Analysis/FramePreview.tsx`** — bakom `VITE_DEV_PREVIEW`: kör trajektorian på
  `currentVideoBlob` (dynamisk `import()` → egen lazy chunk), ritar skelett-overlay (SVG, `0–100`
  viewBox, `xMidYMid slice` matchar `object-cover`) på varje frame via närmaste pose-sampel i tid.
  Statusrad visar hur många frames som fick en pose.

**Ingen fasdetektion i pass 1** — bara detektera + visualisera.

## Verifiering
`npm run dev` (ej build — SW-cache serverar annars gammal kod), `VITE_DEV_PREVIEW=true`. Spela in/
ladda en sving → preview visar skelett-overlay. 🐞 Logs, filtrera modul `PoseDetector` /
`PoseTrajectory`: `loadMs`, `delegate`, `avgInferMs`, `posesDetected`.

## Checklista
- [x] **D-1 pass 1** — Installera tasks-vision, hämta modell, `poseDetector`/`poseTrajectory`,
  skelett-overlay i dev-preview, laddnings-/inferenstid loggad. **Ej fältverifierad** (kräver
  Eriks klipp + browser; overlay-alignment vid `object-cover` på porträttklipp kan behöva ses över).
- [ ] Självhosta WASM-runtimen (offline-först) i stället för jsDelivr-CDN.
- [ ] Härled svingfaser (address/top/impact/…) från handled-/axelbanor.
- [ ] Utvärdera mot `frameExtractor.ts` på riktiga klipp; besluta ersätta/komplettera.
