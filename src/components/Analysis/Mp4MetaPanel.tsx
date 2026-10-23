// DEV-PREVIEW ONLY — container metadata of the clip the pipeline was handed.
//
// Answers slowmo-diagnosis.md §2 on the device itself: what does the File that
// <input type=file> received actually contain? Shows the container duration next to
// the browser's `video.duration` (the only length the pipeline ever reads), each
// track's timescale / stts frame rate, and every `com.apple.quicktime.*` key — so a
// Slo-Mo pick from iOS Photos can be checked for whether Apple's traces survived.
// Read-only: nothing here feeds extraction, the store, or the Vision call.

import { useEffect, useState } from 'react';
import { blobSource, probeMp4, stretchProfile, type Mp4Probe } from '@swingcheck/core/lib/mp4Probe';
import {
  decodeMono,
  lowPitchRun,
  zeroCrossingProfile,
  type AudioBin,
} from '../../lib/audioProfile';

const SLOMO_KEY = 'com.apple.quicktime.full-frame-rate-playback-intent';

function useVideoDuration(blob: Blob): number | null {
  const [read, setRead] = useState<{ blob: Blob; duration: number } | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => setRead({ blob, duration: video.duration });
    video.src = url;
    return () => {
      video.removeAttribute('src');
      URL.revokeObjectURL(url);
    };
  }, [blob]);
  return read?.blob === blob ? read.duration : null;
}

const sec = (s: number) => `${s.toFixed(3)} s`;

/** Telemetry track whose sample timing carries the stretch (S-43). */
const TIMING_KEY = 'com.apple.quicktime.scene-illuminance';

/** Audio is decoded on demand only — it reads the whole file into memory. */
function AudioSection({ blob }: { blob: Blob }) {
  const [state, setState] = useState<
    | { status: 'idle' }
    | { status: 'running' }
    | { status: 'done'; bins: AudioBin[] }
    | { status: 'error'; msg: string }
  >({ status: 'idle' });
  const run = async () => {
    setState({ status: 'running' });
    try {
      const { x, sampleRate } = await decodeMono(blob);
      setState({ status: 'done', bins: zeroCrossingProfile(x, sampleRate) });
    } catch (e) {
      setState({ status: 'error', msg: e instanceof Error ? e.message : String(e) });
    }
  };
  if (state.status === 'idle' || state.status === 'running')
    return (
      <button
        onClick={run}
        disabled={state.status === 'running'}
        className="w-full py-1.5 bg-raised rounded text-fg-dim disabled:opacity-50"
      >
        {state.status === 'running' ? 'decoding audio…' : 'Analyze audio pitch (zero-crossings)'}
      </button>
    );
  if (state.status === 'error') return <div className="text-red-400">audio decode failed: {state.msg}</div>;
  const lowRun = lowPitchRun(state.bins);
  return (
    <div className="space-y-1">
      <div className="text-faint">audio pitch proxy, 0.25 s bins (heuristic)</div>
      <div>
        {lowRun
          ? `low-pitch run ${lowRun.startSec.toFixed(2)}–${lowRun.endSec.toFixed(2)} s · ends ${Math.round(lowRun.refHz)} Hz / inside ${Math.round(lowRun.insideHz)} Hz = ×${lowRun.ratio.toFixed(2)}`
          : 'no low-pitch run'}
      </div>
      <div className="flex flex-wrap gap-x-2">
        {state.bins.map((b) => (
          <span
            key={b.timeSec}
            className={
              lowRun && b.timeSec >= lowRun.startSec && b.timeSec < lowRun.endSec
                ? 'text-amber-400'
                : undefined
            }
          >
            {b.timeSec.toFixed(2)}:{Math.round(b.hz)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Mp4MetaPanel({ blob }: { blob: Blob }) {
  // Result is keyed by the blob it was read from, so a new clip shows "reading…"
  // without resetting state inside the effect.
  const [result, setResult] = useState<{ blob: Blob; probe?: Mp4Probe; error?: string } | null>(
    null,
  );
  const videoDuration = useVideoDuration(blob);

  useEffect(() => {
    let cancelled = false;
    probeMp4(blobSource(blob), { decodeMebx: true }).then(
      (probe) => !cancelled && setResult({ blob, probe }),
      (e) =>
        !cancelled && setResult({ blob, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      cancelled = true;
    };
  }, [blob]);

  const current = result?.blob === blob ? result : null;
  const probe = current?.probe ?? null;
  const error = current?.error ?? null;

  const file = blob instanceof File ? blob : null;
  const appleKeys = probe
    ? [...new Set([...probe.appleKeysRaw, ...probe.meta.map((m) => m.key)])]
        .filter((k) => k.startsWith('com.apple.quicktime.'))
        .sort()
    : [];

  return (
    <details className="bg-surface rounded-lg p-3 text-xs font-mono text-fg-dim" open>
      <summary className="cursor-pointer text-muted font-sans">
        Container metadata{' '}
        {probe &&
          (appleKeys.includes(SLOMO_KEY) ? (
            <span className="text-amber-400">· Slo-Mo key present</span>
          ) : (
            <span className="text-faint">· no Slo-Mo key</span>
          ))}
      </summary>
      <div className="mt-2 space-y-2 break-all">
        <div>
          {file ? `${file.name} · ${file.type || '(no type)'} · ` : `${blob.type || '(no type)'} · `}
          {(blob.size / 1e6).toFixed(2)} MB
        </div>
        {error && <div className="text-red-400">parse failed: {error}</div>}
        {!probe && !error && <div className="text-faint">reading…</div>}
        {probe && (
          <>
            <div>
              brand {probe.majorBrand || '—'} [{probe.compatibleBrands.join(' ')}] · boxes{' '}
              {probe.topLevel.join(' ')}
            </div>
            <div>
              mvhd {sec(probe.movieDurationSec)} ({probe.movieDuration}/{probe.movieTimescale})
              · video.duration {videoDuration == null ? '…' : sec(videoDuration)}
            </div>
            <table className="w-full text-left">
              <thead className="text-faint">
                <tr>
                  <th>#</th>
                  <th>hdlr</th>
                  <th>codec</th>
                  <th>ts</th>
                  <th>dur</th>
                  <th>fps</th>
                  <th>Δ min/med/max (n)</th>
                </tr>
              </thead>
              <tbody>
                {probe.tracks.map((t) => (
                  <tr key={t.trackId}>
                    <td>{t.trackId}</td>
                    <td>{t.handler}</td>
                    <td>{t.codec}</td>
                    <td>{t.timescale}</td>
                    <td>{t.durationSec.toFixed(2)}</td>
                    <td>{t.stts ? t.stts.fps.toFixed(3) : '—'}</td>
                    <td>
                      {t.stts
                        ? `${t.stts.minDelta}/${t.stts.medianDelta}/${t.stts.maxDelta} (${t.stts.distinctDeltas})`
                        : '—'}
                      {t.edits.some((e) => e.mediaRate !== 1) && (
                        <span className="text-amber-400">
                          {' '}
                          rate {t.edits.map((e) => e.mediaRate).join(',')}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="space-y-0.5">
              <div className="text-faint">com.apple.quicktime.* ({appleKeys.length})</div>
              {appleKeys.length === 0 && <div className="text-faint">none</div>}
              {appleKeys.map((k) => {
                const items = probe.meta.filter((m) => m.key === k);
                const mebx = probe.tracks.filter((t) => t.mebxKeys.includes(k)).map((t) => t.trackId);
                return (
                  <div key={k} className={k === SLOMO_KEY ? 'text-amber-400' : undefined}>
                    {k.slice('com.apple.quicktime.'.length)}
                    {items.map((m, i) => (
                      <span key={i}>
                        {' '}= {m.value === null ? '∅' : String(m.value)}{' '}
                        <span className="text-faint">({m.where})</span>
                      </span>
                    ))}
                    {mebx.length > 0 && <span className="text-faint"> (mebx #{mebx.join(',')})</span>}
                  </div>
                );
              })}
            </div>
            <div className="space-y-0.5">
              <div className="text-faint">slow interval from telemetry timing ({TIMING_KEY.slice(20)})</div>
              {(() => {
                const timing = probe.tracks.filter((t) => t.mebxKeys.includes(TIMING_KEY));
                if (timing.length === 0)
                  return <div>no telemetry track — interval + factor NOT in this file</div>;
                return timing.map((t) => (
                  <div key={t.trackId}>
                    #{t.trackId} ({t.mebxSamples.length} samples{t.mebxTruncated ? ', truncated' : ''}):{' '}
                    {stretchProfile(t.mebxSamples).map((s, i) => (
                      <span key={i} className={s.factor && s.factor > 1 ? 'text-amber-400' : undefined}>
                        {i > 0 && ' · '}
                        {s.startSec.toFixed(2)}–{s.endSec.toFixed(2)} {s.factor ? `${s.factor}×` : 'ramp'} (
                        {s.captureSec.toFixed(2)} s real)
                      </span>
                    ))}
                  </div>
                ));
              })()}
            </div>
            <div className="space-y-0.5">
              <div className="text-faint">mebx single-sample values</div>
              {probe.tracks
                .filter((t) => t.codec === 'mebx' && t.mebxSamples.length > 0 && t.mebxSamples.length <= 3)
                .flatMap((t) =>
                  t.mebxSamples.flatMap((s, i) =>
                    s.items.map((it, j) => (
                      <div key={`${t.trackId}-${i}-${j}`}>
                        #{t.trackId} {it.key.replace('com.apple.quicktime.', '')} ={' '}
                        {Array.isArray(it.value) ? it.value.map((n) => n.toFixed(3)).join(',') : String(it.value)}{' '}
                        <span className="text-faint">
                          @{s.timeSec.toFixed(2)}+{s.durSec.toFixed(2)} s
                        </span>
                      </div>
                    )),
                  ),
                )}
            </div>
            <AudioSection key={probe.fileSize} blob={blob} />
          </>
        )}
      </div>
    </details>
  );
}
