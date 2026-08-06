# Envelope regression fixtures (Ström D)

Raw MediaPipe pose-landmark series, one JSON per **verified** clip. These are the
frozen inputs for `poseEnvelopeRegression.test.ts` — the thing that lets `npm test`
replace the manual "load 3 clips in the browser and read the logs" round.

## Why this works

The envelope logic (`poseEnvelope.ts` + `poseEnvelopeSelection.ts`) is a pure
function of the pose-landmark series. MediaPipe's `PoseLandmarker` is deterministic
enough that a clip's landmark series only has to be captured **once** — after that,
every logic change is re-verified against the frozen series with no browser.

## File format

Produced by the **"⬇︎ Export pose fixture"** button in the dev preview
(`FramePreview.tsx`, behind `VITE_DEV_PREVIEW`). One object per clip:

```jsonc
{
  "label": "dtl-full",              // optional, informational
  "capturedAt": "2026-08-06T…Z",    // ISO timestamp of the export
  "sampleCount": 144,
  "samples": [                      // the raw series the detector consumes
    { "t": 0.0,    "landmarks": [ { "x": …, "y": …, "z": …, "visibility": … }, … 33 ] },
    { "t": 0.0667, "landmarks": [ … ] },
    …
  ]
}
```

`t` is seconds from clip start; `landmarks` is all 33 MediaPipe pose landmarks
(coords rounded to 5 decimals — well under detection sensitivity).

## The three checkpoint-2 fixtures

| File            | Camera | Expected                                                     |
| --------------- | ------ | ------------------------------------------------------------ |
| `dtl-full.json` | DTL    | envelope `[6.78 → 8.38]`, impact `~7.85`, cluster applied    |
| `dtl-clipped.json` | DTL | `clippedTail=true`, `impact=null`, cluster **not** applied   |
| `face-on.json`  | Face-on| envelope `[3.35 → 4.83]`, impact `~4.29`, cluster applied    |

Golden values live in the `GOLDENS` array in `../poseEnvelopeRegression.test.ts`.

## Adding a new clip as a fixture

See the step-by-step in [`docs/pose-detection.md`](../../../docs/pose-detection.md)
→ *Regressionsharness — lägg till ett klipp som fixture*. In short:

1. `npm run dev` with `VITE_DEV_PREVIEW=true`, load the clip, wait for the pose
   overlay to finish, click **⬇︎ Export pose fixture**.
2. Rename the download to `<name>.json` and drop it in this directory.
3. Add a `GOLDENS` entry with the values the dev-preview `EnvelopeSummary` shows.
4. `npm test` — the new case runs (a missing fixture stays a `todo`, so the suite
   never goes red just because a clip hasn't been captured yet).
