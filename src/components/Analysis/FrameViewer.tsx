import { useState } from 'react';

interface Props {
  frames: string[];
}

/**
 * The analysed frames: one large frame plus the strip it was picked from.
 *
 * The strip is the honest part of this screen — it shows exactly what the model was
 * given, so a verdict that looks wrong can be traced to a frame that was wrong.
 */
export function FrameViewer({ frames }: Props) {
  const [index, setIndex] = useState(0);

  if (frames.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="relative rounded-[20px] overflow-hidden bg-raised border border-line aspect-[3/4]">
        <img
          src={`data:image/jpeg;base64,${frames[index]}`}
          alt={`Bildruta ${index + 1}`}
          className="w-full h-full object-contain"
        />
        <span className="absolute top-3 right-3 px-2.5 py-1 rounded-pill bg-surface/90 backdrop-blur
                         text-[10px] font-semibold tabular-nums text-fg-dim">
          {index + 1} / {frames.length}
        </span>

        {/* Full-height tap zones rather than small arrows: this is used one-handed,
            outdoors, with the phone at arm's length. */}
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="absolute inset-y-0 left-0 w-1/3 flex items-center justify-start pl-3
                     text-fg/0 hover:text-fg/60 active:text-fg/60 transition-colors
                     disabled:pointer-events-none"
          aria-label="Föregående bildruta"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={() => setIndex((i) => Math.min(frames.length - 1, i + 1))}
          disabled={index === frames.length - 1}
          className="absolute inset-y-0 right-0 w-1/3 flex items-center justify-end pr-3
                     text-fg/0 hover:text-fg/60 active:text-fg/60 transition-colors
                     disabled:pointer-events-none"
          aria-label="Nästa bildruta"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        {frames.map((frame, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            aria-current={i === index}
            className={`w-12 h-16 flex-shrink-0 rounded-chip overflow-hidden transition-all duration-200 ${
              i === index ? 'ring-2 ring-accent opacity-100' : 'opacity-55 hover:opacity-85'
            }`}
          >
            <img
              src={`data:image/jpeg;base64,${frame}`}
              alt={`Bildruta ${i + 1}`}
              className="w-full h-full object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
