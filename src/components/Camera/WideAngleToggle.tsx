import { useSettingsStore } from '../../store/settings';
import { Segmented } from '../ui';

/**
 * 0.5× | 1× toggle, bound to the global wide-angle setting. Same shape as
 * `AngleToggle` — this is a framing control and belongs next to the angle.
 *
 * It stays enabled while recording on purpose: the value is picked up at the next
 * recording start (see `useCamera`), so a mid-session change is remembered rather
 * than blocked.
 */
export function WideAngleToggle() {
  const wideAngle = useSettingsStore((s) => s.wideAngle);
  const setWideAngle = useSettingsStore((s) => s.setWideAngle);

  return (
    <Segmented
      size="sm"
      ariaLabel="Vidvinkel"
      value={wideAngle ? 'wide' : 'normal'}
      onChange={(v) => setWideAngle(v === 'wide')}
      options={[
        { value: 'wide', label: '0.5×' },
        { value: 'normal', label: '1×' },
      ]}
    />
  );
}
