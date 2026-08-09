import { useEffect, useState, type ReactNode } from 'react';
import { useSettingsStore, ACCENTS } from '../../store/settings';
import { loadVoices, getSwedishVoices, primeSpeech, resolveVoice } from '../../lib/tts';
import type { Theme, Accent } from '../../store/settings';
import { useOnboardingStore } from '../../store/onboarding';
import { useSessionStore } from '../../store/session';
import { AVAILABLE_LANGUAGES } from '../../lib/languages';
import { CAMERA_ANGLES, ANGLE_LABEL } from '../../lib/cameraAngle';
import { FlagIcon } from '../Home/FlagIcon';
import { useT } from '../../lib/i18n';
import type { TranslationKey } from '../../lib/i18n';

const FEEDBACK_EMAIL = 'erik@whenever.se';

/** Representative color (the 500 shade) for each accent's preview swatch. */
const ACCENT_SWATCH: Record<Accent, string> = {
  emerald: '#10b981',
  blue: '#3b82f6',
  violet: '#8b5cf6',
  amber: '#f59e0b',
  rose: '#f43f5e',
};

const THEMES: Theme[] = ['system', 'light', 'dark'];

export function SettingsView() {
  const t = useT();
  const {
    theme, setTheme, accent, setAccent,
    language, setLanguage,
    ttsEnabled, setTtsEnabled, ttsMode, setTtsMode,
    cameraAngle, setCameraAngle,
  } = useSettingsStore();
  const resetOnboarding = useOnboardingStore((s) => s.reset);
  const setView = useSessionStore((s) => s.setView);

  return (
    <div className="h-full overflow-y-auto px-5 py-6 space-y-7">
      <h1 className="text-2xl font-bold text-fg">{t('settings.title')}</h1>

      {/* Appearance */}
      <Section title={t('settings.appearance')}>
        <Row label={t('settings.theme')}>
          <Segmented
            value={theme}
            options={THEMES.map((v) => ({ value: v, label: t(`settings.theme.${v}` as TranslationKey) }))}
            onChange={setTheme}
          />
        </Row>
        <Divider />
        <Row label={t('settings.accent')} stack>
          <div className="flex gap-3">
            {ACCENTS.map((a) => (
              <button
                key={a}
                onClick={() => setAccent(a)}
                aria-label={a}
                aria-pressed={accent === a}
                className={`w-9 h-9 rounded-full transition-transform ${
                  accent === a
                    ? 'ring-2 ring-offset-2 ring-offset-surface ring-fg scale-105'
                    : 'hover:scale-105'
                }`}
                style={{ backgroundColor: ACCENT_SWATCH[a] }}
              />
            ))}
          </div>
        </Row>
      </Section>

      {/* Language */}
      <Section title={t('settings.language')}>
        <div className="flex gap-2">
          {AVAILABLE_LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => setLanguage(lang.code)}
              aria-pressed={language === lang.code}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm
                          font-medium border transition-colors ${
                            language === lang.code
                              ? 'bg-accent text-on-accent border-accent'
                              : 'bg-raised text-fg-dim border-line hover:bg-raised-hi'
                          }`}
            >
              <FlagIcon code={lang.code} />
              {lang.label}
            </button>
          ))}
        </div>
      </Section>

      {/* Voice */}
      <Section title={t('settings.voice')}>
        <Row label={t('settings.voice.enable')}>
          {/* primeSpeech first, synchronously: this tap is the gesture iOS needs
              before any later analysis callback is allowed to speak. */}
          <Toggle
            on={ttsEnabled}
            onClick={() => {
              primeSpeech(true);
              setTtsEnabled(!ttsEnabled);
            }}
          />
        </Row>
        {ttsEnabled && (
          <>
            <Divider />
            <Row label={t('settings.voice.mode')}>
              <Segmented
                value={ttsMode}
                options={[
                  { value: 'quick', label: t('settings.voice.quick') },
                  { value: 'detailed', label: t('settings.voice.detailed') },
                ]}
                onChange={setTtsMode}
              />
            </Row>
            <Divider />
            <VoicePicker />
          </>
        )}
      </Section>

      {/* Camera */}
      <Section title={t('settings.camera')}>
        <Row label={t('settings.camera.angle')}>
          <Segmented
            value={cameraAngle}
            options={CAMERA_ANGLES.map((a) => ({ value: a, label: ANGLE_LABEL[a] }))}
            onChange={setCameraAngle}
          />
        </Row>
      </Section>

      {/* Help & feedback */}
      <Section title={t('settings.help')}>
        <button
          onClick={() => {
            resetOnboarding();
            setView('home');
          }}
          className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-fg
                     hover:bg-raised transition-colors"
        >
          <span className="text-accent-text">↻</span>
          {t('settings.replayOnboarding')}
        </button>
        <Divider />
        <a
          href={`mailto:${FEEDBACK_EMAIL}?subject=SwingCheck feedback`}
          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-raised transition-colors"
        >
          <span className="text-accent-text">✉</span>
          <span>
            <span className="block text-sm text-fg">{t('settings.feedback')}</span>
            <span className="block text-xs text-muted">{t('settings.feedbackSubtitle')}</span>
          </span>
        </a>
      </Section>

      <p className="text-center text-xs text-faint pt-2">{t('settings.about')}</p>
    </div>
  );
}

/**
 * Lets the user pick among available Swedish TTS voices, defaulting to automatic
 * best-Swedish selection. Voices load asynchronously (empty on iOS cold start), so we
 * resolve them via loadVoices() which retries until the list is populated.
 */
function VoicePicker() {
  const t = useT();
  const ttsVoiceURI = useSettingsStore((s) => s.ttsVoiceURI);
  const setTtsVoiceURI = useSettingsStore((s) => s.setTtsVoiceURI);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => getSwedishVoices());

  useEffect(() => {
    let active = true;
    loadVoices().then(() => {
      if (active) setVoices(getSwedishVoices());
    });
    return () => {
      active = false;
    };
  }, []);

  const activeVoice = resolveVoice();

  return (
    <Row label={t('settings.voice.voice')} stack>
      {voices.length === 0 ? (
        <p className="text-xs text-muted">{t('settings.voice.none')}</p>
      ) : (
        <>
          <select
            value={ttsVoiceURI ?? ''}
            onChange={(e) => setTtsVoiceURI(e.target.value || null)}
            className="w-full px-3 py-2 rounded-lg bg-raised text-fg border border-line text-sm
                       focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">{t('settings.voice.auto')}</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
          {activeVoice && (
            <p className="text-xs text-muted">{t('settings.voice.voice')}: {activeVoice.name}</p>
          )}
        </>
      )}
    </Row>
  );
}

/* ---- Small building blocks ---- */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="px-1 mb-2 text-xs font-semibold uppercase tracking-wider text-faint">
        {title}
      </h2>
      <div className="rounded-xl bg-surface border border-line overflow-hidden">{children}</div>
    </section>
  );
}

function Row({ label, children, stack }: { label: string; children: ReactNode; stack?: boolean }) {
  return (
    <div
      className={`px-4 py-3 ${
        stack ? 'space-y-3' : 'flex items-center justify-between gap-3'
      }`}
    >
      <span className="text-sm text-fg">{label}</span>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-line mx-4" />;
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={`relative w-11 h-6 rounded-full transition-colors ${
        on ? 'bg-accent' : 'bg-raised-hi'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          on ? 'translate-x-5' : ''
        }`}
      />
    </button>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

function Segmented<T extends string>({ value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="flex rounded-lg bg-raised p-0.5 text-xs font-semibold">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={`px-3 py-1.5 rounded-md transition-colors ${
            value === opt.value ? 'bg-accent text-on-accent' : 'text-muted hover:text-fg'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
