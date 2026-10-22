// DEV-PREVIEW ONLY — container metadata of the clip the pipeline was handed.
//
// Answers slowmo-diagnosis.md §2 on the device itself: what does the File that
// <input type=file> received actually contain? Shows the container duration next to
// the browser's `video.duration` (the only length the pipeline ever reads), each
// track's timescale / stts frame rate, and every `com.apple.quicktime.*` key — so a
// Slo-Mo pick from iOS Photos can be checked for whether Apple's traces survived.
// Read-only: nothing here feeds extraction, the store, or the Vision call.

import { useEffect, useState } from 'react';
import { blobSource, probeMp4, type Mp4Probe } from '../../lib/mp4Probe';

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

export function Mp4MetaPanel({ blob }: { blob: Blob }) {
  // Result is keyed by the blob it was read from, so a new clip shows "reading…"
  // without resetting state inside the effect.
  const [result, setResult] = useState<{ blob: Blob; probe?: Mp4Probe; error?: string } | null>(
    null,
  );
  const videoDuration = useVideoDuration(blob);

  useEffect(() => {
    let cancelled = false;
    probeMp4(blobSource(blob)).then(
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
          </>
        )}
      </div>
    </details>
  );
}
