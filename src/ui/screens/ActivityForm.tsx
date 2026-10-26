// Logging an activity by hand, or editing and deleting one of mine (docs/spec/atividades.md). On a
// Strava activity only the total time changes.
import { useState, type FormEvent } from 'react';
import type { ActivityView, ApiError } from '../../application/api-contract';
import { MANUAL_SPORTS, MAX_DURATION_SECONDS } from '../../domain/activity';
import { strings } from '../../domain/strings';
import { BackHeader } from '../App';
import { useServices } from '../backend-context';
import { deviceTimezone, sportName, toLocalInput } from '../format';
import { navigate } from '../router';
import { useQuery } from '../use-query';

function errorText(error: ApiError): string {
  if (error === 'invalid') return strings.activityForm.invalid;
  if (error === 'conflict') return strings.activityForm.closed;
  if (error === 'not_found') return strings.activityForm.notFound;
  return strings.genericError;
}

function back() {
  if (window.history.length > 1) window.history.back();
  else navigate('/', { replace: true });
}

export function ActivityForm({ activityId }: { activityId: string | null }) {
  const activities = useQuery('activities', {}, ['activities']);
  const activity = activityId ? activities.data?.find((a) => a.id === activityId) : null;
  const title = activityId ? strings.activityForm.editTitle : strings.activityForm.newTitle;
  if (activityId && !activity) {
    return (
      <>
        <BackHeader title={title} to="/perfil" />
        {activities.data && (
          <div className="screen">
            <p className="notice" role="alert">
              {strings.activityForm.notFound}
            </p>
          </div>
        )}
      </>
    );
  }
  return <Form activity={activity ?? null} title={title} />;
}

function Form({ activity, title }: { activity: ActivityView | null; title: string }) {
  const { backend } = useServices();
  const fromStrava = activity?.source === 'strava';
  const initialMinutes = activity ? Math.round(activity.durationSeconds / 60) : 45;
  const [start, setStart] = useState(() => toLocalInput(activity?.startedAt ?? new Date()));
  const [hours, setHours] = useState(String(Math.floor(initialMinutes / 60)));
  const [minutes, setMinutes] = useState(String(initialMinutes % 60));
  const [sport, setSport] = useState(activity?.sport ?? MANUAL_SPORTS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const f = strings.activityForm;

  const durationSeconds = (Number(hours) * 60 + Number(minutes)) * 60;
  const sports: string[] = [...MANUAL_SPORTS];
  if (activity && !sports.includes(activity.sport)) sports.push(activity.sport);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!(durationSeconds > 0 && durationSeconds <= MAX_DURATION_SECONDS)) {
      setError(f.invalid);
      return;
    }
    const startedAt = new Date(start).toISOString();
    const timezone = deviceTimezone() ?? 'UTC';
    setBusy(true);
    const result = activity
      ? await backend.command('activity.update', {
          activityId: activity.id,
          durationSeconds,
          ...(fromStrava ? {} : { sport, ...(toLocalInput(activity.startedAt) === start ? {} : { startedAt, timezone }) }),
        })
      : await backend.command('activity.create', { startedAt, timezone, durationSeconds, sport });
    setBusy(false);
    if (result.ok) {
      back();
      return;
    }
    setError(errorText(result.error));
  }

  async function remove() {
    if (!activity || !window.confirm(f.deleteConfirm)) return;
    setBusy(true);
    const result = await backend.command('activity.delete', { activityId: activity.id });
    setBusy(false);
    if (result.ok) back();
    else setError(errorText(result.error));
  }

  return (
    <>
      <BackHeader title={title} to="/" />
      <form className="screen" onSubmit={submit}>
        <section className="panel">
          {fromStrava && <p className="small muted" style={{ margin: 0 }}>{f.stravaNote}</p>}
          <label>
            <span className="field-label">{f.start}</span>
            <input type="datetime-local" required disabled={fromStrava} max={toLocalInput(new Date())} value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 4 }}>
            <legend className="field-label" style={{ padding: 0, marginBottom: 4 }}>
              {f.duration}
            </legend>
            <div className="form-grid">
              <label>
                <span className="tiny muted">{f.hours}</span>
                <input type="number" inputMode="numeric" required min={0} max={24} step={1} value={hours} onChange={(e) => setHours(e.target.value)} />
              </label>
              <label>
                <span className="tiny muted">{f.minutes}</span>
                <input type="number" inputMode="numeric" required min={0} max={59} step={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
              </label>
            </div>
          </fieldset>
          <label>
            <span className="field-label">{f.sport}</span>
            <select required disabled={fromStrava} value={sport} onChange={(e) => setSport(e.target.value)}>
              {sports.map((s) => (
                <option key={s} value={s}>
                  {sportName(s)}
                </option>
              ))}
            </select>
          </label>
        </section>
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="big-button" disabled={busy}>
          {f.save}
        </button>
        {activity && (
          <button type="button" className="danger big-button" disabled={busy} onClick={() => void remove()}>
            {f.delete}
          </button>
        )}
      </form>
    </>
  );
}
