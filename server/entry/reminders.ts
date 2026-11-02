// Sending the reminders (ADR-012, ADR-013): the Group says which devices are due, the Worker signs
// (and, for the window reminder, encrypts) each push, and forgets the devices their push service
// says are gone.
import { importVapidKey, sendPush } from '../infrastructure/web-push';
import type { PushMessage } from '../application/reminders';
import type { Env } from './env';
import type { Group } from './group-object';

export async function sendReminders(env: Env, group: DurableObjectStub<Group>): Promise<void> {
  const key = await importVapidKey(env.VAPID_KEY);
  // Previews and local runs without the secret never send pushes; the reminders stay unsent.
  if (!key) return;
  const plain = ((await group.remindersDue()) as string[]).map((endpoint) => ({ endpoint, content: undefined }));
  const window = ((await group.windowRemindersDue()) as PushMessage[]).map((m) => ({ endpoint: m.endpoint, content: { keys: m.keys, payload: m.payload } }));
  await Promise.all(
    [...plain, ...window].map(async ({ endpoint, content }) => {
      try {
        if ((await sendPush(key, endpoint, new Date(), content)) === 'gone') await group.removePushSubscription(endpoint);
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
