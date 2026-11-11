// "Estações" (docs/spec/corrida-das-estacoes.md, "Onde eu vejo"): the stage in progress as lanes, the
// count with the same lanes in gray, the podium of a closed stage, the year's summary, and a member's
// circuit. Of each ranking, the group sees only the first; my place is shown to me only.
import { useState } from 'react';
import type { SeasonCircuitView, SeasonRankingView, SeasonStageView, SeasonYearView } from '../../application/api-contract';
import { laneProgress } from '../../domain/seasons/rankings';
import { inRace, nextStage, previousStage, SEASONS, stageDates, stageKey, type Season, type Stage } from '../../domain/seasons/stages';
import { gapText, ofStageName, shortDay, stageName, valueText } from '../../domain/seasons/texts';
import { strings } from '../../domain/strings';
import { daysBetween } from '../../domain/tracking/tracking';
import { Avatar } from '../Avatar';
import { BackIcon, ChevronIcon, Diamond, Medal, RankingIcon, SeasonIcon } from '../icons';
import { Link } from '../router';
import { useQuery } from '../use-query';

const s = strings.seasons;
const TOPICS = ['activities', 'members', 'seasons'] as const;

const asStage = (ref: { year: number; season: Season }): Stage => ({ year: ref.year, season: ref.season });
const stageDatesOf = (stage: Stage) => ({ stage, ...stageDates(stage) });

function Failed({ error }: { error: string | undefined }) {
  if (!error) return null;
  return (
    <div className="screen">
      <p className="notice" role="alert">
        {strings.genericError}
      </p>
    </div>
  );
}

/** The tab itself: the stage of today's quarter; from 18 to 31 December, the year's summary. */
export function SeasonsTab() {
  const current = useQuery('seasonStage', {}, TOPICS);
  if (!current.data) return <Failed error={current.error} />;
  if (current.data.yearEnd) return <YearScreen year={current.data.view.stage.year} tab />;
  return <StageScreen view={current.data.view} tab />;
}

/** A stage opened from the year, the circuit or the arrows. */
export function SeasonStage({ stageKey: key }: { stageKey: string }) {
  const stage = useQuery('seasonStage', { stage: key }, TOPICS);
  if (!stage.data) return <Failed error={stage.error} />;
  return <StageScreen view={stage.data.view} />;
}

function SeasonDots({ current }: { current: Season }) {
  return (
    <span className="season-dots" aria-hidden="true">
      {SEASONS.map((season) => (
        <i key={season} className={season === current ? 'now' : undefined}>
          <SeasonIcon season={season} size={14} plain={season !== current} />
        </i>
      ))}
    </span>
  );
}

/** The top of a stage: its season's color and icon, the name, and where it stands. */
function StageHero({ view, tab }: { view: SeasonStageView; tab: boolean }) {
  const stage = asStage(view.stage);
  const previous = previousStage(stage);
  const next = nextStage(stage);
  const titles = view.rankings.reduce((n, r) => n + r.titleHolders.length, 0);
  const people = new Set(view.rankings.flatMap((r) => r.titleHolders.map((p) => p.memberId))).size;
  const meta =
    view.status === 'running'
      ? s.runningMeta(daysBetween(view.today, view.stage.end), shortDay(view.stage.end))
      : view.status === 'counting'
        ? s.countingMeta(shortDay(view.stage.end), shortDay(view.stage.closesOn))
        : s.closedMeta(titles, people);
  return (
    <header className={`hero-c season-hero season-${stage.season}`}>
      <div className="hero-c-head">
        <div className="hero-c-label">
          {tab ? (
            <Link to={`/estacoes/ano/${stage.year}`} className="season-chip">
              {s.yearsLink}
            </Link>
          ) : (
            <Link to="/estacoes" back className="icon-button" aria-label={strings.nav.back}>
              <BackIcon />
            </Link>
          )}
          <span className="season-chip">{s.statusChip[view.status]}</span>
          <SeasonDots current={stage.season} />
        </div>
        <span className="season-kicker">{view.status === 'closed' ? s.closedKicker : s.raceKicker}</span>
        <div className="season-title-row">
          {inRace(previous) && (
            <Link to={`/estacoes/etapa/${stageKey(previous)}`} className="icon-button" aria-label={s.previousStage}>
              <BackIcon />
            </Link>
          )}
          <h1 className="d season-title">{stageName(stage)}</h1>
          {view.status === 'closed' && (
            <Link to={`/estacoes/etapa/${stageKey(next)}`} className="icon-button flip" aria-label={s.nextStage}>
              <BackIcon />
            </Link>
          )}
        </div>
        <span className="season-meta">{meta}</span>
      </div>
    </header>
  );
}

function StageScreen({ view, tab = false }: { view: SeasonStageView; tab?: boolean }) {
  const me = useQuery('me', {}, ['me']);
  const meId = me.data?.id ?? '';
  return (
    <>
      <StageHero view={view} tab={tab} />
      <div className="sheet">
        <section className="sheet-section">
          {view.status === 'closed' ? (
            <Podium view={view} />
          ) : (
            <>
              {view.status === 'counting' && (
                <>
                  <p className="season-banner">{s.countingBanner(shortDay(nextDay(view.stage.end)), shortDay(lastDay(view.stage.closesOn)))}</p>
                  <h2 className="season-label">{s.provisional}</h2>
                </>
              )}
              <Lanes view={view} meId={meId} />
            </>
          )}
        </section>
      </div>
    </>
  );
}

const nextDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const lastDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/** One lane per ranking: the first at the finish, me running towards her. */
function Lanes({ view, meId }: { view: SeasonStageView; meId: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const counting = view.status === 'counting';
  return (
    <ul className={`lanes${counting ? ' counting' : ''}`}>
      {view.rankings.map((r) => (
        <Lane key={r.key} ranking={r} view={view} meId={meId} open={open === r.key} onToggle={() => setOpen(open === r.key ? null : r.key)} />
      ))}
    </ul>
  );
}

function leaderText(r: SeasonRankingView, meId: string): string {
  if (r.leaders.length === 0 || r.leaderValue === null) return s.nobodyYet;
  return `${s.and(r.leaders.map((p) => (p.memberId === meId ? s.you : p.name)))} · ${valueText(r.key, r.leaderValue)}`;
}

/** How far a tied circle moves from the next one: they overlap a little, so a tie still shows. */
const TIE_SHIFT = 6;

/** The others' anonymous circles: where each one is, and tied ones spread around the same point. */
function othersOnLane(r: SeasonRankingView): { progress: number; shift: number }[] {
  const ties = new Map<number, number>();
  for (const value of r.others) ties.set(value, (ties.get(value) ?? 0) + 1);
  const seen = new Map<number, number>();
  return r.others.map((value) => {
    const i = seen.get(value) ?? 0;
    seen.set(value, i + 1);
    return { progress: laneProgress(r.leaderValue, value, null), shift: (i - ((ties.get(value) ?? 1) - 1) / 2) * TIE_SHIFT };
  });
}

function Lane({
  ranking: r,
  view,
  meId,
  open,
  onToggle,
}: {
  ranking: SeasonRankingView;
  view: SeasonStageView;
  meId: string;
  open: boolean;
  onToggle: () => void;
}) {
  const progress = laneProgress(r.leaderValue, r.me.value, r.me.position);
  const name = s.rankings[r.key];
  const leader = leaderText(r, meId);
  const leaderPerson = r.me.position === 1 ? null : r.leaders[0];
  const more =
    view.status === 'counting'
      ? r.me.position === null
        ? s.outProvisional
        : s.provisionalMine(r.me.position)
      : r.me.gap?.kind === 'behind' || r.me.gap?.kind === 'leader'
        ? `${r.me.position !== null && r.me.position > 1 ? `${s.position(r.me.position)} · ` : ''}${r.me.value !== null ? s.mine(valueText(r.key, r.me.value)) : gapText(r.key, r.me.gap, r.leaderValue, r.me.value, asStage(view.stage))}`
        : gapText(r.key, r.me.gap ?? { kind: 'absent' }, r.leaderValue, r.me.value, asStage(view.stage));
  return (
    <li className={`lane${open ? ' open' : ''}`}>
      <button type="button" className="lane-button" aria-expanded={open} aria-label={s.laneLabel(name, leader)} onClick={onToggle}>
        <span className="lane-head">
          <span className="lane-name">
            <RankingIcon ranking={r.key} size={14} />
            {name}
          </span>
          <span className="lane-leader">{leader}</span>
        </span>
        <span className={`lane-track${r.leaders.length === 0 ? ' off' : ''}`} aria-hidden="true">
          {r.me.position !== null || progress > 0 ? <span className="lane-fill" style={{ width: `${progress * 100}%` }} /> : null}
          {r.leaders.length > 0 &&
            othersOnLane(r).map((o, i) => (
              <span key={i} className="lane-other" style={{ left: `calc(12px + (100% - 24px) * ${o.progress} + ${o.shift}px)` }} />
            ))}
          {r.me.position !== null || progress > 0 ? (
            <>
              <span className="lane-me" style={{ left: `calc(12px + (100% - 24px) * ${progress})` }}>
                {r.me.position ? s.position(r.me.position) : ''}
              </span>
            </>
          ) : null}
          {leaderPerson && (
            <span className="lane-lead">
              <Avatar name={leaderPerson.name} photoUrl={leaderPerson.photoUrl} />
            </span>
          )}
          <span className="lane-flag">🏁</span>
        </span>
      </button>
      {open && <p className="lane-more">{more}</p>}
    </li>
  );
}

/** The closed stage: each ranking's medal and who took it. */
function Podium({ view }: { view: SeasonStageView }) {
  const stage = asStage(view.stage);
  const label = s.medalLabel(stageName(stage));
  return (
    <ul className="podium">
        {view.rankings.map((r) => {
          const holders = s.and(r.titleHolders.map((p) => p.name));
          return (
            <li key={r.key} aria-label={s.medalName(s.rankings[r.key], ofStageName(stage), holders || s.noTitle)}>
              <Medal season={stage.season} ranking={r.key} label={label} ghost={r.titleHolders.length === 0} />
              <b>{s.rankings[r.key]}</b>
              <span>{holders || s.noTitle}</span>
            </li>
          );
        })}
      </ul>
  );
}

/** The four seasons of a year as small icons, lit where the member took a title. */
function Tally({ seasons }: { seasons: ReadonlySet<Season> }) {
  return (
    <span className="season-tally" aria-hidden="true">
      {SEASONS.map((season) => (
        <span key={season} className={seasons.has(season) ? undefined : 'dim'}>
          <SeasonIcon season={season} size={13} plain={!seasons.has(season)} />
        </span>
      ))}
    </span>
  );
}

function YearArrows({ years, year, to }: { years: readonly number[]; year: number; to: (year: number) => string }) {
  const i = years.indexOf(year);
  return (
    <span className="season-years">
      {i > 0 ? (
        <Link to={to(years[i - 1])} className="icon-button" aria-label={s.previousYear}>
          <BackIcon />
        </Link>
      ) : (
        <span className="icon-button" aria-hidden="true" />
      )}
      <span>{year}</span>
      {i >= 0 && i < years.length - 1 ? (
        <Link to={to(years[i + 1])} className="icon-button flip" aria-label={s.nextYear}>
          <BackIcon />
        </Link>
      ) : (
        <span className="icon-button" aria-hidden="true" />
      )}
    </span>
  );
}

/** The year's summary: who took titles, in alphabetical order; each name opens her titles. */
export function YearScreen({ year, tab = false }: { year: number; tab?: boolean }) {
  const query = useQuery('seasonYear', { year }, TOPICS);
  const data = query.data;
  if (!data) return <Failed error={query.error} />;
  return <YearView data={data} tab={tab} />;
}

function YearView({ data, tab }: { data: SeasonYearView; tab: boolean }) {
  // The year is over once its spring closed; 2026 had only that stage.
  const closed = data.stages.some((st) => st.stage.season === 'spring' && st.status === 'closed');
  const titles = data.members.reduce((n, m) => n + m.titles.length, 0);
  const counting = data.stages.find((st) => st.status === 'counting');
  const ended = data.stages.filter((st) => st.status === 'closed' || st.status === 'counting');
  const upcoming = tab ? stageDatesOf({ year: data.year + 1, season: 'summer' }) : null;
  return (
    <>
      <header className="hero-c season-hero season-year">
        <div className="hero-c-head">
          <div className="hero-c-label">
            {tab ? (
              <span />
            ) : (
              <Link to="/estacoes" back className="icon-button" aria-label={strings.nav.back}>
                <BackIcon />
              </Link>
            )}
            <YearArrows years={data.years} year={data.year} to={(y) => `/estacoes/ano/${y}`} />
          </div>
          <span className="season-kicker">{s.yearKicker}</span>
          <h1 className="d season-title">{s.yearTitle(data.year, closed)}</h1>
          <span className="season-meta">{s.yearMeta(ended.length, titles, data.members.length)}</span>
        </div>
      </header>
      <div className="sheet">
        <section className="sheet-section">
          <div className="season-diamond">
            <Diamond label={String(data.year)} width={150} />
          </div>
          <ul className="season-stages">
            {data.stages.map((st) => (
              <li key={st.stage.key}>
                {st.status === 'upcoming' ? (
                  <span className="season-stage-link off">
                    <SeasonIcon season={st.stage.season} size={20} plain />
                    {stageName(asStage(st.stage))}
                    <small>{s.stageStates.upcoming}</small>
                  </span>
                ) : (
                  <Link to={`/estacoes/etapa/${st.stage.key}`} className="season-stage-link">
                    <SeasonIcon season={st.stage.season} size={20} />
                    {stageName(asStage(st.stage))}
                    <small>{s.stageStates[st.status]}</small>
                    <ChevronIcon />
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <div className="season-label-row">
            <h2 className="season-label">{s.whoPodium}</h2>
            {counting && (
              <Link to={`/estacoes/etapa/${counting.stage.key}`} className="sheet-head-link">
                {s.countingLink(ofStageName(asStage(counting.stage)))} ›
              </Link>
            )}
          </div>
          {data.members.length === 0 && <p className="muted">{s.yearEmpty}</p>}
          <ul className="season-rows">
            {data.members.map((m) => (
              <li key={m.memberId}>
                <Link to={`/estacoes/circuito/${encodeURIComponent(m.memberId)}/${data.year}`} className="season-row">
                  <Avatar name={m.name} photoUrl={m.photoUrl} />
                  <span className="season-row-name">
                    <b>{m.name}</b>
                    <Tally seasons={new Set(m.titles.map((t) => t.season))} />
                  </span>
                  <span className="season-row-count">
                    {m.titles.length}
                    <small>{m.titles.some((t) => t.provisional) ? s.provisionalTag : s.titles(m.titles.length).replace(/^\d+ /, '')}</small>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {upcoming && (
            <div className="season-cta">
              <span>
                <b>{s.nextStarts(stageName(upcoming.stage), shortDay(upcoming.start))}</b>
                <small>{s.nextDates(shortDay(upcoming.start), shortDay(upcoming.end))}</small>
              </span>
              <SeasonIcon season="summer" size={32} plain />
            </div>
          )}
        </section>
      </div>
    </>
  );
}

/** A member's circuit: the medals she took in each stage of a year, and the other years. */
export function CircuitScreen({ memberId, year, back }: { memberId?: string; year?: number; back: string }) {
  const input = { ...(memberId ? { memberId } : {}), ...(year ? { year } : {}) };
  const query = useQuery('seasonCircuit', input, TOPICS);
  const data = query.data;
  if (!data) return <Failed error={query.error} />;
  return <CircuitView data={data} mine={!memberId} back={back} />;
}

function circuitCounts(data: SeasonCircuitView): Partial<Record<Season, number>> {
  return Object.fromEntries(data.stages.map((st) => [st.stage.season, st.titles.length]));
}

function CircuitView({ data, mine, back }: { data: SeasonCircuitView; mine: boolean; back: string }) {
  const total = data.stages.reduce((n, st) => n + st.titles.length, 0);
  const base = mine ? '/perfil/circuito' : `/estacoes/circuito/${encodeURIComponent(data.person.memberId)}`;
  return (
    <>
      <header className="hero-c season-hero season-summer">
        <div className="hero-c-head">
          <div className="hero-c-label">
            <Link to={back} back className="icon-button" aria-label={strings.nav.back}>
              <BackIcon />
            </Link>
            <YearArrows years={data.years} year={data.year} to={(y) => `${base}/${y}`} />
          </div>
          <span className="season-kicker">{mine ? s.circuitTitle : s.circuitOf(data.person.name)}</span>
          <h1 className="d season-title">{s.titlesInYear(total)}</h1>
        </div>
      </header>
      <div className="sheet">
        <section className="sheet-section">
          <div className="season-diamond">
            <Diamond label={String(data.year)} counts={circuitCounts(data)} width={170} />
          </div>
          <ul className="season-rows">
            {data.stages.map((st) => {
              const stage = asStage(st.stage);
              const row = (
                <>
                  <span className="season-row-medals">
                    {st.titles.length === 0 ? (
                      <Medal season={stage.season} label={s.medalLabel(stageName(stage))} width={30} ghost />
                    ) : (
                      st.titles.map((t) => <Medal key={t.ranking} season={stage.season} ranking={t.ranking} label={s.medalLabel(stageName(stage))} width={30} />)
                    )}
                  </span>
                  <span className="season-row-name">
                    <b className={`season-ink-${stage.season}`}>{stageName(stage)}</b>
                    <small>
                      {st.titles.length === 0
                        ? st.status === 'closed'
                          ? s.noTitles
                          : s.stageStates[st.status]
                        : st.titles.map((t) => s.rankings[t.ranking]).join(' · ') + (st.titles.some((t) => t.provisional) ? ` · ${s.provisionalTag}` : '')}
                    </small>
                  </span>
                  <span className="season-row-count">{st.titles.length}</span>
                </>
              );
              return (
                <li key={st.stage.key}>
                  {st.status === 'upcoming' ? (
                    <span className="season-row off">{row}</span>
                  ) : (
                    <Link to={`/estacoes/etapa/${st.stage.key}`} className="season-row">
                      {row}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </>
  );
}

/** The profile's section, right above the badges: my titles of the year on the small diamond. */
export function ProfileCircuit() {
  const query = useQuery('seasonCircuit', {}, TOPICS);
  const data = query.data;
  if (!data) return null;
  const total = data.stages.reduce((n, st) => n + st.titles.length, 0);
  const open = data.stages.find((st) => st.status === 'running' || st.status === 'counting');
  return (
    <section className="sheet-section">
      <div className="sheet-head">
        <h2 className="d">{s.race}</h2>
        <Link to="/perfil/circuito" className="sheet-head-link">
          {s.profileLink(data.year)}
        </Link>
      </div>
      <Link to="/perfil/circuito" className="season-profile-card">
        <Diamond label={String(data.year)} counts={circuitCounts(data)} width={88} />
        <span>
          <b className="d">{total > 0 ? s.profileSummary(total, data.year) : s.profileNone(data.year)}</b>
          {open && <small>{s.profileStage(stageName(asStage(open.stage)), shortDay(open.stage.end))}</small>}
          <em>{s.profileOpen} ›</em>
        </span>
      </Link>
    </section>
  );
}
