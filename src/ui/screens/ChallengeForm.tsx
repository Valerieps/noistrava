// Creating or editing a challenge (docs/spec/desafio-horas.md, "Criar" and "Editar"): the name,
// the period with each member's zone, the goal in hours or a journey, and whether the creator is a
// Senhora.
import { useEffect, useState, type FormEvent } from 'react';
import type { ApiError, ChallengeSetupInput, ChallengeView } from '../../application/api-contract';
import { CHALLENGE_NAME_MAX_LENGTH, GOAL_HOURS_MAX, challengePeriod, type Journey } from '../../domain/challenge/challenge';
import { formatOffset, utcOffsetMinutes } from '../../domain/challenge/progress';
import { strings } from '../../domain/strings';
import { isCalendarDate } from '../../domain/time/zones';
import { BackHeader } from '../App';
import { useServices } from '../backend-context';
import { formatWeekdayHour, todayDate } from '../format';
import { navigate } from '../router';
import { useQuery } from '../use-query';
import { JourneyBuilder } from './JourneyBuilder';

function errorText(error: ApiError, editing: boolean): string {
  if (error === 'conflict') return editing ? strings.challengeForm.notEditable : strings.challengeForm.conflict;
  if (error === 'invalid') return strings.challengeForm.invalid;
  if (error === 'forbidden') return strings.forbidden;
  return strings.genericError;
}

/** The last day of the month `date` falls in. */
function endOfMonth(date: string): string {
  const [y, m] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function ChallengeForm({ challengeId }: { challengeId: string | null }) {
  const existing = useQuery('challenge', challengeId ? { challengeId } : {}, ['challenge']);
  const challenge = challengeId ? existing.data?.challenge : null;
  if (challengeId && !challenge) {
    return (
      <>
        <BackHeader title={strings.challengeForm.editTitle} to="/" />
        {existing.error && (
          <div className="screen">
            <p className="notice" role="alert">
              {strings.genericError}
            </p>
          </div>
        )}
      </>
    );
  }
  return <Form challenge={challenge ?? null} />;
}

function Form({ challenge }: { challenge: ChallengeView | null }) {
  const { backend } = useServices();
  const members = useQuery('members', {}, ['members']);
  const today = todayDate();
  const [name, setName] = useState(challenge?.name ?? '');
  const [startDate, setStartDate] = useState(challenge?.startDate ?? today);
  const [endDate, setEndDate] = useState(challenge?.endDate ?? endOfMonth(today));
  const [goalHours, setGoalHours] = useState(challenge ? String(Math.round(challenge.goalMinutes / 60)) : '100');
  const [senhora, setSenhora] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialJourney] = useState<Journey | null>(() =>
    challenge?.journey
      ? { start: challenge.journey.start, end: challenge.journey.end, stops: challenge.journey.stops, distanceMeters: challenge.journey.distanceMeters, route: challenge.journey.route }
      : null,
  );
  const [withJourney, setWithJourney] = useState(initialJourney !== null);
  // The route computed for the chosen places; null until the creator computes it.
  const [journey, setJourney] = useState<Journey | null>(initialJourney);

  useEffect(() => {
    if (challenge && challenge.state !== 'open') navigate('/', { replace: true });
  }, [challenge]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (withJourney && !journey) {
      setError(strings.challengeForm.routeNeeded);
      return;
    }
    setBusy(true);
    const setup: ChallengeSetupInput = withJourney && journey ? { name, startDate, endDate, journey } : { name, startDate, endDate, goalHours: Number(goalHours) };
    const result = challenge
      ? await backend.command('challenge.edit', { ...setup, challengeId: challenge.id })
      : await backend.command('challenge.create', { ...setup, creatorIsSenhora: senhora });
    setBusy(false);
    if (result.ok) {
      navigate('/', { replace: true });
      return;
    }
    setError(errorText(result.error, challenge !== null));
  }

  const zones = [...new Set((members.data ?? []).map((m) => m.timezone).filter((z): z is string => z !== null))];
  const f = strings.challengeForm;

  return (
    <>
      <BackHeader title={challenge ? f.editTitle : f.newTitle} to="/" />
      <form className="screen" onSubmit={submit}>
        <section className="panel">
          <div className="lbl section-label">{f.nameSection}</div>
          <label>
            <span className="field-label">{f.name}</span>
            <input required maxLength={CHALLENGE_NAME_MAX_LENGTH} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        </section>

        <section className="panel">
          <div className="lbl section-label">{f.periodSection}</div>
          <div className="form-grid">
            <label>
              <span className="field-label">{f.start}</span>
              <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label>
              <span className="field-label">{f.end}</span>
              <input type="date" required min={startDate > today ? startDate : today} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
          </div>
          <ZoneTable zones={zones} startDate={startDate} endDate={endDate} />
        </section>

        <section className="panel">
          <div className="lbl section-label">{f.goalSection}</div>
          <div role="radiogroup" aria-label={f.goalSection} className="segmented" style={{ alignSelf: 'stretch' }}>
            <button type="button" role="radio" aria-checked={!withJourney} onClick={() => setWithJourney(false)} style={{ flex: 1, width: 'auto', borderRadius: 'var(--radius-pill)', fontWeight: 600 }}>
              {f.hoursOnly}
            </button>
            <button type="button" role="radio" aria-checked={withJourney} onClick={() => {
                setWithJourney(true);
                // The builder starts again from the stored journey, so the form does too.
                setJourney(initialJourney);
              }} style={{ flex: 1, width: 'auto', borderRadius: 'var(--radius-pill)', fontWeight: 600 }}>
              {f.withJourney}
            </button>
          </div>
          {withJourney ? (
            <JourneyBuilder initial={initialJourney} onChange={setJourney} />
          ) : (
            <label>
              <span className="field-label">{f.goalHours}</span>
              <input type="number" inputMode="numeric" required min={1} max={GOAL_HOURS_MAX} step={1} value={goalHours} onChange={(e) => setGoalHours(e.target.value)} />
              <span className="tiny muted">{f.goalHint}</span>
            </label>
          )}
        </section>

        {!challenge && (
          <section className="panel">
            <label className="switch-row" style={{ flexDirection: 'row' }}>
              <span className="stack" style={{ gap: 0 }}>
                <b>{f.senhora}</b>
                <span className="small muted">{f.senhoraNote}</span>
              </span>
              <input type="checkbox" role="switch" className="switch" checked={senhora} onChange={(e) => setSenhora(e.target.checked)} />
            </label>
          </section>
        )}

        {!challenge && <p className="small muted" style={{ margin: '0 4px' }}>{f.inviteNote}</p>}
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="big-button" disabled={busy}>
          {challenge ? f.save : f.create}
        </button>
      </form>
    </>
  );
}

/** Each zone's start and end, so the creator sees the exact hours before confirming. */
function ZoneTable({ zones, startDate, endDate }: { zones: readonly string[]; startDate: string; endDate: string }) {
  const f = strings.challengeForm;
  if (!isCalendarDate(startDate) || !isCalendarDate(endDate) || endDate < startDate) return null;
  const { startsAt, endsAt } = challengePeriod(startDate, endDate, zones);
  const byOffset = new Map<number, string>();
  for (const zone of zones.length > 0 ? zones : ['UTC']) {
    const offset = utcOffsetMinutes(zone, startsAt);
    if (!byOffset.has(offset)) byOffset.set(offset, zone);
  }
  const rows = [...byOffset.entries()].sort((a, b) => b[0] - a[0]);
  // The end hour shows 24h of the last day rather than 0h of the next.
  const endLabel = (zone: string) => {
    const label = formatWeekdayHour(endsAt, zone);
    if (!label.endsWith(' 0h')) return label;
    const lastDay = new Date(endsAt.getTime() - 1);
    return `${formatWeekdayHour(lastDay, zone).split(' ')[0]} 24h`;
  };
  return (
    <div className="zones">
      <div style={{ fontWeight: 600 }}>{f.zonesTitle}</div>
      {rows.map(([offset, zone]) => (
        <div key={offset} className="zones-row">
          <b>{formatOffset(offset)}</b>
          <span className="muted">{f.zoneStarts(formatWeekdayHour(startsAt, zone))}</span>
          <span className="muted">{f.zoneEnds(endLabel(zone))}</span>
        </div>
      ))}
      <div className="tiny muted">{zones.length > 0 ? f.zonesNote : f.zonesNone}</div>
    </div>
  );
}
