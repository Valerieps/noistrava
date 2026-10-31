// The challenge screen (docs/spec/desafio-horas.md): the current challenge with its progress, the
// pace, the ranking, the highlights and the log, with or without a journey; a chain shows its
// calendar instead (docs/spec/desafio-corrente.md). Answering the invite,
// editing, cancelling and deleting start here too.
import { useEffect, useRef, useState } from 'react';
import type { ApiError, ChallengeView, LogEntryView, MeView } from '../../application/api-contract';
import { PERCENT_MILESTONES } from '../../domain/challenge/challenge';
import { daysLeft, formatDuration, formatGoal, pace, secondsToKm, type Pace } from '../../domain/challenge/progress';
import { isAdmin } from '../../domain/group/roles';
import { strings } from '../../domain/strings';
import { useServices } from '../backend-context';
import { formatDate, formatDayMonth, formatKm } from '../format';
import { MoreIcon, PlusIcon } from '../icons';
import { Link, navigate } from '../router';
import { useQuery } from '../use-query';
import { ActivityLog } from './challenge/ActivityLog';
import { ChainHero, ChainPanel } from './challenge/ChainPanel';
import { Highlights } from './challenge/Highlights';
import { JourneyMap } from './challenge/JourneyMap';
import { ProgressFigure, PaceNote, useProgressView, ViewPicker, type ProgressNumbers } from './challenge/ProgressPanel';
import { JourneyRanking, Ranking, senhorasOf } from './challenge/Ranking';
import { HowWeGotThere, ResultHero, ToleranceNote } from './challenge/Result';

const MINUTE = 60_000;

/** The current time, refreshed every minute so the pace and "faltam" stay right. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), MINUTE);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function errorText(error: ApiError): string {
  if (error === 'forbidden') return strings.forbidden;
  return strings.genericError;
}

export function ChallengeScreen({ me }: { me: MeView }) {
  const current = useQuery('challenge', {}, ['challenge', 'members']);
  const challenge = current.data?.challenge;

  if (current.loading && !current.data) return null;
  if (!current.data && current.error) {
    return (
      <div className="screen">
        <p className="notice" role="alert">
          {strings.genericError}
        </p>
        <button type="button" onClick={current.reload}>
          {strings.retry}
        </button>
      </div>
    );
  }
  if (!challenge) return <NoChallenge />;
  return <Challenge me={me} challenge={challenge} reload={current.reload} />;
}

function NoChallenge() {
  return (
    <div className="screen">
      <section className="hero striped" style={{ borderRadius: 'var(--radius-card)' }}>
        <div className="hero-card">
          <div className="lbl brand-ink">{strings.challenge.type}</div>
          <div className="d hero-title">{strings.challenge.noneTitle}</div>
          <div className="small muted">{strings.challenge.noneBody}</div>
        </div>
      </section>
      <Link to="/desafio/novo" className="button big-button" style={{ lineHeight: '40px' }}>
        {strings.challenge.create}
      </Link>
      <DraftsLink />
      <Link to="/historico" className="button secondary big-button" style={{ lineHeight: '40px' }}>
        {strings.challenge.seeHistory}
      </Link>
    </div>
  );
}

/** My drafts, when I have any; on the challenge screen, also the way to prepare the next one. */
function DraftsLink({ next = false }: { next?: boolean }) {
  const drafts = useQuery('drafts', {}, ['challenge']);
  const count = drafts.data?.length ?? 0;
  if (count === 0 && !next) return null;
  return (
    <Link to={count > 0 ? '/rascunhos' : '/desafio/novo'} className="button secondary big-button" style={{ lineHeight: '40px' }}>
      {count > 0 ? strings.drafts.link(count) : strings.drafts.next}
    </Link>
  );
}

function Challenge({ me, challenge, reload }: { me: MeView; challenge: ChallengeView; reload: () => void }) {
  const { backend } = useServices();
  const now = useNow();
  const log = useQuery('challengeLog', { challengeId: challenge.id }, ['challenge', 'activities']);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const entries: readonly LogEntryView[] = log.data ?? [];
  const journey = challenge.journey;
  const chain = challenge.chain;
  const period = { startsAt: challenge.startsAt, endsAt: challenge.endsAt };
  const goalSeconds = challenge.goalMinutes * 60;
  const open = challenge.state === 'open';
  const started = now.getTime() >= Date.parse(challenge.startsAt);
  const senhoras = senhorasOf(challenge.members).filter((m) => m.response === 'accepted');
  const p = pace(period, challenge.goalMinutes, challenge.totalSeconds, now);

  const left = !open ? strings.challenge.ended : !started ? strings.challenge.notStarted : strings.challenge.daysLeft(Math.max(1, daysLeft(period, now)));
  const dateRange = [formatDayMonth(challenge.startDate), formatDayMonth(challenge.endDate)] as const;

  async function run(action: () => Promise<{ ok: boolean; error?: ApiError }>, after?: () => void) {
    setBusy(true);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      setError(errorText(result.error ?? 'unavailable'));
      return;
    }
    setError(null);
    after?.();
    reload();
  }

  const respond = (accept: boolean) => run(() => backend.command('challenge.respond', { challengeId: challenge.id, accept }));

  function leave() {
    if (window.confirm(strings.challenge.invite.leaveConfirm)) void respond(false);
  }
  function cancel() {
    if (window.confirm(strings.challenge.cancelConfirm)) void run(() => backend.command('challenge.cancel', { challengeId: challenge.id }));
  }
  function remove() {
    if (window.confirm(strings.challenge.deleteConfirm)) void run(() => backend.command('challenge.delete', { challengeId: challenge.id }), () => navigate('/', { replace: true }));
  }

  const numbers: ProgressNumbers = journey
    ? journeyNumbers(challenge, p, journey.progressMeters)
    : {
        headline: formatDuration(challenge.totalSeconds),
        effective: challenge.totalSeconds / goalSeconds,
        programmed: open ? p.programmedSeconds / goalSeconds : 0,
        ofLabel: strings.challenge.ofTheGoal,
        ringLabel: strings.challenge.ringLabel(formatDuration(challenge.totalSeconds), formatDuration(p.programmedSeconds)),
        goalCaption: strings.challenge.curveGoal(formatGoal(challenge.goalMinutes)),
      };

  const [view, pickView] = useProgressView();
  const registerable = challenge.myResponse === 'accepted' && !challenge.closed;
  const inviting = open && challenge.myResponse === 'pending';

  const programmedText = open ? formatDuration(p.programmedSeconds) : undefined;
  const programmedKm = journey && open ? Math.round(Math.min(journey.distanceMeters / 1000, secondsToKm(p.programmedSeconds))) : undefined;
  const label = chain ? strings.chain.heroLabel(left) : journey ? strings.journey.heroLabel(left) : strings.challenge.heroLabel(left);
  const band = <div className="sheet-band" />;

  return (
    <>
      <header className={`hero-c hero-c-${challenge.banner}`}>
        <div className="hero-c-head">
          <div className="hero-c-label">
            <span>{label}</span>
            <Options me={me} challenge={challenge} busy={busy} onLeave={leave} onCancel={cancel} onDelete={remove} />
          </div>
          <h1 className="d hero-c-title">{challenge.name}</h1>
          <div className="hero-c-by">
            {journey && `${strings.journey.route(journey.start.name, journey.end.name)} · `}
            {strings.challenge.createdBy(challenge.creatorName)}
          </div>
        </div>
        {!open ? (
          <ResultHero challenge={challenge} log={entries} />
        ) : chain ? (
          <ChainHero chain={chain} />
        ) : null}
      </header>

      <div className="sheet">
        {open && !chain && (journey ? (
          <ProgressFigure
            view={view}
            picker={<ViewPicker view={view} onPick={pickView} />}
            numbers={numbers}
            of={strings.journey.heroOf(formatKm(journey.distanceMeters / 1000))}
            barNote={strings.journey.heroBarNote(formatDuration(challenge.totalSeconds), formatGoal(challenge.goalMinutes), challenge.percent)}
            programmedNote={programmedKm !== undefined ? strings.journey.heroProgrammed(programmedKm) : undefined}
            unit
            period={period}
            goalSeconds={goalSeconds}
            log={entries}
            now={now}
            dateRange={dateRange}
          />
        ) : (
          <ProgressFigure
            view={view}
            picker={<ViewPicker view={view} onPick={pickView} />}
            numbers={numbers}
            of={strings.challenge.heroOf(formatGoal(challenge.goalMinutes), programmedText)}
            programmedNote={programmedText && strings.challenge.heroProgrammed(programmedText)}
            period={period}
            goalSeconds={goalSeconds}
            log={entries}
            now={now}
            dateRange={dateRange}
          />
        ))}
        {journey && <JourneyMap challenge={challenge} programmedMeters={open ? secondsToKm(p.programmedSeconds) * 1000 : 0} />}
        {error && (
          <div className="sheet-section">
            <p className="notice" role="alert">
              {error}
            </p>
          </div>
        )}
        <Torcida challenge={challenge} busy={busy} onRespond={(accept) => void respond(accept)} />
        {!open && (
          <>
            <ToleranceNote challenge={challenge} />
            <HowWeGotThere challenge={challenge} log={entries} />
          </>
        )}
        {chain ? (
          <ChainPanel chain={chain} open={open} message={open && started} />
        ) : (
          open &&
          started && (
            <div className="sheet-section">
              <PaceNote {...paceText(p, challenge, senhoras.length, !!journey)} tone={p.tone} />
              {!journey && <PaceTiles p={p} goalMinutes={challenge.goalMinutes} />}
            </div>
          )
        )}
        {journey && (
          <>
            {band}
            <Timeline challenge={challenge} />
            {band}
            <JourneyRanking members={challenge.members} log={entries} now={now} />
          </>
        )}
        {!journey && (
          <>
            {band}
            <Ranking members={challenge.members} log={entries} period={period} now={now} />
          </>
        )}
        {band}
        <ActivityLog challengeId={challenge.id} entries={entries} journey={!!journey} sheet now={now} onChanged={log.reload} />
        {!journey && !chain && (
          <>
            {band}
            <Highlights log={entries} />
          </>
        )}
        {band}
        <div className="sheet-section">
          <DraftsLink next />
        </div>
        {registerable && <div className="spacer-fab" />}
        {inviting && <div className="spacer-invite" />}
      </div>

      {inviting && <InviteBar busy={busy} onRespond={(accept) => void respond(accept)} />}
      {registerable && (
        <Link to="/atividade/nova" className="fab fab-round" aria-label={strings.challenge.register}>
          <PlusIcon />
        </Link>
      )}
    </>
  );
}

function journeyNumbers(challenge: ChallengeView, p: Pace, progressMeters: number): ProgressNumbers {
  const journey = challenge.journey!;
  const totalKm = journey.distanceMeters / 1000;
  const doneKm = progressMeters / 1000;
  const programmedKm = Math.min(totalKm, secondsToKm(p.programmedSeconds));
  const open = challenge.state === 'open';
  return {
    headline: formatKm(doneKm),
    effective: doneKm / totalKm,
    programmed: open ? programmedKm / totalKm : 0,
    ofLabel: strings.challenge.ofTheRoute,
    ringLabel: strings.journey.ringLabel(formatKm(doneKm), formatKm(programmedKm)),
    goalCaption: strings.journey.curveGoal(journey.end.name, formatKm(totalKm)),
  };
}

function paceText(p: Pace, challenge: ChallengeView, senhoras: number, journey: boolean): { title: string; body: string } {
  const each = (seconds: number) => formatDuration(senhoras > 0 ? seconds / senhoras : seconds);
  const t = strings.challenge.pace;
  switch (p.tone) {
    case 'ahead':
      return {
        title: t.ahead(journey ? formatKm(secondsToKm(p.differenceSeconds)) : formatDuration(p.differenceSeconds)),
        body: p.projectedGoalAt && p.projectedGoalAt.getTime() < Date.parse(challenge.endsAt) ? t.aheadBody(formatDate(p.projectedGoalAt)) : t.aheadBodyNoDate,
      };
    case 'behind':
      return {
        title: journey ? strings.journey.behind(formatKm(secondsToKm(-p.differenceSeconds))) : t.behind(formatDuration(-p.differenceSeconds)),
        body: t.behindBody(each(-p.differenceSeconds)),
      };
    case 'finalStretch':
      return { title: t.finalStretch(formatDuration(p.remainingSeconds), p.daysLeft), body: t.finalStretchBody(formatDuration(p.neededPerDaySeconds)) };
    default:
      return { title: t.onPace, body: t.onPaceBody(formatDuration(p.neededPerDaySeconds), formatGoal(challenge.goalMinutes)) };
  }
}

function PaceTiles({ p, goalMinutes }: { p: Pace; goalMinutes: number }) {
  const extra = p.neededPerDaySeconds - p.averagePerDaySeconds;
  const tiles = [
    { value: formatDuration(p.neededPerDaySeconds), note: strings.challenge.tiles.needed(formatGoal(goalMinutes)) },
    { value: formatDuration(p.averagePerDaySeconds), note: strings.challenge.tiles.average },
    { value: `${extra > 0 ? '+' : '−'}${formatDuration(Math.abs(extra))}`, note: extra > 0 ? strings.challenge.tiles.extra : strings.challenge.tiles.slack },
  ];
  return (
    <div className="sheet-numbers">
      {tiles.map((t) => (
        <div key={t.note}>
          <div className="d sheet-number-value">{t.value}</div>
          <div className="sheet-number-note">{t.note}</div>
        </div>
      ))}
    </div>
  );
}

/** Being in the torcida, on the sheet, with the way back to being a Senhora. */
function Torcida({ challenge, busy, onRespond }: { challenge: ChallengeView; busy: boolean; onRespond: (accept: boolean) => void }) {
  if (challenge.state !== 'open' || challenge.myResponse !== 'declined') return null;
  const t = strings.challenge.invite;
  return (
    <div className="sheet-section sheet-torcida">
      <span>{t.torcida}</span>
      <button type="button" className="secondary" disabled={busy} onClick={() => onRespond(true)}>
        {t.join}
      </button>
    </div>
  );
}

/** The pending invite, in a bar fixed above the navigation. */
function InviteBar({ busy, onRespond }: { busy: boolean; onRespond: (accept: boolean) => void }) {
  const t = strings.challenge.invite;
  return (
    <section className="invite-bar" aria-label={t.title}>
      <h2 className="d">{t.title}</h2>
      <p>{t.body}</p>
      <div className="invite-bar-actions">
        <button type="button" className="secondary" disabled={busy} onClick={() => onRespond(false)}>
          {t.decline}
        </button>
        <button type="button" disabled={busy} onClick={() => onRespond(true)}>
          {t.accept}
        </button>
      </div>
    </section>
  );
}

interface TimelineItem {
  readonly km: number;
  readonly kind: 'mark' | 'here';
  readonly tag: string;
  readonly name: string;
  readonly reachedAt?: string;
}

function Timeline({ challenge }: { challenge: ChallengeView }) {
  const journey = challenge.journey!;
  const doneKm = Math.round(journey.progressMeters / 1000);
  const reached = new Map(challenge.milestones.map((m) => [m.milestone, m.reachedAt]));
  const totalKm = journey.distanceMeters / 1000;
  const items: TimelineItem[] = [
    { km: 0, kind: 'mark', tag: strings.journey.start, name: journey.start.name, reachedAt: challenge.startsAt },
    ...PERCENT_MILESTONES.map((p) => ({ km: Math.round((totalKm * p) / 100), kind: 'mark' as const, tag: strings.journey.milestone(`${p}%`), name: strings.journey.milestonePlace, reachedAt: reached.get(`${p}%`) })),
    ...journey.stops.map((s) => ({ km: Math.round(s.distanceMeters / 1000), kind: 'mark' as const, tag: strings.journey.stop, name: s.name, reachedAt: reached.get(`parada:${s.name}`) })),
    { km: Math.round(totalKm), kind: 'mark', tag: strings.journey.finish, name: journey.end.name },
  ];
  if (doneKm > 0 && doneKm < Math.round(totalKm)) items.push({ km: doneKm, kind: 'here', tag: strings.journey.now, name: strings.journey.groupHere });
  items.sort((a, b) => a.km - b.km || (a.kind === 'here' ? 1 : -1));

  return (
    <section className="sheet-section">
      <h2 className="d">{strings.journey.along}</h2>
      <ol className="rail-list">
        {items.map((t, i) => {
          const done = t.km <= doneKm;
          const here = t.kind === 'here';
          const at = here || done ? (t.reachedAt ? strings.journey.atKmOn(t.km, formatDate(t.reachedAt)) : strings.journey.atKm(t.km)) : strings.journey.inKm(t.km - doneKm);
          return (
            <li key={i} className={`rail-item${done ? ' done' : ''}${here ? ' here' : ''}`}>
              <div className="rail-dot" aria-hidden="true" />
              <div style={{ minWidth: 0 }}>
                <div className="rail-tag">{t.tag}</div>
                <div className="rail-name ellipsis">{t.name}</div>
              </div>
              <div className="rail-km">{at}</div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** The challenge's options, in a three-dot menu on the right of the header. */
function Options({
  me,
  challenge,
  busy,
  onLeave,
  onCancel,
  onDelete,
}: {
  me: MeView;
  challenge: ChallengeView;
  busy: boolean;
  onLeave: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!expanded) return;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setExpanded(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [expanded]);

  const creator = challenge.creatorId === me.id;
  const open = challenge.state === 'open';
  const canLeave = open && challenge.myResponse === 'accepted';
  if (!(creator && open) && !isAdmin(me) && !canLeave) return null;

  const pick = (action: () => void) => () => {
    setExpanded(false);
    action();
  };
  return (
    <div className="header-menu" ref={ref}>
      <button type="button" aria-label={strings.challenge.options} aria-haspopup="menu" aria-expanded={expanded} onClick={() => setExpanded((e) => !e)}>
        <MoreIcon />
      </button>
      {expanded && (
        <div className="menu-list" role="menu" aria-label={strings.challenge.options}>
          {creator && open && (
            <button type="button" role="menuitem" disabled={busy} onClick={pick(() => navigate(`/desafio/${encodeURIComponent(challenge.id)}/editar`))}>
              {strings.challenge.edit}
            </button>
          )}
          {creator && open && (
            <button type="button" role="menuitem" disabled={busy} onClick={pick(onCancel)}>
              {strings.challenge.cancel}
            </button>
          )}
          {canLeave && (
            <button type="button" role="menuitem" disabled={busy} onClick={pick(onLeave)}>
              {strings.challenge.invite.leave}
            </button>
          )}
          {isAdmin(me) && (
            <button type="button" role="menuitem" className="danger-strong" disabled={busy} onClick={pick(onDelete)}>
              {strings.challenge.delete}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
