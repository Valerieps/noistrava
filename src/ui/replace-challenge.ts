// Starting a challenge while another is still active or finished (docs/spec/desafio-horas.md,
// "Criar"): the app alerts that the current one must be finished and archived first, and offers to
// do both from the alert, then tries again.
import type { ApiResult, ChallengeView } from '../application/api-contract';
import type { Backend } from '../application/ports';
import { strings } from '../domain/strings';

export type StartResult = ApiResult<ChallengeView> | { readonly ok: false; readonly error: 'declined' };

/**
 * Runs `start` (creating or activating); when it fails with `conflict` because another challenge
 * is live, asks to finish and archive that one, and on a yes does so and runs `start` again.
 */
export async function startOrReplace(backend: Backend, start: () => Promise<ApiResult<ChallengeView>>): Promise<StartResult> {
  const first = await start();
  if (first.ok || first.error !== 'conflict') return first;
  const live = await backend.query('challenge', {});
  const blocking = live.ok ? live.value.challenge : null;
  if (!blocking) return first;
  if (!window.confirm(strings.challenge.replaceConfirm(blocking.name))) return { ok: false, error: 'declined' };
  const finished = await backend.command('challenge.finish', { challengeId: blocking.id });
  if (!finished.ok) return finished;
  return start();
}
