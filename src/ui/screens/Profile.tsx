// "Perfil": my name, my zone, the Strava connection, my numbers across challenges, my activities
// (to edit or delete) and the way to the members, invites and signing out.
import { useState, type FormEvent } from 'react';
import type { MeView } from '../../application/api-contract';
import { formatDuration, formatOffset, highlights, utcOffsetMinutes } from '../../domain/challenge/progress';
import { NAME_MAX_LENGTH } from '../../domain/group/profile';
import { canManageGroup, isAdmin } from '../../domain/group/roles';
import { strings } from '../../domain/strings';
import { useServices } from '../backend-context';
import { formatDateTime, initial, sportName } from '../format';
import { ChevronIcon, PlusIcon } from '../icons';
import { Link } from '../router';
import { useQuery } from '../use-query';
import { StravaConnect } from './StravaConnect';

export function Profile({ me, onSignOut }: { me: MeView; onSignOut: () => void }) {
  const { backend } = useServices();
  const history = useQuery('history', {}, ['history', 'me']);
  const activities = useQuery('activities', {}, ['activities']);
  const current = useQuery('challenge', {}, ['challenge']);
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

  const closed = history.data ?? [];
  const open = current.data?.challenge ?? null;
  const mine = closed.map((c) => ({ id: c.id, name: c.name, total: c.totalSeconds, my: c.results.find((r) => r.memberId === me.id)?.totalSeconds }));
  const openMine = open?.members.find((m) => m.memberId === me.id);
  if (open && !open.closed) mine.unshift({ id: open.id, name: open.name, total: open.totalSeconds, my: openMine && (openMine.response === 'accepted' || openMine.totalSeconds > 0) ? openMine.totalSeconds : undefined });
  const myTotal = mine.reduce((sum, c) => sum + (c.my ?? 0), 0);
  const asSenhora = mine.filter((c) => c.my !== undefined).length;

  const myActivities = activities.data ?? [];
  const bySport = new Map<string, number>();
  for (const a of myActivities) bySport.set(a.sport, (bySport.get(a.sport) ?? 0) + a.durationSeconds);
  const favorite = [...bySport.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const streak = highlights(myActivities.map((a) => ({ ...a, memberId: me.id }))).streakDays;

  return (
    <>
      <header className="profile-band">
        <div className="lbl">{p.title}</div>
      </header>
      <div className="screen" style={{ paddingTop: 0 }}>
        <section className="panel profile-card" style={{ margin: '-40px 0 0' }}>
          <div className="row" style={{ margin: 0, alignItems: 'flex-end' }}>
            <div className="profile-photo" aria-hidden="true">
              {me.photoUrl ? <img src={me.photoUrl} alt="" referrerPolicy="no-referrer" /> : initial(me.name)}
            </div>
            <div className="grow">
              <h1 className="d" style={{ margin: 0, color: 'var(--color-text)', fontSize: 26 }}>
                {me.name}
              </h1>
              <div className="small muted">{isAdmin(me) ? p.admin : p.member}</div>
            </div>
          </div>
          <form className="stack" onSubmit={rename}>
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
          <div className="split panel-foot" style={{ alignItems: 'center', color: 'var(--color-text)' }}>
            <div>
              <div style={{ fontWeight: 600 }}>{p.timezone}</div>
              <div className="tiny muted">{p.timezoneNote}</div>
            </div>
            <div className="d" style={{ fontSize: 18 }}>
              {me.timezone ? formatOffset(utcOffsetMinutes(me.timezone, new Date())) : p.timezoneUnknown}
            </div>
          </div>
        </section>

        <section className="panel">
          <StravaConnect />
        </section>

        <section className="tiles tiles-2">
          <Tile value={formatDuration(myTotal)} note={p.totalHours} />
          <Tile value={p.asSenhora(asSenhora, mine.length)} note={p.asSenhoraLabel} />
          {favorite && <Tile value={sportName(favorite)} note={p.favoriteSport} />}
          {streak > 0 && <Tile value={strings.challenge.highlights.streakValue(streak)} note={p.longestStreak} />}
        </section>

        {mine.some((c) => c.my !== undefined) && (
          <section className="panel">
            <h2 className="d">{p.myShare}</h2>
            {mine
              .filter((c) => c.my !== undefined)
              .map((c) => {
                const share = c.total > 0 ? Math.round(((c.my ?? 0) / c.total) * 100) : 0;
                return (
                  <div key={c.id} className="share-row">
                    <span className="ellipsis">{c.name}</span>
                    <div className="meter">
                      <div className="lead" style={{ width: `${share}%` }} />
                    </div>
                    <b className="right">{share}%</b>
                  </div>
                );
              })}
            <div className="tiny muted">{p.myShareNote}</div>
          </section>
        )}

        <section className="panel">
          <div className="split" style={{ alignItems: 'center' }}>
            <h2 className="d">{p.activities}</h2>
            <Link to="/atividade/nova" className="button secondary" aria-label={strings.challenge.register} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <PlusIcon />
              {strings.challenge.register}
            </Link>
          </div>
          {activities.data && myActivities.length === 0 && <p className="muted small">{p.activitiesEmpty}</p>}
          <ul className="list stack" style={{ gap: 0 }}>
            {myActivities.map((a) => (
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
                  <span className="d" style={{ fontSize: 17 }}>
                    {formatDuration(a.durationSeconds)}
                  </span>
                  <ChevronIcon />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <nav className="menu-list" aria-label={p.membersAndInvites}>
          <Link to="/integrantes">
            {canManageGroup(me) ? p.membersAndInvites : strings.nav.members}
            <ChevronIcon />
          </Link>
          <button type="button" className="danger-text" onClick={onSignOut}>
            {strings.nav.signOut}
          </button>
        </nav>
      </div>
    </>
  );
}

function Tile({ value, note }: { value: string; note: string }) {
  return (
    <div className="tile" style={{ padding: 'var(--space-4)' }}>
      <div className="d" style={{ fontSize: 28, lineHeight: 1.1 }}>
        {value}
      </div>
      <div className="tile-note" style={{ fontSize: 13 }}>
        {note}
      </div>
    </div>
  );
}
