// Everything about HOW a recording behaves that is not the mode itself.
//
// These used to be a horizontally scrolling chip row on the camera view, where a
// persistent setting (countdown), an output choice (voice) and an input method
// (headset button) all wore the same pill and looked like peers of the one decision
// that actually changes what the record button does. They are settings; the mode is
// a mode. So they live behind a gear, and the camera view keeps three things:
// viewfinder, mode, record.

import { useEffect, useRef } from 'react';
import { useSettingsStore } from '../../store/settings';
import { primeSpeech } from '../../lib/tts';
import { CountdownStepper } from './CountdownStepper';
import { useT } from '../../lib/i18n';
import { Segmented, Toggle } from '../ui';

export function RecordSettingsSheet({
  open,
  onClose,
  rangeMode,
  onToggleRangeMode,
  sessionActive,
  countdownDisabled,
}: {
  open: boolean;
  onClose: () => void;
  rangeMode: boolean;
  onToggleRangeMode: () => void;
  /** In a session the headset loop is held open for us, so its switch is locked on. */
  sessionActive: boolean;
  countdownDisabled?: boolean;
}) {
  const t = useT();
  const ttsEnabled = useSettingsStore((s) => s.ttsEnabled);
  const setTtsEnabled = useSettingsStore((s) => s.setTtsEnabled);
  const ttsMode = useSettingsStore((s) => s.ttsMode);
  const setTtsMode = useSettingsStore((s) => s.setTtsMode);
  const countdownSeconds = useSettingsStore((s) => s.countdownSeconds);
  const setCountdownSeconds = useSettingsStore((s) => s.setCountdownSeconds);

  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes. The sheet holds no destructive action, so a stray tap on the
  // backdrop closing it is the right cost/benefit.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <button
        aria-label={t('camera.settings.close')}
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t('camera.settings')}
        className="relative w-full max-w-[430px] rounded-t-[22px] border-t border-line bg-surface
                   shadow-lift outline-none safe-bottom"
      >
        <div className="flex items-center justify-between px-[18px] pt-3.5 pb-2">
          <h2 className="text-[13px] font-semibold text-fg">{t('camera.settings')}</h2>
          <button
            onClick={onClose}
            className="rounded-pill px-3 py-1 text-[11px] font-semibold text-accent-text
                       hover:bg-accent-tint transition-colors"
          >
            {t('camera.settings.close')}
          </button>
        </div>

        <div className="px-[18px] pb-4 space-y-0.5">
          <SheetRow label={t('camera.settings.countdown')} hint={t('camera.settings.countdownHint')}>
            <CountdownStepper
              value={countdownSeconds}
              onChange={setCountdownSeconds}
              disabled={countdownDisabled}
            />
          </SheetRow>

          <Divider />

          {/* primeSpeech first, synchronously: this tap is the gesture iOS needs before
              any later analysis callback is allowed to speak. */}
          <SheetRow label={t('settings.voice.enable')}>
            <Toggle
              on={ttsEnabled}
              label={t('settings.voice.enable')}
              onClick={() => {
                primeSpeech(true);
                setTtsEnabled(!ttsEnabled);
              }}
            />
          </SheetRow>

          {ttsEnabled && (
            <SheetRow label={t('settings.voice.mode')}>
              <Segmented
                size="sm"
                value={ttsMode}
                onChange={setTtsMode}
                options={[
                  { value: 'quick', label: t('settings.voice.quick') },
                  { value: 'detailed', label: t('settings.voice.detailed') },
                ]}
              />
            </SheetRow>
          )}

          <Divider />

          <SheetRow
            label={t('camera.settings.remote')}
            hint={
              sessionActive
                ? t('camera.settings.remoteInSession')
                : t('camera.settings.remoteHint')
            }
          >
            <Toggle
              on={rangeMode}
              label={t('camera.settings.remote')}
              onClick={() => {
                // Same forced prime as the session toggle: the loop and the speech
                // engine are both unlocked by this one gesture.
                primeSpeech(true);
                if (!sessionActive) onToggleRangeMode();
              }}
            />
          </SheetRow>
        </div>
      </div>
    </div>
  );
}

function SheetRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <span className="min-w-0">
        <span className="block text-xs font-medium text-fg">{label}</span>
        {hint && <span className="mt-0.5 block text-[10.5px] leading-[1.45] text-muted">{hint}</span>}
      </span>
      <span className="flex-none pt-0.5">{children}</span>
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-line" />;
}
