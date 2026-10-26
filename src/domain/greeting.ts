// Example of a domain rule: pure TypeScript, no framework imports, tested next to it.
// Delete it once the app has its own domain.
export function greetingFor(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}
