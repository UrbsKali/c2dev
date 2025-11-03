import { writable } from 'svelte/store';

export type WaypointTuple = [number, number];

const defaultWaypoints: WaypointTuple[] = [];

export const drawnWaypoints = writable<WaypointTuple[]>(defaultWaypoints);
export const sharedSelectedRobotId = writable<string | null>(null);

type SyncEventType = 'waypoints' | 'selected-robot';

interface SyncMessage {
  source: string;
  type: SyncEventType;
  payload: unknown;
  timestamp: number;
}

const CHANNEL_NAME = 'c2dev-cross-tab-sync';
const STORAGE_KEY = 'c2dev-cross-tab-event';

const instanceId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
  ? crypto.randomUUID()
  : `instance-${Math.random().toString(36).slice(2)}`;

const channel = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel(CHANNEL_NAME)
  : null;

const hasStorage = typeof window !== 'undefined' && typeof window.addEventListener === 'function' && 'localStorage' in window;

let suppressBroadcast = false;

function markSuppressed<T>(fn: () => T): T {
  suppressBroadcast = true;
  try {
    return fn();
  } finally {
    suppressBroadcast = false;
  }
}

function broadcast(type: SyncEventType, payload: unknown): void {
  if (suppressBroadcast) return;
  const message: SyncMessage = {
    source: instanceId,
    type,
    payload,
    timestamp: Date.now()
  };

  if (channel) {
    channel.postMessage(message);
    return;
  }

  if (hasStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(message));
      // Removing the key lets subsequent writes fire storage events reliably.
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn('[Sync] Failed to broadcast via localStorage', error);
    }
  }
}

function handleIncoming(message: SyncMessage): void {
  if (!message || message.source === instanceId) {
    return;
  }

  if (message.type === 'waypoints') {
    if (!Array.isArray(message.payload)) return;
    const cleaned = (message.payload as WaypointTuple[]).map((point) => [Number(point[0]), Number(point[1])] as WaypointTuple);
    markSuppressed(() => {
      drawnWaypoints.set(cleaned.length ? cleaned : defaultWaypoints);
    });
  } else if (message.type === 'selected-robot') {
    const robotId = typeof message.payload === 'string' || message.payload === null ? (message.payload as string | null) : null;
    markSuppressed(() => {
      sharedSelectedRobotId.set(robotId);
    });
  }
}

if (channel) {
  channel.addEventListener('message', (event: MessageEvent<SyncMessage>) => {
    handleIncoming(event.data);
  });

  window.addEventListener(
    'beforeunload',
    () => {
      channel.close();
    },
    { once: true }
  );
} else if (hasStorage) {
  window.addEventListener('storage', (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const data = JSON.parse(event.newValue) as SyncMessage;
      handleIncoming(data);
    } catch (error) {
      console.warn('[Sync] Failed to parse storage event payload', error);
    }
  });
}

if (typeof window !== 'undefined') {
  drawnWaypoints.subscribe((points) => {
    broadcast('waypoints', points);
  });

  sharedSelectedRobotId.subscribe((robotId) => {
    broadcast('selected-robot', robotId);
  });
}

export function recordWaypoints(points: WaypointTuple[]): void {
  drawnWaypoints.set(points.length ? [...points] : defaultWaypoints);
}

export function clearWaypoints(): void {
  drawnWaypoints.set(defaultWaypoints);
}
