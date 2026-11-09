// The chain (docs/spec/desafio-corrente.md, "Ver a corrente"): on the sheet, a message on where it
// stands, the streak and the breaks, a calendar with one circle per day, and the saved breaks with
// who saved them.
import type { ChainDayView, ChainView } from '../../../application/api-contract';
import { addDays } from '../../../domain/time/zones';
import { strings } from '../../../domain/strings';
import { formatDayMonth, todayDate } from '../../format';
import { PaceIcon } from '../../icons';

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

function ChainMessage({ chain }: { chain: ChainView }) {
  const risk = savable(chain.days);
  const last = chain.days.filter((d) => d.state !== 'future').at(-1);
  const [title, body, tone] = risk
    ? [c.message.atRisk(formatDayMonth(risk.date)), c.message.atRiskBody(formatDayMonth(addDays(risk.date, 1))), 'behind' as const]
    : last?.state === 'waiting'
      ? [c.message.waiting, c.message.waitingBody, 'finalStretch' as const]
      : [c.message.firm, c.message.firmBody(c.streak(chain.streak)), 'ahead' as const];
  return (
    <div className="sheet-note" role="status">
      <div className="sheet-note-icon">
        <PaceIcon tone={tone} />
      </div>
      <div>
        <strong>{title}</strong>
        <span>{body}</span>
      </div>
    </div>
  );
}

/**
 * The chain on the sheet. `message` says where it stands, once it has started and while it is open;
 * the numbers show only while it is open, since the result in the top carries them after.
 */
export function ChainPanel({ chain, open, message }: { chain: ChainView; open: boolean; message: boolean }) {
  const today = todayDate();
  const blanks = chain.days.length > 0 ? weekday(chain.days[0].date) : 0;
  const saved = chain.days.filter((d) => d.state === 'saved');
  const numbers = [
    { value: c.streak(chain.streak), note: c.streakNote },
    { value: c.breaks(chain.lost, chain.allowedBreaks), note: c.breaksNote },
    { value: String(chain.saved), note: c.savedNote(chain.saved) },
  ];

  return (
    <>
      {open && (
        <div className="sheet-section">
          {message && <ChainMessage chain={chain} />}
          <div className="sheet-numbers">
            {numbers.map((n) => (
              <div key={n.note}>
                <div className="d sheet-number-value">{n.value}</div>
                <div className="sheet-number-note">{n.note}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="sheet-band" />
      <section className="sheet-section" aria-label={c.calendar}>
        <div>
          <h2 className="d">{c.calendar}</h2>
          <div className="sheet-foot">{c.rules(chain.allowedBreaks, chain.minMinutesPerDay)}</div>
        </div>
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

      <div className="sheet-band" />
      <section className="sheet-section">
        <h2 className="d">{c.savedTitle}</h2>
        {saved.length === 0 ? (
          <p className="sheet-foot" style={{ margin: 0 }}>
            {c.savedEmpty}
          </p>
        ) : (
          <div className="sheet-list">
            {saved.map((d) => (
              <div key={d.date} className="sheet-row chain-saved-row">
                <div className="chain-day saved" aria-hidden="true">
                  {Number(d.date.slice(8))}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="sheet-row-name">{formatDayMonth(d.date)}</div>
                  <div className="sheet-row-sub">{c.savedBy(c.and(d.savedBy.map((s) => s.name)))}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
