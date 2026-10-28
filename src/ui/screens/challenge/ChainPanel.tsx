// The chain (docs/spec/desafio-corrente.md, "Ver a corrente"): a message on where it stands, the
// streak and the breaks, a calendar with one square per day, and the saved breaks with who saved them.
import type { ChainDayView, ChainView } from '../../../application/api-contract';
import { addDays } from '../../../domain/time/zones';
import { strings } from '../../../domain/strings';
import { formatDayMonth, todayDate } from '../../format';

const c = strings.chain;

/** Monday is 0. */
function weekday(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/**
 * A break the next day can still save: decided and at risk, or, more often, yesterday with no link
 * while today has begun.
 */
function savable(days: readonly ChainDayView[]): ChainDayView | undefined {
  const started = days.filter((d) => d.state !== 'future');
  return started.find((d) => d.state === 'at_risk') ?? started.slice(0, -1).find((d) => d.state === 'waiting');
}

export function ChainMessage({ chain }: { chain: ChainView }) {
  const risk = savable(chain.days);
  const last = chain.days.filter((d) => d.state !== 'future').at(-1);
  const [title, body, tone] = risk
    ? [c.message.atRisk(formatDayMonth(risk.date)), c.message.atRiskBody(formatDayMonth(addDays(risk.date, 1))), 'tone-behind']
    : last?.state === 'waiting'
      ? [c.message.waiting, c.message.waitingBody, 'tone-finalStretch']
      : [c.message.firm, c.message.firmBody(c.streak(chain.streak)), 'tone-ahead'];
  return (
    <div className={`message ${tone}`} role="status">
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  );
}

export function ChainPanel({ chain }: { chain: ChainView }) {
  const today = todayDate();
  const blanks = chain.days.length > 0 ? weekday(chain.days[0].date) : 0;
  const saved = chain.days.filter((d) => d.state === 'saved');

  return (
    <>
      <section className="tiles tiles-3">
        <div className="tile">
          <div className="d text-xl">{c.streak(chain.streak)}</div>
          <div className="tile-note">{c.streakNote}</div>
        </div>
        <div className="tile">
          <div className="d text-xl">{c.breaks(chain.lost, chain.allowedBreaks)}</div>
          <div className="tile-note">{c.breaksNote}</div>
        </div>
        <div className="tile">
          <div className="d text-xl">{chain.saved}</div>
          <div className="tile-note">{c.savedNote(chain.saved)}</div>
        </div>
      </section>

      <section className="panel" aria-label={c.calendar}>
        <h2 className="d">{c.calendar}</h2>
        <div className="small muted">{c.rules(chain.allowedBreaks, chain.minMinutesPerDay)}</div>
        <div className="chain-grid">
          {c.weekdays.map((w, i) => (
            <div key={`w${i}`} className="chain-weekday" aria-hidden="true">
              {w}
            </div>
          ))}
          {Array.from({ length: blanks }, (_, i) => (
            <div key={`b${i}`} aria-hidden="true" />
          ))}
          {chain.days.map((d) => (
            <div
              key={d.date}
              className={`chain-day ${d.state}${d.date === today ? ' today' : ''}`}
              role="img"
              aria-label={c.dayLabel(formatDayMonth(d.date), c.states[d.state])}
              title={c.dayLabel(formatDayMonth(d.date), c.states[d.state])}
            >
              {Number(d.date.slice(8))}
            </div>
          ))}
        </div>
        <div className="legend">
          {(['linked', 'saved', 'lost', 'at_risk'] as const).map((s) => (
            <div key={s}>
              <span className={`chain-swatch ${s}`} />
              <span>{c.states[s]}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2 className="d">{c.savedTitle}</h2>
        {saved.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>
            {c.savedEmpty}
          </p>
        ) : (
          <ul className="list chain-saved">
            {saved.map((d) => (
              <li key={d.date}>
                <span className="chain-swatch saved" aria-hidden="true" />
                <span>
                  <b>{formatDayMonth(d.date)}</b> · {c.savedBy(c.and(d.savedBy.map((s) => s.name)))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
