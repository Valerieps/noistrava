import { describe, expect, it } from 'vitest';
import { addDays } from '../time/zones';
import { awardTitles, gapFor, laneProgress, othersOf, standings, wholeWeeks, type RaceActivity, type RankingKey, type Standings } from './rankings';
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

  it('breaks a comeback tie in favour of fewer hours in the previous stage', () => {
    const s = standings(SPRING, members('2026-11-09', 'ana', 'bia'), [
      act('ana', '2026-08-01', 120),
      act('ana', '2026-10-05', 180),
      act('bia', '2026-08-01', 60),
      act('bia', '2026-10-05', 120),
    ]);
    expect(positions(s, 'comeback')).toEqual([
      ['bia', 1],
      ['ana', 2],
    ]);
    expect(gapText('comeback', gapFor(s.comeback, 'ana'), 3600, 3600, SPRING)).toBe(
      'Você empata com a 1ª, mas perde no desempate: menos horas na etapa anterior.',
    );
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

  it('ranks the share of activities on the same weekday and time as in another week', () => {
    // Ana: Monday 7h every week and a Friday once: 4 of 5 repeat. Bia: Monday 7h, then 8h, 9h, 7h45 and 7h40.
    const ana = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'].map((d) => act('ana', d, 30, 'Run', '07:00:00'));
    const bia = [
      act('bia', '2026-10-05', 30, 'Run', '07:00:00'),
      act('bia', '2026-10-12', 30, 'Run', '08:00:00'),
      act('bia', '2026-10-19', 30, 'Run', '09:00:00'),
      act('bia', '2026-10-26', 30, 'Run', '07:45:00'),
      act('bia', '2026-11-02', 30, 'Run', '07:40:00'),
    ];
    // Cris repeats every slot, but in her own zone: 22h in São Paulo is 1h UTC the next day.
    const cris = ['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27', '2026-11-03'].map((d) =>
      act('cris', d, 30, 'Run', '01:00:00', 'America/Sao_Paulo'),
    );
    const s = standings(SPRING, members('2026-11-09', 'ana', 'bia', 'cris', 'dani'), [
      ...ana,
      act('ana', '2026-10-09', 30, 'Run', '07:00:00'),
      ...bia,
      ...cris,
      act('dani', '2026-10-05', 30),
    ]);
    expect(s.steady.entries).toMatchObject([
      { memberId: 'cris', value: 1, tiebreak: 5, position: 1 },
      { memberId: 'ana', value: 0.8, position: 2 },
      { memberId: 'bia', value: 0.6, position: 3 },
    ]);
    expect(s.steady.scores.get('dani')).toMatchObject({ out: 'fewActivities' });
  });

  it('breaks a Relógio Suíço tie by more activities, and leaves out a share of zero', () => {
    const weekly = (id: string, days: string[]) => days.map((d) => act(id, d, 30, 'Run', '07:00:00'));
    const mondays = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09'];
    const s = standings(SPRING, members('2026-11-10', 'ana', 'bia', 'cris'), [
      ...weekly('ana', mondays.slice(0, 5)),
      ...weekly('bia', mondays),
      ...['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'].map((d) => act('cris', d, 30)),
    ]);
    expect(positions(s, 'steady')).toEqual([
      ['bia', 1],
      ['ana', 2],
    ]);
    expect(s.steady.scores.get('cris')).toMatchObject({ out: 'zero', value: 0 });
  });

  it('leaves out the members not given, such as those who left', () => {
    const s = standings(SPRING, members('2026-11-09', 'ana'), [act('ana', '2026-10-05', 30), act('gone', '2026-10-05', 300)]);
    expect(s.hours.entries.map((e) => e.memberId)).toEqual(['ana']);
  });
});

describe('awardTitles', () => {
  it('gives each title to the first, however many titles she already has', () => {
    const s = standings(SPRING, members('2026-11-09', 'ana', 'bia'), [
      act('ana', '2026-10-05', 120, 'Run'),
      act('ana', '2026-10-06', 120, 'Yoga'),
      act('ana', '2026-10-07', 120, 'Swim'),
      act('bia', '2026-10-05', 30, 'Run'),
      act('bia', '2026-10-06', 30, 'Ride'),
    ]);
    const titles = awardTitles(s);
    expect(titles.activities).toEqual(['ana']);
    expect(titles.hours).toEqual(['ana']);
    expect(titles.variety).toEqual(['ana']);
  });

  it('gives a title to everyone tied first, and none to an empty ranking', () => {
    const s = standings(SPRING, members('2026-11-09', 'ana', 'bia'), [act('ana', '2026-10-05', 60, 'Run'), act('bia', '2026-10-05', 60, 'Run')]);
    const titles = awardTitles(s);
    expect(titles.activities).toEqual(['ana', 'bia']);
    expect(titles.variety).toEqual(['ana', 'bia']);
    expect(titles.steady).toEqual([]);
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
    expect(gapText('steady', { kind: 'out', reason: 'fewActivities', missing: 0.8 }, 0.8, null, SPRING)).toBe('Conta a partir de 5 atividades na etapa.');
    expect(gapText('steady', { kind: 'out', reason: 'zero', missing: 0.8 }, 0.8, 0, SPRING)).toBe(
      'Nenhuma atividade sua repetiu ainda o dia da semana e a hora de outra semana.',
    );
    expect(gapText('weekend', { kind: 'out', reason: 'zero', missing: 1 }, 1, 0, SPRING)).toBe('Falta 1 atividade num sábado ou domingo para alcançar a 1ª.');
    expect(gapText('steady', { kind: 'behind', position: 2, missing: 0.1, tied: false }, 0.9, 0.8, SPRING)).toBe(
      'A 1ª tem 90% das atividades no mesmo dia e hora; você, 80%.',
    );
  });

  it('writes the values as the group sees them', () => {
    expect(valueText('activities', 1)).toBe('1 atividade');
    expect(valueText('momentum', 5)).toBe('5 semanas');
    expect(valueText('comeback', 14 * 3600)).toBe('+14h00');
    expect(valueText('steady', 0.8)).toBe('80% no mesmo dia e hora');
    expect(shortDay('2026-10-05')).toBe('5 out');
  });
});


describe('othersOf', () => {
  it('leaves out me and the first ones, smallest first', () => {
    const entries = [
      { memberId: 'a', position: 1, value: 9 },
      { memberId: 'b', position: 1, value: 9 },
      { memberId: 'c', position: 3, value: 7 },
      { memberId: 'me', position: 4, value: 5 },
      { memberId: 'd', position: 5, value: 2 },
      { memberId: 'e', position: 5, value: 2 },
    ];
    expect(othersOf(entries, 'me')).toEqual([2, 2, 7]);
    expect(othersOf(entries, 'a')).toEqual([2, 2, 5, 7]);
  });
});

describe('laneProgress', () => {
  it('puts me along the lane by my value against the first', () => {
    expect(laneProgress(100, 25, 3)).toBe(0.25);
    expect(laneProgress(0.8, 0.4, 2)).toBe(0.5);
    expect(laneProgress(100, 100, 1)).toBe(1);
    expect(laneProgress(100, -20, null)).toBe(0);
    expect(laneProgress(null, 0, null)).toBe(0);
  });
});
