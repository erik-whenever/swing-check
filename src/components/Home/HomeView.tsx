import { useEffect, useRef, useState } from 'react';
import { useSessionStore } from '../../store/session';
import { useRulesStore } from '../../store/rules';
import { useSettingsStore } from '../../store/settings';
import { AVAILABLE_LANGUAGES, getLanguageInfo } from '../../lib/languages';
import { useHistory } from '../../hooks/useHistory';
import { useT } from '../../lib/i18n';
import type { TranslationKey } from '../../lib/i18n';
import { FlagIcon } from './FlagIcon';
import { Button, Card } from '../ui';

/** Greeting for the current hour — the app is opened before a session as often as after. */
function greetingKey(hour: number): TranslationKey {
  if (hour < 11) return 'home.greeting.morning';
  if (hour < 17) return 'home.greeting.day';
  return 'home.greeting.evening';
}

export function HomeView() {
  const t = useT();
  const setView = useSessionStore((s) => s.setView);
  const activeRules = useRulesStore((s) => s.rules.filter((r) => r.active).length);
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const { records } = useHistory();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = getLanguageInfo(language);

  // Close the dropdown when clicking outside it.
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  return (
    <div className="flex flex-col h-full px-[18px] pt-2 pb-5 overflow-y-auto">
      {/* Language selector */}
      <div className="flex justify-end">
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={t('home.language')}
            aria-expanded={menuOpen}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-pill bg-raised
                       hover:bg-raised-hi text-sm transition-colors"
          >
            <FlagIcon code={current.code} />
            <span className="text-muted text-[10px] leading-none">▾</span>
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 mt-1.5 z-10 min-w-[10rem] rounded-card overflow-hidden
                         border border-line bg-surface shadow-lift"
            >
              {AVAILABLE_LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => {
                    setLanguage(lang.code);
                    setMenuOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2.5 text-sm text-left
                              transition-colors ${
                                language === lang.code
                                  ? 'bg-accent-tint text-accent-text font-semibold'
                                  : 'text-fg-dim hover:bg-raised'
                              }`}
                >
                  <FlagIcon code={lang.code} />
                  {lang.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Hero — left-aligned and generous. The greeting is the only thing here that
          changes between visits, which is what makes the screen read as "yours". */}
      <div className="flex-1 flex flex-col justify-center py-8">
        <h1 className="text-[31px] leading-[1.12] font-semibold tracking-[-0.02em] text-fg">
          {t(greetingKey(new Date().getHours()))}
          <br />
          {t('home.hero')}
          <br />
          <span className="text-accent-text">{t('home.heroAccent')}</span>
        </h1>
        <p className="mt-3.5 text-[12.5px] leading-[1.55] text-muted max-w-[19rem]">
          {t('home.tagline')}
        </p>
      </div>

      {/* The stats double as navigation: those numbers are the reason to tap through. */}
      <div className="flex gap-2">
        <StatCard
          value={activeRules}
          label={t('home.statRules')}
          accent
          onClick={() => setView('rules')}
        />
        <StatCard
          value={records.length}
          label={t('home.statSwings')}
          onClick={() => setView('history')}
        />
      </div>

      <Button size="lg" full className="mt-2.5" onClick={() => setView('camera')}>
        {t('home.cta')}
      </Button>
    </div>
  );
}

function StatCard({
  value,
  label,
  accent,
  onClick,
}: {
  value: number;
  label: string;
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <Card className="flex-1 active:scale-[0.99] transition-transform" padded={false}>
      <button onClick={onClick} className="w-full text-left p-3.5">
        <p className={`text-[19px] font-semibold tabular-nums ${accent ? 'text-accent-text' : 'text-fg'}`}>
          {value}
        </p>
        <p className="mt-0.5 text-[10px] text-muted">{label}</p>
      </button>
    </Card>
  );
}
