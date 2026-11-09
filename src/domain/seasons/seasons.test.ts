import { describe, expect, it } from 'vitest';
import { addDays } from '../time/zones';
import { awardTitles, gapFor, standings, wholeWeeks, type RaceActivity, type RankingKey, type Standings } from './rankings';
import {
  compareStages,
  inRace,
  isYearEnd,
  nextStage,
  parseStageKey,
  previousStage,
  quarterStage,
  sprintStart,
  stageDates,
  stageKey,
  stageOf,
  stageStatusOn,
  stagesOf,
} from './stages';
import { gapText, shortDay, stageName, valueText } from './texts';

const SPRING = { year: 2026, season: 'spring' } as const;
const WINTER = { year: 2026, season: 'winter' } as const;

describe('stages', () => {
  it('runs each stage from the quarter start to two weeks before its last day', () => {
    expect(stageDates({ year: 2027, season: 'summer' })).toEqual({ start: '2027-01-01', end: '2027-03-17', closesOn: '2027-04-01' });
    expect(stageDates({ year: 2027, season: 'autumn' })).toEqual({ start: '2027-04-01', end: '2027-06-16', closesOn: '2027-07-01' });
    expect(stageDates({ year: 2027, season: 'winter' })).toEqual({ start: '2027-07-01', end: '2027-09-16', closesOn: '2027-10-01' });
    expect(stageDates(SPRING)).toEqual({ start: '2026-10-01', end: '2026-12-17', closesOn: '2027-01-01' });
  });

  it('gives a date the stage it counts for, none in the two weeks of the count', () => {
    expect(stageOf('2026-12-17')).toEqual(SPRING);
    expect(stageOf('2026-12-18')).toBeNull();
    expect(stageOf('2026-12-31')).toBeNull();
    expect(stageOf('2027-01-01')).toEqual({ year: 2027, season: 'summer' });
    expect(quarterStage('2026-12-31')).toEqual(SPRING);
  });

  it('walks the stages across the year and orders them', () => {
    expect(previousStage({ year: 2027, season: 'summer' })).toEqual(SPRING);
    expect(nextStage(SPRING)).toEqual({ year: 2027, season: 'summer' });
    expect(previousStage(SPRING)).toEqual(WINTER);
    expect(compareStages(WINTER, SPRING)).toBeLessThan(0);
    expect(inRace(WINTER)).toBe(false);
    expect(inRace(SPRING)).toBe(true);
    expect(stagesOf(2026)).toEqual([SPRING]);
    expect(stagesOf(2027)).toHaveLength(4);
  });

  it('names a stage by a key the API reads back', () => {
    expect(stageKey(SPRING)).toBe('2026-spring');
    expect(parseStageKey('2026-spring')).toEqual(SPRING);
    expect(parseStageKey('2026-fall')).toBeNull();
    expect(parseStageKey(42)).toBeNull();
    expect(stageName(SPRING)).toBe('Primavera 2026');
  });

  it('says where a stage stands on a date', () => {
    expect(stageStatusOn(SPRING, '2026-09-30')).toBe('upcoming');
    expect(stageStatusOn(SPRING, '2026-11-09')).toBe('running');
    expect(stageStatusOn(SPRING, '2026-12-18')).toBe('counting');
    expect(stageStatusOn(SPRING, '2027-01-01')).toBe('closed');
  });

  it('opens the year summary from 18 to 31 December', () => {
    expect(isYearEnd('2026-12-17')).toBe(false);
    expect(isYearEnd('2026-12-18')).toBe(true);
    expect(isYearEnd('2026-12-31')).toBe(true);
    expect(isYearEnd('2027-01-01')).toBe(false);
  });

  it('starts the sprint 7 days before the end', () => {
    expect(sprintStart(SPRING)).toBe('2026-12-11');
  });
});

describe('wholeWeeks', () => {
  it('counts only the Monday-to-Sunday weeks inside the stage that are over', () => {
    // Spring 2026 starts on a Thursday: the first whole week starts on Monday 5 Oct.
    expect(wholeWeeks(SPRING, '2026-10-17')).toEqual(['2026-10-05']);
    expect(wholeWeeks(SPRING, '2026-10-18')).toEqual(['2026-10-05', '2026-10-12']);
    // It ends on Thursday 17 Dec: the last whole week is 7 to 13 Dec.
    expect(wholeWeeks(SPRING, '2026-12-31').at(-1)).toBe('2026-12-07');
    expect(wholeWeeks(SPRING, '2026-12-31')).toHaveLength(10);
  });
});

function act(memberId: string, date: string, minutes: number, sport = 'Run', time = '10:00:00', timezone = 'UTC'): RaceActivity {
  return { memberId, startedAt: `${date}T${time}Z`, timezone, durationSeconds: minutes * 60, sport };
}

const members = (today: string, ...ids: string[]) => ids.map((id) => ({ id, today }));
const positions = (s: Standings, key: RankingKey) => s[key].entries.map((e) => [e.memberId, e.position]);

describe('standings', () => {
  it('counts each activity on its own zone date, and leaves out the count weeks', () => {
    const s = standings(SPRING, members('2027-01-01', 'ana', 'bia'), [
      // 18 Dec, 01:00 UTC is still 17 Dec in São Paulo: it counts; Bia's 19 Dec does not.
      act('ana', '2026-12-17', 30, 'Run', '23:30:00', 'UTC'),
      act('ana', '2026-12-18', 30, 'Run', '01:00:00', 'America/Sao_Paulo'),
      act('bia', '2026-12-19', 300),
    ]);
    expect(s.activities.entries).toMatchObject([{ memberId: 'ana', value: 2, position: 1 }]);
    expect(s.activities.scores.has('bia')).toBe(false);
  });

  it('breaks ties and shares a position that stays tied', () => {
    const s = standings(SPRING, members('2026-11-09', 'ana', 'bia', 'cris', 'dani'), [
      act('ana', '2026-10-05', 30),
      act('ana', '2026-10-06', 30),
      act('bia', '2026-10-05', 40),
      act('bia', '2026-10-06', 20),
      act('cris', '2026-10-05', 90),
      act('cris', '2026-10-06', 10),
      act('dani', '2026-10-05', 200),
    ]);
    // Two activities each; cris has more hours; ana and bia stay tied; dani is last.
    expect(positions(s, 'activities')).toEqual([
      ['cris', 1],
      ['ana', 2],
      ['bia', 2],
      ['dani', 4],
    ]);
    expect(positions(s, 'hours')[0]).toEqual(['dani', 1]);
  });

  it('ranks the weekend, the sports, the longest activity and the sprint', () => {
    const s = standings(SPRING, members('2026-12-17', 'ana', 'bia'), [
      act('ana', '2026-10-10', 30, 'Run'), // Saturday
      act('ana', '2026-10-11', 30, 'Yoga'), // Sunday
      act('ana', '2026-12-12', 100, 'Swim'),
      act('bia', '2026-10-12', 180, 'Ride'), // Monday
      act('bia', '2026-10-13', 170, 'Ride'),
    ]);
    expect(positions(s, 'weekend')).toEqual([['ana', 1]]);
    expect(s.weekend.scores.get('bia')?.out).toBe('zero');
    expect(positions(s, 'variety')).toEqual([
      ['ana', 1],
      ['bia', 2],
    ]);
    expect(s.marathon.entries[0]).toMatchObject({ memberId: 'bia', value: 180 * 60, tiebreak: 170 * 60 });
    expect(positions(s, 'sprint')).toEqual([['ana', 1]]);
  });

  it('keeps the sprint closed until its days come', () => {
    const s = standings(SPRING, members('2026-11-09', 'ana'), [act('ana', '2026-10-05', 30)]);
    expect(s.sprint.scores.get('ana')?.out).toBe('notOpen');
  });

  it('measures the comeback against the previous stage, even before the race existed', () => {
    const s = standings(SPRING, members('2026-11-09', 'ana', 'bia'), [
      act('ana', '2026-08-01', 60),
      act('ana', '2026-10-05', 120),
      act('bia', '2026-08-01', 300),
      act('bia', '2026-10-05', 60),
    ]);
    expect(s.comeback.entries).toMatchObject([{ memberId: 'ana', value: 3600 }]);
    expect(s.comeback.scores.get('bia')).toMatchObject({ out: 'noIncrease', value: -240 * 60 });
  });

  it('counts the whole weeks with the week index in the green, finished ones only', () => {
    // Ana moves every other day from 1 Oct: every week in the green. Bia moves once a week.
    const ana = Array.from({ length: 20 }, (_, i) => act('ana', addDays('2026-10-01', i * 2), 30));
    const bia = [act('bia', '2026-10-05', 30), act('bia', '2026-10-12', 30), act('bia', '2026-10-19', 30)];
    const s = standings(SPRING, members('2026-10-26', 'ana', 'bia'), [...ana, ...bia]);
    // Today is Monday 26 Oct: the whole weeks over are 5, 12 and 19 Oct.
    expect(s.momentum.entries).toMatchObject([{ memberId: 'ana', value: 3, tiebreak: 100, position: 1 }]);
    expect(s.momentum.scores.get('bia')?.out).toBe('zero');
  });

  it('ranks the steadiest weekly time, among those active in every whole week', () => {
    const s = standings(SPRING, members('2026-10-19', 'ana', 'bia', 'cris'), [
      act('ana', '2026-10-05', 60),
      act('ana', '2026-10-12', 60),
      act('bia', '2026-10-05', 30),
      act('bia', '2026-10-12', 90),
      act('cris', '2026-10-05', 600),
    ]);
    expect(s.steady.entries).toMatchObject([
      { memberId: 'ana', value: 0, position: 1 },
      { memberId: 'bia', value: 0.5, position: 2 },
    ]);
    expect(s.steady.scores.get('cris')).toMatchObject({ out: 'missedWeek', week: '2026-10-12' });
    const early = standings(SPRING, members('2026-10-12', 'ana'), [act('ana', '2026-10-05', 60)]);
    expect(early.steady.scores.get('ana')?.out).toBe('fewWeeks');
  });

  it('leaves out the members not given, such as those who left', () => {
    const s = standings(SPRING, members('2026-11-09', 'ana'), [act('ana', '2026-10-05', 30), act('gone', '2026-10-05', 300)]);
    expect(s.hours.entries.map((e) => e.memberId)).toEqual(['ana']);
  });
});

describe('awardTitles', () => {
  it('gives each member at most 2 titles, in the order of the table', () => {
    // Ana leads activities, hours and variety; the variety title goes to Bia, second.
    const s = standings(SPRING, members('2026-11-09', 'ana', 'bia'), [
      act('ana', '2026-10-05', 120, 'Run'),
      act('ana', '2026-10-06', 120, 'Yoga'),
      act('ana', '2026-10-07', 120, 'Swim'),
      act('bia', '2026-10-05', 30, 'Run'),
      act('bia', '2026-10-06', 30, 'Ride'),
    ]);
    const titles = awardTitles(s);
    expect(titles.activities).toEqual({ holders: ['ana'], blockedLeaders: [] });
    expect(titles.hours).toEqual({ holders: ['ana'], blockedLeaders: [] });
    expect(titles.variety).toEqual({ holders: ['bia'], blockedLeaders: ['ana'] });
  });

  it('gives a title to everyone tied first, counting it towards each limit', () => {
    const s = standings(SPRING, members('2026-11-09', 'ana', 'bia'), [act('ana', '2026-10-05', 60, 'Run'), act('bia', '2026-10-05', 60, 'Run')]);
    const titles = awardTitles(s);
    expect(titles.activities.holders).toEqual(['ana', 'bia']);
    expect(titles.hours.holders).toEqual(['ana', 'bia']);
    expect(titles.variety.holders).toEqual([]);
    expect(titles.variety.blockedLeaders).toEqual(['ana', 'bia']);
  });
});

describe('gapFor and gapText', () => {
  const s = standings(SPRING, members('2026-11-09', 'ana', 'bia', 'cris'), [
    act('ana', '2026-10-05', 120),
    act('ana', '2026-10-06', 120),
    act('ana', '2026-10-07', 60),
    act('bia', '2026-10-05', 30),
    act('cris', '2026-10-05', 30),
    act('cris', '2026-10-06', 30),
    act('cris', '2026-10-07', 30),
  ]);

  it('says only "first" to the first, never her lead', () => {
    expect(gapFor(s.hours, 'ana')).toEqual({ kind: 'leader' });
    expect(gapText('hours', gapFor(s.hours, 'ana'), 300 * 60, 300 * 60, SPRING)).toBe('Você está em 1º.');
  });

  it('says what I miss, in the ranking unit', () => {
    expect(gapFor(s.activities, 'bia')).toEqual({ kind: 'behind', position: 3, missing: 2, tied: false });
    expect(gapText('activities', gapFor(s.activities, 'bia'), 3, 1, SPRING)).toBe('Faltam 2 atividades para alcançar a 1ª.');
    expect(gapText('hours', gapFor(s.hours, 'bia'), 300 * 60, 30 * 60, SPRING)).toBe('Faltam 4h30 para alcançar a 1ª.');
    expect(gapText('marathon', gapFor(s.marathon, 'bia'), 120 * 60, 30 * 60, SPRING)).toBe('Uma atividade de mais de 2h00 te põe em 1º.');
  });

  it('names the tie-break when I equal the first and lose on it', () => {
    expect(gapFor(s.activities, 'cris')).toMatchObject({ kind: 'behind', position: 2, tied: true });
    expect(gapText('activities', gapFor(s.activities, 'cris'), 3, 3, SPRING)).toBe('Você empata com a 1ª, mas perde no desempate: mais horas.');
  });

  it('explains why I am out of a ranking', () => {
    expect(gapFor(s.activities, 'nobody')).toEqual({ kind: 'absent' });
    expect(gapText('sprint', gapFor(s.sprint, 'bia'), null, 0, SPRING)).toBe('Conta só os últimos 7 dias da etapa: de 11 dez a 17 dez.');
    expect(gapText('steady', { kind: 'out', reason: 'missedWeek', missing: null, week: '2026-10-12' }, 0.1, null, SPRING)).toBe(
      'Você ficou de fora: não teve atividade na semana de 12 out.',
    );
    expect(gapText('weekend', { kind: 'out', reason: 'zero', missing: 1 }, 1, 0, SPRING)).toBe('Falta 1 atividade num sábado ou domingo para alcançar a 1ª.');
    expect(gapText('steady', { kind: 'behind', position: 2, missing: 0.1, tied: false }, 0.08, 0.18, SPRING)).toBe('A 1ª variou ±8%; você, ±18%.');
  });

  it('writes the values as the group sees them', () => {
    expect(valueText('activities', 1)).toBe('1 atividade');
    expect(valueText('momentum', 5)).toBe('5 semanas');
    expect(valueText('comeback', 14 * 3600)).toBe('+14h00');
    expect(valueText('steady', 0.083)).toBe('variou só ±8%');
    expect(shortDay('2026-10-05')).toBe('5 out');
  });
});

