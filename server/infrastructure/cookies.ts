// Cookies the Worker sets. `__Host-` pins them to this origin, HTTPS and path /;
// HttpOnly keeps them away from scripts. Lax lets the Google redirect bring them back.
export const SESSION_COOKIE = '__Host-sessao';
export const LOGIN_COOKIE = '__Host-login';

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=') || null;
  }
  return null;
}

export function setCookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${value}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearCookie(name: string): string {
  return setCookie(name, '', 0);
}
