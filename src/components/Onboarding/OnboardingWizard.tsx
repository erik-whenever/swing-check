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
  /** true = the one thing this step is really pointing at (gold dot). */
  highlight?: boolean;
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
      { titleKey: 'onb.angle.dtl', bodyKey: 'onb.angle.dtlBody' },
      { titleKey: 'onb.angle.faceOn', bodyKey: 'onb.angle.faceOnBody', highlight: true },
    ],
  },
  {
    art: CameraArt,
    titleKey: 'onb.camera.title',
    bodyKey: 'onb.camera.body',
    points: [
      { titleKey: 'onb.camera.distance', bodyKey: 'onb.camera.distanceBody' },
      { titleKey: 'onb.camera.height', bodyKey: 'onb.camera.heightBody', highlight: true },
      { titleKey: 'onb.camera.light', bodyKey: 'onb.camera.lightBody' },
    ],
  },
  {
    art: RulesArt,
    titleKey: 'onb.rules.title',
    bodyKey: 'onb.rules.body',
    points: [
      { titleKey: 'onb.rules.library', bodyKey: 'onb.rulesBody1' },
      { titleKey: 'onb.rules.custom', bodyKey: 'onb.rulesBody2' },
    ],
  },
  {
    art: RecordArt,
    titleKey: 'onb.record.title',
    bodyKey: 'onb.record.body',
    points: [
      { titleKey: 'onb.record.voice', bodyKey: 'onb.recordBody1' },
      { titleKey: 'onb.record.range', bodyKey: 'onb.recordBody2' },
    ],
  },
];

/**
 * First-run tour, full-bleed fairway green.
 *
 * It used to be a modal card floating on a dimmed app. Full-bleed is the better
 * choice for a first run: there is no app behind it worth peeking at yet, and the
 * one screen a new user sees before anything else should state what the product
 * is — a calm, green, club-house thing — rather than obscure it.
 */
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
      className={`fixed inset-0 z-50 flex justify-center bg-[#1d5c3d] text-[#f5f1e8]
                  ${closing ? 'animate-onb-backdrop-out' : 'animate-onb-backdrop-in'}`}
      role="dialog"
      aria-modal="true"
      aria-label={t(step.titleKey)}
    >
      <div
        className={`flex w-full max-w-[430px] flex-col safe-top safe-bottom
                    ${closing ? 'animate-onb-card-out' : 'animate-onb-card-in'}`}
      >
        {/* Progress bars + skip */}
        <div className="flex items-center justify-between gap-3 px-[18px] pt-4">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => {
                  setDir(i > index ? 1 : -1);
                  setIndex(i);
                }}
                aria-label={t('onb.stepOf', { current: i + 1, total })}
                className={`h-1 rounded-pill transition-all duration-300 ${
                  i === index ? 'w-6 bg-[#f5f1e8]' : 'w-4 bg-[#f5f1e8]/30'
                }`}
              />
            ))}
          </div>
          {!isLast && (
            <button
              onClick={finish}
              className="text-[11px] font-medium text-[#f5f1e8]/60 transition-colors hover:text-[#f5f1e8]"
            >
              {t('onb.skip')}
            </button>
          )}
        </div>

        {/* Hero illustration */}
        <div className="relative flex min-h-0 flex-1 items-center justify-center px-6 pt-4">
          <div
            key={index}
            className={dir >= 0 ? 'animate-onb-art-next h-full w-full' : 'animate-onb-art-prev h-full w-full'}
            aria-hidden="true"
          >
            <div className="mx-auto h-full max-h-[230px] max-w-[260px]">
              <Art />
            </div>
          </div>
        </div>

        {/* Body */}
        <div key={`t-${index}`} className={`px-6 pb-2 text-center ${dir >= 0 ? 'animate-onb-text-next' : 'animate-onb-text-prev'}`}>
          {step.tagKey && (
            <span className="mb-3 inline-block rounded-pill bg-[#f5f1e8]/12 px-3 py-1
                             text-[11px] font-semibold tracking-wide text-[#f5f1e8]/85">
              {t(step.tagKey)}
            </span>
          )}
          <h2 className="text-[24px] font-semibold leading-[1.15] tracking-[-0.01em]">
            {t(step.titleKey)}
          </h2>
          <p className="mx-auto mt-2.5 max-w-[19rem] text-[12.5px] leading-[1.55] text-[#f5f1e8]/75">
            {t(step.bodyKey)}
          </p>

          {step.points && (
            <ul className="mt-4 space-y-2 text-left">
              {step.points.map((p) => (
                <li key={p.titleKey} className="flex gap-3 rounded-card bg-[#f5f1e8]/8 px-3.5 py-3">
                  <span
                    className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                      p.highlight ? 'bg-[#e0bd76]' : 'bg-[#f5f1e8]/70'
                    }`}
                  />
                  <div>
                    <p className="text-[12.5px] font-semibold">{t(p.titleKey)}</p>
                    <p className="mt-0.5 text-[10.5px] leading-[1.45] text-[#f5f1e8]/70">
                      {t(p.bodyKey)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Controls — inverted primary: cream fill, green label, on a green ground. */}
        <div className="flex items-center gap-3 px-[18px] pb-4 pt-3">
          {index > 0 && (
            <button
              onClick={() => go(-1)}
              className="rounded-pill px-4 py-3.5 text-xs font-semibold text-[#f5f1e8]/75
                         transition-colors hover:bg-[#f5f1e8]/10"
            >
              {t('onb.back')}
            </button>
          )}
          <button
            onClick={() => (isLast ? finish() : go(1))}
            className="ml-auto flex-1 rounded-pill bg-[#f5f1e8] py-3.5 text-sm font-semibold
                       text-[#1d5c3d] transition-transform active:scale-[0.99]"
          >
            {isLast ? t('onb.start') : t('onb.next')}
          </button>
        </div>
      </div>
    </div>
  );
}
