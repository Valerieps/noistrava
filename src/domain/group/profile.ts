// A member's display name (docs/spec/acesso-e-membros.md, "Perfil").
export const NAME_MAX_LENGTH = 40;

/** The name as stored: trimmed, inner spaces collapsed; null when empty or too long. */
export function normalizeName(name: string): string | null {
  const clean = name.trim().replace(/\s+/g, ' ');
  return clean.length >= 1 && clean.length <= NAME_MAX_LENGTH ? clean : null;
}
