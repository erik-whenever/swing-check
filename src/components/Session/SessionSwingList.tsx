// SESSION VIEW (ADR-003 §5, D-5 pass 3) — the swings of the current session, each
// with its own status and its analysis as it lands.
//
// The single-swing views render `swings[0]` and take over the screen; this one
// cannot, because the camera must keep running behind it. So it is a list that
// grows downward while recording continues: swing 3 can be `analyzing` while swing
// 2 shows a verdict and swing 1 shows a failure, all at once. That is exactly the
// state the pass-1 store refactor made representable, and this is the surface where
// it becomes visible.
//
// Read-only. Nothing here starts, retries or cancels anything — the session is
// driven by the detector, not by taps.

import { useSessionStore, type SessionSwing, type SwingStatus } from '../../store/session';

const STATUS_LABEL: Record<SwingStatus, string> = {
  detected: 'upptäckt',
  extracting: 'hämtar bilder',
  analyzing: 'analyserar',
  done: 'klar',
  failed: 'misslyckades',
};

const STATUS_CLASS: Record<SwingStatus, string> = {
  detected: 'bg-raised text-fg-dim',
  extracting: 'bg-sky-900/60 text-sky-300',
  analyzing: 'bg-sky-900/60 text-sky-300',
  done: 'bg-green-900/60 text-green-300',
  failed: 'bg-red-900/60 text-red-300',
};

export function SessionSwingList() {
  const swings = useSessionStore((s) => s.swings);

  if (swings.length === 0) {
    return (
      <div className="px-4 py-3 text-xs text-faint">
        Sessionen är igång — svingar dyker upp här allteftersom de upptäcks.
      </div>
    );
  }

  return (
    <div className="max-h-52 overflow-y-auto px-4 py-2 space-y-2">
      {swings.map((swing, i) => (
        <SwingRow key={swing.id} swing={swing} index={i + 1} />
      ))}
    </div>
  );
}

function SwingRow({ swing, index }: { swing: SessionSwing; index: number }) {
  const busy = swing.status === 'extracting' || swing.status === 'analyzing';
  const failed = swing.status === 'failed';
  const failedRules = swing.analysis?.rules.filter((r) => r.verdict === 'fail') ?? [];

  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold tabular-nums">Sving {index}</span>
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide
                      ${STATUS_CLASS[swing.status]}`}
        >
          {STATUS_LABEL[swing.status]}
        </span>
        {busy && (
          <span className="w-3 h-3 border-2 border-accent-press border-t-transparent rounded-full animate-spin" />
        )}
        {swing.envelopeSec && (
          <span className="ml-auto text-[10px] font-mono text-faint">
            {swing.envelopeSec[0].toFixed(1)}–{swing.envelopeSec[1].toFixed(1)}s
          </span>
        )}
      </div>

      {swing.analysis && (
        <p className="mt-1.5 text-xs text-muted">{swing.analysis.overall_assessment}</p>
      )}

      {failedRules.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {failedRules.map((r) => (
            <li key={r.id} className="text-[11px] text-amber-300/90">
              • {r.short_verdict || r.observation || r.id}
            </li>
          ))}
        </ul>
      )}

      {failed && swing.error && (
        <p className="mt-1.5 text-xs text-red-400">
          {swing.error}
          <span className="text-faint"> — sessionen fortsätter</span>
        </p>
      )}

      {/* The latency chain, per swing: impact → frames → verdict → spoken. This is
          the measurement requirement 6 asks for, on screen instead of only in a log. */}
      {swing.timings && (
        <div className="mt-1 text-[10px] font-mono text-faint">
          det {fmtMs(swing.timings.detectedMs)} · bilder {fmtMs(swing.timings.framesMs)} ·
          analys {fmtMs(swing.timings.analysisMs)} · röst {fmtMs(swing.timings.spokenMs)}
        </div>
      )}
    </div>
  );
}

function fmtMs(ms: number | null): string {
  if (ms === null) return '—';
  return `${(ms / 1000).toFixed(1)}s`;
}
