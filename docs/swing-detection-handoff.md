# Swing Detection — Handoff / Session Notes

> Working doc for continuing the swing-frame-detection work in a fresh session.
> Last updated: 2026-06-01.

## Goal
Improve `src/lib/frameExtractor.ts` so the 10 frames sent to Claude actually
cover the **swing** (address → backswing → top → downswing → impact →
follow-through). For videos longer than ~6 s the old logic picked the wrong
frames. The user chose a **motion-based rework with no new dependencies**
(over pose estimation), for the scenario *one real swing + long setup*.

## The core insight (most important)
A pixel-difference motion metric **cannot see the ball strike**. At impact only
a thin, fast club moves → very few pixels change → impact sits in a motion
**valley**. The big body rotation of the **follow-through** dominates the score.
So "find the motion peak = impact" is fundamentally wrong: it lands on the
follow-through, not the swing.

What the metric *does* see reliably:
- **Address** = the long sustained **stillness** before the swing.
- **Follow-through** = the big motion after impact.
- **Impact** lives at the **transition** between them.

→ Therefore we anchor on the **address stillness**, not the motion peak.

## Current approach (implemented, in `frameExtractor.ts`)
1. **Down-scaled motion canvas** (~360 px longest side). Crucial: at full 1080p,
   sensor/codec noise makes ~12 % of pixels "change" every frame even when still,
   drowning the swing. Down-scaling averages that out. The full-res canvas is
   kept only for the final extracted frames.
2. **Motion metric** = fraction of centre-weighted pixels whose luma changed
   beyond a threshold, **after** subtracting any uniform global brightness shift
   (robust to auto-exposure / white-balance settling).
3. **Coarse scan** of the whole clip (12 fps, capped) → motion curve, smoothed.
4. **Address** = longest run of consecutive "still" frames
   (`smooth < moveThreshold`). `impact ≈ first moving frame after it`.
   Fallback to global motion peak if no clear stillness exists.
5. **Window** = `[impact − 1.2 s, impact + 1.2 s]`, trimmed earlier if motion
   re-settles (so we don't capture the golfer lowering the club / walking off).
6. **10 frames spread EVENLY** across the window, labelled by position; the frame
   nearest the estimated impact is forced to the `impact` label. Even spacing is
   deliberate — impact time is only an estimate, so blanket coverage beats
   betting frames on a precise instant.

Key tunables (top of `frameExtractor.ts`): `SWING_PRE_SEC`, `SWING_POST_SEC`,
`MIN_STILL_SEC`, `SETTLE_SKIP_SEC`, `MOTION_PIXEL_THRESHOLD`, `MOTION_MAX_DIM`.

## Test clip & ground truth (the case we debugged)
Uploaded clip, **9.58 s**, portrait 1080×1920. User confirmed **impact ≈ 6–7 s**.
Motion `curveDigest` (≈4 fps, [t, score]):
- **0.5–2.5 s**: 12,9,9,7,7,5,3 → a burst that decays. = setup/walk-in (NOT the swing).
- **2.5–6.75 s**: ~0–1 = **still (the address)**.
- **7.0–9.5 s**: 3,5,3,6,4,4,5,9,8,10,9 → rising, **cut off at clip end** = follow-through / lowering club.
- At the real impact (6–7 s) the motion is ~**0–1** → confirms impact is invisible to the metric.

## What we tested (chronological) & what each revealed
1. First rework (coarse-to-fine, energy-window, global-max impact): captured
   frames at **0–0.3 s** (pure setup). → metric was **noise-dominated** at full
   res (scores flat ~12 everywhere).
2. Added brightness-compensated metric + start-skip: still wrong. → still noisy.
3. **Down-scaled motion canvas**: noise floor dropped to ~1.5, swing motion 10–20.
   Detection moved to the end region (8.4–9.5 s). User: "that's the
   follow-through / lowering the club, not the swing."
4. Found the address-threshold bug (`quietThreshold 0.88 < still baseline 1.46`
   → address never found → fallback). Fixed threshold to sit *above* baseline.
   Frames then spanned 8.4–9.5 (still follow-through).
5. Added `curveDigest` full-curve logging → revealed **two motion regions with
   stillness between**, and that impact (6–7 s) is in a motion valley. → led to
   the address-anchored rewrite (current state).

Recurring trap: the **PWA service worker served stale cached code** repeatedly,
so changes appeared to have "no effect." Always test via `npm run dev` in the
browser, and Unregister the SW (DevTools → Application → Service Workers) if in
doubt. The "Copy" button + `curveDigest` field are good canaries for fresh code.

## Where we are now
Address-anchored detection + even distribution is implemented and **builds +
lints clean** (`npm run build`). **Not yet verified** on the test clip by the
user (battery died). Expected result for the test clip: frames ~5.8–8.2 s,
covering address→backswing→impact→follow-through.

## How to verify
1. `npm run dev` (NOT `preview`/a build — SW caching).
2. Ensure `VITE_DEV_PREVIEW=true` (shows the frame preview + 🐞 Logs panel).
3. Upload the clip. In the preview, frames show their phase label + timestamp.
4. Open **🐞 Logs** (right sidebar), module filter `FrameExtractor`, press
   **Copy 📋**. Read **"Swing detection summary"**: `impactSec`, `frameTimesSec`,
   `curveDigest`, `usedFallback`.

## Open items / next steps
- **Verify** the current approach on the user's clip (and a few others of varied
  length / swing position).
- If it still misses the swing → the motion-only metric is at its limit.
  **Escalate to pose estimation** (MediaPipe Tasks Vision / MoveNet in-browser)
  to track club/hands and find impact directly. This was the "best quality"
  option the user initially set aside.
- **Clean-up before merge**: the consolidated **WARN** "Swing detection summary"
  + `curveDigest` + `topPeaks` were added for debugging — downgrade to `debug`
  or remove. The DevLogPanel changes (right sidebar + Copy button) can stay.
- Not yet committed. Changes live in the working tree on `main`. Suggest a branch
  before committing.

## Files touched
- `src/lib/frameExtractor.ts` — core algorithm (the bulk of the work).
- `src/components/Camera/CameraView.tsx` — dropped the now-unused `skipEndTrim`.
- `src/components/Analysis/FramePreview.tsx` — phase label + timestamp per frame.
- `src/components/DevLogPanel.tsx` — right-side sidebar + Copy button.
