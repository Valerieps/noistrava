// Roles and what each allows (docs/spec/acesso-e-membros.md). Add the app's own roles here; the
// server checks them on every call, the interface only hides what a member cannot do.
export type Role = 'admin';

export interface MemberRoles {
  readonly roles: readonly Role[];
}

export function isAdmin(member: MemberRoles): boolean {
  return member.roles.includes('admin');
}

/** Invite and remove members, give and take roles. */
export function canManageGroup(member: MemberRoles): boolean {
  return isAdmin(member);
}

/**
 * Whether a change leaves the group with at least one admin.
 * `activeAdminIds` are the current admins; `losingAdminId` is the one losing the role or removed.
 */
export function keepsAnAdmin(activeAdminIds: readonly string[], losingAdminId: string): boolean {
  return activeAdminIds.some((id) => id !== losingAdminId);
}

export function normalizeRoles(roles: readonly string[]): Role[] {
  const valid: Role[] = ['admin'];
  return valid.filter((role) => roles.includes(role));
}
