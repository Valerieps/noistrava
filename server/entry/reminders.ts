// Sending the reminder (ADR-012): the Group says which devices are due, the Worker signs and sends
// each push, and forgets the devices their push service says are gone.
import { importVapidKey, sendPush } from '../infrastructure/web-push';
import type { Env } from './env';
import type { Group } from './group-object';

export async function sendReminders(env: Env, group: DurableObjectStub<Group>): Promise<void> {
  const key = await importVapidKey(env.VAPID_KEY);
  // Previews and local runs without the secret never send pushes; the reminders stay unsent.
  if (!key) return;
  const endpoints = (await group.remindersDue()) as string[];
  await Promise.all(
    endpoints.map(async (endpoint) => {
      try {
        if ((await sendPush(key, endpoint, new Date())) === 'gone') await group.removePushSubscription(endpoint);
      } catch (error) {
        console.error('Push failed', error instanceof Error ? error.message : 'unknown error');
      }
    }),
  );
}

/** The VAPID public key the app subscribes with; null where the secret is not set. */
export async function vapidPublicKey(env: Env): Promise<string | null> {
  return (await importVapidKey(env.VAPID_KEY))?.publicKey ?? null;
}
