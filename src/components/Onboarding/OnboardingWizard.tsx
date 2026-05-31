import { useEffect, useState } from 'react';
import { useT } from '../../lib/i18n';
import type { TranslationKey } from '../../lib/i18n';
import { useOnboardingStore } from '../../store/onboarding';
import {
  WelcomeArt,
  AngleArt,
  CameraArt,
  RulesArt,
  RecordArt,
} from './illustrations';

/** A bullet shown under the headline on detail steps. */
interface Point {
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
  /** Tailwind text colour for the leading dot, ties the point to its art. */
  accent: string;
}

interface Step {
  art: () => React.ReactElement;
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
  /** Pill shown over the hero (welcome step only). */
  tagKey?: TranslationKey;
  points?: Point[];
}

const STEPS: Step[] = [
  {
    art: WelcomeArt,
    titleKey: 'onb.welcome.title',
    bodyKey: 'onb.welcome.body',
    tagKey: 'onb.welcome.tag',
  },
  {
    art: AngleArt,
    titleKey: 'onb.angle.title',
    bodyKey: 'onb.angle.body',
    points: [
      { titleKey: 'onb.angle.dtl', bodyKey: 'onb.angle.dtlBody', accent: 'bg-accent-text' },
      { titleKey: 'onb.angle.faceOn', bodyKey: 'onb.angle.faceOnBody', accent: 'bg-sky-400' },
    ],
  },
  {
    art: CameraArt,
    titleKey: 'onb.camera.title',
    bodyKey: 'onb.camera.body',
    points: [
      { titleKey: 'onb.camera.distance', bodyKey: 'onb.camera.distanceBody', accent: 'bg-accent-text' },
      { titleKey: 'onb.camera.height', bodyKey: 'onb.camera.heightBody', accent: 'bg-accent-text' },
      { titleKey: 'onb.camera.light', bodyKey: 'onb.camera.lightBody', accent: 'bg-amber-400' },
    ],
  },
  {
    art: RulesArt,
    titleKey: 'onb.rules.title',
    bodyKey: 'onb.rules.body',
    points: [
      { titleKey: 'onb.rules.library', bodyKey: 'onb.rulesBody1', accent: 'bg-accent-text' },
      { titleKey: 'onb.rules.custom', bodyKey: 'onb.rulesBody2', accent: 'bg-accent-text' },
    ],
  },
  {
    art: RecordArt,
    titleKey: 'onb.record.title',
    bodyKey: 'onb.record.body',
    points: [
      { titleKey: 'onb.record.voice', bodyKey: 'onb.recordBody1', accent: 'bg-accent-text' },
      { titleKey: 'onb.record.range', bodyKey: 'onb.recordBody2', accent: 'bg-accent-text' },
    ],
  },
];

export function OnboardingWizard() {
  const t = useT();
  const complete = useOnboardingStore((s) => s.complete);
  const [index, setIndex] = useState(0);
  /** -1 = entered from the left (back), 1 = from the right (next). */
  const [dir, setDir] = useState(1);
  const [closing, setClosing] = useState(false);

  const step = STEPS[index];
  const Art = step.art;
  const isLast = index === STEPS.length - 1;
  const total = STEPS.length;

  // Allow Esc to skip and arrow keys to navigate.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  function go(delta: number) {
    const next = index + delta;
    if (next < 0 || next >= total) return;
    setDir(delta);
    setIndex(next);
  }

  function finish() {
    if (closing) return;
    setClosing(true);
    // Let the exit animation play before unmounting.
    window.setTimeout(complete, 280);
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center
                  bg-slate-950/70 backdrop-blur-sm px-4 py-4
                  ${closing ? 'animate-onb-backdrop-out' : 'animate-onb-backdrop-in'}`}
      role="dialog"
      aria-modal="true"
      aria-label={t(step.titleKey)}
    >
      <div
        className={`relative w-full max-w-[420px] overflow-hidden rounded-3xl border border-white/10
                    bg-slate-900 shadow-2xl shadow-accent-press/40
                    ${closing ? 'animate-onb-card-out' : 'animate-onb-card-in'}`}
      >
        {/* Skip */}
        {!isLast && (
          <button
            onClick={finish}
            className="absolute right-4 top-4 z-10 rounded-full px-3 py-1 text-xs font-medium
                       text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
          >
            {t('onb.skip')}
          </button>
        )}

        {/* Hero illustration */}
        <div className="relative h-52 overflow-hidden bg-gradient-to-b from-slate-800/60 to-slate-900">
          <div
            className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2
                       rounded-full bg-accent-hover/20 blur-3xl"
          />
          <div key={index} className={dir >= 0 ? 'animate-onb-art-next h-full' : 'animate-onb-art-prev h-full'} aria-hidden="true">
            <div className="mx-auto h-full max-w-[280px] px-6 py-4">
              <Art />
            </div>
          </div>
          {step.tagKey && (
            <span
              className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-accent-text/30
                         bg-accent-hover/10 px-3 py-1 text-[11px] font-semibold tracking-wide text-accent-text"
            >
              {t(step.tagKey)}
            </span>
          )}
        </div>

        {/* Body */}
        <div className="px-6 pb-6 pt-5">
          {/* Progress dots */}
          <div className="mb-5 flex items-center gap-2">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => {
                  setDir(i > index ? 1 : -1);
                  setIndex(i);
                }}
                aria-label={t('onb.stepOf', { current: i + 1, total })}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === index
                    ? 'w-7 bg-accent-text'
                    : i < index
                      ? 'w-1.5 bg-accent-press'
                      : 'w-1.5 bg-slate-700'
                }`}
              />
            ))}
          </div>

          <div key={index} className={dir >= 0 ? 'animate-onb-text-next' : 'animate-onb-text-prev'}>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-accent-text/80">
              {t('onb.stepOf', { current: index + 1, total })}
            </p>
            <h2 className="text-2xl font-bold leading-tight text-white">{t(step.titleKey)}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{t(step.bodyKey)}</p>

            {step.points && (
              <ul className="mt-4 space-y-3">
                {step.points.map((p) => (
                  <li key={p.titleKey} className="flex gap-3 rounded-xl bg-slate-800/60 p-3">
                    <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${p.accent}`} />
                    <div>
                      <p className="text-sm font-semibold text-white">{t(p.titleKey)}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{t(p.bodyKey)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Controls */}
          <div className="mt-6 flex items-center gap-3">
            {index > 0 && (
              <button
                onClick={() => go(-1)}
                className="rounded-xl px-4 py-3 text-sm font-semibold text-slate-300
                           transition-colors hover:bg-white/5"
              >
                {t('onb.back')}
              </button>
            )}
            <button
              onClick={() => (isLast ? finish() : go(1))}
              className="ml-auto flex-1 rounded-xl bg-accent py-3 text-sm font-semibold text-white
                         shadow-lg shadow-accent-press/40 transition-colors hover:bg-accent-hover
                         active:scale-[0.99]"
            >
              {isLast ? t('onb.start') : t('onb.next')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
