// "Histórico" (docs/spec/desafio-horas.md): the closed challenges, newest first. A card shows the
// name, the month and the result; opening it shows the final ranking and the progress charts
// (docs/spec/desafio-corrente.md for a chain's calendar).
import { useState } from 'react';
import type { HistoryItemView } from '../../application/api-contract';
import { formatDuration, formatGoal, pace } from '../../domain/challenge/progress';
import { strings } from '../../domain/strings';
import { formatDayMonth, formatKm, formatMonthYear } from '../format';
import { ChevronIcon } from '../icons';
import { useQuery } from '../use-query';
import { ChainPanel } from './challenge/ChainPanel';
import { journeyNumbers, ProgressFigure, useProgressView, ViewPicker, type ProgressNumbers } from './challenge/ProgressPanel';
import { JourneyRanking, Ranking } from './challenge/Ranking';

export function History() {
  const history = useQuery('history', {}, ['history']);
  const me = useQuery('me', {}, ['me']);
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
        <HistoryCard key={item.id} item={item} meId={me.data?.id ?? ''} />
      ))}
    </div>
  );
}

function stateChip(item: HistoryItemView): { text: string; tone: string } {
  if (item.state === 'succeeded') return { text: strings.history.succeeded, tone: 'ok' };
  if (item.state === 'failed') return { text: strings.history.failed, tone: 'warn' };
  return { text: strings.history.cancelled, tone: 'plain' };
}

function HistoryCard({ item, meId }: { item: HistoryItemView; meId: string }) {
  const [open, setOpen] = useState(false);
  const chip = stateChip(item);
  const panelId = `history-${item.id}`;
  return (
    <article className="history-card">
      <button type="button" className="history-toggle" aria-expanded={open} aria-controls={panelId} aria-label={open ? strings.history.collapse(item.name) : strings.history.expand(item.name)} onClick={() => setOpen(!open)}>
        <div className={`history-thumb banner-${item.banner}`} aria-hidden="true" />
        <div className="grow">
          <h2 className="ellipsis card-title">{item.name}</h2>
          <div className="small muted">{formatMonthYear(item.startsAt)}</div>
        </div>
        <span className={`chip ${chip.tone}`}>{chip.text}</span>
        <span className={`history-chevron${open ? ' open' : ''}`} aria-hidden="true">
          <ChevronIcon />
        </span>
      </button>
      <div id={panelId}>{open && <HistoryDetail item={item} meId={meId} />}</div>
    </article>
  );
}

/** Loaded only when the card opens: the progress charts and the final ranking, as on the challenge's sheet. */
function HistoryDetail({ item, meId }: { item: HistoryItemView; meId: string }) {
  const challenge = useQuery('challenge', { challengeId: item.id }, ['challenge', 'history']);
  const log = useQuery('challengeLog', { challengeId: item.id }, ['challenge', 'activities']);
  const [view, pickView] = useProgressView();
  const c = challenge.data?.challenge;
  if (!c || !log.data) {
    return challenge.error || log.error ? (
      <p className="notice" role="alert">
        {strings.genericError}
      </p>
    ) : (
      <p className="muted small">{strings.history.loading}</p>
    );
  }
  const entries = log.data;
  const period = { startsAt: c.startsAt, endsAt: c.endsAt };
  const end = new Date(c.endedAt ?? c.endsAt);
  const goalSeconds = c.goalMinutes * 60;
  const journey = c.journey;
  const p = pace(period, c.goalMinutes, c.totalSeconds, end);
  const numbers: ProgressNumbers = journey
    ? journeyNumbers(c, p, journey.progressMeters)
    : {
        headline: formatDuration(c.totalSeconds),
        effective: c.totalSeconds / goalSeconds,
        programmed: 0,
        ofLabel: strings.challenge.ofTheGoal,
        ringLabel: strings.challenge.ringLabel(formatDuration(c.totalSeconds), formatDuration(p.programmedSeconds)),
        goalCaption: strings.challenge.curveGoal(formatGoal(c.goalMinutes)),
      };
  const dateRange = [formatDayMonth(c.startDate), formatDayMonth(c.endDate)] as const;
  return (
    <div className="history-detail">
      {c.chain ? (
        <ChainPanel chain={c.chain} open={false} message={false} />
      ) : (
        <ProgressFigure
          view={view}
          picker={<ViewPicker view={view} onPick={pickView} />}
          numbers={numbers}
          of={journey ? strings.journey.heroOf(formatKm(journey.distanceMeters / 1000)) : strings.challenge.heroOf(formatGoal(c.goalMinutes))}
          barNote={journey ? strings.journey.heroBarNote(formatDuration(c.totalSeconds), formatGoal(c.goalMinutes), c.percent) : undefined}
          unit={!!journey}
          period={period}
          goalSeconds={goalSeconds}
          log={entries}
          now={end}
          dateRange={dateRange}
        />
      )}
      {journey ? (
        <JourneyRanking members={c.members} log={entries} now={end} />
      ) : (
        <Ranking members={c.members} log={entries} period={period} now={end} meId={meId} />
      )}
    </div>
  );
}
