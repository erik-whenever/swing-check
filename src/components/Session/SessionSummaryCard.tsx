// SESSION SUMMARY, on screen (D-5) — the same numbers `lib/sessionStats.ts` logs.
//
// The log line is the primary artefact and this card is deliberately secondary: it
// exists because the field test happens on a range with a phone on a tripod, where
// opening the dev log panel to read one figure is the difference between checking
// after every session and not checking at all. It shows the same summary object, in
// the same units, so a screenshot and a log line can be compared line for line.
//
// Read-only and dismissible. There is no session end VIEW to put this in — a session
// ends on the camera view — so it renders there, above the controls, until dismissed
// or until the next session starts.

import { useSessionStore } from '../../store/session';
import type { Distribution } from '../../lib/sessionStats';

export function SessionSummaryCard() {
  const summary = useSessionStore((s) => s.lastSummary);
  const clear = useSessionStore((s) => s.clearLastSummary);

  if (!summary) return null;

  return (
    <div className="mx-[18px] mb-1 rounded-card border border-line bg-surface px-3.5 py-3 animate-rise-in">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold">Sessionen klar</span>
        <span className="text-[10.5px] text-faint tabular-nums">
          {fmtDuration(summary.durationSec)}
        </span>
        <button
          onClick={clear}
          className="ml-auto rounded-pill px-2 py-1 text-[10px] font-semibold text-faint
                     hover:bg-raised transition-colors"
        >
          Stäng
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] tabular-nums">
        <Stat label="upptäckta" value={summary.swingsDetected} />
        <Stat label="analyserade" value={summary.swingsAnalyzed} />
        <Stat
          label="misslyckade"
          value={summary.swingsFailed}
          tone={summary.swingsFailed > 0 ? 'bad' : undefined}
        />
        <Stat label="kostnad" value={`$${summary.totalCostUsd.toFixed(2)}`} />
      </div>

      {/* Median · p95 for the chain, because a session is judged on the typical
          swing AND on its worst one. */}
      <div className="mt-2 space-y-0.5 text-[10px] font-mono text-faint">
        <div>upptäckt {fmtDist(summary.detectedMs)}</div>
        <div>bilder {fmtDist(summary.framesMs)}</div>
        <div>vision {fmtDist(summary.visionMs)}</div>
        <div>röst {fmtSec(summary.spokenMedianMs)} (median)</div>
        <div>
          pose {fmtPercent(summary.poseDetectionRate)} · {fmtNum(summary.achievedFpsMedian)} fps
          {' · '}
          evict {summary.ringEvicted} · max {summary.maxWindowMb.toFixed(1)} MB
        </div>
      </div>

      {summary.failureReasons.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {summary.failureReasons.map((f) => (
            <li key={f.reason} className="text-[11px] text-bad">
              • {f.reason} ×{f.count}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: 'bad';
}) {
  return (
    <span className={tone === 'bad' ? 'text-bad' : 'text-muted'}>
      <span className="font-semibold text-fg">{value}</span> {label}
    </span>
  );
}

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m} min ${s} s` : `${s} s`;
}

function fmtDist(d: Distribution): string {
  return `${fmtSec(d.median)} · p95 ${fmtSec(d.p95)}`;
}

function fmtSec(ms: number | null): string {
  return ms === null ? '—' : `${(ms / 1000).toFixed(1)}s`;
}

function fmtNum(n: number | null): string {
  return n === null ? '—' : String(n);
}

function fmtPercent(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}
