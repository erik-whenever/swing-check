import type { SwingRecord } from '../../types';
import { ANGLE_LABEL } from '../../lib/cameraAngle';
import { useT } from '../../lib/i18n';
import { swingScore } from '../../lib/swingScore';
import { Card, ScoreRing } from '../ui';

interface Props {
  record: SwingRecord;
}

/**
 * One saved swing. Thumbnail, when and from where, how many rules passed, and the
 * score as a ring — the row answers "was that a good one?" without being opened.
 */
export function SwingCard({ record }: Props) {
  const t = useT();
  const date = new Date(record.timestamp);
  const passCount = record.results.filter((r) => r.verdict === 'pass').length;
  const assessed = record.results.filter(
    (r) => r.verdict === 'pass' || r.verdict === 'fail',
  ).length;

  // A mid-swing frame, not frame 0: every address looks the same, so a column of
  // first frames identifies nothing.
  const thumb = record.frames[Math.floor(record.frames.length / 2)] ?? record.frames[0];

  return (
    <Card className="flex items-center gap-3 animate-rise-in">
      {thumb ? (
        <img
          src={`data:image/jpeg;base64,${thumb}`}
          alt=""
          className="w-[50px] h-[62px] flex-none rounded-chip object-cover bg-raised"
        />
      ) : (
        <div className="w-[50px] h-[62px] flex-none rounded-chip bg-raised" />
      )}

      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold">
          {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {record.cameraAngle && (
            <span className="font-medium text-muted"> · {ANGLE_LABEL[record.cameraAngle]}</span>
          )}
        </p>
        <p className="mt-1 text-[10.5px] text-muted">
          {t('history.passOf', { pass: passCount, total: assessed })}
        </p>
        {record.overallAssessment && (
          <p className="mt-1 text-[10.5px] leading-[1.4] text-faint line-clamp-2">
            {record.overallAssessment}
          </p>
        )}
      </div>

      <ScoreRing value={swingScore(record)} size={34} />
    </Card>
  );
}
