// DEV-PREVIEW ONLY — the readout for the live capture path (ADR-003 §4, D-5 pass 2).
//
// This panel exists to answer one question during Erik's field test: does the app
// count swings WHILE recording, without the recording being stopped? So the swing
// counter is the biggest thing on it, and everything else is the evidence behind it.
//
// The numbers below the counter are the thermal measurement (ADR-003 Risker §1, the
// largest risk in the whole ADR). Read them across a session rather than at a moment:
// inference time creeping up while achieved fps falls below the target is throttling,
// and `SAT` means the target rate is unreachable no matter how the loop is scheduled.
//
// Nothing here reaches the Vision call, the session store or SwingRecord — the clip
// path runs unchanged alongside it.

import { useLiveSwingDetection } from '../../hooks/useLiveSwingDetection';

export function LiveSwingPanel({
  videoRef,
  active,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  active: boolean;
}) {
  const { status, swings, stats, detectMs, error } = useLiveSwingDetection(videoRef, active);

  if (!active) return null;

  const last = swings.length > 0 ? swings[swings.length - 1] : null;

  return (
    <div className="absolute top-14 left-2 right-2 rounded-lg border-2 border-fuchsia-600/60
                    bg-black/75 backdrop-blur-sm px-2 py-1.5 pointer-events-none space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-fuchsia-300">
          ⚗︎ Live-detektering
        </span>
        {status === 'starting' && <span className="text-[10px] text-sky-400">startar…</span>}
        {status === 'error' && (
          <span className="text-[10px] text-red-400 truncate">fel: {error}</span>
        )}
        {status === 'running' && stats && (
          <span
            className={`text-[10px] font-mono font-bold ${
              stats.cadence === 'active' ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {stats.cadence === 'active' ? 'ACTIVE' : 'GUARD'} {stats.targetFps}fps
          </span>
        )}
      </div>

      {/* The counter — the thing the field test is looking at. */}
      <div className="flex items-baseline gap-2">
        <span
          className={`text-2xl font-bold tabular-nums ${
            swings.length > 0 ? 'text-emerald-400' : 'text-fg-dim'
          }`}
        >
          {swings.length}
        </span>
        <span className="text-xs text-fg-dim">
          sving{swings.length === 1 ? '' : 'ar'} detekterade
        </span>
      </div>

      {last && (
        <div className="text-[10px] font-mono text-emerald-300/90">
          senast: [{last.envelopeSec[0].toFixed(2)}→{last.envelopeSec[1].toFixed(2)}]{' '}
          {last.impactSec !== null ? (
            <>imp {last.impactSec.toFixed(2)} · ds {last.downswingSec?.toFixed(2) ?? '—'}s</>
          ) : (
            <span className="text-sky-300">ingen impact</span>
          )}{' '}
          · exc {last.excursion.toFixed(3)} · lat {last.latencySec.toFixed(2)}s
        </div>
      )}

      {/* Thermal / throughput evidence. */}
      {stats && (
        <div className="text-[10px] font-mono text-fg-dim leading-snug">
          <div>
            infer {stats.avgInferMs.toFixed(1)}ms avg · p95 {stats.p95InferMs.toFixed(1)} ·
            max {stats.maxInferMs.toFixed(1)} · detect {detectMs.toFixed(1)}ms
            {stats.saturated && <span className="text-red-400 font-bold"> · SAT</span>}
          </div>
          <div>
            {stats.achievedFps.toFixed(1)}/{stats.targetFps} fps · buf {stats.bufferSize}
            {stats.bufferEvicted > 0 && `+${stats.bufferEvicted}ev`} /{' '}
            {stats.bufferSpanSec.toFixed(1)}s · {stats.delegate ?? '—'}
          </div>
          <div>
            {stats.samples} sampel · {stats.posesDetected} pose · {stats.errors} fel ·{' '}
            {stats.elapsedSec.toFixed(0)}s · v {stats.lastSpeed.toFixed(3)}
          </div>
        </div>
      )}
    </div>
  );
}
