import type { SwingRecord } from '../../types';

interface Props {
  record: SwingRecord;
}

export function SwingCard({ record }: Props) {
  const date = new Date(record.timestamp);
  const passCount = record.results.filter((r) => r.verdict === 'pass').length;
  const failCount = record.results.filter((r) => r.verdict === 'fail').length;
  const naCount = record.results.filter((r) => r.verdict === 'cannot_determine').length;

  return (
    <div className="p-3 bg-surface rounded-lg border border-line">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">
          {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        <div className="flex gap-2 text-xs">
          {passCount > 0 && (
            <span className="text-green-400">{passCount} pass</span>
          )}
          {failCount > 0 && (
            <span className="text-red-400">{failCount} fail</span>
          )}
          {naCount > 0 && (
            <span className="text-yellow-400">{naCount} N/A</span>
          )}
        </div>
      </div>

      {/* Frame thumbnails */}
      {record.frames.length > 0 && (
        <div className="flex gap-1 mb-2 overflow-x-auto">
          {record.frames.slice(0, 5).map((frame, i) => (
            <img
              key={i}
              src={`data:image/jpeg;base64,${frame}`}
              alt={`Frame ${i + 1}`}
              className="w-12 h-9 object-cover rounded flex-shrink-0"
            />
          ))}
        </div>
      )}

      <p className="text-xs text-muted line-clamp-2">
        {record.overallAssessment}
      </p>
    </div>
  );
}
