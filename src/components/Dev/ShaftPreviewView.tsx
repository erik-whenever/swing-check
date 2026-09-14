// DEV-PREVIEW ONLY — "Shaft detector".
//
// Pick a clip, run production's frame-selection chain over it, run the ONNX shaft
// detector on the frames it picked, and draw butt → hosel on top of each one.
//
// The purpose is a side-by-side check that the model behaves the same in Safari on
// a phone as it does in `training/evaluate.py` — so the overlay is drawn in the
// FRAME's own coordinate space (an SVG viewBox sized to the source image), not in
// CSS pixels. That way what you see is the coordinate the detector returned, at
// whatever size the phone happens to render the image, and a letterbox mistake
// shows up as points sliding off the shaft rather than as a layout quirk.
//
// No camera, no capture, no Vision call: this view only reads a file off disk.

import { useCallback, useRef, useState } from 'react';
import { Button } from '../ui';
import { ANALYSIS_FRAME_COUNT } from '../../lib/frameExtractor';
import { MODEL_INPUT_SIZE, type ShaftDetection } from '../../lib/shaft/shaftDetector';
import {
  CONF_THRESHOLD,
  KEYPOINT_THRESHOLD,
} from '../../lib/shaft/shaftPostprocess';
import {
  runShaftPreview,
  shaftAngleDeg,
  type PreviewFrame,
  type PreviewProgress,
  type PreviewRun,
} from '../../lib/shaft/shaftPreview';

type Status = 'idle' | 'running' | 'done' | 'error';

const STAGE_LABEL: Record<PreviewProgress['stage'], string> = {
  session: 'Loading model (~26 MB on first run)…',
  pose: 'Pose trajectory…',
  grabbing: 'Grabbing frames…',
  detecting: 'Detecting shaft…',
  done: 'Done',
};

export function ShaftPreviewView() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState<PreviewProgress | null>(null);
  const [run, setRun] = useState<PreviewRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const running = status === 'running';

  const start = useCallback(async () => {
    if (!file) return;
    const controller = new AbortController();
    abort.current = controller;
    setStatus('running');
    setError(null);
    setRun(null);
    setProgress(null);
    try {
      const result = await runShaftPreview(file, {
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
  }, [file]);

  return (
    <div className="h-full overflow-y-auto px-4 py-4 space-y-4 text-sm">
      <header className="space-y-1">
        <h1 className="text-base font-semibold text-fg">Shaft detector</h1>
        <p className="text-xs text-muted">
          Production frame chain → shaft-v1.onnx ({MODEL_INPUT_SIZE}²), up to{' '}
          {ANALYSIS_FRAME_COUNT} frames per swing. conf ≥ {CONF_THRESHOLD}, keypoint ≥{' '}
          {KEYPOINT_THRESHOLD}.
        </p>
      </header>

      <div className="space-y-2">
        <input
          type="file"
          accept="video/*"
          disabled={running}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setRun(null);
            setStatus('idle');
          }}
          className="block w-full text-xs text-muted file:mr-3 file:rounded-pill file:border-0
                     file:bg-accent-tint file:px-3 file:py-1.5 file:text-xs file:font-semibold
                     file:text-accent-text"
        />
        <div className="flex gap-2">
          <Button onClick={start} disabled={!file || running}>
            {running ? 'Running…' : 'Run detector'}
          </Button>
          {running && (
            <Button variant="ghost" onClick={() => abort.current?.abort()}>
              Stop
            </Button>
          )}
        </div>
      </div>

      {progress && running && (
        <p className="text-xs text-muted font-mono">
          {STAGE_LABEL[progress.stage]} {Math.round(progress.fraction * 100)}%
          {progress.detail ? ` · ${progress.detail}` : ''}
        </p>
      )}

      {error && (
        <p className="rounded-card bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-300">
          {error}
        </p>
      )}

      {run && <RunSummary run={run} />}

      {run?.swings.map((swing) => (
        <section key={swing.swingIndex} className="space-y-3">
          <h2 className="text-xs font-semibold text-fg-dim font-mono">
            Swing {swing.swingIndex + 1} · {swing.envelopeSec[0].toFixed(2)}–
            {swing.envelopeSec[1].toFixed(2)} s ·{' '}
            {swing.impactSec === null ? 'no impact' : `impact ${swing.impactSec.toFixed(2)} s`} ·{' '}
            {swing.frames.length} frames
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {swing.frames.map((frame, i) => (
              <FrameCard key={i} frame={frame} />
            ))}
          </div>
        </section>
      ))}

      {run && run.swings.length === 0 && (
        <div className="space-y-1 text-xs text-muted">
          <p>No swing passed production&apos;s gate in this clip.</p>
          {run.rejected.map((r, i) => (
            <p key={i} className="font-mono">
              {r}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** The numbers this view exists to produce: per-frame inference time, on this device. */
function RunSummary({ run }: { run: PreviewRun }) {
  const t = run.timing;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-card border border-line bg-surface
                   p-3 text-xs font-mono">
      <Row label="clip" value={run.clipName} />
      <Row label="pose samples" value={String(run.poseSamples)} />
      <Row label="swings" value={String(run.swings.length)} />
      <Row label="frames" value={String(t?.frames ?? 0)} />
      <Row label="session load" value={`${run.sessionLoadMs} ms`} />
      {t && <Row label="inference median" value={`${t.medianMs} ms`} />}
      {t && <Row label="inference mean" value={`${t.meanMs} ms`} />}
      {t && <Row label="inference min/max" value={`${t.minMs} / ${t.maxMs} ms`} />}
      {t && <Row label="preprocess median" value={`${t.medianPreprocessMs} ms`} />}
    </dl>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-faint">{label}</dt>
      <dd className="text-fg-dim truncate">{value}</dd>
    </>
  );
}

function FrameCard({ frame }: { frame: PreviewFrame }) {
  const d = frame.detection;
  const angle = shaftAngleDeg(d);
  return (
    <figure className="space-y-1">
      <div className="relative rounded-card overflow-hidden bg-black">
        <img
          src={`data:image/jpeg;base64,${frame.jpegBase64}`}
          alt=""
          className="block w-full"
        />
        {d && <ShaftOverlay detection={d} />}
      </div>
      <figcaption className="text-[10px] leading-tight font-mono text-faint space-y-0.5">
        <div>
          {frame.tSec.toFixed(2)} s · {frame.phase}
        </div>
        {frame.error ? (
          <div className="text-red-400">{frame.error}</div>
        ) : d ? (
          <>
            <div>
              box {d.boxConf.toFixed(2)} · {Math.round(d.inferenceMs)} ms
            </div>
            <div>
              butt {d.butt ? d.butt.conf.toFixed(2) : '—'} · hosel{' '}
              {d.hosel ? d.hosel.conf.toFixed(2) : '—'}
              {angle === null ? '' : ` · ${angle.toFixed(1)}°`}
            </div>
          </>
        ) : null}
      </figcaption>
    </figure>
  );
}

/**
 * Butt and hosel as dots with the shaft line between them, drawn in the SOURCE
 * image's coordinate space via the viewBox — see the file header for why that is
 * the whole point rather than a convenience.
 *
 * Stroke widths are given as a fraction of the image height so the overlay reads the
 * same on a 720×818 web clip and a 1080×1920 phone clip.
 */
function ShaftOverlay({ detection }: { detection: ShaftDetection }) {
  const { width, height } = detection.imageSize;
  const unit = height / 200;
  const { butt, hosel } = detection;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden
    >
      {butt && hosel && (
        <line
          x1={butt.x}
          y1={butt.y}
          x2={hosel.x}
          y2={hosel.y}
          stroke="#facc15"
          strokeWidth={unit}
          strokeLinecap="round"
        />
      )}
      {/* Butt green, hosel magenta — two hues, not two sizes, so the DIRECTION of the
          butt → hosel vector is readable at thumbnail size. */}
      {butt && <circle cx={butt.x} cy={butt.y} r={unit * 2} fill="#22c55e" />}
      {hosel && <circle cx={hosel.x} cy={hosel.y} r={unit * 2} fill="#e879f9" />}
    </svg>
  );
}
