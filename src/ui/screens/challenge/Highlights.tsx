// "Destaques": the longest activity, the strongest day, the streak, the zones in play and the
// share of each sport. All read from the log and the members' zones.
import type { LogEntryView } from '../../../application/api-contract';
import { formatDuration, formatOffset, highlights, sportShares, utcOffsetMinutes } from '../../../domain/challenge/progress';
import { strings } from '../../../domain/strings';
import { formatDayMonth, sportName } from '../../format';
import { TONES } from '../../palette';

export function Highlights({ log, zones, now }: { log: readonly LogEntryView[]; zones: readonly string[]; now: Date }) {
  const h = highlights(log);
  const shares = sportShares(log);
  const offsets = [...new Set(zones.map((z) => utcOffsetMinutes(z, now)))].sort((a, b) => a - b);

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
          {h.strongestDay && <Tile label={strings.challenge.highlights.strongestDay} value={formatDuration(h.strongestDay.seconds)} note={formatDayMonth(h.strongestDay.date)} />}
          <Tile label={strings.challenge.highlights.streak} value={strings.challenge.highlights.streakValue(h.streakDays)} note={strings.challenge.highlights.streakNote} />
          {offsets.length > 0 && (
            <Tile
              label={strings.challenge.highlights.zones}
              value={String(offsets.length)}
              note={strings.challenge.highlights.zonesRange(formatOffset(offsets[0]), formatOffset(offsets[offsets.length - 1]))}
            />
          )}
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
