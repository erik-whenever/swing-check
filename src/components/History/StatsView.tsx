import { useMemo } from 'react';
import { useHistory } from '../../hooks/useHistory';
import { useRulesStore } from '../../store/rules';
import type { Rule, RuleResult } from '../../types';

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
  const { records, loading } = useHistory();
  const rules = useRulesStore((s) => s.rules);

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
        <p className="text-sm text-faint">Laddar statistik…</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <p className="text-xs text-faint mb-4">
        {records.length} {records.length === 1 ? 'sving' : 'svingar'} analyserade
      </p>

      {stats.length === 0 ? (
        <p className="text-sm text-faint">Inga aktiva regler att visa statistik för.</p>
      ) : (
        <div className="space-y-3">
          {stats.map((stat) => (
            <RuleStatCard key={stat.rule.id} stat={stat} />
          ))}
        </div>
      )}
    </div>
  );
}

function RuleStatCard({ stat }: { stat: RuleStat }) {
  const { rule, verdicts, passRate, assessed } = stat;
  const hasData = verdicts.length >= MIN_DATA;
  const pct = passRate !== null ? Math.round(passRate * 100) : null;

  return (
    <div className="p-3 bg-surface rounded-lg border border-line">
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-sm font-medium truncate">{rule.title}</span>
        {pct !== null ? (
          <span className={`text-sm font-semibold ${pctColor(pct)}`}>{pct}%</span>
        ) : (
          <span className="text-xs text-faint">—</span>
        )}
      </div>

      {hasData ? (
        <>
          <VerdictBars verdicts={verdicts.slice(-SPARK_WINDOW)} />
          <p className="text-[11px] text-faint mt-1.5">
            {assessed} bedömda av {verdicts.length} senaste
          </p>
        </>
      ) : (
        <p className="text-xs text-faint">För lite data</p>
      )}
    </div>
  );
}

/** A compact bar strip: one bar per swing, coloured by verdict. */
function VerdictBars({ verdicts }: { verdicts: Verdict[] }) {
  return (
    <div className="flex items-end gap-0.5 h-8" aria-hidden>
      {verdicts.map((v, i) => (
        <div
          key={i}
          className={`flex-1 rounded-sm ${barColor(v)}`}
          style={{ height: v === 'pass' ? '100%' : v === 'fail' ? '45%' : '20%' }}
          title={v}
        />
      ))}
    </div>
  );
}

function barColor(v: Verdict): string {
  if (v === 'pass') return 'bg-green-400';
  if (v === 'fail') return 'bg-red-400';
  return 'bg-line';
}

function pctColor(pct: number): string {
  if (pct >= 70) return 'text-green-400';
  if (pct >= 40) return 'text-yellow-400';
  return 'text-red-400';
}
