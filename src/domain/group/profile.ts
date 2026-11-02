// A member's display name (docs/spec/acesso-e-membros.md, "Perfil").
export const NAME_MAX_LENGTH = 40;

const LOWERCASE_PARTICLES = new Set(['da', 'das', 'de', 'do', 'dos', 'e']);

/** Uppercases the first letter of each word that starts in lowercase; the rest is left as typed. */
export function capitalizeName(name: string): string {
  return name.replace(/(^|[\s-])(\p{L})/gu, (match, lead: string, letter: string, offset: number, whole: string) => {
    const word = /^\p{L}+/u.exec(whole.slice(offset + lead.length))?.[0] ?? '';
    const isParticle = offset + lead.length > 0 && LOWERCASE_PARTICLES.has(word);
    return isParticle ? match : lead + letter.toLocaleUpperCase('pt-BR');
  });
}

/** The first word of a name, for greetings. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

/** The name as stored: trimmed, inner spaces collapsed, capitalized; null when empty or too long. */
export function normalizeName(name: string): string | null {
  const clean = capitalizeName(name.trim().replace(/\s+/g, ' '));
  return clean.length >= 1 && clean.length <= NAME_MAX_LENGTH ? clean : null;
}
