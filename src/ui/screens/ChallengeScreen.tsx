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
import { formatDate, formatDateTime, formatDayMonth, formatKm, formatPeriod } from '../format';
import { MoreIcon, PlusIcon } from '../icons';
import { Link, navigate } from '../router';
import { useQuery } from '../use-query';
import { ActivityLog } from './challenge/ActivityLog';
import { ChainMessage, ChainPanel } from './challenge/ChainPanel';
import { Highlights } from './challenge/Highlights';
import { JourneyMap } from './challenge/JourneyMap';
import { HeroRing, PaceMessage, PaceNote, ProgressPanel, type ProgressNumbers } from './challenge/ProgressPanel';
import { JourneyRanking, Ranking, senhorasOf } from './challenge/Ranking';

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
  const periodText = formatPeriod(challenge.startDate, challenge.endDate);
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
        subline: strings.challenge.ofGoal(formatGoal(challenge.goalMinutes), challenge.percent),
        effective: challenge.totalSeconds / goalSeconds,
        programmed: open ? p.programmedSeconds / goalSeconds : 0,
        effectiveLabel: `${strings.challenge.effective} ${formatDuration(challenge.totalSeconds)}`,
        programmedLabel: `${strings.challenge.programmed} ${formatDuration(p.programmedSeconds)}`,
        ofLabel: strings.challenge.ofTheGoal,
        ringLabel: strings.challenge.ringLabel(formatDuration(challenge.totalSeconds), formatDuration(p.programmedSeconds)),
        goalCaption: strings.challenge.curveGoal(formatGoal(challenge.goalMinutes)),
        milestones: PERCENT_MILESTONES.map((m) => m / 100),
        barFooter: (
          <>
            <div className="legend">
              <div>
                <span className="swatch brand" />
                <span>
                  <b>{strings.challenge.effective}</b> {formatDuration(challenge.totalSeconds)}
                </span>
              </div>
              {open && (
                <div>
                  <span className="swatch ghost" />
                  <span>
                    <b>{strings.challenge.programmedToday}</b> {formatDuration(p.programmedSeconds)}
                  </span>
                </div>
              )}
            </div>
            <div className="small muted">
              {open && strings.challenge.barNote}{' '}
              {challenge.milestones.some((m) => m.milestone.endsWith('%')) &&
                strings.challenge.milestonesReached(
                  challenge.milestones
                    .filter((m) => m.milestone.endsWith('%'))
                    .map((m) => m.milestone)
                    .join(', '),
                )}
            </div>
          </>
        ),
      };

  const registerable = challenge.myResponse === 'accepted' && !challenge.closed;

  if (!journey && !chain) {
    const programmedText = open ? formatDuration(p.programmedSeconds) : undefined;
    return (
      <>
        <header className={`hero-c hero-c-${challenge.banner}`}>
          <div className="hero-c-label">
            <span>{strings.challenge.heroLabel(left)}</span>
            <Options me={me} challenge={challenge} busy={busy} onLeave={leave} onCancel={cancel} onDelete={remove} />
          </div>
          <h1 className="d hero-c-title">{challenge.name}</h1>
          <div className="hero-c-by">{strings.challenge.createdBy(challenge.creatorName)}</div>
          <div className="hero-c-total">
            <HeroRing numbers={numbers} />
            <div>
              <div className="d hero-c-number">{numbers.headline}</div>
              <div className="hero-c-of">{strings.challenge.heroOf(formatGoal(challenge.goalMinutes), programmedText)}</div>
            </div>
          </div>
        </header>

        <div className="sheet">
          {error && (
            <div className="sheet-section">
              <p className="notice" role="alert">
                {error}
              </p>
            </div>
          )}
          <Response sheet challenge={challenge} busy={busy} onRespond={(accept) => void respond(accept)} />
          {!open && (
            <div className="sheet-section">
              <Result challenge={challenge} />
            </div>
          )}
          {open && started && (
            <div className="sheet-section">
              <PaceNote {...paceText(p, challenge, senhoras.length, false)} tone={p.tone} />
              <PaceTiles p={p} goalMinutes={challenge.goalMinutes} />
            </div>
          )}
          <div className="sheet-band" />
          <Ranking members={challenge.members} log={entries} period={period} now={now} />
          <div className="sheet-band" />
          <ActivityLog challengeId={challenge.id} entries={entries} journey={false} sheet now={now} onChanged={log.reload} />
          <div className="sheet-band" />
          <Highlights log={entries} />
          <div className="sheet-band" />
          <div className="sheet-section">
            <DraftsLink next />
          </div>
          {registerable && <div className="spacer-fab" />}
        </div>

        {registerable && (
          <Link to="/atividade/nova" className="fab fab-round" aria-label={strings.challenge.register}>
            <PlusIcon />
          </Link>
        )}
      </>
    );
  }

  return (
    <>
      {journey ? (
        <header className="journey-header">
          <div className={`journey-badge banner-${challenge.banner}`} aria-hidden="true" />
          <div className="stack" style={{ gap: 2, minWidth: 0 }}>
            <h1 className="d hero-title" style={{ margin: 0, color: 'var(--color-text)' }}>
              {challenge.name}
            </h1>
            <div className="small muted">
              {periodText} · {left}
            </div>
          </div>
          <Options me={me} challenge={challenge} busy={busy} onLeave={leave} onCancel={cancel} onDelete={remove} />
        </header>
      ) : (
        <header className={`hero banner-${challenge.banner}`}>
          <div className="hero-card">
            <h1 className="d hero-title" style={{ margin: 0, color: 'var(--color-text)' }}>
              {challenge.name}
            </h1>
            <div className="small muted">
              {periodText} · {left} · {strings.challenge.createdBy(challenge.creatorName)}
            </div>
          </div>
          <Options me={me} challenge={challenge} busy={busy} onLeave={leave} onCancel={cancel} onDelete={remove} />
        </header>
      )}

      <div className="screen">
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}

        <Response challenge={challenge} busy={busy} onRespond={(accept) => void respond(accept)} />
        {!open && <Result challenge={challenge} />}

        {chain ? (
          <>
            {open && started && <ChainMessage chain={chain} />}
            <ChainPanel chain={chain} />
          </>
        ) : (
          <>
            {journey && <JourneyMap challenge={challenge} programmedMeters={open ? secondsToKm(p.programmedSeconds) * 1000 : 0} />}

            <ProgressPanel
              numbers={numbers}
              period={period}
              goalSeconds={goalSeconds}
              log={entries}
              now={now}
              dateRange={dateRange}
              message={open && started ? <PaceMessage {...paceText(p, challenge, senhoras.length, !!journey)} tone={p.tone} /> : null}
            />

          </>
        )}

        {journey && <Timeline challenge={challenge} />}

        {journey && <JourneyRanking members={challenge.members} log={entries} now={now} />}

        <ActivityLog challengeId={challenge.id} entries={entries} journey={!!journey} now={now} onChanged={log.reload} />

        <DraftsLink next />
        {registerable && <div className="spacer-fab" />}
      </div>

      {registerable && (
        <Link to="/atividade/nova" className="fab">
          <PlusIcon />
          {strings.challenge.register}
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
  const places = [{ name: journey.start.name, distanceMeters: 0 }, ...journey.stops, { name: journey.end.name, distanceMeters: journey.distanceMeters }];
  return {
    headline: formatKm(doneKm),
    subline: strings.journey.of(formatKm(doneKm), formatKm(totalKm),formatDuration(challenge.totalSeconds), formatGoal(challenge.goalMinutes), challenge.percent),
    effective: doneKm / totalKm,
    programmed: open ? programmedKm / totalKm : 0,
    effectiveLabel: strings.journey.walked(formatKm(doneKm)),
    programmedLabel: strings.journey.programmedKm(formatKm(programmedKm)),
    ofLabel: strings.challenge.ofTheRoute,
    ringLabel: strings.journey.ringLabel(formatKm(doneKm), formatKm(programmedKm)),
    goalCaption: strings.journey.curveGoal(journey.end.name, formatKm(totalKm)),
    milestones: [],
    barFooter: (
      <div className="axis">
        {places.map((s) => (
          <span key={`${s.name}-${s.distanceMeters}`}>{s.name}</span>
        ))}
      </div>
    ),
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

/** The invite: a box on the old layout, plain on the sheet. */
function Response({ challenge, busy, onRespond, sheet = false }: { challenge: ChallengeView; busy: boolean; onRespond: (accept: boolean) => void; sheet?: boolean }) {
  if (challenge.state !== 'open') return null;
  const t = strings.challenge.invite;
  if (challenge.myResponse === 'pending') {
    return (
      <section className={sheet ? 'sheet-section sheet-invite' : 'panel'} style={sheet ? undefined : { background: 'var(--color-brand-soft)' }}>
        <h2 className="d">{t.title}</h2>
        <p className="small" style={{ margin: 0 }}>
          {t.body}
        </p>
        <div className="actions">
          <button type="button" disabled={busy} onClick={() => onRespond(true)}>
            {t.accept}
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={() => onRespond(false)}>
            {t.decline}
          </button>
        </div>
      </section>
    );
  }
  if (challenge.myResponse === 'declined') {
    return (
      <div className={sheet ? 'sheet-section' : undefined}>
        <div className="notice row" style={{ margin: 0, justifyContent: 'space-between' }}>
          <span>{t.torcida}</span>
          <button type="button" disabled={busy} onClick={() => onRespond(true)}>
            {t.join}
          </button>
        </div>
      </div>
    );
  }
  return null;
}

function Result({ challenge }: { challenge: ChallengeView }) {
  if (challenge.chain && challenge.state !== 'cancelled') return <ChainResult challenge={challenge} />;
  const r = strings.challenge.result;
  const days = challenge.endedAt ? Math.max(1, Math.ceil((Date.parse(challenge.endedAt) - Date.parse(challenge.startsAt)) / 86_400_000)) : 0;
  const [title, body, tone] =
    challenge.state === 'succeeded'
      ? [r.succeeded, r.succeededBody(days), 'tone-ahead']
      : challenge.state === 'failed'
        ? [r.failed(challenge.percent), r.failedBody, 'tone-behind']
        : [r.cancelled, r.cancelledBody, 'tone-onPace'];
  return (
    <div className={`message ${tone}`} role="status">
      <strong>{title}</strong>
      <span>{body}</span>
      {challenge.closesAt && !challenge.closed && challenge.state !== 'cancelled' && <span>{r.tolerance(formatDateTime(challenge.closesAt))}</span>}
    </div>
  );
}

function ChainResult({ challenge }: { challenge: ChallengeView }) {
  const chain = challenge.chain!;
  const r = strings.chain.result;
  const succeeded = challenge.state === 'succeeded';
  return (
    <div className={`message ${succeeded ? 'tone-ahead' : 'tone-behind'}`} role="status">
      <strong>{succeeded ? r.succeeded : r.failed}</strong>
      <span>{succeeded ? r.succeededBody(chain.saved) : r.failedBody(chain.lost, chain.allowedBreaks)}</span>
      {challenge.closesAt && !challenge.closed && <span>{r.tolerance(formatDateTime(challenge.closesAt))}</span>}
    </div>
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
  if (doneKm > 0 && doneKm < Math.round(totalKm)) items.push({ km: doneKm, kind: 'here', tag: strings.journey.now, name: strings.journey.now });
  items.sort((a, b) => a.km - b.km || (a.kind === 'here' ? 1 : -1));

  return (
    <section className="panel panel-flush" aria-label={strings.journey.along}>
      <ol className="timeline list">
        {items.map((t, i) => {
          const done = t.km <= doneKm;
          const here = t.kind === 'here';
          const at = here ? strings.journey.hereNow(t.km) : done ? (t.reachedAt ? strings.journey.atKmOn(t.km, formatDate(t.reachedAt)) : strings.journey.atKm(t.km)) : strings.journey.inKm(t.km - doneKm);
          return (
            <li key={i} className="timeline-item">
              <div className="timeline-rail" aria-hidden="true">
                <div className={`line${done ? ' done' : ''}`} />
                <div className={`dot${here ? ' here' : t.kind === 'mark' ? ' mark' : ''}${done && !here ? ' done' : ''}`} />
              </div>
              <div className={`timeline-card${here ? ' plain' : ''}${done ? ' done' : ' ahead'}`}>
                <div className="timeline-tag">{t.tag}</div>
                {!here && <div className="small" style={{ fontWeight: 700, lineHeight: 1.2 }}>{t.name}</div>}
                <div className="tiny muted">{at}</div>
              </div>
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
