// Renders a shareable swing clip: the recorded video re-drawn onto a canvas with the
// rule-result overlay and a SwingCheck watermark, captured via MediaRecorder into a new
// video blob. Designed for the Web Share API (navigator.share with files) with a download
// fallback handled by the caller.
import { createLogger } from './logger';

const log = createLogger('videoExport');

/** Hard cap on clip length (seconds) — keeps the share payload small and snappy. */
const MAX_DURATION_S = 15;
const FPS = 30;

export interface OverlayLine {
  label: string;
  verdict: 'pass' | 'fail' | 'cannot_determine';
}

export interface ExportedClip {
  blob: Blob;
  ext: 'mp4' | 'webm';
}

/** Whether the canvas-capture export pipeline is usable in this browser. */
export function isClipExportSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function'
  );
}

function pickMimeType(): string | undefined {
  const candidates = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m));
}

function loadVideo(blob: Blob): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = URL.createObjectURL(blob);
    video.onloadedmetadata = () => resolve(video);
    video.onerror = () => reject(new Error('Could not load recorded video for export'));
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draw the result list (bottom) + watermark (top-right) over the current video frame. */
function drawOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, lines: OverlayLine[]) {
  const scale = w / 720; // design sizes against a 720px-wide reference
  const pad = 16 * scale;
  const fontSize = Math.max(13, 20 * scale);
  const lineH = fontSize * 1.5;

  // Watermark
  ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  const mark = '🏌️ SwingCheck';
  const markW = ctx.measureText(mark).width;
  roundRect(ctx, w - markW - pad * 2.5, pad, markW + pad * 1.5, lineH, 8 * scale);
  ctx.fillStyle = 'rgba(15, 61, 46, 0.7)';
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText(mark, w - markW - pad * 1.75, pad + lineH / 2);

  if (lines.length === 0) return;

  // Result panel at the bottom.
  const shown = lines.slice(0, 6);
  const panelH = shown.length * lineH + pad;
  const panelY = h - panelH - pad;
  roundRect(ctx, pad, panelY, w - pad * 2, panelH, 10 * scale);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fill();

  ctx.textAlign = 'left';
  shown.forEach((line, i) => {
    const y = panelY + pad / 2 + lineH * (i + 0.5);
    const icon = line.verdict === 'pass' ? '✓' : line.verdict === 'fail' ? '✗' : '–';
    ctx.fillStyle = line.verdict === 'pass' ? '#4ade80' : line.verdict === 'fail' ? '#f87171' : '#cbd5e1';
    ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
    ctx.fillText(icon, pad * 1.5, y);
    ctx.fillStyle = '#ffffff';
    ctx.font = `500 ${fontSize}px system-ui, sans-serif`;
    ctx.fillText(line.label, pad * 1.5 + fontSize * 1.4, y);
  });
}

/**
 * Produce a shareable clip (≤15s) of the recorded swing with the result overlay burned in.
 */
export async function exportSwingClip(videoBlob: Blob, lines: OverlayLine[]): Promise<ExportedClip> {
  if (!isClipExportSupported()) throw new Error('Clip export not supported in this browser');

  const video = await loadVideo(videoBlob);
  const url = video.src;
  try {
    const w = video.videoWidth || 720;
    const h = video.videoHeight || 1280;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');

    const mimeType = pickMimeType();
    const stream = canvas.captureStream(FPS);
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });

    recorder.start();
    await video.play();
    const startedAt = performance.now();

    await new Promise<void>((resolve) => {
      const draw = () => {
        ctx.drawImage(video, 0, 0, w, h);
        drawOverlay(ctx, w, h, lines);
        const elapsed = (performance.now() - startedAt) / 1000;
        if (video.ended || elapsed >= MAX_DURATION_S) {
          resolve();
          return;
        }
        requestAnimationFrame(draw);
      };
      requestAnimationFrame(draw);
    });

    video.pause();
    recorder.stop();
    await stopped;

    const type = mimeType?.split(';')[0] || 'video/webm';
    const ext: ExportedClip['ext'] = type.includes('mp4') ? 'mp4' : 'webm';
    const blob = new Blob(chunks, { type });
    log.info('Swing clip exported', { ext, sizeKb: Math.round(blob.size / 1024), lines: lines.length });
    return { blob, ext };
  } finally {
    URL.revokeObjectURL(url);
  }
}
