// "Atividades modelo" (docs/spec/atividades.md): the activities I repeat, saved once with their
// sport, total time, weekdays and time, to pick when logging by hand.
import { useState, type FormEvent } from 'react';
import type { ActivityTemplateView, ApiError } from '../../application/api-contract';
import { MANUAL_SPORTS, MAX_DURATION_SECONDS } from '../../domain/activity';
import { MAX_TEMPLATE_NAME_LENGTH } from '../../domain/activity-template';
import { formatDuration } from '../../domain/challenge/progress';
import type { Weekday } from '../../domain/reminder';
import { strings } from '../../domain/strings';
import { BackHeader } from '../App';
import { useServices } from '../backend-context';
import { sportName } from '../format';
import { ChevronIcon, PlusIcon } from '../icons';
import { Link, navigate } from '../router';
import { useQuery } from '../use-query';

const WEEKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6];

/** "seg e qua · 08:00 · 1h". */
export function templateSummary(template: ActivityTemplateView): string {
  return `${strings.templates.daysLabel(template.days)} · ${template.time} · ${formatDuration(template.durationSeconds)}`;
}

export function ActivityTemplates() {
  const templates = useQuery('activityTemplates', {}, ['templates']);
  const t = strings.templates;
  const list = templates.data ?? [];
  return (
    <section className="sheet-section">
      <p className="muted small" style={{ margin: 0 }}>
        {t.about}
      </p>
      <Link to="/modelo/novo" className="button secondary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <PlusIcon />
        {t.add}
      </Link>
      {templates.data && list.length === 0 && <p className="muted small">{t.empty}</p>}
      <ul className="sheet-list-plain">
        {list.map((template) => (
          <li key={template.id}>
            <Link to={`/modelo/${encodeURIComponent(template.id)}`} className="sheet-link-row">
              <span className="grow">
                <b>{template.name}</b>
                <br />
                <span className="small muted">
                  {sportName(template.sport)} · {templateSummary(template)}
                </span>
              </span>
              <ChevronIcon />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function errorText(error: ApiError): string {
  if (error === 'invalid') return strings.templates.invalid;
  if (error === 'conflict') return strings.templates.tooMany;
  if (error === 'not_found') return strings.templates.notFound;
  return strings.genericError;
}

function back() {
  if (window.history.length > 1) window.history.back();
  else navigate('/perfil/modelos', { replace: true });
}

export function ActivityTemplateForm({ templateId }: { templateId: string | null }) {
  const templates = useQuery('activityTemplates', {}, ['templates']);
  const template = templateId ? templates.data?.find((t) => t.id === templateId) : null;
  const title = templateId ? strings.templates.editTitle : strings.templates.newTitle;
  if (templateId && !template) {
    return (
      <>
        <BackHeader title={title} to="/perfil/modelos" />
        {templates.data && (
          <div className="screen">
            <p className="notice" role="alert">
              {strings.templates.notFound}
            </p>
          </div>
        )}
      </>
    );
  }
  return <Form template={template ?? null} title={title} />;
}

function Form({ template, title }: { template: ActivityTemplateView | null; title: string }) {
  const { backend } = useServices();
  const initialMinutes = template ? Math.round(template.durationSeconds / 60) : 60;
  const [name, setName] = useState(template?.name ?? '');
  const [sport, setSport] = useState(template?.sport ?? MANUAL_SPORTS[0]);
  const [hours, setHours] = useState(String(Math.floor(initialMinutes / 60)));
  const [minutes, setMinutes] = useState(String(initialMinutes % 60));
  const [days, setDays] = useState<readonly Weekday[]>(template?.days ?? []);
  const [time, setTime] = useState(template?.time ?? '08:00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = strings.templates;
  const f = strings.activityForm;

  const durationSeconds = (Number(hours) * 60 + Number(minutes)) * 60;

  function toggleDay(day: Weekday, on: boolean) {
    setDays(on ? [...days, day].sort((a, b) => a - b) : days.filter((d) => d !== day));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!(durationSeconds > 0 && durationSeconds <= MAX_DURATION_SECONDS)) {
      setError(t.invalid);
      return;
    }
    const fields = { name, sport, durationSeconds, days, time };
    setBusy(true);
    const result = template
      ? await backend.command('activityTemplate.update', { templateId: template.id, ...fields })
      : await backend.command('activityTemplate.create', fields);
    setBusy(false);
    if (result.ok) back();
    else setError(errorText(result.error));
  }

  async function remove() {
    if (!template || !window.confirm(t.deleteConfirm)) return;
    setBusy(true);
    const result = await backend.command('activityTemplate.delete', { templateId: template.id });
    setBusy(false);
    if (result.ok) back();
    else setError(errorText(result.error));
  }

  return (
    <>
      <BackHeader title={title} to="/perfil/modelos" />
      <form className="screen" onSubmit={submit}>
        <section className="panel">
          <label>
            <span className="field-label">{t.name}</span>
            <input
              type="text"
              required
              maxLength={MAX_TEMPLATE_NAME_LENGTH}
              placeholder={t.namePlaceholder}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            <span className="field-label">{f.sport}</span>
            <select required value={sport} onChange={(e) => setSport(e.target.value)}>
              {MANUAL_SPORTS.map((s) => (
                <option key={s} value={s}>
                  {sportName(s)}
                </option>
              ))}
            </select>
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
          <fieldset className="stack" style={{ border: 0, margin: 0, padding: 0 }}>
            <legend className="field-label">{t.days}</legend>
            <div className="weekday-picker">
              {WEEKDAYS.map((day) => (
                <label key={day}>
                  <input
                    type="checkbox"
                    checked={days.includes(day)}
                    aria-label={strings.tracking.weekdays[day]}
                    onChange={(e) => toggleDay(day, e.target.checked)}
                  />
                  <span aria-hidden="true">{strings.tracking.weekdayInitials[day]}</span>
                </label>
              ))}
            </div>
            {days.length === 0 && <p className="muted small">{t.noDays}</p>}
          </fieldset>
          <label>
            <span className="field-label">{t.time}</span>
            <input type="time" required value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        </section>
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="big-button" disabled={busy}>
          {t.save}
        </button>
        {template && (
          <button type="button" className="danger big-button" disabled={busy} onClick={() => void remove()}>
            {t.delete}
          </button>
        )}
      </form>
    </>
  );
}
