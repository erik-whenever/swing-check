import { useEffect, useMemo, useState } from 'react';
import { useSessionStore } from '../../store/session';
import { FrameLightbox } from './FrameLightbox';
import { SkeletonOverlay } from './SkeletonOverlay';
import { nearestSample } from '../../lib/poseSampling';
import type { PoseSample } from '../../lib/poseTrajectory';
import type { FrameMeta } from '../../lib/frameExtractor';
import { detectSwingPhases } from '../../lib/posePhases';
import {
  selectPhaseWeightedFrames,
  type PhaseWeightedSelection,
} from '../../lib/poseFrameSelection';
import { grabFramesAtTimes } from '../../lib/poseFrameGrab';
import { createLogger } from '../../lib/logger';

const DEV_PREVIEW = import.meta.env.VITE_DEV_PREVIEW === 'true';
const log = createLogger('PoseSelect');

type Strategy = 'even' | 'phase-weighted';

export function FramePreview() {
  const meta = useSessionStore((s) => s.currentFrameMeta);
  const videoBlob = useSessionStore((s) => s.currentVideoBlob);
  const setView = useSessionStore((s) => s.setView);
  const setIsAnalyzing = useSessionStore((s) => s.setIsAnalyzing);
  const setCurrentFrames = useSessionStore((s) => s.setCurrentFrames);
  const setCurrentFrameMeta = useSessionStore((s) => s.setCurrentFrameMeta);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Dev-only pose trajectory: run MediaPipe over the source clip and overlay the
  // skeleton on each extracted frame (nearest sample by timestamp).
  const [poseSamples, setPoseSamples] = useState<PoseSample[] | null>(null);
  const [poseStatus, setPoseStatus] = useState<'idle' | 'running' | 'done' | 'error'>(
    'idle',
  );

  // Pass 2 A/B: selection strategy. EVEN (Pass 1, from the store) is the default;
  // phase-weighted is the pose-driven experiment. This is preview-only — "Send to
  // Claude" always ships the store's even frames until Pass 3 wires it up.
  const [strategy, setStrategy] = useState<Strategy>('even');
  // Cache the grabbed frames against the selection they were built from, so a new
  // clip (which yields a fresh phaseSel) invalidates them without a reset effect.
  const [pw, setPw] = useState<{ selRef: PhaseWeightedSelection; frames: FrameMeta[] } | null>(
    null,
  );
  const [pwStatus, setPwStatus] = useState<'idle' | 'grabbing' | 'done' | 'error'>(
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

  // Pure phase read + allocation, recomputed when the trajectory changes. Cheap
  // (no DOM), so we do it eagerly; frame grabbing is deferred until requested.
  const phaseSel = useMemo<PhaseWeightedSelection | null>(() => {
    if (!poseSamples || poseSamples.length === 0) return null;
    const phases = detectSwingPhases(poseSamples);
    const budget = meta.length || 10;
    const spanStart = poseSamples[0].t;
    const spanEnd = poseSamples[poseSamples.length - 1].t;
    return selectPhaseWeightedFrames(phases, budget, spanStart, spanEnd);
  }, [poseSamples, meta.length]);

  // Grab the phase-weighted frames lazily, the first time the strategy is
  // switched on for this clip. Logs the verification summary (checkpoint 2).
  useEffect(() => {
    if (strategy !== 'phase-weighted' || !phaseSel || !videoBlob) return;
    if (pw?.selRef === phaseSel) return; // already grabbed for this selection
    let cancelled = false;
    (async () => {
      setPwStatus('grabbing');
      try {
        const times = phaseSel.picks.map((p) => p.t);
        const b64s = await grabFramesAtTimes(videoBlob, times);
        if (cancelled) return;
        const built: FrameMeta[] = phaseSel.picks.map((p, i) => ({
          b64: b64s[i],
          score: 0, // pose path has no pixel-diff score; bar is hidden below
          isAddress: p.phase === 'address',
          isSwingStart: i === 0,
          candidateIndex: i,
          phase: p.phase,
          timeSec: Number(p.t.toFixed(2)),
        }));
        setPw({ selRef: phaseSel, frames: built });
        setPwStatus('done');
        const ph = phaseSel.phases;
        log.warn('Phase-weighted selection', {
          usedPhaseWeighting: phaseSel.usedPhaseWeighting,
          fellBackToEven: phaseSel.fellBackToEven,
          reason: phaseSel.reason,
          trackedWrist: ph.trackedWrist,
          visibleFrac: Number(ph.visibleFrac.toFixed(2)),
          boundariesSec: {
            addressRef: Number(ph.addressRef.toFixed(2)),
            backswingStart: Number(ph.backswingStart.toFixed(2)),
            top: Number(ph.top.toFixed(2)),
            impact: Number(ph.impact.toFixed(2)),
            followStart: Number(ph.followThroughStart.toFixed(2)),
          },
          allocation: phaseSel.allocation,
          frameTimesSec: phaseSel.picks.map((p) => Number(p.t.toFixed(2))),
        });
        // STEG 1: per-sample dump so the REAL speed peak is visible vs where the
        // detector placed impact. Read `impactReason` + scan `frames` for the max
        // `spd` (and where `vy` flips from up to down) to locate true impact.
        if (ph.debug) {
          const d = ph.debug;
          log.warn('Phase per-frame trace', {
            addressY: Number(ph.addressY.toFixed(3)),
            apexY: Number(ph.apexY.toFixed(3)),
            peakSpeed: Number(ph.peakSpeed.toFixed(2)),
            picked: {
              addrEndIdx: d.addrEndIdx,
              bsIdx: d.bsIdx,
              topIdx: d.topIdx,
              impactIdx: d.impactIdx,
              impactReason: d.impactReason,
            },
            frames: d.frames.map((f, i) => ({
              i,
              t: Number(f.t.toFixed(2)),
              y: Number(f.y.toFixed(3)),
              vy: Number(f.vy.toFixed(2)),
              spd: Number(f.speed.toFixed(2)),
            })),
          });
        }
      } catch {
        if (!cancelled) setPwStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [strategy, phaseSel, videoBlob, pw]);

  const pwMeta = pw?.selRef === phaseSel ? pw.frames : null;
  const activeMeta = strategy === 'phase-weighted' ? (pwMeta ?? []) : meta;
  const showMotion = strategy === 'even';

  const maxScore = Math.max(...activeMeta.map((m) => m.score), 1);
  const swingStartIndex = activeMeta.findIndex((m) => m.isSwingStart);

  const handleSend = () => {
    setIsAnalyzing(true);
    setView('analysis');
  };

  const handleDiscard = () => {
    setCurrentFrames([]);
    setCurrentFrameMeta([]);
    setView('camera');
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

        {/* Pass 2 A/B: selection strategy toggle (dev only) */}
        {DEV_PREVIEW && (
          <div className="space-y-2">
            <div className="flex gap-2">
              {(['even', 'phase-weighted'] as Strategy[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStrategy(s)}
                  disabled={s === 'phase-weighted' && !phaseSel}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    strategy === s
                      ? 'bg-accent-press text-white'
                      : 'bg-raised hover:bg-raised-hi disabled:opacity-40'
                  }`}
                >
                  {s === 'even' ? 'Even (Pass 1)' : 'Phase-weighted (Pass 2)'}
                </button>
              ))}
            </div>
            {strategy === 'phase-weighted' && (
              <PhaseSummary sel={phaseSel} status={pwStatus} />
            )}
          </div>
        )}

        <p className="text-xs text-muted">
          {activeMeta.length} frames selected from recording. Swing start detected at
          candidate frame #
          {activeMeta.find((m) => m.isSwingStart)?.candidateIndex ?? '?'}. Tap any frame
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
          {activeMeta.map((frame, i) => (
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

              {/* Motion score bar (even/Pass 1 only — pose path has no pixel score) */}
              {showMotion && (
                <div className="bg-surface px-2 py-1.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-muted">motion</span>
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
              )}
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

      {lightboxIndex !== null && activeMeta[lightboxIndex] && (
        <FrameLightbox
          frames={activeMeta}
          index={lightboxIndex}
          poseSamples={DEV_PREVIEW ? poseSamples : null}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </div>
  );
}

/** Dev verification surface for the phase-weighted read (checkpoint 2). */
function PhaseSummary({
  sel,
  status,
}: {
  sel: PhaseWeightedSelection | null;
  status: 'idle' | 'grabbing' | 'done' | 'error';
}) {
  if (!sel) return <p className="text-[10px] text-faint">pose read pending…</p>;
  const alloc = Object.entries(sel.allocation)
    .map(([k, v]) => `${k}:${v}`)
    .join('  ');
  const p = sel.phases;
  const s = (n: number) => n.toFixed(2);
  return (
    <div className="rounded-lg bg-surface px-3 py-2 space-y-1 text-[10px] font-mono text-fg-dim">
      <div>
        {sel.usedPhaseWeighting ? (
          <span className="text-emerald-400">phase-weighted</span>
        ) : (
          <span className="text-amber-400">
            fell back to even ({sel.reason ?? 'ambiguous'})
          </span>
        )}
        {status === 'grabbing' && <span className="text-sky-400"> · grabbing…</span>}
        {status === 'error' && <span className="text-red-400"> · grab failed</span>}
      </div>
      <div>
        bounds: bs {s(p.backswingStart)} · top {s(p.top)} ·{' '}
        <span className="text-emerald-300">impact {s(p.impact)}</span> · ft{' '}
        {s(p.followThroughStart)}
      </div>
      <div>
        wrist: {p.trackedWrist} · vis {p.visibleFrac.toFixed(2)}
      </div>
      <div>alloc: {alloc || '—'}</div>
    </div>
  );
}
