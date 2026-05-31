import { useSettingsStore } from '../store/settings';
import { ANGLE_LABEL, CAMERA_ANGLES } from '../lib/cameraAngle';
import type { CameraAngle } from '../lib/cameraAngle';

/** DTL | Face-on segmented toggle, bound to the global camera angle. */
export function AngleToggle() {
  const cameraAngle = useSettingsStore((s) => s.cameraAngle);
  const setCameraAngle = useSettingsStore((s) => s.setCameraAngle);

  return (
    <div
      role="group"
      aria-label="Camera angle"
      className="flex rounded-lg overflow-hidden border border-slate-700 text-xs font-semibold"
    >
      {CAMERA_ANGLES.map((angle) => (
        <button
          key={angle}
          onClick={() => setCameraAngle(angle)}
          aria-pressed={cameraAngle === angle}
          className={`px-3 py-1.5 transition-colors ${
            cameraAngle === angle
              ? 'bg-emerald-600 text-white'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
          }`}
        >
          {ANGLE_LABEL[angle]}
        </button>
      ))}
    </div>
  );
}

/** Small static pill showing a single angle (for viewfinder / badges). */
export function AnglePill({
  angle,
  className = '',
}: {
  angle: CameraAngle;
  className?: string;
}) {
  return (
    <span
      className={`px-2 py-0.5 rounded-full bg-slate-900/80 border border-emerald-500/60
                  text-[11px] font-bold text-emerald-300 tracking-wide ${className}`}
    >
      {ANGLE_LABEL[angle]}
    </span>
  );
}
