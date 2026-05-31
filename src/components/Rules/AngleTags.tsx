import { ANGLE_LABEL, CAMERA_ANGLES } from '../../lib/cameraAngle';
import type { CameraAngle } from '../../lib/cameraAngle';

/**
 * Small inline pills showing which angle(s) a rule applies to. The pill for the
 * currently-active angle is highlighted; others are muted. No `angles` = any angle.
 */
export function AngleTags({
  angles,
  active,
}: {
  angles?: CameraAngle[];
  active: CameraAngle;
}) {
  if (!angles || angles.length === 0) {
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-raised text-muted">
        Any
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1">
      {angles.map((a) => (
        <span
          key={a}
          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide ${
            a === active
              ? 'bg-accent-press/40 text-accent-text'
              : 'bg-raised text-faint'
          }`}
        >
          {ANGLE_LABEL[a]}
        </span>
      ))}
    </span>
  );
}

/** Multi-select angle picker used in the custom-rule form. */
export function AngleFormPicker({
  angles,
  onChange,
}: {
  angles: CameraAngle[];
  onChange: (next: CameraAngle[]) => void;
}) {
  const toggle = (a: CameraAngle) => {
    onChange(
      angles.includes(a) ? angles.filter((x) => x !== a) : [...angles, a],
    );
  };

  return (
    <div>
      <p className="text-[11px] text-faint mb-1">Verifiable from angle</p>
      <div className="flex gap-2">
        {CAMERA_ANGLES.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => toggle(a)}
            aria-pressed={angles.includes(a)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
              angles.includes(a)
                ? 'bg-accent-press text-on-accent'
                : 'bg-bg border border-line text-muted hover:text-fg'
            }`}
          >
            {ANGLE_LABEL[a]}
          </button>
        ))}
      </div>
    </div>
  );
}
