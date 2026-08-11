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
import { Chip } from '../ui';
import type { ChipTone } from '../ui';

const STATUS_LABEL: Record<SwingStatus, string> = {
  detected: 'upptäckt',
  extracting: 'hämtar bilder',
  analyzing: 'analyserar',
  done: 'klar',
  failed: 'misslyckades',
  skipped: 'ingen träff',
};

const STATUS_TONE: Record<SwingStatus, ChipTone> = {
  detected: 'neutral',
  extracting: 'accent',
  analyzing: 'accent',
  done: 'ok',
  failed: 'bad',
  // Neutral, not 'bad': skipping a non-swing is the gate working, not a failure.
  skipped: 'neutral',
};

export function SessionSwingList() {
  const swings = useSessionStore((s) => s.swings);

  if (swings.length === 0) {
    return (
      <div className="px-[18px] py-3 text-[10.5px] text-muted">
        Sessionen är igång — svingar dyker upp här allteftersom de upptäcks.
      </div>
    );
  }

  return (
    <div className="max-h-52 overflow-y-auto px-[18px] py-2 space-y-2">
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
    <div className="rounded-card border border-line bg-surface px-3.5 py-2.5 animate-rise-in">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold tabular-nums">Sving {index}</span>
        <Chip tone={STATUS_TONE[swing.status]}>{STATUS_LABEL[swing.status]}</Chip>
        {busy && (
          <span className="h-3 w-3 rounded-full border-2 border-accent border-t-transparent animate-spin" />
        )}
        {swing.envelopeSec && (
          <span className="ml-auto text-[10px] font-mono text-faint tabular-nums">
            {swing.envelopeSec[0].toFixed(1)}–{swing.envelopeSec[1].toFixed(1)}s
          </span>
        )}
      </div>

      {swing.analysis && (
        <p className="mt-1.5 text-[11px] leading-[1.45] text-muted">
          {swing.analysis.overall_assessment}
        </p>
      )}

      {failedRules.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {failedRules.map((r) => (
            <li key={r.id} className="text-[10.5px] text-bad">
              · {r.short_verdict || r.observation || r.id}
            </li>
          ))}
        </ul>
      )}

      {failed && swing.error && (
        <p className="mt-1.5 text-[11px] text-bad">
          {swing.error}
          <span className="text-faint"> — sessionen fortsätter</span>
        </p>
      )}

      {swing.status === 'skipped' && swing.error && (
        <p className="mt-1.5 text-[11px] text-muted">{swing.error}</p>
      )}

      {/* The latency chain, per swing: impact → frames → verdict → spoken. This is
          the measurement requirement 6 asks for, on screen instead of only in a log. */}
      {swing.timings && (
        <div className="mt-1.5 text-[10px] font-mono text-faint">
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
