import { useState } from 'react';
import type { ApiError, MeView, MemberListItem } from '../../application/api-contract';
import { canManageGroup, isAdmin } from '../../domain/group/roles';
import { strings } from '../../domain/strings';
import { useServices } from '../backend-context';
import { ChevronIcon } from '../icons';
import { Link } from '../router';
import { useQuery } from '../use-query';

function errorText(error: ApiError): string {
  if (error === 'last_admin') return strings.members.lastAdmin;
  if (error === 'forbidden') return strings.forbidden;
  return strings.genericError;
}

export function Members({ me }: { me: MeView }) {
  const { backend } = useServices();
  const members = useQuery('members', {}, ['members']);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const manages = canManageGroup(me);

  async function toggleAdmin(member: MemberListItem) {
    setBusy(member.id);
    const result = await backend.command('member.setRoles', { memberId: member.id, roles: isAdmin(member) ? [] : ['admin'] });
    setBusy(null);
    setError(result.ok ? null : errorText(result.error));
  }

  async function remove(member: MemberListItem) {
    if (!window.confirm(strings.members.removeConfirm(member.name))) return;
    setBusy(member.id);
    const result = await backend.command('member.remove', { memberId: member.id });
    setBusy(null);
    setError(result.ok ? null : errorText(result.error));
  }

  return (
    <section>
      {manages && (
        <nav className="menu-list" style={{ marginBottom: 'var(--space-4)' }}>
          <Link to="/convites">
            {strings.nav.invites}
            <ChevronIcon />
          </Link>
        </nav>
      )}
      {members.error && !members.data && <p className="notice">{strings.genericError}</p>}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {members.data?.length === 1 && <p className="muted">{strings.members.empty}</p>}
      <ul className="list">
        {members.data?.map((member) => (
          <li key={member.id} className="card row">
            {member.photoUrl && <img className="avatar" src={member.photoUrl} alt="" referrerPolicy="no-referrer" />}
            <span className="grow">
              {member.name} {member.id === me.id && <span className="muted">{strings.members.you}</span>}
              <br />
              <span className="muted">{isAdmin(member) ? strings.members.admin : strings.members.member}</span>
              {member.email && (
                <>
                  <br />
                  <span className="muted">{member.email}</span>
                </>
              )}
            </span>
            {manages && (
              <span className="row" role="group" aria-label={strings.members.rolesOf(member.name)}>
                <button
                  type="button"
                  className="secondary"
                  aria-pressed={isAdmin(member)}
                  disabled={busy === member.id}
                  onClick={() => void toggleAdmin(member)}
                >
                  {strings.members.makeAdmin}
                </button>
                {member.id !== me.id && (
                  <button
                    type="button"
                    className="secondary danger"
                    aria-label={strings.members.removeOf(member.name)}
                    disabled={busy === member.id}
                    onClick={() => void remove(member)}
                  >
                    {strings.members.remove}
                  </button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
