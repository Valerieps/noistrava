// "Notificações", from the bell in the top bar: the reminder to log the activities and the window
// reminder, each on its weekdays and at its time (docs/spec/notificacoes.md). Turning one on
// subscribes this device.
import { useEffect, useState } from 'react';
import type { CommandName, ReminderView } from '../../application/api-contract';
import type { PushDeviceState } from '../../application/ports';
import type { ReminderSettings, Weekday } from '../../domain/reminder';
import { strings } from '../../domain/strings';
import { useServices } from '../backend-context';
import { useQuery } from '../use-query';

const WEEKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6];

type ReminderKind = {
  readonly command: Extract<CommandName, 'reminder.set' | 'windowReminder.set'>;
  readonly text: { readonly title: string; readonly about: string };
  /** Its push has content, so it reaches only a device that gives its keys (ADR-013). */
  readonly needsKeys: boolean;
};

const FABRICIO: ReminderKind = { command: 'reminder.set', text: strings.reminder, needsKeys: false };
const WINDOW: ReminderKind = { command: 'windowReminder.set', text: strings.windowReminder, needsKeys: true };

const reaches = (kind: ReminderKind, device: PushDeviceState): boolean => device.kind === 'on' && (!kind.needsKeys || device.keys !== null);

export function Notifications() {
  const { backend, push } = useServices();
  const reminder = useQuery('reminder', {}, ['reminder']);
  const windowReminder = useQuery('windowReminder', {}, ['reminder']);
  const [device, setDevice] = useState<PushDeviceState | null>(null);

  useEffect(() => {
    void push.state().then(
      (state) => {
        setDevice(state);
        // A device subscribed before the window reminder existed gives its keys now (ADR-013).
        if (state.kind === 'on' && state.keys) void backend.command('push.refreshKeys', { endpoint: state.endpoint, ...state.keys });
      },
      () => setDevice({ kind: 'unsupported' }),
    );
  }, [backend, push]);

  if (!reminder.data || !windowReminder.data) {
    return reminder.error || windowReminder.error ? (
      <p className="notice" role="alert">
        {strings.genericError}
      </p>
    ) : null;
  }
  return (
    <>
      <ReminderForm kind={FABRICIO} saved={reminder.data} device={device} onDevice={setDevice} />
      <ReminderForm kind={WINDOW} saved={windowReminder.data} device={device} onDevice={setDevice} />
    </>
  );
}

function ReminderForm({
  kind,
  saved,
  device,
  onDevice,
}: {
  kind: ReminderKind;
  saved: ReminderView;
  device: PushDeviceState | null;
  onDevice: (state: PushDeviceState) => void;
}) {
  const { backend, push } = useServices();
  const s = strings.reminder;
  const [settings, setSettings] = useState<ReminderSettings>(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: ReminderSettings) {
    setSettings(next);
    setError(null);
    const result = await backend.command(kind.command, next);
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
    onDevice(state);
    if (state.kind !== 'on' || !reaches(kind, state)) {
      setError(state.kind === 'blocked' ? s.blocked : s.unsupported);
      return false;
    }
    const result = await backend.command('push.subscribe', { endpoint: state.endpoint, ...state.keys });
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
      <label className="switch-row" style={{ flexDirection: 'row' }}>
        <h2>{kind.text.title}</h2>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={settings.enabled}
          disabled={busy}
          onChange={(e) => void toggle(e.target.checked)}
        />
      </label>
      <p className="muted">{kind.text.about}</p>

      {settings.enabled && device && !reaches(kind, device) && (
        <button type="button" disabled={busy} onClick={() => void addDevice()}>
          {s.addThisDevice}
        </button>
      )}

      <fieldset className="stack" disabled={!settings.enabled} style={{ border: 0, margin: 0, padding: 0 }}>
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
          <input
            type="time"
            aria-label={strings.reminder.time}
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
