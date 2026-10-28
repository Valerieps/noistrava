// "Histórico" (docs/spec/desafio-horas.md): the closed challenges, newest first, with the result,
// the total, the percent and each Senhora's total; a chain shows its breaks saved and lost
// (docs/spec/desafio-corrente.md).
import type { HistoryItemView } from '../../application/api-contract';
import { formatDuration, formatGoal } from '../../domain/challenge/progress';
import { strings } from '../../domain/strings';
import { formatMonthYear } from '../format';
import { TONES } from '../palette';
import { useQuery } from '../use-query';

const DAY_MS = 86_400_000;

export function History() {
  const history = useQuery('history', {}, ['history']);
  const items = history.data ?? [];
  const totalSeconds = items.reduce((sum, c) => sum + c.totalSeconds, 0);
  const met = items.filter((c) => c.state === 'succeeded').length;

  return (
    <div className="screen">
      <h1 className="d screen-title" style={{ color: 'var(--color-text)' }}>
        {strings.history.title}
      </h1>
      {history.error && !history.data && (
        <p className="notice" role="alert">
          {strings.genericError}
        </p>
      )}
      {history.data && items.length === 0 && <p className="muted">{strings.history.empty}</p>}
      {items.length > 0 && (
        <section className="tiles tiles-2">
          <div className="tile">
            <div className="d text-xl">
              {Math.floor(totalSeconds / 3600)}h
            </div>
            <div className="tile-note">{strings.history.totalHours}</div>
          </div>
          <div className="tile">
            <div className="d text-xl">
              {strings.history.goalsMet(met, items.length)}
            </div>
            <div className="tile-note">{strings.history.goalsMetLabel}</div>
          </div>
        </section>
      )}
      {items.map((item) => (
        <HistoryCard key={item.id} item={item} />
      ))}
    </div>
  );
}

function stateChip(item: HistoryItemView): { text: string; tone: string } {
  if (item.chain && item.state !== 'cancelled') {
    return item.state === 'succeeded' ? { text: strings.chain.history.succeeded, tone: 'ok' } : { text: strings.chain.history.failed, tone: 'warn' };
  }
  if (item.state === 'succeeded') {
    const days = item.endedAt ? Math.max(1, Math.ceil((Date.parse(item.endedAt) - Date.parse(item.startsAt)) / DAY_MS)) : 0;
    return { text: strings.history.succeeded(days), tone: 'ok' };
  }
  if (item.state === 'failed') return { text: strings.history.failed(item.percent), tone: 'warn' };
  return { text: strings.history.cancelled, tone: 'plain' };
}

function HistoryCard({ item }: { item: HistoryItemView }) {
  const chip = stateChip(item);
  const goalSeconds = item.goalMinutes * 60;
  // The bar fills to the goal; past it, to the total.
  const scale = (item.chain ? item.totalSeconds : Math.max(goalSeconds, item.totalSeconds)) || 1;
  const cancelledDay = item.state === 'cancelled' && item.endedAt ? Math.max(1, Math.ceil((Date.parse(item.endedAt) - Date.parse(item.startsAt)) / DAY_MS)) : null;
  return (
    <article className="history-card">
      <div className="row" style={{ margin: 0, alignItems: 'flex-start' }}>
        <div className="history-thumb striped" aria-hidden="true" />
        <div className="grow">
          <h2 className="ellipsis card-title">
            {item.name}
          </h2>
          <div className="small muted">{formatMonthYear(item.startsAt)}</div>
        </div>
        <span className={`chip ${chip.tone}`}>{chip.text}</span>
      </div>
      <div className="split" style={{ alignItems: 'baseline' }}>
        <div className="d text-xl">
          {item.chain
            ? strings.chain.history.summary(item.chain.saved, item.chain.lost, item.chain.allowedBreaks)
            : item.state === 'succeeded'
              ? formatDuration(item.totalSeconds)
              : strings.history.totalOfGoal(formatDuration(item.totalSeconds), formatGoal(item.goalMinutes))}
        </div>
        <div className="small muted">{cancelledDay ? strings.history.cancelledOn(cancelledDay) : strings.history.senhoras(item.results.length)}</div>
      </div>
      <div className="stacked-bar" aria-hidden="true">
        {item.results
          .filter((r) => r.totalSeconds > 0)
          .map((r, i) => (
            <div key={r.memberId} style={{ width: `${(r.totalSeconds / scale) * 100}%`, background: TONES[i % TONES.length] }} />
          ))}
      </div>
      <div className="result-legend">
        {item.results.map((r) => (
          <span key={r.memberId}>
            <b>{r.name}</b> {formatDuration(r.totalSeconds)}
          </span>
        ))}
      </div>
    </article>
  );
}
