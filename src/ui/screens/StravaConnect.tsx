import { useEffect, useState, type FormEvent } from 'react';
import { strings } from '../../domain/strings';
import { useServices } from '../backend-context';
import { navigate } from '../router';
import { useQuery } from '../use-query';

// "Conectar com Strava" (docs/spec/strava.md): the button only works after the member accepts
// that the group sees the start, total time and sport type of her activities.
export function StravaConnect() {
  const { backend } = useServices();
  const connection = useQuery('strava', {}, ['strava']);
  const [consent, setConsent] = useState(false);
  const [includePrivate, setIncludePrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(() => strings.strava.results[new URLSearchParams(window.location.search).get('strava') ?? ''] ?? null);

  // The result came from the Strava redirect; drop it from the address bar.
  useEffect(() => {
    if (window.location.search) navigate(window.location.pathname, { replace: true });
  }, []);

  async function connect(event: FormEvent) {
    event.preventDefault();
    if (!consent) return;
    setBusy(true);
    const result = await backend.stravaConnect(includePrivate);
    if (result.ok) {
      window.location.assign(result.value);
      return;
    }
    setBusy(false);
    setMessage(result.error === 'unavailable' ? strings.strava.unavailable : strings.genericError);
  }

  const notice = message && (
    <p className="notice" role="status">
      {message}
    </p>
  );

  if (!connection.data) return null;
  if (connection.data.connected) {
    return (
      <section className="stack">
        <h2>{strings.strava.title}</h2>
        {notice}
        <p>
          {strings.strava.connected} {connection.data.includePrivate && strings.strava.connectedPrivate}
        </p>
      </section>
    );
  }

  return (
    <form className="stack" onSubmit={connect}>
      <h2>{strings.strava.title}</h2>
      {notice}
      <p>{strings.strava.intro}</p>
      <label className="check">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          {strings.strava.consent} <span className="muted">{strings.strava.consentNote}</span>
        </span>
      </label>
      <label className="check">
        <input type="checkbox" checked={includePrivate} onChange={(e) => setIncludePrivate(e.target.checked)} />
        <span>{strings.strava.includePrivate}</span>
      </label>
      <button type="submit" disabled={!consent || busy}>
        {strings.strava.connect}
      </button>
    </form>
  );
}
