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
import { SectionLabel, Segmented, Toggle } from '../ui';

const FEEDBACK_EMAIL = 'erik@whenever.se';

/** Preview swatch per accent — the 600 shade, i.e. what a filled button looks like. */
const ACCENT_SWATCH: Record<Accent, string> = {
  emerald: '#1d5c3d',
  blue: '#31567d',
  violet: '#6d4f7d',
  amber: '#c9a24b',
  rose: '#a34432',
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
    <div className="h-full overflow-y-auto px-[18px] pt-2 pb-6 space-y-5">
      <h1 className="text-base font-semibold text-fg">{t('settings.title')}</h1>

      {/* Appearance */}
      <Section title={t('settings.appearance')}>
        <Row label={t('settings.theme')}>
          <Segmented
            size="sm"
            value={theme}
            options={THEMES.map((v) => ({
              value: v,
              label: t(`settings.theme.${v}` as TranslationKey),
            }))}
            onChange={setTheme}
          />
        </Row>
        <Divider />
        <Row label={t('settings.accent')} stack>
          <div className="flex gap-2.5">
            {ACCENTS.map((a) => (
              <button
                key={a}
                onClick={() => setAccent(a)}
                aria-label={a}
                aria-pressed={accent === a}
                className={`w-[26px] h-[26px] rounded-full transition-transform ${
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
        <div className="flex gap-2 p-3">
          {AVAILABLE_LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => setLanguage(lang.code)}
              aria-pressed={language === lang.code}
              className={`flex flex-1 items-center justify-center gap-2 rounded-pill py-2.5
                          text-xs font-semibold transition-colors ${
                            language === lang.code
                              ? 'bg-accent text-on-accent'
                              : 'bg-raised text-muted hover:text-fg'
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
            label={t('settings.voice.enable')}
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
                size="sm"
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
            size="sm"
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
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-xs font-medium
                     text-fg hover:bg-raised transition-colors"
        >
          <span className="text-accent-text">↻</span>
          {t('settings.replayOnboarding')}
        </button>
        <Divider />
        <a
          href={`mailto:${FEEDBACK_EMAIL}?subject=SwingCheck feedback`}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-raised transition-colors"
        >
          <span className="text-accent-text">✉</span>
          <span>
            <span className="block text-xs font-medium text-fg">{t('settings.feedback')}</span>
            <span className="block text-[10.5px] text-muted">{t('settings.feedbackSubtitle')}</span>
          </span>
        </a>
      </Section>

      <p className="pt-1 text-center text-[9.5px] text-faint">{t('settings.about')}</p>
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
        <p className="text-[10.5px] text-muted">{t('settings.voice.none')}</p>
      ) : (
        <>
          <select
            value={ttsVoiceURI ?? ''}
            onChange={(e) => setTtsVoiceURI(e.target.value || null)}
            className="w-full rounded-chip bg-raised px-3 py-2.5 text-xs text-fg
                       focus:outline-none focus:ring-2 focus:ring-accent/50"
          >
            <option value="">{t('settings.voice.auto')}</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
          {activeVoice && (
            <p className="text-[10.5px] text-muted">
              {t('settings.voice.voice')}: {activeVoice.name}
            </p>
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
      <SectionLabel>{title}</SectionLabel>
      <div className="rounded-card border border-line bg-surface shadow-card overflow-hidden">
        {children}
      </div>
    </section>
  );
}

function Row({ label, children, stack }: { label: string; children: ReactNode; stack?: boolean }) {
  return (
    <div
      className={`px-4 py-3 ${stack ? 'space-y-2.5' : 'flex items-center justify-between gap-3'}`}
    >
      <span className="text-xs font-medium text-fg">{label}</span>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="mx-4 h-px bg-line" />;
}
