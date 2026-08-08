import { useEffect, useMemo, useState } from 'react';
import { useSessionStore, selectPrimarySwing } from '../../store/session';
import { FrameLightbox } from './FrameLightbox';
import { SkeletonOverlay } from './SkeletonOverlay';
import { nearestSample } from '../../lib/poseSampling';
import type { PoseSample } from '../../lib/poseTrajectory';
import { detectSwingEnvelope, type SwingEnvelope } from '../../lib/poseEnvelope';
import type { FrameMeta } from '../../lib/frameExtractor';
import { SegmentedSwings } from './SegmentedSwings';

const DEV_PREVIEW = import.meta.env.VITE_DEV_PREVIEW === 'true';

/** Stable empty array so `meta` keeps its identity when there is no swing. */
const EMPTY_META: FrameMeta[] = [];

export function FramePreview() {
  // Preview of the single-swing selection: swings[0]. Multi-swing preview is the
  // SegmentedSwings panel below (dev only) until D-5 pass 2 wires it into capture.
  const swing = useSessionStore(selectPrimarySwing);
  const meta = swing?.frameMeta ?? EMPTY_META;
  const videoBlob = useSessionStore((s) => s.currentVideoBlob);
  const setView = useSessionStore((s) => s.setView);
  const updateSwing = useSessionStore((s) => s.updateSwing);
  const clearSwings = useSessionStore((s) => s.clearSwings);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Dev-only pose trajectory: run MediaPipe over the source clip and overlay the
  // skeleton on each extracted frame (nearest sample by timestamp). Since the
  // D-3 cutover the frames themselves are ALREADY the pose/envelope selection
  // (chosen in frameExtractor.ts) — this overlay + the envelope summary below are
  // purely for inspection and DO NOT drive selection.
  const [poseSamples, setPoseSamples] = useState<PoseSample[] | null>(null);
  const [poseStatus, setPoseStatus] = useState<'idle' | 'running' | 'done' | 'error'>(
    'idle',
  );

  useEffect(() => {
    if (!DEV_PREVIEW || !videoBlob || meta.length === 0) return;
    let cancelled = false;
    (async () => {
      setPoseSamples(null);
      setPoseStatus('running');
      try {
        // Dynamic import keeps @mediapipe/tasks-vision out of the main bundle;
        // it only loads when the dev preview actually runs pose detection.
        const { extractPoseTrajectory } = await import('../../lib/poseTrajectory');
        const samples = await extractPoseTrajectory(videoBlob);
        if (!cancelled) {
          setPoseSamples(samples);
          setPoseStatus('done');
        }
      } catch {
        if (!cancelled) setPoseStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [videoBlob, meta.length]);

  // Read-only envelope read for the verification summary. Deterministic from the
  // same pose signal frameExtractor.ts uses, so it reports the same boundaries the
  // production selection was built from (or valid=false when production fell back
  // to the motion path). No selection / frame grabbing happens here.
  const envelope = useMemo<SwingEnvelope | null>(() => {
    if (!poseSamples || poseSamples.length === 0) return null;
    return detectSwingEnvelope(poseSamples);
  }, [poseSamples]);

  const maxScore = Math.max(...meta.map((m) => m.score), 1);
  const swingStartIndex = meta.findIndex((m) => m.isSwingStart);

  const handleSend = () => {
    // Flip status before the view switch so the analysis view opens on its
    // spinner rather than flashing "no analysis yet".
    if (swing) updateSwing(swing.id, { status: 'analyzing' });
    setView('analysis');
  };

  const handleDiscard = () => {
    clearSwings();
    setView('camera');
  };

  // Dump the raw pose-landmark series for the loaded clip as JSON so it can be
  // frozen as a regression fixture (src/lib/__fixtures__/). MediaPipe is
  // deterministic enough to capture once — after that every envelope-logic change
  // is re-verified by `npm test` (poseEnvelopeRegression.test.ts) with no browser.
  const handleExportFixture = () => {
    if (!poseSamples) return;
    const round = (n: number) => Math.round(n * 1e5) / 1e5; // 5 dp: under detection sensitivity
    const payload = {
      label: '',
      capturedAt: new Date().toISOString(),
      sampleCount: poseSamples.length,
      samples: poseSamples.map((s) => ({
        t: round(s.t),
        landmarks: s.landmarks.map((l) => ({
          x: round(l.x),
          y: round(l.y),
          z: round(l.z),
          ...(l.visibility !== undefined ? { visibility: round(l.visibility) } : {}),
        })),
      })),
    };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pose-fixture-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Frame Preview</h2>
          <span className="text-xs text-faint bg-surface px-2 py-1 rounded">
            DEV MODE
          </span>
        </div>

        {DEV_PREVIEW && (
          <p className="text-xs text-muted">
            Pose overlay:{' '}
            {poseStatus === 'running' && <span className="text-sky-400">detecting…</span>}
            {poseStatus === 'done' && (
              <span className="text-emerald-400">
                {poseSamples?.filter((s) => s.landmarks.length > 0).length ?? 0}/
                {poseSamples?.length ?? 0} frames with pose
              </span>
            )}
            {poseStatus === 'error' && (
              <span className="text-red-400">failed (see Logs)</span>
            )}
            {poseStatus === 'idle' && <span className="text-faint">—</span>}
          </p>
        )}

        {DEV_PREVIEW && poseStatus === 'done' && poseSamples && (
          <button
            onClick={handleExportFixture}
            className="w-full py-2 bg-surface hover:bg-raised rounded-lg text-xs font-mono text-fg-dim transition-colors"
            title="Dump the raw pose-landmark series as a regression fixture (src/lib/__fixtures__/)"
          >
            ⬇︎ Export pose fixture ({poseSamples.length} samples)
          </button>
        )}

        {/* Read-only envelope verification (dev only). The frames below ARE this
            selection — this panel just surfaces the boundaries it was built from. */}
        {DEV_PREVIEW && <EnvelopeSummary envelope={envelope} />}

        {/* ADR-003 segmentation view (dev only). Renders itself ONLY when the clip
            holds more than one swing; one swing or none leaves everything below
            exactly as it was, because that is the case the single-envelope path
            already gets right. Read-only — nothing here reaches the Vision call. */}
        {DEV_PREVIEW && poseSamples && videoBlob && (
          <SegmentedSwings poseSamples={poseSamples} videoBlob={videoBlob} />
        )}

        <p className="text-xs text-muted">
          {meta.length} frames selected from recording. Swing start detected at
          candidate frame #
          {meta.find((m) => m.isSwingStart)?.candidateIndex ?? '?'}. Tap any frame
          to zoom and inspect.
        </p>

        {swingStartIndex >= 0 && (
          <button
            onClick={() => setLightboxIndex(swingStartIndex)}
            className="w-full py-2 bg-amber-700 hover:bg-amber-600 rounded-lg text-sm font-medium transition-colors"
          >
            🔍 Inspect swing start frame
          </button>
        )}

        {/* Frame grid */}
        <div className="grid grid-cols-2 gap-2">
          {meta.map((frame, i) => (
            <button
              key={i}
              onClick={() => setLightboxIndex(i)}
              className={`text-left rounded-lg overflow-hidden border-2 cursor-zoom-in ${
                frame.isSwingStart
                  ? 'border-amber-500'
                  : frame.isAddress
                    ? 'border-blue-500'
                    : 'border-line'
              }`}
            >
              <div className="relative">
                <img
                  src={`data:image/jpeg;base64,${frame.b64}`}
                  alt={`Frame ${i + 1}`}
                  className="w-full aspect-video object-cover"
                />
                {DEV_PREVIEW && poseSamples && (
                  <SkeletonOverlay
                    sample={nearestSample(poseSamples, frame.timeSec)}
                    fit="cover"
                  />
                )}
                {/* Labels */}
                <div className="absolute top-1 left-1 flex gap-1">
                  {frame.phase && (
                    <span className="px-1.5 py-0.5 bg-black/70 rounded text-[10px] font-bold uppercase tracking-wide">
                      {frame.phase}
                    </span>
                  )}
                  {frame.isSwingStart && (
                    <span className="px-1.5 py-0.5 bg-amber-600 rounded text-[10px] font-bold">
                      START
                    </span>
                  )}
                </div>
                <span className="absolute top-1 right-1 px-1.5 py-0.5 bg-black/70 rounded text-[10px] font-mono">
                  #{frame.candidateIndex}
                  {frame.timeSec !== undefined && ` · ${frame.timeSec.toFixed(2)}s`}
                </span>
              </div>

              {/* Frame-to-frame delta bar (rough "how much changed" indicator). */}
              <div className="bg-surface px-2 py-1.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted">Δ frame</span>
                  <span className="text-[10px] font-mono text-fg-dim">
                    {frame.score.toFixed(1)}
                  </span>
                </div>
                <div className="h-1 bg-raised rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      frame.score / maxScore > 0.6
                        ? 'bg-accent-hover'
                        : frame.score / maxScore > 0.3
                          ? 'bg-yellow-500'
                          : 'bg-faint'
                    }`}
                    style={{ width: `${(frame.score / maxScore) * 100}%` }}
                  />
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={handleDiscard}
            className="flex-1 py-3 bg-raised hover:bg-raised-hi rounded-lg text-sm font-medium transition-colors"
          >
            Discard
          </button>
          <button
            onClick={handleSend}
            className="flex-1 py-3 bg-accent-press hover:bg-accent rounded-lg text-sm font-medium transition-colors"
          >
            Send to Claude
          </button>
        </div>
      </div>

      {lightboxIndex !== null && meta[lightboxIndex] && (
        <FrameLightbox
          frames={meta}
          index={lightboxIndex}
          poseSamples={DEV_PREVIEW ? poseSamples : null}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </div>
  );
}

/** Dev verification surface for the envelope read (checkpoint 2 / D-3). Read-only:
 *  the grid above already renders the production selection; this reports the
 *  envelope boundaries it was derived from, or valid=false when production fell
 *  back to the pixel-diff motion path. */
function EnvelopeSummary({ envelope }: { envelope: SwingEnvelope | null }) {
  if (!envelope) return <p className="text-[10px] text-faint">pose read pending…</p>;
  const s = (n: number) => n.toFixed(2);
  return (
    <div className="rounded-lg bg-surface px-3 py-2 space-y-1 text-[10px] font-mono text-fg-dim">
      <div>
        {envelope.valid ? (
          <span className="text-emerald-400">pose envelope</span>
        ) : (
          <span className="text-amber-400">
            invalid → motion fallback ({envelope.reason ?? 'ambiguous'})
          </span>
        )}
        {envelope.valid && envelope.clippedTail && (
          <span className="text-amber-400"> · clipped tail</span>
        )}
      </div>
      {envelope.valid && (
        <>
          <div>
            envelope: [{s(envelope.startSec)} → {s(envelope.finishSec)}]{' '}
            {envelope.impact ? (
              <span className="text-emerald-300">
                · impact {s(envelope.impact.timeSec)}
              </span>
            ) : (
              <span className="text-amber-400">· no impact ({envelope.impactReason})</span>
            )}
          </div>
          <div>
            wrist: {envelope.trackedWrist} · vis {envelope.visibleFrac.toFixed(2)}
          </div>
        </>
      )}
    </div>
  );
}
