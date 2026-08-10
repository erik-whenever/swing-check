// DEV-PREVIEW ONLY — inspection surface for the ADR-003 segmentation (D-4).
//
// Production still assumes ONE swing per clip: `frameExtractor.extractFrames` runs
// `detectSwingEnvelope` over the whole span and returns one set of ANALYSIS_FRAME_COUNT
// frames. Feed it a 64-second range session and you get 20 frames smeared across the
// whole clip — the silent failure ADR-003 exists to fix.
//
// This component renders what the SEGMENTED chain sees instead: `detectSessionSwings`
// splits the pose stream into per-swing segments, and each swing gets its own
// `selectEnvelopeFrames` allocation, grabbed and shown as its own section. It is a
// read-only viewer — nothing here feeds the Vision call, the store, or `SwingRecord`.
// The wiring into the real capture path is D-5 (ADR-003 §4/§5).
//
// Frames are grabbed here rather than reused from `currentFrameMeta`, because those
// frames ARE the single-envelope selection this view exists to contradict — reusing
// them would show the bug instead of the fix. Grabbing is the same seek-and-draw
// helper Stream D has always used (`poseFrameGrab`), so `frameExtractor.ts` stays
// untouched.

import { useEffect, useMemo, useState } from 'react';
import { ANALYSIS_FRAME_COUNT } from '../../lib/frameExtractor';
import { createLogger } from '../../lib/logger';
import { detectSessionSwings, type DetectedSwing } from '../../lib/poseSegments';
import { selectEnvelopeFrames, type FramePick } from '../../lib/poseEnvelopeSelection';
import { grabFramesAtTimes } from '../../lib/poseFrameGrab';
import { nearestSample } from '../../lib/poseSampling';
import type { PoseSample } from '../../lib/poseTrajectory';
import { SkeletonOverlay } from './SkeletonOverlay';

const log = createLogger('SwingSegments');

/** Per-swing frames + the picks they came from. */
interface SwingFrames {
  swing: DetectedSwing;
  picks: FramePick[];
  b64: string[];
}

type GrabStatus = 'idle' | 'grabbing' | 'done' | 'error';

export function SegmentedSwings({
  poseSamples,
  videoBlob,
}: {
  poseSamples: PoseSample[];
  videoBlob: Blob;
}) {
  // Segmentation is pure and cheap — derive it, don't store it.
  const session = useMemo(() => detectSessionSwings(poseSamples), [poseSamples]);

  const [frames, setFrames] = useState<SwingFrames[]>([]);
  const [status, setStatus] = useState<GrabStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [lightbox, setLightbox] = useState<{ b64: string; label: string } | null>(null);

  const multi = session.swings.length > 1;

  // Segmenteringssteget loggas ALLTID, oberoende av utfallet — det är den enda
  // signalen som skiljer "segmenteringen hittade inga burstar" från "grinden fällde
  // dem". WARN, inte INFO: logpanelen visar bara WARN och uppåt, och en diagnostik
  // som inte syns är ingen diagnostik.
  useEffect(() => {
    const d = session.segmentation.diagnostics;
    const span =
      poseSamples.length > 0
        ? [round(poseSamples[0].t), round(poseSamples[poseSamples.length - 1].t)]
        : [0, 0];
    log.warn('Segmentation', {
      poseSamples: poseSamples.length,
      clipSpanSec: span,
      sampleDt: round(session.segmentation.sampleDt),
      trackedWrist: session.segmentation.trackedWrist,
      visibleFrac: round(session.segmentation.visibleFrac),
      refSpeedP95: round(session.refSpeed),
      quietThreshold: round(session.segmentation.quietThreshold),
      quietFrames: d.quietFrames,
      movingFrames: d.movingFrames,
      stillnessIslands: d.islands,
      bursts: d.bursts.length,
      burstsAdmitted: d.bursts.filter((b) => b.admitted).length,
      burstList: d.bursts.map(
        (b) =>
          `${b.startSec.toFixed(2)}-${b.endSec.toFixed(2)} ${b.durationSec.toFixed(2)}s pk=${b.peakSpeed.toFixed(2)}${b.admitted ? ' ✓' : ` ✗ ${b.culledBy}`}`,
      ),
      candidates: session.segmentation.candidates.length,
      accepted: session.swings.length,
      rejected: session.rejected.map(
        (r) => `[${r.candidate.startSec.toFixed(2)}-${r.candidate.endSec.toFixed(2)}] ${r.reason}`,
      ),
      ...(session.segmentation.reason ? { segmentationReason: session.segmentation.reason } : {}),
    });
  }, [session, poseSamples]);

  useEffect(() => {
    // Frames grabbas bara för en MULTI-sving-klipp: vid noll eller en sving visar
    // panelen diagnostik, och den vanliga frame-griden nedanför är redan rätt vy.
    // Ingen state-återställning behövs här — nästa multi-klipp nollar vid grab-start.
    if (!multi) return;
    let cancelled = false;
    (async () => {
      setFrames([]);
      setProgress(0);
      setStatus('grabbing');
      try {
        const out: SwingFrames[] = [];
        for (const [i, swing] of session.swings.entries()) {
          // Same call production makes per clip — but bounded to THIS segment, which
          // is the whole point of ADR-003: the envelope's global measures become
          // per-segment measures for free.
          const sel = selectEnvelopeFrames(
            swing.envelope,
            ANALYSIS_FRAME_COUNT,
            swing.candidate.startSec,
            swing.candidate.endSec,
          );
          const e = swing.envelope;
          log.warn(`Swing ${i + 1}/${session.swings.length}`, {
            envelopeSec: [round(e.startSec), round(e.finishSec)],
            envelopeDurationSec: round(e.finishSec - e.startSec),
            impactSec: swing.impactSec === null ? null : round(swing.impactSec),
            impactReason: e.impactReason,
            downswingSec: e.impact ? round(e.impact.downswingSec) : null,
            verticalExcursion: round(e.addressY - e.apexY),
            frameCount: sel.picks.length,
            impactClusterApplied: sel.impactClusterApplied,
            segmentSec: [round(swing.candidate.startSec), round(swing.candidate.endSec)],
            peakSpeed: round(e.peakSpeed),
            visibleFrac: round(e.visibleFrac),
          });

          // No `cropBounds` here on purpose: this panel exists to inspect what the
          // envelope selected, and a crop would change what is on screen relative to
          // the skeleton overlay drawn over it.
          const { frames: b64 } = await grabFramesAtTimes(
            videoBlob,
            sel.picks.map((p) => p.t),
          );
          if (cancelled) return;
          out.push({ swing, picks: sel.picks, b64 });
          setProgress(i + 1);
          // Publish incrementally: on a 64 s 4K clip each swing takes a few seconds
          // of seeking, and watching swing 1 while 2 and 3 load beats a blank panel.
          setFrames([...out]);
        }
        if (!cancelled) setStatus('done');
      } catch (err) {
        if (!cancelled) {
          setStatus('error');
          log.error('Segment frame grab failed', err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [multi, session, videoBlob]);

  // Panelen visas ALLTID när pose har kört. Den är mest värdefull när INGET hittas —
  // "ingen panel" går inte att skilja från "koden kördes aldrig", och det var precis
  // den tvetydigheten som gjorde noll-svingsfallet omöjligt att felsöka.
  const seg = session.segmentation;
  const d = seg.diagnostics;
  const span =
    poseSamples.length > 0
      ? `${poseSamples[0].t.toFixed(2)}–${poseSamples[poseSamples.length - 1].t.toFixed(2)}s`
      : 'empty';

  return (
    <div className="rounded-lg border-2 border-fuchsia-600/60 bg-fuchsia-950/20">
      <div className="flex items-center justify-between px-3 py-2 border-b border-fuchsia-600/40">
        <span className="text-xs font-bold uppercase tracking-wide text-fuchsia-300">
          ⚗︎ Segmentation view — dev only
        </span>
        <span
          className={`text-[10px] font-mono ${
            multi ? 'text-fuchsia-300' : 'text-amber-400'
          }`}
        >
          {session.swings.length} swing{session.swings.length === 1 ? '' : 's'}
        </span>
      </div>

      <p className="px-3 pt-2 text-[10px] text-fuchsia-200/70 leading-relaxed">
        Not the production path. Production (<code>frameExtractor</code>) sends ONE
        {' '}
        {ANALYSIS_FRAME_COUNT}-frame set for the whole clip — the grid further down.
        This panel is <code>detectSessionSwings</code> (ADR-003 steg A + C).
        {multi
          ? ' Below: one allocation per detected swing. Wiring it into capture is D-5.'
          : ' Fewer than two swings here, so no per-swing frames are grabbed — the diagnostics below show where the clip fell out.'}
      </p>

      {/* Input identity first: the fastest way to tell "wrong/short clip" from
          "right clip, detection disagrees". session-multi.json is 953 samples
          over 0.00–63.45s; anything far from that is a different input. */}
      <div className="px-3 py-2 space-y-0.5 text-[10px] font-mono text-fg-dim">
        <div>
          input: {poseSamples.length} samples · span {span} · dt{' '}
          {seg.sampleDt.toFixed(4)} ({(1 / seg.sampleDt).toFixed(1)} fps)
        </div>
        <div>
          wrist {seg.trackedWrist} · vis {seg.visibleFrac.toFixed(3)} · refSpeed(p95){' '}
          {session.refSpeed.toFixed(3)} · quietThr {seg.quietThreshold.toFixed(4)}
        </div>
        <div>
          frames: {d.quietFrames} quiet / {d.movingFrames} moving · islands {d.islands} ·
          bursts {d.bursts.length} ({d.bursts.filter((b) => b.admitted).length} admitted)
        </div>
        <div>
          candidates {seg.candidates.length} · accepted{' '}
          <span className={session.swings.length > 0 ? 'text-emerald-400' : 'text-amber-400'}>
            {session.swings.length}
          </span>{' '}
          · rejected {session.rejected.length}
          {seg.reason && <span className="text-amber-400"> · {seg.reason}</span>}
          {status === 'grabbing' && (
            <span className="text-sky-400">
              {' '}
              · grabbing frames… {progress}/{session.swings.length}
            </span>
          )}
          {status === 'error' && (
            <span className="text-red-400"> · grab failed (see Logs)</span>
          )}
        </div>
      </div>

      {/* Burst-nivån: skiljer "segmenteringen hittade inget" från "grinden fällde". */}
      {d.bursts.length > 0 && (
        <details className="px-3 pb-2 text-[10px] font-mono" open={!multi}>
          <summary className="cursor-pointer text-fuchsia-300/70">
            {d.bursts.length} bursts before coarse filtering
          </summary>
          <ul className="mt-1 space-y-0.5 pl-2">
            {d.bursts.map((b, i) => (
              <li key={i} className={b.admitted ? 'text-emerald-400/80' : 'text-faint'}>
                {b.admitted ? '✓' : '✗'} [{b.startSec.toFixed(2)}–{b.endSec.toFixed(2)}]{' '}
                {b.durationSec.toFixed(2)}s pk {b.peakSpeed.toFixed(2)}
                {b.culledBy && ` — ${b.culledBy}`}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="px-3 pb-3 space-y-4">
        {frames.map(({ swing, picks, b64 }, si) => (
          <SwingSection
            key={si}
            index={si}
            total={session.swings.length}
            swing={swing}
            picks={picks}
            b64={b64}
            poseSamples={poseSamples}
            onZoom={setLightbox}
          />
        ))}

        {/* Grind-nivån: per kandidat, exakt vilket villkor som fällde den. Öppen
            som default när inget hittades — då är detta huvudinnehållet. */}
        {session.rejected.length > 0 && (
          <details className="text-[10px] font-mono text-faint" open={!multi}>
            <summary className="cursor-pointer text-fuchsia-300/70">
              {session.rejected.length} candidate
              {session.rejected.length === 1 ? '' : 's'} rejected by the gate
            </summary>
            <ul className="mt-1 space-y-1 pl-2">
              {session.rejected.map((r, i) => (
                <li key={i}>
                  <span className="text-fg-dim">
                    [{r.candidate.startSec.toFixed(2)}–{r.candidate.endSec.toFixed(2)}] pk{' '}
                    {r.candidate.peakSpeed.toFixed(2)}
                  </span>
                  <br />
                  <span className="text-amber-400/90">↳ {r.reason}</span>
                  {r.envelope?.valid && (
                    <span className="text-faint">
                      {' '}
                      (env [{r.envelope.startSec.toFixed(2)}→
                      {r.envelope.finishSec.toFixed(2)}], exc{' '}
                      {(r.envelope.addressY - r.envelope.apexY).toFixed(3)}
                      {r.envelope.clippedTail && ', clippedTail'})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}

        {session.swings.length === 0 && session.rejected.length === 0 && (
          <p className="text-[10px] font-mono text-amber-400">
            No candidates at all — the coarse filter culled every burst (see list
            above), so this fell out in SEGMENTATION, not in the gate.
          </p>
        )}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <img src={`data:image/jpeg;base64,${lightbox.b64}`} alt={lightbox.label} className="max-h-[85vh] max-w-full object-contain" />
          <span className="mt-2 text-xs font-mono text-fg-dim">{lightbox.label}</span>
        </div>
      )}
    </div>
  );
}

function SwingSection({
  index,
  total,
  swing,
  picks,
  b64,
  poseSamples,
  onZoom,
}: {
  index: number;
  total: number;
  swing: DetectedSwing;
  picks: FramePick[];
  b64: string[];
  poseSamples: PoseSample[];
  onZoom: (v: { b64: string; label: string }) => void;
}) {
  const e = swing.envelope;
  const excursion = e.addressY - e.apexY;
  // Badge the pick NEAREST the impact timestamp, not one matching it exactly. The
  // impact cluster is laid out around impact at its own spacing and then deduped
  // against the uniform baseline, so no pick is guaranteed to land on the exact
  // millisecond — an equality test would silently badge nothing, which is worse than
  // useless on a panel whose job is to make impact easy to eyeball.
  const impactIdx =
    e.impact === null
      ? -1
      : picks.reduce(
          (best, p, i) =>
            Math.abs(p.t - e.impact!.timeSec) < Math.abs(picks[best].t - e.impact!.timeSec)
              ? i
              : best,
          0,
        );
  return (
    <div className="rounded-lg bg-surface/60 overflow-hidden">
      <div className="px-2 py-1.5 bg-surface">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold text-fuchsia-200">
            Swing {index + 1} / {total}
          </span>
          <span className="text-[10px] font-mono text-fg-dim">
            {b64.length} frames
          </span>
        </div>
        <div className="text-[10px] font-mono text-muted mt-0.5">
          envelope [{e.startSec.toFixed(2)} → {e.finishSec.toFixed(2)}] ={' '}
          {(e.finishSec - e.startSec).toFixed(2)}s ·{' '}
          {/* Impact är polish, inte acceptanskrav — en sving utan verifierad impact
              är fortfarande en sving och får uniform baslinje (ADR-002). Märk den
              som sådan i stället för att låta den se ut som ett fel. */}
          {swing.impactSec !== null ? (
            <>
              <span className="text-emerald-300">impact {swing.impactSec.toFixed(2)}</span> · ds{' '}
              {e.impact!.downswingSec.toFixed(2)}s
            </>
          ) : (
            <span className="text-sky-300" title={e.impactReason}>
              no impact → uniform baseline
            </span>
          )}{' '}
          · exc {excursion.toFixed(3)}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1 p-1">
        {b64.map((img, i) => {
          const t = picks[i]?.t ?? 0;
          const isImpact = i === impactIdx;
          const label = `swing ${index + 1} · ${t.toFixed(2)}s${picks[i]?.phase ? ` · ${picks[i].phase}` : ''}`;
          return (
            <button
              key={i}
              onClick={() => onZoom({ b64: img, label })}
              className={`relative rounded overflow-hidden border cursor-zoom-in ${
                isImpact ? 'border-emerald-400' : 'border-line'
              }`}
            >
              <img
                src={`data:image/jpeg;base64,${img}`}
                alt={label}
                className="w-full aspect-video object-cover"
              />
              <SkeletonOverlay sample={nearestSample(poseSamples, t)} fit="cover" />
              <span className="absolute bottom-0 right-0 px-1 bg-black/70 text-[9px] font-mono">
                {t.toFixed(2)}
              </span>
              {isImpact && (
                <span className="absolute top-0 left-0 px-1 bg-emerald-600 text-[9px] font-bold">
                  IMP
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 3 dp — enough to compare against the harness goldens, short enough to read. */
function round(n: number): number {
  return Math.round(n * 1e3) / 1e3;
}
