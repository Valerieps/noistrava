// "Rascunhos" (docs/spec/desafio-horas.md): my own drafts, to edit, activate while no challenge is
// open, or delete. Nobody else sees them.
import { useState } from 'react';
import type { ApiError, ChallengeView } from '../../application/api-contract';
import { formatGoal } from '../../domain/challenge/progress';
import { strings } from '../../domain/strings';
import { useServices } from '../backend-context';
import { formatPeriod } from '../format';
import { Link, navigate } from '../router';
import { useQuery } from '../use-query';

function errorText(error: ApiError, draft: ChallengeView): string {
  const d = strings.drafts;
  if (error === 'conflict') return d.activeExists;
  if (error === 'invalid') return draft.journeyPending ? d.routeNeeded : d.endPassed;
  return strings.genericError;
}

export function Drafts() {
  const { backend } = useServices();
  const drafts = useQuery('drafts', {}, ['challenge']);
  const current = useQuery('challenge', {}, ['challenge']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = strings.drafts;
  const items = drafts.data ?? [];
  const canActivate = current.data !== undefined && current.data.challenge?.state !== 'open';

  async function activate(draft: ChallengeView) {
    setBusy(true);
    const result = await backend.command('challenge.activate', { challengeId: draft.id });
    setBusy(false);
    if (result.ok) {
      navigate('/', { replace: true });
      return;
    }
    setError(errorText(result.error, draft));
  }

  async function remove(draft: ChallengeView) {
    if (!window.confirm(d.deleteConfirm)) return;
    setBusy(true);
    const result = await backend.command('challenge.delete', { challengeId: draft.id });
    setBusy(false);
    if (result.ok) {
      setError(null);
      drafts.reload();
      return;
    }
    setError(errorText(result.error, draft));
  }

  return (
    <>
      {drafts.error && !drafts.data && (
        <p className="notice" role="alert">
          {strings.genericError}
        </p>
      )}
      <p className="small muted" style={{ margin: '0 4px' }}>
        {canActivate ? d.introFree : d.introBusy}
      </p>
      {drafts.data && items.length === 0 && <p className="muted">{d.empty}</p>}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {items.map((draft) => (
        <section key={draft.id} className="panel" style={{ gap: 10 }}>
          <h2 className="ellipsis card-title">
            {draft.name}
          </h2>
          <div className="small muted">
            {formatPeriod(draft.startDate, draft.endDate)} · {draft.journeyPending ? d.routePending : draft.journey ? d.journey(formatGoal(draft.goalMinutes)) : formatGoal(draft.goalMinutes)}
          </div>
          <div className="actions">
            {canActivate && (
              <button type="button" disabled={busy} onClick={() => void activate(draft)}>
                {d.activate}
              </button>
            )}
            <button type="button" className="secondary" disabled={busy} onClick={() => navigate(`/desafio/${encodeURIComponent(draft.id)}/editar`)}>
              {d.edit}
            </button>
            <button type="button" className="danger" disabled={busy} onClick={() => void remove(draft)}>
              {d.delete}
            </button>
          </div>
        </section>
      ))}
      <Link to="/desafio/novo" className="button secondary big-button" style={{ lineHeight: '40px' }}>
        {d.create}
      </Link>
    </>
  );
}
