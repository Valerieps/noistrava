// Invites are tied to an e-mail (docs/spec/grupo-e-papeis.md); compare them in one canonical form.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isPlausibleEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}
