import { useState, type FormEvent } from 'react';
import type { ApiError, InviteState } from '../../application/api-contract';
import { strings } from '../../domain/strings';
import { useServices } from '../backend-context';
import { useQuery } from '../use-query';

const STATE_LABEL: Record<InviteState, string> = {
  pending: strings.invites.pending,
  accepted: strings.invites.accepted,
  revoked: strings.invites.revoked,
};

function errorText(error: ApiError): string {
  if (error === 'invalid') return strings.invites.invalidEmail;
  if (error === 'conflict') return strings.invites.alreadyMember;
  if (error === 'forbidden') return strings.forbidden;
  return strings.genericError;
}

export function Invites() {
  const { backend } = useServices();
  const invites = useQuery('invites', {}, ['invites']);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await backend.command('invite.create', { email });
    setBusy(false);
    if (result.ok) {
      setEmail('');
      setError(null);
    } else {
      setError(errorText(result.error));
    }
  }

  async function revoke(target: string) {
    const result = await backend.command('invite.revoke', { email: target });
    if (!result.ok) setError(errorText(result.error));
  }

  return (
    <section>
      <form className="row" onSubmit={submit}>
        <label className="grow">
          <span className="muted">{strings.invites.emailLabel}</span>
          <input type="email" required autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button type="submit" disabled={busy}>
          {strings.invites.send}
        </button>
      </form>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {invites.data?.length === 0 && <p className="muted">{strings.invites.empty}</p>}
      <ul className="list">
        {invites.data?.map((invite) => (
          <li key={invite.email} className="card row">
            <span className="grow">
              {invite.email}
              <br />
              <span className="muted">{STATE_LABEL[invite.state]}</span>
            </span>
            {invite.state === 'pending' && (
              <button type="button" className="secondary" onClick={() => void revoke(invite.email)}>
                {strings.invites.revoke}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
