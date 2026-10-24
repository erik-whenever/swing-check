// Skeleton over the camera preview, to check test O (pose-android.md §7): the landmarks land
// on the person with the phone both upright and on its side, and 16 (right wrist) is on the
// person's right.
//
// The landmarks are normalized to the upright image the module fed MediaPipe. To draw them, each
// point goes back to the unrotated camera buffer (undoing ImageInfo.rotationDegrees), then through
// VisionCamera's own transforms: buffer → sensor (Frame.convertFramePointToCameraPoint) and
// sensor → preview view (CameraRef.convertCameraPointToViewPoint). Both are affine, so three
// buffer corners give the whole map. That holds even when the preview stream has another aspect
// ratio (and so another crop of the sensor) than the 16:9 frame output.
import { StyleSheet, Text, View } from 'react-native';

/** Three buffer corners, (0,0), (W,0), (0,H), in preview-view coordinates (dp). */
export interface BufferToView {
  o: { x: number; y: number };
  u: { x: number; y: number };
  v: { x: number; y: number };
}

/** Upright normalized (x, y) → normalized point in the unrotated buffer, for rotation r. */
export function uprightToBuffer(x: number, y: number, rotation: number): [number, number] {
  switch (rotation) {
    case 90:
      return [y, 1 - x];
    case 180:
      return [1 - x, 1 - y];
    case 270:
      return [1 - y, x];
    default:
      return [x, y];
  }
}

function toView(map: BufferToView, x: number, y: number, rotation: number) {
  const [a, b] = uprightToBuffer(x, y, rotation);
  return {
    x: map.o.x + a * (map.u.x - map.o.x) + b * (map.v.x - map.o.x),
    y: map.o.y + a * (map.u.y - map.o.y) + b * (map.v.y - map.o.y),
  };
}

// MediaPipe's pose connections (body and a minimal face).
const EDGES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10],
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [15, 17], [15, 19], [15, 21], [17, 19], [16, 18], [16, 20], [16, 22], [18, 20],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31], [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
];
const LEFT = '#4dd0e1';
const RIGHT = '#ff9800';
/** Odd indices are the person's left, even (from 12) the right; 0–10 are the face. */
const sideColor = (i: number) => (i <= 10 ? '#ffffff' : i % 2 === 1 ? LEFT : RIGHT);

export interface OverlayPose {
  /** 33 × (x, y), upright normalized. */
  xy: number[];
  rotation: number;
}

export function SkeletonOverlay({ pose, map }: { pose: OverlayPose | null; map: BufferToView | null }) {
  if (pose == null || map == null || pose.xy.length < 66) return null;
  const p = Array.from({ length: 33 }, (_, i) => toView(map, pose.xy[2 * i], pose.xy[2 * i + 1], pose.rotation));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {EDGES.map(([a, b]) => {
        const dx = p[b].x - p[a].x;
        const dy = p[b].y - p[a].y;
        const len = Math.hypot(dx, dy);
        return (
          <View
            key={`${a}-${b}`}
            style={[
              styles.edge,
              {
                left: (p[a].x + p[b].x) / 2 - len / 2,
                top: (p[a].y + p[b].y) / 2 - 1,
                width: len,
                backgroundColor: a >= 11 && a % 2 === b % 2 ? sideColor(a) : '#ffffffaa',
                transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
              },
            ]}
          />
        );
      })}
      {p.map((q, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i === 16 && styles.rightWrist,
            { left: q.x - (i === 16 ? 7 : 4), top: q.y - (i === 16 ? 7 : 4), backgroundColor: sideColor(i) },
          ]}
        />
      ))}
      <Text style={[styles.label, { left: p[16].x + 9, top: p[16].y - 9 }]}>16 H</Text>
      <Text style={[styles.label, { left: p[15].x + 7, top: p[15].y - 9, color: LEFT }]}>15 V</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  edge: { position: 'absolute', height: 2 },
  dot: { position: 'absolute', width: 8, height: 8, borderRadius: 4 },
  rightWrist: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#000' },
  label: { position: 'absolute', color: RIGHT, fontSize: 12, fontWeight: '700' },
});
