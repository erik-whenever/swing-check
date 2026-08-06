import { useEffect, useState } from 'react';
import type { FrameMeta } from '../../lib/frameExtractor';
import type { PoseSample } from '../../lib/poseTrajectory';
import { SkeletonOverlay } from './SkeletonOverlay';
import { nearestSample } from '../../lib/poseSampling';

interface Props {
  frames: FrameMeta[];
  index: number;
  /** Dev-only pose trajectory; when present the skeleton is overlaid. */
  poseSamples?: PoseSample[] | null;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export function FrameLightbox({ frames, index, poseSamples, onClose, onNavigate }: Props) {
  const [zoom, setZoom] = useState(1);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  // Aspect ratio of the loaded frame, so the overlay box matches the letterboxed
  // (object-contain) image exactly.
  const [aspect, setAspect] = useState<number | null>(null);

  const frame = frames[index];

  // Reset zoom when switching frames
  useEffect(() => {
    setZoom(1);
    setOrigin({ x: 50, y: 50 });
  }, [index]);

  // Keyboard: arrows to navigate, esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && index > 0) onNavigate(index - 1);
      if (e.key === 'ArrowRight' && index < frames.length - 1) onNavigate(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, frames.length, onClose, onNavigate]);

  const cycleZoom = () => setZoom((z) => (z >= 4 ? 1 : z === 1 ? 2 : z + 1));

  // Track cursor so zoom focuses on the point of interest
  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (zoom === 1) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setOrigin({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-mono text-slate-300">#{frame.candidateIndex}</span>
          {frame.isSwingStart && (
            <span className="px-1.5 py-0.5 bg-amber-600 rounded text-[10px] font-bold">
              SWING START
            </span>
          )}
          {frame.isAddress && !frame.isSwingStart && (
            <span className="px-1.5 py-0.5 bg-blue-600 rounded text-[10px] font-bold">
              ADDRESS
            </span>
          )}
          <span className="text-slate-400 font-mono">motion {frame.score.toFixed(1)}</span>
        </div>
        <button onClick={onClose} className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded">
          Close
        </button>
      </div>

      {/* Zoomable image */}
      <div
        className="flex-1 overflow-hidden flex items-center justify-center cursor-zoom-in"
        onClick={cycleZoom}
        onMouseMove={handleMove}
        style={{ cursor: zoom > 1 ? 'zoom-out' : 'zoom-in' }}
      >
        {/* Wrapper sized to the image aspect so the skeleton overlay aligns. */}
        <div
          className="relative max-w-full max-h-full transition-transform duration-100"
          style={{
            aspectRatio: aspect ?? undefined,
            transform: `scale(${zoom})`,
            transformOrigin: `${origin.x}% ${origin.y}%`,
          }}
        >
          <img
            src={`data:image/jpeg;base64,${frame.b64}`}
            alt={`Frame #${frame.candidateIndex}`}
            className="w-full h-full object-contain select-none"
            onLoad={(e) =>
              setAspect(
                e.currentTarget.naturalWidth / e.currentTarget.naturalHeight,
              )
            }
            draggable={false}
          />
          {poseSamples && (
            <SkeletonOverlay
              sample={nearestSample(poseSamples, frame.timeSec)}
              fit="contain"
            />
          )}
        </div>
      </div>

      {/* Footer: nav + zoom level */}
      <div className="flex items-center justify-between p-3 text-sm">
        <button
          onClick={() => onNavigate(index - 1)}
          disabled={index === 0}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded disabled:opacity-30"
        >
          ← Prev
        </button>
        <span className="text-slate-400 font-mono text-xs">
          {index + 1} / {frames.length} · zoom {zoom}× (click to zoom)
        </span>
        <button
          onClick={() => onNavigate(index + 1)}
          disabled={index === frames.length - 1}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded disabled:opacity-30"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
