import { useEffect, useState } from 'react';
import { useSessionStore } from '../../store/session';
import { FrameLightbox } from './FrameLightbox';
import { POSE_CONNECTIONS } from '../../lib/poseConnections';
import type { PoseSample } from '../../lib/poseTrajectory';

const DEV_PREVIEW = import.meta.env.VITE_DEV_PREVIEW === 'true';

/** Landmark below this visibility is treated as unreliable and not drawn. */
const MIN_VISIBILITY = 0.5;

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

  const maxScore = Math.max(...meta.map((m) => m.score), 1);
  const swingStartIndex = meta.findIndex((m) => m.isSwingStart);

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

        <p className="text-xs text-muted">
          {meta.length} frames selected from recording. Swing start detected at
          candidate frame #{meta.find((m) => m.isSwingStart)?.candidateIndex ?? '?'}.
          Tap any frame to zoom and inspect.
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

              {/* Motion score bar */}
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

      {lightboxIndex !== null && (
        <FrameLightbox
          frames={meta}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </div>
  );
}

/** The pose sample whose timestamp is closest to `timeSec` (undefined → none). */
function nearestSample(
  samples: PoseSample[],
  timeSec: number | undefined,
): PoseSample | null {
  if (samples.length === 0 || timeSec === undefined) return null;
  let best: PoseSample | null = null;
  let bestDist = Infinity;
  for (const s of samples) {
    const d = Math.abs(s.t - timeSec);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

/**
 * Draws the MediaPipe pose skeleton over a frame. Landmarks are normalized
 * (0–1) to the source video, so the SVG uses a 0–100 viewBox with
 * `xMidYMid slice` to match the img's `object-cover` cropping. Strokes/points
 * use non-scaling units so they stay crisp regardless of tile size.
 */
function SkeletonOverlay({ sample }: { sample: PoseSample | null }) {
  const landmarks = sample?.landmarks;
  if (!landmarks || landmarks.length === 0) return null;

  const visible = (i: number) => {
    const p = landmarks[i];
    return p && (p.visibility === undefined || p.visibility >= MIN_VISIBILITY);
  };

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
    >
      {POSE_CONNECTIONS.map(([a, b], i) =>
        visible(a) && visible(b) ? (
          <line
            key={i}
            x1={landmarks[a].x * 100}
            y1={landmarks[a].y * 100}
            x2={landmarks[b].x * 100}
            y2={landmarks[b].y * 100}
            stroke="#34d399"
            strokeWidth={2}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ) : null,
      )}
      {landmarks.map((p, i) =>
        visible(i) ? (
          <circle key={i} cx={p.x * 100} cy={p.y * 100} r={0.9} fill="#fbbf24" />
        ) : null,
      )}
    </svg>
  );
}
