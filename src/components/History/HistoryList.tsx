import { useMemo, useState } from 'react';
import { useHistory } from '../../hooks/useHistory';
import { SwingCard } from './SwingCard';
import { StatsView } from './StatsView';
import { useT } from '../../lib/i18n';
import type { TranslationKey } from '../../lib/i18n';
import { swingScore } from '../../lib/swingScore';
import type { SwingRecord } from '../../types';
import { Card, Segmented, Sparkline } from '../ui';

type Tab = 'swings' | 'stats';

const TREND_WINDOW = 10;

export function HistoryList() {
  const t = useT();
  const { records, loading } = useHistory();
  const [tab, setTab] = useState<Tab>('swings');

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-[18px] pt-2 pb-3">
        <h2 className="text-base font-semibold">{t('history.title')}</h2>
        <div className="mt-3">
          <Segmented
            full
            value={tab}
            onChange={setTab}
            options={[
              { value: 'swings', label: t('history.tab.swings') },
              { value: 'stats', label: t('history.tab.stats') },
            ]}
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === 'swings' ? <SwingsTab records={records} loading={loading} /> : <StatsView />}
      </div>
    </div>
  );
}

function SwingsTab({ records, loading }: { records: SwingRecord[]; loading: boolean }) {
  const t = useT();

  // Grouped by calendar day so the list reads as a practice log, not a flat feed.
  const groups = useMemo(() => {
    const byDay = new Map<string, SwingRecord[]>();
    for (const rec of records) {
      const key = new Date(rec.timestamp).toDateString();
      const bucket = byDay.get(key);
      if (bucket) bucket.push(rec);
      else byDay.set(key, [rec]);
    }
    return [...byDay.entries()];
  }, [records]);

  // Oldest → newest, so the line runs left-to-right the way time does.
  const trend = useMemo(
    () =>
      records
        .slice(0, TREND_WINDOW)
        .map(swingScore)
        .filter((s): s is number => s !== null)
        .reverse(),
    [records],
  );

  if (loading) return <Centered>{t('history.loading')}</Centered>;
  if (records.length === 0) return <Centered>{t('history.empty')}</Centered>;

  // Second half of the window against the first — a direction, not a regression.
  const delta =
    trend.length >= 4
      ? Math.round(
          (avg(trend.slice(Math.ceil(trend.length / 2))) -
            avg(trend.slice(0, Math.floor(trend.length / 2)))) *
            100,
        )
      : null;

  return (
    <div className="px-[18px] pb-6 space-y-4">
      {groups.map(([day, dayRecords]) => (
        <div key={day}>
          <p className="eyebrow text-muted px-1 mb-2">{dayLabel(day, t)}</p>
          <div className="space-y-2">
            {dayRecords.map((record) => (
              <SwingCard key={record.id} record={record} />
            ))}
          </div>
        </div>
      ))}

      {/* The trend sits last, not first: it summarises everything above it. */}
      {trend.length >= 2 && (
        <Card className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] text-muted">{t('history.trend', { count: trend.length })}</p>
            <p
              className={`mt-0.5 text-base font-semibold tabular-nums ${
                delta === null ? 'text-fg' : delta >= 0 ? 'text-ok' : 'text-bad'
              }`}
            >
              {delta === null ? '—' : `${delta >= 0 ? '+' : ''}${delta} %`}
            </p>
          </div>
          <Sparkline points={trend} />
        </Card>
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center h-full px-10">
      <p className="text-sm text-muted text-center leading-relaxed">{children}</p>
    </div>
  );
}

function dayLabel(day: string, t: (key: TranslationKey) => string): string {
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();
  if (day === today) return t('history.today');
  if (day === yesterday) return t('history.yesterday');
  return new Date(day).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function avg(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}
