import { useEffect, useRef, useState } from 'react';
import { useSessionStore } from '../../store/session';
import { useRulesStore } from '../../store/rules';
import { useSettingsStore } from '../../store/settings';
import { AVAILABLE_LANGUAGES, getLanguageInfo } from '../../lib/languages';
import { useHistory } from '../../hooks/useHistory';
import { useT } from '../../lib/i18n';
import { FlagIcon } from './FlagIcon';

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
    <div className="flex flex-col h-full px-6 py-10 overflow-y-auto">
      {/* Language selector */}
      <div className="flex justify-end">
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={t('home.language')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface
                       hover:bg-raised border border-line text-sm transition-colors"
          >
            <FlagIcon code={current.code} />
            <span className="text-muted text-xs">▾</span>
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 mt-1 z-10 min-w-[10rem] rounded-lg overflow-hidden
                         border border-line bg-surface shadow-xl"
            >
              {AVAILABLE_LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => {
                    setLanguage(lang.code);
                    setMenuOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-sm text-left
                              transition-colors ${
                                language === lang.code
                                  ? 'bg-accent text-on-accent'
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

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <div className="w-20 h-20 rounded-2xl bg-accent-hover/10 border border-accent-text/30
                        flex items-center justify-center mb-6">
          <span className="text-4xl">🏌️</span>
        </div>
        <h1 className="text-3xl font-bold text-fg mb-2">SwingCheck</h1>
        <p className="text-muted max-w-xs">{t('home.tagline')}</p>

        <button
          onClick={() => setView('camera')}
          className="mt-8 w-full max-w-xs py-4 bg-accent hover:bg-accent-hover
                     rounded-2xl text-on-accent font-semibold text-lg transition-colors"
        >
          {t('home.cta')}
        </button>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3 mt-8">
        <button
          onClick={() => setView('rules')}
          className="p-4 rounded-xl bg-surface hover:bg-raised text-left transition-colors"
        >
          <p className="text-sm font-medium text-fg">{t('home.rules')}</p>
          <p className="text-xs text-muted mt-0.5">
            {t('home.rulesActive', { count: activeRules })}
          </p>
        </button>
        <button
          onClick={() => setView('history')}
          className="p-4 rounded-xl bg-surface hover:bg-raised text-left transition-colors"
        >
          <p className="text-sm font-medium text-fg">{t('home.history')}</p>
          <p className="text-xs text-muted mt-0.5">
            {t('home.historySaved', { count: records.length })}
          </p>
        </button>
      </div>
    </div>
  );
}
