// "Notificações", from the bell in the top bar: the reminder to log the activities, on which
// weekdays and at what time (docs/spec/notificacoes.md). Turning it on subscribes this device.
import { useEffect, useState } from 'react';
import type { ReminderView } from '../../application/api-contract';
import type { PushDeviceState } from '../../application/ports';
import type { ReminderSettings, Weekday } from '../../domain/reminder';
import { strings } from '../../domain/strings';
import { useServices } from '../backend-context';
import { useQuery } from '../use-query';

const WEEKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6];

export function Notifications() {
  const reminder = useQuery('reminder', {}, ['reminder']);
  if (!reminder.data) {
    return reminder.error ? (
      <p className="notice" role="alert">
        {strings.genericError}
      </p>
    ) : null;
  }
  return <ReminderForm saved={reminder.data} />;
}

function ReminderForm({ saved }: { saved: ReminderView }) {
  const { backend, push } = useServices();
  const s = strings.reminder;
  const [settings, setSettings] = useState<ReminderSettings>(saved);
  const [device, setDevice] = useState<PushDeviceState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void push.state().then(setDevice, () => setDevice({ kind: 'unsupported' }));
  }, [push]);

  async function save(next: ReminderSettings) {
    setSettings(next);
    setError(null);
    const result = await backend.command('reminder.set', next);
    if (!result.ok) setError(strings.genericError);
  }

  /** Asks for permission, subscribes this device and tells the server; false when it could not. */
  async function addThisDevice(): Promise<boolean> {
    const key = await backend.pushKey();
    if (!key.ok) {
      setError(key.error === 'unavailable' ? s.unavailable : strings.genericError);
      return false;
    }
    const state = await push.subscribe(key.value).catch((): PushDeviceState => ({ kind: 'unsupported' }));
    setDevice(state);
    if (state.kind !== 'on') {
      setError(state.kind === 'blocked' ? s.blocked : s.unsupported);
      return false;
    }
    const result = await backend.command('push.subscribe', { endpoint: state.endpoint });
    // The server refuses a push service outside the network policy (ADR-012).
    if (!result.ok) setError(result.error === 'invalid' ? s.unsupported : strings.genericError);
    return result.ok;
  }

  async function toggle(enabled: boolean) {
    setBusy(true);
    setError(null);
    if (!enabled || (await addThisDevice())) await save({ ...settings, enabled });
    setBusy(false);
  }

  async function addDevice() {
    setBusy(true);
    setError(null);
    await addThisDevice();
    setBusy(false);
  }

  function toggleDay(day: Weekday, on: boolean) {
    const days = on ? [...settings.days, day].sort((a, b) => a - b) : settings.days.filter((d) => d !== day);
    void save({ ...settings, days });
  }

  return (
    <div className="sheet-section">
      <h2>{s.title}</h2>
      <p className="muted">{s.about}</p>

      <label className="switch-row" style={{ flexDirection: 'row' }}>
        <b>{s.enabled}</b>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={settings.enabled}
          disabled={busy}
          onChange={(e) => void toggle(e.target.checked)}
        />
      </label>

      {settings.enabled && device && (
        <p className="muted">
          {device.kind === 'on' ? s.thisDevice : s.notThisDevice} {s.devices(saved.devices)}
        </p>
      )}
      {settings.enabled && device && device.kind !== 'on' && (
        <button type="button" disabled={busy} onClick={() => void addDevice()}>
          {s.addThisDevice}
        </button>
      )}

      <fieldset className="stack" disabled={!settings.enabled} style={{ border: 0, margin: 0, padding: 0 }}>
        <legend className="field-label">{s.days}</legend>
        <div className="weekday-picker">
          {WEEKDAYS.map((day) => (
            <label key={day}>
              <input
                type="checkbox"
                checked={settings.days.includes(day)}
                aria-label={strings.tracking.weekdays[day]}
                onChange={(e) => toggleDay(day, e.target.checked)}
              />
              <span aria-hidden="true">{strings.tracking.weekdayInitials[day]}</span>
            </label>
          ))}
        </div>
        {settings.days.length === 0 && <p className="muted">{s.noDays}</p>}

        <label>
          <span className="field-label">{s.time}</span>
          <input
            type="time"
            step={300}
            required
            value={settings.time}
            onChange={(e) => {
              if (/^\d{2}:\d{2}$/.test(e.target.value)) void save({ ...settings, time: e.target.value });
            }}
          />
        </label>
      </fieldset>

      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
