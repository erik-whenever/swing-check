import { useState } from 'react';
import { RULE_LIBRARY } from '../../data/ruleLibrary';
import { useRulesStore } from '../../store/rules';
import { useSettingsStore } from '../../store/settings';
import { useToastStore } from '../../store/toast';
import { AngleTags } from './AngleTags';
import { ruleMatchesAngle, ANGLE_LABEL } from '../../lib/cameraAngle';
import { useT } from '../../lib/i18n';
import type { TranslationKey } from '../../lib/i18n';
import { PHASES } from '../../types';
import { Button, Card, SectionLabel } from '../ui';

export function RuleLibraryView() {
  const t = useT();
  const addFromLibrary = useRulesStore((s) => s.addFromLibrary);
  const hasLibraryRule = useRulesStore((s) => s.hasLibraryRule);
  const cameraAngle = useSettingsStore((s) => s.cameraAngle);
  const showToast = useToastStore((s) => s.show);
  const [expandedDrills, setExpandedDrills] = useState<Set<string>>(new Set());
  // Rules currently flying away: added to My Rules but still animating out of the list.
  const [flyingAway, setFlyingAway] = useState<Set<string>>(new Set());

  const toggleDrills = (id: string) => {
    setExpandedDrills((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = (rule: (typeof RULE_LIBRARY)[number]) => {
    addFromLibrary(rule);
    showToast(t('rules.added', { title: rule.title }));
    setFlyingAway((prev) => new Set(prev).add(rule.id));
  };

  const handleFlyAwayEnd = (id: string) => {
    setFlyingAway((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  // Show a rule unless it's already in My Rules — but keep it mounted while it flies away.
  // Rules matching the active angle are listed first so the list re-filters live with the toggle.
  const grouped = PHASES.map((phase) => ({
    phase,
    rules: RULE_LIBRARY.filter(
      (r) => r.phase === phase && (!hasLibraryRule(r.id) || flyingAway.has(r.id)),
    ).sort(
      (a, b) =>
        Number(ruleMatchesAngle(b, cameraAngle)) -
        Number(ruleMatchesAngle(a, cameraAngle)),
    ),
  })).filter((g) => g.rules.length > 0);

  if (grouped.length === 0) {
    return (
      <p className="text-sm text-muted text-center py-10 px-8 leading-relaxed">
        {t('rules.libraryEmpty')}
      </p>
    );
  }

  return (
    <div className="px-[18px] pb-6">
      {grouped.map(({ phase, rules }) => (
        <div key={phase} className="mb-5">
          <SectionLabel>{t(`phase.${phase}` as TranslationKey)}</SectionLabel>

          <div className="space-y-2">
            {rules.map((rule) => {
              const isFlyingAway = flyingAway.has(rule.id);
              const showDrills = expandedDrills.has(rule.id);
              const offAngle = !ruleMatchesAngle(rule, cameraAngle);

              return (
                <Card
                  key={rule.id}
                  tone={offAngle ? 'muted' : 'default'}
                  className={isFlyingAway ? 'animate-fly-away' : ''}
                >
                  <div
                    onAnimationEnd={(e) => {
                      if (e.animationName === 'fly-away') handleFlyAwayEnd(rule.id);
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <p className="text-[12.5px] font-semibold leading-snug flex-1">
                        {rule.title}
                      </p>
                      <AngleTags angles={rule.angles} active={cameraAngle} />
                    </div>

                    <p className="mt-1 text-[10.5px] leading-[1.45] text-muted">
                      {rule.description}
                    </p>

                    {/* A dimmed rule says WHY it is dimmed. "Greyed out with no reason"
                        is the most common dead end in this kind of list. */}
                    {offAngle && (
                      <p className="mt-2 text-[10.5px] text-faint">
                        {t('rules.notUsedAt', { angle: ANGLE_LABEL[cameraAngle] })}
                      </p>
                    )}

                    <div className="flex items-center gap-2 mt-2.5">
                      {rule.drills.length > 0 && (
                        <Button size="sm" variant="secondary" onClick={() => toggleDrills(rule.id)}>
                          {showDrills ? t('rules.hideDrills') : t('rules.showDrills')}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        className="ml-auto"
                        onClick={() => handleAdd(rule)}
                        disabled={isFlyingAway}
                      >
                        {t('rules.add')}
                      </Button>
                    </div>

                    {showDrills && (
                      <div className="mt-2.5 space-y-1.5">
                        {rule.drills.map((drill, i) => (
                          <div key={i} className="p-2.5 bg-raised rounded-chip">
                            <p className="text-[11px] font-semibold text-accent-text">
                              {drill.title}
                            </p>
                            <p className="mt-0.5 text-[10.5px] leading-[1.45] text-muted">
                              {drill.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      <p className="text-center text-[10.5px] text-muted pt-1">
        {t('rules.filtered', { angle: ANGLE_LABEL[cameraAngle] })}
      </p>
    </div>
  );
}
