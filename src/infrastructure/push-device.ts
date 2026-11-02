// This device's Web Push subscription for the reminders (ADR-012, ADR-013), through the service
// worker in public/sw.js. The push service's address and the device's keys to encrypt a push with
// go to the server; nothing else leaves the device.
import type { PushDevice, PushDeviceState } from '../application/ports';
import { isPushKeys } from '../domain/reminder';

function on(subscription: PushSubscription): PushDeviceState {
  const keys = subscription.toJSON().keys ?? {};
  return { kind: 'on', endpoint: subscription.endpoint, keys: isPushKeys(keys) ? { p256dh: keys.p256dh, auth: keys.auth } : null };
}

function supported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register('/sw.js');
  return navigator.serviceWorker.ready;
}

export function pushDevice(): PushDevice {
  return {
    async state(): Promise<PushDeviceState> {
      if (!supported()) return { kind: 'unsupported' };
      if (Notification.permission === 'denied') return { kind: 'blocked' };
      const existing = await navigator.serviceWorker.getRegistration('/');
      const subscription = await existing?.pushManager.getSubscription();
      return subscription ? on(subscription) : { kind: 'off' };
    },

    async subscribe(publicKey: string): Promise<PushDeviceState> {
      if (!supported()) return { kind: 'unsupported' };
      if ((await Notification.requestPermission()) !== 'granted') return { kind: 'blocked' };
      const pushManager = (await registration()).pushManager;
      const key = fromBase64Url(publicKey);
      let subscription = await pushManager.getSubscription();
      // A subscription made with another key (the server's key changed) cannot receive pushes.
      const current = subscription?.options.applicationServerKey;
      if (subscription && current && !sameBytes(new Uint8Array(current), key)) {
        await subscription.unsubscribe();
        subscription = null;
      }
      subscription ??= await pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      return on(subscription);
    },

    async unsubscribe(): Promise<string | null> {
      if (!supported()) return null;
      const subscription = await (await navigator.serviceWorker.getRegistration('/'))?.pushManager.getSubscription();
      if (!subscription) return null;
      await subscription.unsubscribe();
      return subscription.endpoint;
    },
  };
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}
