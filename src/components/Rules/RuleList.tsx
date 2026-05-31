import { useRulesStore } from '../../store/rules';
import { useSessionStore } from '../../store/session';
import { RuleBadge } from './RuleBadge';

export function RuleList() {
  const rules = useRulesStore((s) => s.rules);
  const toggleRule = useRulesStore((s) => s.toggleRule);
  const removeRule = useRulesStore((s) => s.removeRule);
  const focusRuleId = useSessionStore((s) => s.focusRuleId);
  const setFocusRuleId = useSessionStore((s) => s.setFocusRuleId);

  if (rules.length === 0) {
    return (
      <p className="text-sm text-faint text-center py-8">
        No rules yet. Add one above.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {rules.map((rule) => (
        <div
          key={rule.id}
          className={`p-3 rounded-lg border text-left transition-colors ${
            rule.active
              ? 'bg-surface border-line'
              : 'bg-surface/50 border-line/50 opacity-60'
          } ${focusRuleId === rule.id ? 'ring-2 ring-accent-hover' : ''}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium truncate">{rule.title}</span>
                <RuleBadge phase={rule.phase} />
              </div>
              <p className="text-xs text-muted line-clamp-2">
                {rule.description}
              </p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() =>
                  setFocusRuleId(focusRuleId === rule.id ? null : rule.id)
                }
                className={`p-1.5 rounded text-xs ${
                  focusRuleId === rule.id
                    ? 'bg-accent-press text-on-accent'
                    : 'text-muted hover:text-fg'
                }`}
                title="Set as focus rule"
              >
                F
              </button>
              <button
                onClick={() => toggleRule(rule.id)}
                className="p-1.5 rounded text-xs text-muted hover:text-fg"
                title={rule.active ? 'Disable' : 'Enable'}
              >
                {rule.active ? 'ON' : 'OFF'}
              </button>
              <button
                onClick={() => removeRule(rule.id)}
                className="p-1.5 rounded text-xs text-red-400 hover:text-red-300"
                title="Delete"
              >
                X
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
