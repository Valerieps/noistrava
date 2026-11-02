// Makes the VAPID_KEY secret for the reminder's pushes (ADR-012) and prints it, to pipe straight
// into Wrangler so it never shows on screen:
//   node scripts/vapid-key.mjs mailto:you@example.com | npx wrangler secret put VAPID_KEY
// The subject is how push services reach whoever runs the app. A new key makes every device
// subscribe again, so make it once.
const subject = process.argv[2];
if (!subject || !/^(mailto:|https:)/.test(subject)) {
  console.error('Usage: node scripts/vapid-key.mjs mailto:you@example.com');
  process.exit(1);
}
const { privateKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const { kty, crv, x, y, d } = await crypto.subtle.exportKey('jwk', privateKey);
process.stdout.write(JSON.stringify({ subject, jwk: { kty, crv, x, y, d } }));
