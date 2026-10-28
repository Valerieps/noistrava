// "Perfil" (docs/spec/acompanhamento.md): my week, the next badge, the month calendar, my habits,
// my badges and my part with the group, all shown to me only; then my account.
import { useState, type FormEvent } from 'react';
import type { MeView, TrackingView } from '../../application/api-contract';
import { formatDuration } from '../../domain/challenge/progress';
import { NAME_MAX_LENGTH } from '../../domain/group/profile';
import { strings } from '../../domain/strings';
import { addDays } from '../../domain/time/zones';
import { BADGES } from '../../domain/tracking/tracking';
import { useServices } from '../backend-context';
import { formatDateTime, formatMonth, formatShortDay, initial, sportName } from '../format';
import { CheckIcon, ChevronIcon, GearIcon, PlusIcon } from '../icons';
import { Link } from '../router';
import { useQuery } from '../use-query';
import { EarnedBadges, NextBadge } from './profile/Badges';
import { MonthCalendar } from './profile/MonthCalendar';

const TOPICS = ['activities', 'challenge', 'history'] as const;

export function Profile({ me, onSignOut }: { me: MeView; onSignOut: () => void }) {
  const tracking = useQuery('tracking', {}, TOPICS);
  const t = tracking.data;
  const next = t?.badges.find((b) => b.key === t.nextBadge);

  return (
    <div className="screen profile">
      <header className="profile-head">
        <div className="profile-photo" aria-hidden="true">
          {me.photoUrl ? <img src={me.photoUrl} alt="" referrerPolicy="no-referrer" /> : initial(me.name)}
        </div>
        <h1 className="d grow">{strings.profile.greeting(me.name)}</h1>
        <a href="#conta" className="icon-button surface" aria-label={strings.profile.account}>
          <GearIcon />
        </a>
      </header>

      {t && (
        <>
          <WeekCard tracking={t} />
          {next && <NextBadge badge={next} />}
          <MonthCalendar days={t.days} today={t.today} />
          <Habits tracking={t} />
          <section className="panel">
            <div className="split" style={{ alignItems: 'baseline' }}>
              <h2 className="d text-md">{strings.tracking.badgesTitle}</h2>
              <Link to="/perfil/selos" className="small strong-link">
                {strings.tracking.badgesCount(t.badges.filter((b) => b.earnedAt !== null).length, BADGES.length)}
              </Link>
            </div>
            <EarnedBadges badges={t.badges} />
          </section>
          <Group contribution={t.contribution} />
        </>
      )}

      <Account me={me} onSignOut={onSignOut} />
    </div>
  );
}

function WeekCard({ tracking: t }: { tracking: TrackingView }) {
  const s = strings.tracking;
  const end = addDays(t.week.start, 6);
  const activeNames = s.weekdays.filter((_, i) => t.week.activeDays[i]);
  return (
    <section className="week-card">
      <div className="week-card-top">
        <span>{s.thisWeek(`${formatShortDay(t.week.start)} a ${formatShortDay(end)}`)}</span>
        {t.streakWeeks > 0 && <span className="week-card-chip">{s.streak(t.streakWeeks)}</span>}
      </div>
      <div className="stack" style={{ gap: 4 }}>
        <span className="d week-card-total">{formatDuration(t.week.seconds)}</span>
        {t.comparePercent !== null && t.normalSeconds !== null && <span>{s.compare(t.comparePercent, formatDuration(t.normalSeconds))}</span>}
        {t.comebackDays !== null && <span className="week-card-note">{s.comeback(t.comebackDays)}</span>}
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
    </section>
  );
}

function Habits({ tracking: t }: { tracking: TrackingView }) {
  const s = strings.tracking;
  const month = formatMonth(t.today.slice(0, 7), Number(t.today.slice(0, 4)));
  return (
    <section className="panel">
      <h2 className="d text-md">{s.habitsTitle}</h2>
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
        <ul className="pills">
          {t.month.sports.map((sport, i) => (
            <li key={sport.sport} className={`pill${i === 0 ? ' strong' : ''}`}>
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
    <section className="panel">
      <h2 className="d text-md">{s.groupTitle}</h2>
      <dl className="group-rows">
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

function Account({ me, onSignOut }: { me: MeView; onSignOut: () => void }) {
  const activities = useQuery('activities', {}, ['activities']);
  const strava = useQuery('strava', {}, ['strava']);
  const p = strings.profile;
  return (
    <nav id="conta" className="menu-list" aria-label={p.account}>
      <Link to="/perfil/atividades">
        {p.activities}
        <span className="muted">{activities.data?.length ?? ''}</span>
      </Link>
      <Link to="/perfil/nome">
        {p.nameRow}
        <span className="muted ellipsis">{me.name}</span>
      </Link>
      <Link to="/perfil/strava">
        {p.strava}
        {strava.data && <span className={`status-pill${strava.data.connected ? ' ok' : ''}`}>{strava.data.connected ? p.stravaConnected : p.stravaDisconnected}</span>}
      </Link>
      <button type="button" className="danger-text" onClick={onSignOut}>
        {strings.nav.signOut}
      </button>
    </nav>
  );
}

/** "Minhas atividades": the list to edit or delete, and logging a new one. */
export function MyActivities() {
  const activities = useQuery('activities', {}, ['activities']);
  const p = strings.profile;
  const list = activities.data ?? [];
  return (
    <section className="panel">
      <Link to="/atividade/nova" className="button secondary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <PlusIcon />
        {strings.challenge.register}
      </Link>
      {activities.data && list.length === 0 && <p className="muted small">{p.activitiesEmpty}</p>}
      <ul className="list stack" style={{ gap: 0 }}>
        {list.map((a) => (
          <li key={a.id}>
            <Link to={`/atividade/${encodeURIComponent(a.id)}`} className="split" style={{ padding: '10px 0', textDecoration: 'none', color: 'inherit', borderBottom: '1px solid var(--color-border)', alignItems: 'center' }}>
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
    <form className="panel" onSubmit={rename}>
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
