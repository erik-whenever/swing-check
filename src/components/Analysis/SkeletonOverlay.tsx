import { POSE_CONNECTIONS } from '../../lib/poseConnections';
import type { PoseSample } from '../../lib/poseTrajectory';

/** Landmark below this visibility is treated as unreliable and not drawn. */
const MIN_VISIBILITY = 0.4;

interface Props {
  sample: PoseSample | null;
  /**
   * Match how the underlying <img> is fitted so the skeleton lines up:
   * - 'cover'   → object-cover  (SVG uses `xMidYMid slice`)
   * - 'contain' → the overlay fills a box already sized to the image, so the
   *   viewBox is stretched to it (`none`).
   */
  fit?: 'cover' | 'contain';
  className?: string;
}

/**
 * Draws the MediaPipe pose skeleton over a frame. Landmarks are normalized
 * (0–1) to the source video, mapped onto a 0–100 viewBox. Each bone is drawn as
 * a dark underlay + bright top stroke so it reads on any background. Strokes and
 * points use non-scaling units so they stay crisp at any tile/zoom size.
 */
export function SkeletonOverlay({ sample, fit = 'cover', className }: Props) {
  const landmarks = sample?.landmarks;
  if (!landmarks || landmarks.length === 0) return null;

  const visible = (i: number) => {
    const p = landmarks[i];
    return p && (p.visibility === undefined || p.visibility >= MIN_VISIBILITY);
  };

  const bones = POSE_CONNECTIONS.filter(([a, b]) => visible(a) && visible(b));

  return (
    <svg
      className={className ?? 'absolute inset-0 w-full h-full pointer-events-none'}
      viewBox="0 0 100 100"
      preserveAspectRatio={fit === 'cover' ? 'xMidYMid slice' : 'none'}
    >
      {/* Dark underlay for contrast */}
      {bones.map(([a, b], i) => (
        <line
          key={`u${i}`}
          x1={landmarks[a].x * 100}
          y1={landmarks[a].y * 100}
          x2={landmarks[b].x * 100}
          y2={landmarks[b].y * 100}
          stroke="rgba(0,0,0,0.85)"
          strokeWidth={5}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {/* Bright top stroke */}
      {bones.map(([a, b], i) => (
        <line
          key={`b${i}`}
          x1={landmarks[a].x * 100}
          y1={landmarks[a].y * 100}
          x2={landmarks[b].x * 100}
          y2={landmarks[b].y * 100}
          stroke="#34d399"
          strokeWidth={2.5}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {/* Joints */}
      {landmarks.map((p, i) =>
        visible(i) ? (
          <circle
            key={i}
            cx={p.x * 100}
            cy={p.y * 100}
            r={1.2}
            fill="#fbbf24"
            stroke="rgba(0,0,0,0.85)"
            strokeWidth={0.6}
          />
        ) : null,
      )}
    </svg>
  );
}
