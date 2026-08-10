import { useSettingsStore } from '../store/settings';
import { ANGLE_LABEL, CAMERA_ANGLES } from '../lib/cameraAngle';
import type { CameraAngle } from '../lib/cameraAngle';
import { Segmented } from './ui';

/** DTL | Face-on segmented toggle, bound to the global camera angle. */
export function AngleToggle() {
  const cameraAngle = useSettingsStore((s) => s.cameraAngle);
  const setCameraAngle = useSettingsStore((s) => s.setCameraAngle);

  return (
    <Segmented
      value={cameraAngle}
      onChange={setCameraAngle}
      size="sm"
      ariaLabel="Kameravinkel"
      options={CAMERA_ANGLES.map((angle) => ({ value: angle, label: ANGLE_LABEL[angle] }))}
    />
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
      className={`inline-flex items-center rounded-pill px-2.5 py-1 text-[10.5px] font-semibold
                  bg-surface/90 text-accent-text backdrop-blur ${className}`}
    >
      {ANGLE_LABEL[angle]}
    </span>
  );
}
