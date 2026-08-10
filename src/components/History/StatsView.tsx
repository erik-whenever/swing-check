import { useMemo } from 'react';
import { useHistory } from '../../hooks/useHistory';
import { useRulesStore } from '../../store/rules';
import { useSessionStore } from '../../store/session';
import { useT } from '../../lib/i18n';
import type { Rule, RuleResult } from '../../types';
import { Button, Card, VerdictBars } from '../ui';

type Verdict = RuleResult['verdict'];

interface RuleStat {
  rule: Rule;
  /** Chronological verdicts (oldest → newest) for swings where this rule was evaluated. */
  verdicts: Verdict[];
  /** pass / (pass + fail); null when nothing assessable. */
  passRate: number | null;
  assessed: number;
}

const SPARK_WINDOW = 20;
const MIN_DATA = 3;

/**
 * Per-rule pass/fail trend over recorded swings. Reads existing IndexedDB history (no
 * migration) and ranks rules by pass-rate so the ones that "need work" surface first.
 */
export function StatsView() {
  const t = useT();
  const { records, loading } = useHistory();
  const rules = useRulesStore((s) => s.rules);
  const focusRuleId = useSessionStore((s) => s.focusRuleId);
  const setFocusRuleId = useSessionStore((s) => s.setFocusRuleId);

  const stats = useMemo<RuleStat[]>(() => {
    // useHistory returns newest-first; reverse to oldest-first for the trend.
    const chronological = [...records].reverse();
    const active = rules.filter((r) => r.active);

    const computed = active.map<RuleStat>((rule) => {
      const verdicts: Verdict[] = [];
      for (const rec of chronological) {
        const result = rec.results.find((r) => r.id === rule.id);
        if (result) verdicts.push(result.verdict);
      }
      const pass = verdicts.filter((v) => v === 'pass').length;
      const fail = verdicts.filter((v) => v === 'fail').length;
      const assessed = pass + fail;
      return {
        rule,
        verdicts,
        assessed,
        passRate: assessed > 0 ? pass / assessed : null,
      };
    });

    // Default sort: "Behöver träning" first (lowest pass-rate). Rules with no assessable
    // data sink to the bottom.
    return computed.sort((a, b) => {
      if (a.passRate === null && b.passRate === null) return 0;
      if (a.passRate === null) return 1;
      if (b.passRate === null) return -1;
      return a.passRate - b.passRate;
    });
  }, [records, rules]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted">{t('stats.loading')}</p>
      </div>
    );
  }

  // Ranking by pass-rate only pays off if the screen also offers the move it implies:
  // the weakest rule with real data is the one worth making the focus.
  const weakest = stats.find((s) => s.passRate !== null && s.verdicts.length >= MIN_DATA);
  const suggestFocus = weakest && weakest.rule.id !== focusRuleId;

  return (
    <div className="px-[18px] pb-6">
      <p className="mb-3 px-1 text-[10.5px] text-muted">
        {t('stats.analyzed', { count: records.length })}
      </p>

      {stats.length === 0 ? (
        <p className="px-1 text-sm text-muted">{t('stats.none')}</p>
      ) : (
        <div className="space-y-2">
          {stats.map((stat) => (
            <RuleStatCard key={stat.rule.id} stat={stat} />
          ))}
        </div>
      )}

      {suggestFocus && (
        <div className="mt-3 flex items-start gap-2.5 rounded-card bg-ok-tint px-3.5 py-3">
          <span className="mt-0.5 text-base leading-none" aria-hidden>🎯</span>
          <div className="flex-1">
            <p className="text-[10.5px] leading-[1.45] text-ok">
              <span className="font-semibold">{t('stats.suggestion')}</span>{' '}
              {t('stats.suggestionBody', { rule: weakest.rule.title })}
            </p>
            <Button size="sm" className="mt-2" onClick={() => setFocusRuleId(weakest.rule.id)}>
              {t('rules.focus')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function RuleStatCard({ stat }: { stat: RuleStat }) {
  const t = useT();
  const { rule, verdicts, passRate, assessed } = stat;
  const hasData = verdicts.length >= MIN_DATA;
  const pct = passRate !== null ? Math.round(passRate * 100) : null;

  return (
    <Card>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="truncate text-[12.5px] font-semibold">{rule.title}</span>
        {pct !== null ? (
          <span className={`text-[13px] font-bold tabular-nums ${pctColor(pct)}`}>{pct} %</span>
        ) : (
          <span className="text-xs text-faint">—</span>
        )}
      </div>

      {hasData ? (
        <>
          <VerdictBars verdicts={verdicts.slice(-SPARK_WINDOW)} />
          <p className="mt-1.5 text-[9.5px] text-faint">
            {t('stats.assessed', { assessed, total: verdicts.length })}
          </p>
        </>
      ) : (
        <p className="text-[10.5px] text-faint">{t('stats.tooLittle')}</p>
      )}
    </Card>
  );
}

function pctColor(pct: number): string {
  if (pct >= 70) return 'text-ok';
  if (pct >= 40) return 'text-gold';
  return 'text-bad';
}
