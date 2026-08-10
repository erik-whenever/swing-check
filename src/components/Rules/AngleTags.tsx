import { ANGLE_LABEL, CAMERA_ANGLES } from '../../lib/cameraAngle';
import type { CameraAngle } from '../../lib/cameraAngle';
import { useT } from '../../lib/i18n';
import { Chip } from '../ui';

/**
 * Which angle(s) a rule applies to. The angles are joined into ONE chip
 * ("Bakifrån · Framifrån") rather than one chip each — two adjacent pills read as
 * two separate facts, and the row already carries a phase chip next to them.
 */
export function AngleTags({
  angles,
  active,
}: {
  angles?: CameraAngle[];
  active: CameraAngle;
}) {
  if (!angles || angles.length === 0) {
    return <Chip tone="neutral">{ANGLE_LABEL.dtl} · {ANGLE_LABEL['face-on']}</Chip>;
  }
  return (
    <Chip tone={angles.includes(active) ? 'neutral' : 'outline'}>
      {angles.map((a) => ANGLE_LABEL[a]).join(' · ')}
    </Chip>
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
  const t = useT();
  const toggle = (a: CameraAngle) => {
    onChange(angles.includes(a) ? angles.filter((x) => x !== a) : [...angles, a]);
  };

  return (
    <div>
      <p className="eyebrow text-muted mb-1.5">{t('rules.form.angles')}</p>
      <div className="flex gap-2">
        {CAMERA_ANGLES.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => toggle(a)}
            aria-pressed={angles.includes(a)}
            className={`flex-1 py-2 rounded-pill text-xs font-semibold transition-colors ${
              angles.includes(a)
                ? 'bg-accent text-on-accent'
                : 'bg-raised text-muted hover:text-fg'
            }`}
          >
            {ANGLE_LABEL[a]}
          </button>
        ))}
      </div>
    </div>
  );
}
