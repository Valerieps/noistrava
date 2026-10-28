// "Destaques": the longest activity, the streak and the share of each sport, read from the log.
import type { LogEntryView } from '../../../application/api-contract';
import { formatDuration, highlights, sportShares } from '../../../domain/challenge/progress';
import { strings } from '../../../domain/strings';
import { sportName } from '../../format';
import { TONES } from '../../palette';

export function Highlights({ log }: { log: readonly LogEntryView[] }) {
  const h = highlights(log);
  const shares = sportShares(log);

  return (
    <section className="panel">
      <h2 className="d">{strings.challenge.highlights.title}</h2>
      {log.length === 0 ? (
        <p className="muted small">{strings.challenge.highlights.empty}</p>
      ) : (
        <div className="tiles tiles-2" style={{ gap: 10 }}>
          {h.longest && (
            <Tile label={strings.challenge.highlights.longest} value={formatDuration(h.longest.durationSeconds)} note={`${h.longest.memberName}, ${sportName(h.longest.sport).toLowerCase()}`} />
          )}
          <Tile label={strings.challenge.highlights.streak} value={strings.challenge.highlights.streakValue(h.streakDays)} note={strings.challenge.highlights.streakNote} />
        </div>
      )}
      {shares.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <div className="small" style={{ fontWeight: 600 }}>
            {strings.challenge.highlights.sports}
          </div>
          <div className="share-bar" aria-hidden="true">
            {shares.map((s, i) => (
              <div key={s.sport ?? 'outros'} style={{ width: `${s.share * 100}%`, background: TONES[i % TONES.length] }} />
            ))}
          </div>
          <div className="share-legend">
            {shares.map((s, i) => (
              <div key={s.sport ?? 'outros'} className="legend-item" style={{ gap: 6 }}>
                <span className="swatch" style={{ background: TONES[i % TONES.length] }} />
                {s.sport ? sportName(s.sport) : strings.otherSports} {Math.round(s.share * 100)}%
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="tile soft">
      <div className="tiny muted">{label}</div>
      <div className="d text-lg">
        {value}
      </div>
      <div className="small">{note}</div>
    </div>
  );
}
