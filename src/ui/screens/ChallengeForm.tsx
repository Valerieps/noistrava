// Creating or editing a challenge (docs/spec/desafio-horas.md, "Criar" and "Editar"): the type,
// the name, the goal in hours or a journey, or a chain's breaks (docs/spec/desafio-corrente.md),
// the period, and whether the creator is a Senhora. A new challenge is saved as a draft, or opened at once while no other is open.
import { useEffect, useState, type FormEvent } from 'react';
import type { ApiError, ChallengeSetupInput, ChallengeView } from '../../application/api-contract';
import { CHAIN_MIN_MINUTES_MAX, maxBreaks } from '../../domain/challenge/chain';
import { CHALLENGE_NAME_MAX_LENGTH, GOAL_HOURS_MAX, type ChallengeType, type Journey } from '../../domain/challenge/challenge';
import { strings } from '../../domain/strings';
import { BackHeader } from '../App';
import { useServices } from '../backend-context';
import { todayDate } from '../format';
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

/** Saving a draft, opening the challenge now (creating it, or activating the draft), or saving an open one. */
type Mode = 'draft' | 'open' | 'save';

function Form({ challenge }: { challenge: ChallengeView | null }) {
  const { backend } = useServices();
  const current = useQuery('challenge', {}, ['challenge']);
  const isDraft = challenge?.state === 'draft';
  const creating = challenge === null || isDraft;
  // Opening now is offered only while no challenge is open.
  const canOpen = current.data !== undefined && current.data.challenge?.state !== 'open';
  const today = todayDate();
  const [name, setName] = useState(challenge?.name ?? '');
  const [startDate, setStartDate] = useState(challenge?.startDate ?? today);
  const [endDate, setEndDate] = useState(challenge?.endDate ?? endOfMonth(today));
  const [goalHours, setGoalHours] = useState(challenge?.goalMinutes ? String(Math.round(challenge.goalMinutes / 60)) : '100');
  const [type, setType] = useState<ChallengeType>(challenge?.type ?? 'horas_colaborativas');
  const [allowedBreaks, setAllowedBreaks] = useState(String(challenge?.chain?.allowedBreaks ?? 0));
  const [minMinutes, setMinMinutes] = useState(String(challenge?.chain?.minMinutesPerDay ?? 0));
  const chain = type === 'corrente';
  const breaksMax = startDate <= endDate ? maxBreaks(startDate, endDate) : 0;
  const [senhora, setSenhora] = useState(isDraft ? challenge.creatorIsSenhora : true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialJourney] = useState<Journey | null>(() =>
    challenge?.journey
      ? { start: challenge.journey.start, end: challenge.journey.end, stops: challenge.journey.stops, distanceMeters: challenge.journey.distanceMeters, route: challenge.journey.route }
      : null,
  );
  const [withJourney, setWithJourney] = useState(initialJourney !== null || challenge?.journeyPending === true);
  // The route computed for the chosen places; null until the creator computes it.
  const [journey, setJourney] = useState<Journey | null>(initialJourney);

  useEffect(() => {
    if (challenge && challenge.state !== 'open' && challenge.state !== 'draft') navigate('/', { replace: true });
  }, [challenge]);

  async function submit(mode: Mode) {
    // A draft may wait for its route; an open challenge may not.
    if (!chain && withJourney && !journey && mode !== 'draft') {
      setError(strings.challengeForm.routeNeeded);
      return;
    }
    setBusy(true);
    const setup: ChallengeSetupInput = chain
      ? { type, name, startDate, endDate, chain: { allowedBreaks: Number(allowedBreaks), minMinutesPerDay: Number(minMinutes) } }
      : !withJourney
      ? { name, startDate, endDate, goalHours: Number(goalHours) }
      : journey
        ? { name, startDate, endDate, journey }
        : { name, startDate, endDate, journeyPending: true };
    let result;
    if (!challenge) {
      result = await backend.command('challenge.create', { ...setup, creatorIsSenhora: senhora, draft: mode === 'draft' });
    } else {
      result = await backend.command('challenge.edit', { ...setup, challengeId: challenge.id, ...(isDraft ? { creatorIsSenhora: senhora } : {}) });
      if (result.ok && isDraft && mode === 'open') result = await backend.command('challenge.activate', { challengeId: challenge.id });
    }
    setBusy(false);
    if (result.ok) {
      navigate(mode === 'draft' ? '/rascunhos' : '/', { replace: true });
      return;
    }
    setError(errorText(result.error, !creating));
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit(!creating ? 'save' : canOpen ? 'open' : 'draft');
  }

  const f = strings.challengeForm;

  return (
    <>
      <BackHeader title={isDraft ? f.draftTitle : challenge ? f.editTitle : f.newTitle} to={isDraft ? '/rascunhos' : '/'} />
      <form className="screen" onSubmit={onSubmit}>
        <section className="panel">
          <label>
            <span className="field-label">{f.name}</span>
            <input required maxLength={CHALLENGE_NAME_MAX_LENGTH} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        </section>

        {creating && (
          <section className="panel">
            <div role="radiogroup" aria-label={f.typeSection} className="segmented" style={{ alignSelf: 'stretch' }}>
              <button type="button" role="radio" aria-checked={!chain} onClick={() => setType('horas_colaborativas')} style={{ flex: 1, width: 'auto', borderRadius: 'var(--radius-pill)', fontWeight: 600 }}>
                {f.hoursType}
              </button>
              <button type="button" role="radio" aria-checked={chain} onClick={() => setType('corrente')} style={{ flex: 1, width: 'auto', borderRadius: 'var(--radius-pill)', fontWeight: 600 }}>
                {f.chainType}
              </button>
            </div>
            {chain && <span className="tiny muted">{f.chainHint}</span>}
          </section>
        )}

        {chain ? (
          <section className="panel">
            <div className="form-grid">
              <label>
                <span className="field-label">{f.allowedBreaks}</span>
                <input type="number" inputMode="numeric" required min={0} max={breaksMax} step={1} value={allowedBreaks} onChange={(e) => setAllowedBreaks(e.target.value)} />
              </label>
              <label>
                <span className="field-label">{f.minMinutes}</span>
                <input type="number" inputMode="numeric" required min={0} max={CHAIN_MIN_MINUTES_MAX} step={1} value={minMinutes} onChange={(e) => setMinMinutes(e.target.value)} />
              </label>
            </div>
            <span className="tiny muted">{f.allowedBreaksHint(breaksMax)}</span>
            <span className="tiny muted">{f.minMinutesHint}</span>
          </section>
        ) : (
          <section className="panel">
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
        )}

        <section className="panel">
          <div className="form-grid">
            <label>
              <span className="field-label">{f.start}</span>
              <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label>
              <span className="field-label">{f.end}</span>
              {/* A draft's end may have passed; opening it checks again. */}
              <input type="date" required min={creating ? startDate : startDate > today ? startDate : today} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
          </div>
        </section>

        {creating && (
          <section className="panel">
            <label className="switch-row" style={{ flexDirection: 'row' }}>
              <b>{f.senhora}</b>
              <input type="checkbox" role="switch" className="switch" checked={senhora} onChange={(e) => setSenhora(e.target.checked)} />
            </label>
          </section>
        )}

        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        {creating && canOpen && (
          <button type="submit" className="big-button" disabled={busy}>
            {isDraft ? f.activate : f.create}
          </button>
        )}
        {creating ? (
          <button type={canOpen ? 'button' : 'submit'} className={canOpen ? 'secondary big-button' : 'big-button'} disabled={busy}
            onClick={
              canOpen
                ? (e) => {
                    if (e.currentTarget.form?.reportValidity()) void submit('draft');
                  }
                : undefined
            }
          >
            {f.saveDraft}
          </button>
        ) : (
          <button type="submit" className="big-button" disabled={busy}>
            {f.save}
          </button>
        )}
      </form>
    </>
  );
}
