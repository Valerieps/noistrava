// "Perfil" (docs/spec/acompanhamento.md): my week, the next badge, the month calendar, my habits,
// my badges and my part with the group, all shown to me only; then my activities. My name and the
// Strava connection live in the settings.
import { useState, type FormEvent } from 'react';
import type { MeView, TrackingView } from '../../application/api-contract';
import { formatDuration } from '../../domain/challenge/progress';
import { NAME_MAX_LENGTH } from '../../domain/group/profile';
import { strings } from '../../domain/strings';
import { addDays } from '../../domain/time/zones';
import { BADGES } from '../../domain/tracking/tracking';
import { useServices } from '../backend-context';
import { formatDateTime, formatMonth, formatShortDay, initial, sportName } from '../format';
import { CheckIcon, ChevronIcon, PlusIcon } from '../icons';
import { Link } from '../router';
import { useQuery } from '../use-query';
import { EarnedBadges, NextBadge } from './profile/Badges';
import { MonthCalendar } from './profile/MonthCalendar';

const TOPICS = ['activities', 'challenge', 'history'] as const;

export function Profile({ me }: { me: MeView }) {
  const tracking = useQuery('tracking', {}, TOPICS);
  const t = tracking.data;
  const next = t?.badges.find((b) => b.key === t.nextBadge);
  const band = <div className="sheet-band" />;

  return (
    <>
      <header className="hero-c hero-c-dots">
        <div className="hero-c-head">
          <div className="hero-who">
            <Photo me={me} />
            <div className="stack" style={{ gap: 2, minWidth: 0 }}>
              <h1 className="d hero-who-name">{strings.profile.greeting(me.name)}</h1>
              {t && <span className="hero-who-sub">{strings.tracking.thisWeek(`${formatShortDay(t.week.start)} a ${formatShortDay(addDays(t.week.start, 6))}`)}</span>}
            </div>
          </div>
        </div>
        {t && <WeekHero tracking={t} />}
      </header>

      <div className="sheet">
        {t && (
          <>
            {next && (
              <>
                <NextBadge badge={next} />
                {band}
              </>
            )}
            <MonthCalendar days={t.days} today={t.today} />
            {band}
            <Habits tracking={t} />
            {band}
            <section className="sheet-section">
              <div className="sheet-head">
                <h2 className="d">{strings.tracking.badgesTitle}</h2>
                <Link to="/perfil/selos" className="sheet-head-link">
                  {strings.tracking.badgesCount(t.badges.filter((b) => b.earnedAt !== null).length, BADGES.length)}
                </Link>
              </div>
              <EarnedBadges badges={t.badges} />
            </section>
            {band}
            <Group contribution={t.contribution} />
            {band}
          </>
        )}
        <Account />
      </div>
    </>
  );
}

/** My photo, or my initial, in a white circle on the hero. */
export function Photo({ me, size = 56 }: { me: MeView; size?: number }) {
  return (
    <span className="hero-photo" style={{ width: size, height: size }} aria-hidden="true">
      {me.photoUrl ? <img src={me.photoUrl} alt="" referrerPolicy="no-referrer" /> : initial(me.name)}
    </span>
  );
}

function WeekHero({ tracking: t }: { tracking: TrackingView }) {
  const s = strings.tracking;
  const activeNames = s.weekdays.filter((_, i) => t.week.activeDays[i]);
  return (
    <>
      <div className="week-hero-total">
        <div className="stack" style={{ gap: 4, minWidth: 0 }}>
          <span className="d week-hero-number">{formatDuration(t.week.seconds)}</span>
          {t.comparePercent !== null && t.normalSeconds !== null && <span className="week-hero-note">{s.compare(t.comparePercent, formatDuration(t.normalSeconds))}</span>}
        </div>
        {t.streakWeeks > 0 && <span className="week-hero-chip">{s.streak(t.streakWeeks)}</span>}
      </div>
      <ol className="week-days" aria-label={s.weekDaysLabel(activeNames)}>
        {s.weekdayInitials.map((initialLetter, i) => {
          const date = addDays(t.week.start, i);
          const state = t.week.activeDays[i] ? 'done' : date > t.today ? 'future' : 'idle';
          return (
            <li key={date} aria-hidden="true">
              <span className={`week-dot ${state}${date === t.today ? ' today' : ''}`}>{state === 'done' && <CheckIcon />}</span>
              {initialLetter}
            </li>
          );
        })}
      </ol>
      {t.comebackDays !== null && <p className="week-hero-comeback">{s.comeback(t.comebackDays)}</p>}
    </>
  );
}

function Habits({ tracking: t }: { tracking: TrackingView }) {
  const s = strings.tracking;
  const month = formatMonth(t.today.slice(0, 7), Number(t.today.slice(0, 4)));
  return (
    <section className="sheet-section">
      <h2 className="d">{s.habitsTitle}</h2>
      <p style={{ margin: 0, lineHeight: 1.5 }}>
        {t.favoriteWeekday !== null && t.favoritePeriod !== null && (
          <>
            {s.habitLead}
            <b>{s.habitDays[t.favoriteWeekday]}</b>, <b>{s.habitPeriods[t.favoritePeriod]}</b>.{' '}
          </>
        )}
        {s.monthSummary(month, t.month.activeDays, t.month.sports.length)}
      </p>
      {t.month.sports.length > 0 && (
        <ul className="sheet-pills">
          {t.month.sports.map((sport, i) => (
            <li key={sport.sport} className={i === 0 ? 'strong' : undefined}>
              {sportName(sport.sport)} {formatDuration(sport.seconds)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Group({ contribution: c }: { contribution: TrackingView['contribution'] }) {
  const s = strings.tracking;
  const rows: [string, string][] = [
    ...(c.current ? [[s.myPart(c.current.name), `${c.current.percent}%`] as [string, string]] : []),
    [s.asSenhora, s.asSenhoraValue(c.asSenhora, c.won)],
    [s.hearts, `${c.heartsGiven} · ${c.heartsReceived}`],
    [s.pulled, String(c.pulledDays)],
  ];
  return (
    <section className="sheet-section" style={{ paddingBottom: 0 }}>
      <h2 className="d">{s.groupTitle}</h2>
      <dl className="sheet-pairs">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Account() {
  const activities = useQuery('activities', {}, ['activities']);
  const strava = useQuery('strava', {}, ['strava']);
  const p = strings.profile;
  return (
    <>
      <nav className="sheet-menu" aria-label={p.activities}>
        <Link to="/perfil/atividades" className="sheet-menu-row strong">
          <span>{p.activities}</span>
          <span className="sheet-menu-value">{activities.data?.length ?? ''}</span>
          <ChevronIcon />
        </Link>
      </nav>
      {strava.data?.connected && <StravaSync />}
    </>
  );
}

/** "Puxar atividades do Strava": for when an activity did not arrive on its own. */
function StravaSync() {
  const { backend } = useServices();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const p = strings.profile;

  async function sync() {
    setBusy(true);
    setMessage(null);
    const result = await backend.stravaSync();
    setBusy(false);
    if (result.ok) setMessage(result.value.changed ? p.stravaSyncChanged : p.stravaSyncNothing);
    else setMessage(result.error === 'conflict' ? p.stravaSyncDisconnected : p.stravaSyncUnavailable);
  }

  return (
    <section className="sheet-section">
      <button type="button" className="secondary" onClick={sync} disabled={busy}>
        {busy ? p.stravaSyncing : p.stravaSync}
      </button>
      {message && (
        <p className="small muted" role="status" style={{ margin: 0 }}>
          {message}
        </p>
      )}
    </section>
  );
}

/** "Minhas atividades": the list to edit or delete, and logging a new one. */
export function MyActivities() {
  const activities = useQuery('activities', {}, ['activities']);
  const p = strings.profile;
  const list = activities.data ?? [];
  return (
    <section className="sheet-section">
      <Link
        to="/atividade/nova"
        className="button secondary"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        <PlusIcon />
        {strings.challenge.register}
      </Link>
      {activities.data && list.length === 0 && <p className="muted small">{p.activitiesEmpty}</p>}
      <ul className="sheet-list-plain">
        {list.map((a) => (
          <li key={a.id}>
            <Link to={`/atividade/${encodeURIComponent(a.id)}`} className="sheet-link-row">
              <span className="grow">
                <b>{sportName(a.sport)}</b>
                <br />
                <span className="small muted">
                  {formatDateTime(a.startedAt)} · {a.source === 'strava' ? p.strava : p.manual}
                  {a.editedByMember && ` · ${p.edited}`}
                </span>
              </span>
              <span className="d text-md">{formatDuration(a.durationSeconds)}</span>
              <ChevronIcon />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Nome": my name in the app. */
export function NameForm({ me }: { me: MeView }) {
  const { backend } = useServices();
  const [name, setName] = useState(me.name);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const p = strings.profile;

  async function rename(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await backend.command('member.rename', { name });
    setBusy(false);
    setMessage(result.ok ? p.saved : strings.genericError);
  }

  return (
    <form className="sheet-section" onSubmit={rename}>
      <label>
        <span className="field-label">{p.nameLabel}</span>
        <input required maxLength={NAME_MAX_LENGTH} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      {name !== me.name && (
        <button type="submit" disabled={busy}>
          {p.save}
        </button>
      )}
      {message && (
        <p className="small muted" role="status" style={{ margin: 0 }}>
          {message}
        </p>
      )}
    </form>
  );
}
