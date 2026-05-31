import { useState } from 'react';

interface Props {
  frames: string[];
}

export function FrameViewer({ frames }: Props) {
  const [index, setIndex] = useState(0);

  if (frames.length === 0) return null;

  return (
    <div className="space-y-2">
      {/* Large frame */}
      <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
        <img
          src={`data:image/jpeg;base64,${frames[index]}`}
          alt={`Frame ${index + 1}`}
          className="w-full h-full object-contain"
        />
        <span className="absolute top-2 right-2 px-2 py-0.5 bg-black/70 rounded text-xs font-mono">
          {index + 1} / {frames.length}
        </span>

        {/* Prev/Next tap zones */}
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="absolute inset-y-0 left-0 w-1/3 flex items-center justify-start pl-2
                     text-white/0 hover:text-white/80 active:text-white/80 transition-colors
                     disabled:pointer-events-none"
          aria-label="Previous frame"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={() => setIndex((i) => Math.min(frames.length - 1, i + 1))}
          disabled={index === frames.length - 1}
          className="absolute inset-y-0 right-0 w-1/3 flex items-center justify-end pr-2
                     text-white/0 hover:text-white/80 active:text-white/80 transition-colors
                     disabled:pointer-events-none"
          aria-label="Next frame"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Thumbnail strip */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {frames.map((frame, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            className={`w-14 h-10 flex-shrink-0 rounded overflow-hidden border-2 transition-colors ${
              i === index ? 'border-emerald-400' : 'border-transparent opacity-60'
            }`}
          >
            <img
              src={`data:image/jpeg;base64,${frame}`}
              alt={`Frame ${i + 1}`}
              className="w-full h-full object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
