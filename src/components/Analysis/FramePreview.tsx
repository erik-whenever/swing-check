import { useState } from 'react';
import { useSessionStore } from '../../store/session';
import { FrameLightbox } from './FrameLightbox';

export function FramePreview() {
  const meta = useSessionStore((s) => s.currentFrameMeta);
  const setView = useSessionStore((s) => s.setView);
  const setIsAnalyzing = useSessionStore((s) => s.setIsAnalyzing);
  const setCurrentFrames = useSessionStore((s) => s.setCurrentFrames);
  const setCurrentFrameMeta = useSessionStore((s) => s.setCurrentFrameMeta);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const maxScore = Math.max(...meta.map((m) => m.score), 1);
  const swingStartIndex = meta.findIndex((m) => m.isSwingStart);

  const handleSend = () => {
    setIsAnalyzing(true);
    setView('analysis');
  };

  const handleDiscard = () => {
    setCurrentFrames([]);
    setCurrentFrameMeta([]);
    setView('camera');
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Frame Preview</h2>
          <span className="text-xs text-faint bg-surface px-2 py-1 rounded">
            DEV MODE
          </span>
        </div>

        <p className="text-xs text-muted">
          {meta.length} frames selected from recording. Swing start detected at
          candidate frame #{meta.find((m) => m.isSwingStart)?.candidateIndex ?? '?'}.
          Tap any frame to zoom and inspect.
        </p>

        {swingStartIndex >= 0 && (
          <button
            onClick={() => setLightboxIndex(swingStartIndex)}
            className="w-full py-2 bg-amber-700 hover:bg-amber-600 rounded-lg text-sm font-medium transition-colors"
          >
            🔍 Inspect swing start frame
          </button>
        )}

        {/* Frame grid */}
        <div className="grid grid-cols-2 gap-2">
          {meta.map((frame, i) => (
            <button
              key={i}
              onClick={() => setLightboxIndex(i)}
              className={`text-left rounded-lg overflow-hidden border-2 cursor-zoom-in ${
                frame.isSwingStart
                  ? 'border-amber-500'
                  : frame.isAddress
                    ? 'border-blue-500'
                    : 'border-line'
              }`}
            >
              <div className="relative">
                <img
                  src={`data:image/jpeg;base64,${frame.b64}`}
                  alt={`Frame ${i + 1}`}
                  className="w-full aspect-video object-cover"
                />
                {/* Labels */}
                <div className="absolute top-1 left-1 flex gap-1">
                  {frame.phase && (
                    <span className="px-1.5 py-0.5 bg-black/70 rounded text-[10px] font-bold uppercase tracking-wide">
                      {frame.phase}
                    </span>
                  )}
                  {frame.isSwingStart && (
                    <span className="px-1.5 py-0.5 bg-amber-600 rounded text-[10px] font-bold">
                      START
                    </span>
                  )}
                </div>
                <span className="absolute top-1 right-1 px-1.5 py-0.5 bg-black/70 rounded text-[10px] font-mono">
                  #{frame.candidateIndex}
                  {frame.timeSec !== undefined && ` · ${frame.timeSec.toFixed(2)}s`}
                </span>
              </div>

              {/* Motion score bar */}
              <div className="bg-surface px-2 py-1.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted">motion</span>
                  <span className="text-[10px] font-mono text-fg-dim">
                    {frame.score.toFixed(1)}
                  </span>
                </div>
                <div className="h-1 bg-raised rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      frame.score / maxScore > 0.6
                        ? 'bg-accent-hover'
                        : frame.score / maxScore > 0.3
                          ? 'bg-yellow-500'
                          : 'bg-faint'
                    }`}
                    style={{ width: `${(frame.score / maxScore) * 100}%` }}
                  />
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={handleDiscard}
            className="flex-1 py-3 bg-raised hover:bg-raised-hi rounded-lg text-sm font-medium transition-colors"
          >
            Discard
          </button>
          <button
            onClick={handleSend}
            className="flex-1 py-3 bg-accent-press hover:bg-accent rounded-lg text-sm font-medium transition-colors"
          >
            Send to Claude
          </button>
        </div>
      </div>

      {lightboxIndex !== null && (
        <FrameLightbox
          frames={meta}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </div>
  );
}
