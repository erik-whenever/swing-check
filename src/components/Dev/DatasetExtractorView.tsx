// DEV-PREVIEW ONLY — "Dataset extractor".
//
// Pick video files, tag each one (web/own, slow-mo, a note), run the production frame
// chain over them and download a ZIP a human can annotate in CVAT
// (docs/shaft/annotation-spec.md). No camera, no capture, no Vision call — this view
// only reads clips off disk.
//
// The tagging happens BEFORE the run on purpose: `source` and `slowmo` are properties
// of the footage, not of the extraction, and a run costs minutes of pose inference —
// discovering afterwards that a clip was mis-tagged would mean re-running it.

import { useCallback, useMemo, useRef, useState } from 'react';
import { Button } from '../ui';
import { ANALYSIS_FRAME_COUNT } from '../../lib/frameExtractor';
import {
  buildDatasetZip,
  datasetFileName,
  extractDataset,
  type ClipInput,
  type DatasetRun,
  type ExtractProgress,
} from '../../lib/dataset/extractDataset';
import { MAX_FRAMES_PER_SWING } from '../../lib/dataset/phaseQuota';
import type { ClipSource } from '../../lib/dataset/datasetTypes';

type Status = 'idle' | 'running' | 'done' | 'error';

interface QueuedClip extends ClipInput {
  /** Stable key for React — the file name can repeat across two picks. */
  key: string;
}

export function DatasetExtractorView() {
  const [clips, setClips] = useState<QueuedClip[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState<ExtractProgress | null>(null);
  const [run, setRun] = useState<DatasetRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const running = status === 'running';

  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const added: QueuedClip[] = Array.from(files).map((file, i) => ({
      key: `${file.name}-${file.size}-${file.lastModified}-${Date.now()}-${i}`,
      file,
      // `own` is the safer default: mis-tagging your own footage as web is the one
      // that matters, since the spec forbids publishing the set either way but the
      // provenance is what a licence question would be answered from.
      source: 'own',
      slowmo: false,
      notes: '',
    }));
    setClips((prev) => [...prev, ...added]);
    setRun(null);
    setStatus('idle');
  }, []);

  const patch = useCallback((key: string, fields: Partial<ClipInput>) => {
    setClips((prev) => prev.map((c) => (c.key === key ? { ...c, ...fields } : c)));
  }, []);

  const start = useCallback(async () => {
    if (clips.length === 0) return;
    const controller = new AbortController();
    abort.current = controller;
    setStatus('running');
    setError(null);
    setRun(null);
    setProgress(null);
    try {
      const result = await extractDataset(clips, {
        onProgress: setProgress,
        signal: controller.signal,
      });
      setRun(result);
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    } finally {
      abort.current = null;
    }
  }, [clips]);

  const download = useCallback(() => {
    if (!run || run.frames.length === 0) return;
    const url = URL.createObjectURL(buildDatasetZip(run));
    const a = document.createElement('a');
    a.href = url;
    a.download = datasetFileName(run);
    a.click();
    // Revoke on the next tick — revoking synchronously can beat the download start.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }, [run]);

  const totals = useMemo(() => {
    if (!run) return null;
    const swings = run.clips.reduce((sum, c) => sum + c.swings.length, 0);
    return {
      clips: run.clips.length,
      failed: run.clips.filter((c) => c.error).length,
      emptyClips: run.clips.filter((c) => !c.error && c.swings.length === 0).length,
      swings,
      frames: run.frames.length,
    };
  }, [run]);

  return (
    <div className="h-full overflow-y-auto px-4 py-4 space-y-4">
      <header className="space-y-1">
        <h1 className="text-lg font-bold text-fg">Dataset extractor</h1>
        <p className="text-xs text-muted leading-relaxed">
          Runs the production chain (pose → segmentation → envelope selection at{' '}
          {ANALYSIS_FRAME_COUNT} frames) over the clips below, keeps at most{' '}
          {MAX_FRAMES_PER_SWING} frames per swing weighted towards the downswing, and
          exports full-resolution JPEGs plus <code>manifest.json</code> as a ZIP for
          shaft annotation. Dev-only; nothing here touches capture or analysis.
        </p>
      </header>

      <div>
        <label className="inline-block">
          <input
            type="file"
            accept="video/*"
            multiple
            disabled={running}
            className="block w-full text-xs text-muted file:mr-3 file:rounded-pill file:border-0
                       file:bg-raised file:px-4 file:py-2 file:text-xs file:font-semibold
                       file:text-accent-text"
            onChange={(e) => {
              addFiles(e.target.files);
              // Clear the input so re-picking the same file fires `change` again.
              e.target.value = '';
            }}
          />
        </label>
      </div>

      {clips.length > 0 && (
        <ul className="space-y-2">
          {clips.map((clip) => (
            <li key={clip.key} className="rounded-lg border border-line bg-surface p-3 space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-fg break-all">{clip.file.name}</span>
                <button
                  type="button"
                  disabled={running}
                  onClick={() => setClips((prev) => prev.filter((c) => c.key !== clip.key))}
                  className="text-[10px] text-faint hover:text-bad disabled:opacity-40"
                >
                  remove
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-[11px]">
                <label className="flex items-center gap-1.5">
                  <span className="text-muted">source</span>
                  <select
                    value={clip.source}
                    disabled={running}
                    onChange={(e) => patch(clip.key, { source: e.target.value as ClipSource })}
                    className="rounded-md border border-line bg-raised px-2 py-1 text-[11px] text-fg"
                  >
                    <option value="own">own</option>
                    <option value="web">web</option>
                  </select>
                </label>

                <label className="flex items-center gap-1.5 text-muted">
                  <input
                    type="checkbox"
                    checked={clip.slowmo}
                    disabled={running}
                    onChange={(e) => patch(clip.key, { slowmo: e.target.checked })}
                  />
                  slow-mo
                </label>

                <span className="text-faint font-mono">
                  {(clip.file.size / 1e6).toFixed(1)} MB
                </span>
              </div>

              <input
                type="text"
                value={clip.notes}
                disabled={running}
                placeholder="notes (optional)"
                onChange={(e) => patch(clip.key, { notes: e.target.value })}
                className="w-full rounded-md border border-line bg-raised px-2 py-1 text-[11px]
                           text-fg placeholder:text-faint"
              />
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <Button onClick={start} disabled={running || clips.length === 0}>
          {running ? 'Extracting…' : `Extract ${clips.length || ''} clip${clips.length === 1 ? '' : 's'}`}
        </Button>
        {running && (
          <Button variant="ghost" onClick={() => abort.current?.abort()}>
            Stop
          </Button>
        )}
        {clips.length > 0 && !running && (
          <Button variant="ghost" onClick={() => setClips([])}>
            Clear
          </Button>
        )}
      </div>

      {progress && running && (
        <p className="text-[11px] font-mono text-muted">
          clip {progress.clipIndex + 1}/{progress.clipCount} · {progress.clipName} ·{' '}
          {progress.stage}
          {progress.stage === 'pose' && ` ${Math.round(progress.fraction * 100)}%`}
        </p>
      )}

      {error && <p className="text-[11px] font-mono text-bad">Extraction failed: {error}</p>}

      {run && totals && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-fg">Summary</h2>

          <div className="rounded-lg border border-line bg-surface p-3 text-[11px] font-mono
                          text-fg-dim space-y-0.5">
            <div>
              {totals.clips} clip{totals.clips === 1 ? '' : 's'} · {totals.swings} swing
              {totals.swings === 1 ? '' : 's'} · {totals.frames} frame
              {totals.frames === 1 ? '' : 's'}
            </div>
            {totals.failed > 0 && (
              <div className="text-bad">{totals.failed} clip(s) failed — see per-clip rows</div>
            )}
            {totals.emptyClips > 0 && (
              <div className="text-gold">
                {totals.emptyClips} clip(s) yielded no swings — the gate rejected every
                candidate
              </div>
            )}
          </div>

          <div className="rounded-lg border border-line bg-surface p-3">
            <div className="text-[11px] font-semibold text-fg mb-2">
              Phase distribution vs spec targets
            </div>
            <table className="w-full text-[11px] font-mono">
              <thead className="text-faint">
                <tr>
                  <th className="text-left font-normal">phase</th>
                  <th className="text-right font-normal">n</th>
                  <th className="text-right font-normal">actual</th>
                  <th className="text-right font-normal">target</th>
                  <th className="text-right font-normal">Δ</th>
                </tr>
              </thead>
              <tbody>
                {run.distribution.map((d) => {
                  const delta = Math.round((d.actualPct - d.targetPct) * 10) / 10;
                  return (
                    <tr key={d.phase}>
                      <td className="text-fg-dim">{d.phase}</td>
                      <td className="text-right text-fg-dim">{d.count}</td>
                      <td className="text-right text-fg-dim">{d.actualPct.toFixed(1)}%</td>
                      <td className="text-right text-faint">{d.targetPct.toFixed(1)}%</td>
                      <td
                        className={`text-right ${
                          Math.abs(delta) >= 10 ? 'text-gold' : 'text-faint'
                        }`}
                      >
                        {delta > 0 ? '+' : ''}
                        {delta.toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-[10px] text-faint leading-relaxed">
              Per-swing quotas are exact; the run total drifts from the targets when a
              swing has no frames in some phase (no confident impact, a clipped tail),
              since that share flows to the next-hungriest phase rather than being lost.
            </p>
          </div>

          <ul className="space-y-1">
            {run.clips.map((clip, i) => (
              <li
                key={`${clip.clipName}-${i}`}
                className="rounded-lg border border-line bg-surface p-2 text-[10px] font-mono"
              >
                <div className="text-fg-dim break-all">{clip.clipName}</div>
                {clip.error ? (
                  <div className="text-bad">↳ {clip.error}</div>
                ) : (
                  <>
                    <div className="text-faint">
                      {clip.poseSamples} pose samples · {clip.swings.length} swing
                      {clip.swings.length === 1 ? '' : 's'} ·{' '}
                      {clip.swings.reduce((sum, s) => sum + s.frames.length, 0)} frames
                    </div>
                    {clip.swings.map((s) => (
                      <div key={s.swingIndex} className="text-faint pl-2">
                        #{s.swingIndex} [{s.envelopeSec[0].toFixed(2)}→
                        {s.envelopeSec[1].toFixed(2)}]{' '}
                        {s.impactSec === null
                          ? 'no impact'
                          : `impact ${s.impactSec.toFixed(2)}`}{' '}
                        · {s.selectedCount}→{s.frames.length} frames
                      </div>
                    ))}
                    {clip.rejected.map((r, j) => (
                      <div key={j} className="text-gold pl-2">
                        ✗ {r}
                      </div>
                    ))}
                  </>
                )}
              </li>
            ))}
          </ul>

          <Button onClick={download} disabled={run.frames.length === 0} full>
            Download ZIP ({run.frames.length} frames)
          </Button>
        </section>
      )}
    </div>
  );
}
