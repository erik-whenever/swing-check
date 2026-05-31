import { useHistory } from '../../hooks/useHistory';
import { SwingCard } from './SwingCard';

export function HistoryList() {
  const { records, loading } = useHistory();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-faint">Loading history...</p>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-faint">
          No swings recorded yet. Start by recording one!
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4">
        <h2 className="text-lg font-semibold mb-4">History</h2>
        <div className="space-y-3">
          {records.map((record) => (
            <SwingCard key={record.id} record={record} />
          ))}
        </div>
      </div>
    </div>
  );
}
