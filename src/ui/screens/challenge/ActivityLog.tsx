// The challenge's activity log: who, when, how long, the sport, and a heart anyone can send or
// take back, torcida included.
import { useState } from 'react';
import type { LogEntryView } from '../../../application/api-contract';
import { formatDuration, secondsToKm } from '../../../domain/challenge/progress';
import { strings } from '../../../domain/strings';
import { useServices } from '../../backend-context';
import { formatKm, formatWhen, initial, sportName } from '../../format';
import { HeartIcon } from '../../icons';

const PREVIEW = 4;

export function ActivityLog({
  challengeId,
  entries,
  journey,
  now,
  onChanged,
}: {
  challengeId: string;
  entries: readonly LogEntryView[];
  journey: boolean;
  now: Date;
  onChanged: () => void;
}) {
  const { backend } = useServices();
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const shown = all ? entries : entries.slice(0, PREVIEW);

  async function toggle(entry: LogEntryView) {
    setBusy(entry.activityId);
    const result = await backend.command('reaction.set', { challengeId, activityId: entry.activityId, heart: !entry.heartedByMe });
    setBusy(null);
    setError(!result.ok);
    onChanged();
  }

  return (
    <section className="stack" style={{ gap: 10 }}>
      <div className="section-head">
        <h2 className="d">{strings.challenge.log.title}</h2>
        {entries.length > PREVIEW && (
          <button type="button" className="link-button" onClick={() => setAll(!all)} aria-expanded={all}>
            {all ? strings.challenge.log.seeLess : strings.challenge.log.seeAll}
          </button>
        )}
      </div>
      {error && (
        <p className="notice" role="alert">
          {strings.genericError}
        </p>
      )}
      {entries.length === 0 && <p className="muted small">{strings.challenge.log.empty}</p>}
      {shown.map((entry) => (
        <div key={entry.activityId} className="log-row">
          <div className="initial large" aria-hidden="true">
            {initial(entry.memberName)}
          </div>
          <div className="stack" style={{ gap: 2, minWidth: 0 }}>
            <div>
              <b>{entry.memberName}</b> · {sportName(entry.sport).toLowerCase()}
            </div>
            <div className="small muted">
              {formatWhen(entry.startedAt, entry.timezone, now)}
              {journey && ` · ${formatDuration(entry.durationSeconds)} · +${formatKm(secondsToKm(entry.durationSeconds))}`}
            </div>
          </div>
          <div className="row" style={{ margin: 0, gap: 8 }}>
            {!journey && (
              <div className="d" style={{ fontSize: 17 }}>
                {formatDuration(entry.durationSeconds)}
              </div>
            )}
            <button
              type="button"
              className="heart"
              aria-pressed={entry.heartedByMe}
              aria-label={entry.heartedByMe ? strings.challenge.log.unheart(entry.memberName) : strings.challenge.log.heart(entry.memberName)}
              disabled={busy === entry.activityId}
              onClick={() => void toggle(entry)}
            >
              <HeartIcon filled={entry.heartedByMe} />
              {entry.hearts > 0 && entry.hearts}
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
