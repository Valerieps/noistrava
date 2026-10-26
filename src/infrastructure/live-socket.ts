// The live connection (ADR-004): one WebSocket to /api/live. The server only says which topics
// changed; screens refetch them. On reconnect every topic is refetched, since messages may have
// been missed while offline.
import type { LiveMessage, Topic } from '../application/api-contract';
import type { LiveStatus, LiveUpdates } from '../application/ports';

const ALL_TOPICS: readonly Topic[] = ['me', 'members', 'invites'];
const MAX_BACKOFF_MS = 30_000;

export function liveSocket(): LiveUpdates {
  const changeListeners = new Set<(topics: readonly Topic[]) => void>();
  const statusListeners = new Set<(status: LiveStatus) => void>();
  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let attempts = 0;
  let running = false;
  let connectedOnce = false;

  const emitStatus = (status: LiveStatus) => statusListeners.forEach((l) => l(status));
  const emitChange = (topics: readonly Topic[]) => changeListeners.forEach((l) => l(topics));

  function connect() {
    if (!running) return;
    emitStatus('connecting');
    const url = new URL('/api/live', window.location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(url);
    socket.onopen = () => {
      attempts = 0;
      emitStatus('online');
      if (connectedOnce) emitChange(ALL_TOPICS);
      connectedOnce = true;
    };
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as LiveMessage;
        if (message.type === 'changed') emitChange(message.topics);
      } catch {
        // Ignore anything that is not a live message.
      }
    };
    socket.onclose = () => {
      socket = null;
      if (!running) return;
      emitStatus('offline');
      const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempts++);
      retry = setTimeout(connect, delay);
    };
  }

  const onVisible = () => {
    if (document.visibilityState === 'visible' && running && !socket) {
      if (retry) clearTimeout(retry);
      attempts = 0;
      connect();
    }
  };

  return {
    subscribe(listener) {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
    onStatus(listener) {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    start() {
      if (running) return;
      running = true;
      document.addEventListener('visibilitychange', onVisible);
      connect();
    },
    stop() {
      running = false;
      document.removeEventListener('visibilitychange', onVisible);
      if (retry) clearTimeout(retry);
      socket?.close();
      socket = null;
    },
  };
}
