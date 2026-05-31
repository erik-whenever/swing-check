import { useState } from 'react';
import { useHistory } from '../../hooks/useHistory';
import { SwingCard } from './SwingCard';
import { StatsView } from './StatsView';

type Tab = 'swings' | 'stats';

export function HistoryList() {
  const { records, loading } = useHistory();
  const [tab, setTab] = useState<Tab>('swings');

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4">
        <h2 className="text-lg font-semibold mb-3">Historik</h2>

        {/* Segmented control: swing list vs. per-rule stats. */}
        <div className="flex p-0.5 mb-4 bg-surface rounded-lg border border-line text-sm">
          <SegButton active={tab === 'swings'} onClick={() => setTab('swings')}>
            Svingar
          </SegButton>
          <SegButton active={tab === 'stats'} onClick={() => setTab('stats')}>
            Statistik
          </SegButton>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {tab === 'swings' ? (
          <SwingsTab records={records} loading={loading} />
        ) : (
          <StatsView />
        )}
      </div>
    </div>
  );
}

function SegButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 py-1.5 rounded-md font-medium transition-colors ${
        active ? 'bg-accent-press text-white' : 'text-faint hover:text-fg-dim'
      }`}
    >
      {children}
    </button>
  );
}

function SwingsTab({
  records,
  loading,
}: {
  records: ReturnType<typeof useHistory>['records'];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-faint">Laddar historik…</p>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="flex items-center justify-center h-full px-4">
        <p className="text-sm text-faint text-center">
          Inga svingar inspelade än. Börja med att spela in en!
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 pb-4">
      <div className="space-y-3">
        {records.map((record) => (
          <SwingCard key={record.id} record={record} />
        ))}
      </div>
    </div>
  );
}
