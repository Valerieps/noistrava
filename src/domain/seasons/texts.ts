// How a ranking's value and "quanto falta" read (docs/spec/corrida-das-estacoes.md, "Onde eu vejo"):
// each ranking has its own unit, and the Relógio Suíço compares variations instead of a distance.
import { formatDuration } from '../challenge/progress';
import { strings } from '../strings';
import type { CalendarDate } from '../time/zones';
import type { Gap, RankingKey } from './rankings';
import { sprintStart, stageDates, type Stage } from './stages';

const s = strings.seasons;

/** "13 out". */
export function shortDay(date: CalendarDate): string {
  return `${Number(date.slice(8, 10))} ${s.shortMonths[Number(date.slice(5, 7)) - 1]}`;
}

/** "Verão 2027". */
export function stageName(stage: Stage): string {
  return s.stage(s.names[stage.season], stage.year);
}

/** The variation of the Relógio Suíço, in whole percent. */
const percent = (fraction: number) => Math.round(fraction * 100);

/** A ranking's value as the group sees the first's: "31 atividades", "38h20", "variou só ±8%". */
export function valueText(key: RankingKey, value: number): string {
  switch (key) {
    case 'activities':
    case 'weekend':
    case 'sprint':
      return s.count(value, 'atividade', 'atividades');
    case 'momentum':
      return s.count(value, 'semana', 'semanas');
    case 'variety':
      return s.count(value, 'modalidade', 'modalidades');
    case 'hours':
    case 'marathon':
      return formatDuration(value);
    case 'comeback':
      return `+${formatDuration(value)}`;
    case 'steady':
      return s.variation(percent(value));
  }
}

const isTime = (key: RankingKey) => key === 'hours' || key === 'comeback';

function missingText(key: RankingKey, missing: number, leader: number): string {
  if (key === 'marathon') return s.gap.marathon(formatDuration(leader));
  const [one, many] = s.gapUnits[key];
  if (isTime(key)) return s.gap.missing(formatDuration(missing), true, one);
  return s.gap.missing(String(missing), missing !== 1, missing === 1 ? one : many);
}

/**
 * The sentence of what I miss to reach the first place. `leader` is the first's value; `mine`, my
 * own (only the Relógio Suíço needs it, to compare the variations).
 */
export function gapText(key: RankingKey, gap: Gap, leader: number | null, mine: number | null, stage: Stage): string {
  switch (gap.kind) {
    case 'leader':
      return s.gap.leader;
    case 'absent':
      return s.gap.absent;
    case 'behind':
      if (gap.tied) return s.gap.tied(s.tiebreaks[key]);
      if (key === 'steady') return s.gap.steady(percent(leader ?? 0), percent(mine ?? 0));
      return missingText(key, gap.missing, leader ?? 0);
    case 'out':
      if (gap.reason === 'notOpen') return s.gap.notOpen(shortDay(sprintStart(stage)), shortDay(stageDates(stage).end));
      if (gap.reason === 'fewWeeks') return s.gap.fewWeeks;
      if (gap.reason === 'missedWeek') return s.gap.missedWeek(shortDay(gap.week ?? stageDates(stage).start));
      if (gap.missing !== null && leader !== null) return missingText(key, gap.missing, leader);
      if (key === 'momentum') return s.gap.momentumZero;
      if (gap.reason === 'noIncrease') return s.gap.noIncrease;
      return s.gap.nobody;
  }
}
