import { useState } from 'react';
import { RULE_LIBRARY } from '../../data/ruleLibrary';
import { useRulesStore } from '../../store/rules';
import { useSettingsStore } from '../../store/settings';
import { useToastStore } from '../../store/toast';
import { RuleBadge } from './RuleBadge';
import { AngleTags } from './AngleTags';
import { ruleMatchesAngle, ANGLE_LABEL } from '../../lib/cameraAngle';
import { PHASES } from '../../types';

export function RuleLibraryView() {
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
    showToast(`Added "${rule.title}" to My Rules`);
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
      (r) =>
        r.phase === phase && (!hasLibraryRule(r.id) || flyingAway.has(r.id))
    ).sort(
      (a, b) =>
        Number(ruleMatchesAngle(b, cameraAngle)) -
        Number(ruleMatchesAngle(a, cameraAngle)),
    ),
  })).filter((g) => g.rules.length > 0);

  return (
    <div className="p-4 space-y-6">
      {grouped.map(({ phase, rules }) => (
        <div key={phase}>
          <div className="flex items-center gap-2 mb-3">
            <RuleBadge phase={phase} />
            <span className="text-xs text-slate-500 uppercase tracking-wide">
              {rules.length} rules
            </span>
          </div>

          <div className="space-y-2">
            {rules.map((rule) => {
              const isFlyingAway = flyingAway.has(rule.id);
              const showDrills = expandedDrills.has(rule.id);
              const offAngle = !ruleMatchesAngle(rule, cameraAngle);

              return (
                <div
                  key={rule.id}
                  onAnimationEnd={(e) => {
                    if (e.animationName === 'fly-away') handleFlyAwayEnd(rule.id);
                  }}
                  className={`p-3 bg-slate-800 rounded-lg border border-slate-700 text-left ${
                    isFlyingAway ? 'animate-fly-away' : ''
                  } ${offAngle ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{rule.title}</span>
                        <AngleTags angles={rule.angles} active={cameraAngle} />
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {rule.description}
                      </p>
                      {offAngle && (
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Not used at {ANGLE_LABEL[cameraAngle]} angle
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => toggleDrills(rule.id)}
                      className="px-2 py-1 text-[11px] bg-slate-700 hover:bg-slate-600 rounded transition-colors"
                    >
                      {showDrills ? 'Hide Drills' : 'View Drills'}
                    </button>
                    <button
                      onClick={() => handleAdd(rule)}
                      disabled={isFlyingAway}
                      className="px-2 py-1 text-[11px] rounded transition-colors bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-60"
                    >
                      Add to My Rules
                    </button>
                  </div>

                  {showDrills && (
                    <div className="mt-2 space-y-1.5">
                      {rule.drills.map((drill, i) => (
                        <div
                          key={i}
                          className="p-2 bg-slate-900 rounded border border-slate-700/50"
                        >
                          <p className="text-xs font-medium text-emerald-400">
                            {drill.title}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {drill.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
