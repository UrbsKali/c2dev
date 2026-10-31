import { writable, derived, get } from 'svelte/store';
import { supabaseClient, EVENTS_TABLE } from '$services/supabase';
import { currentUser } from '$stores/user';
import type { RobotEvent, EventSeverity } from '$types';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { EVENTS_CONFIG } from '$config/events';

const eventsInternal = writable<RobotEvent[]>([]);
export const events = {
  subscribe: eventsInternal.subscribe
};

export const activeFilter = writable<{ robotId: string | null; severity: EventSeverity | 'all' }>({
  robotId: null,
  severity: 'all'
});

export const unacknowledgedEvents = derived(eventsInternal, ($events) =>
  $events.filter((event) => !event.acknowledged)
);

export const unacknowledgedCount = derived(unacknowledgedEvents, ($unack) => $unack.length);

export const filteredEvents = derived([eventsInternal, activeFilter], ([$events, $filter]) => {
  return $events.filter((event) => {
    if ($filter.robotId && event.robotId !== $filter.robotId) return false;
    if ($filter.severity !== 'all' && event.severity !== $filter.severity) return false;
    return true;
  });
});

// Toasts queue for real-time popups
export interface EventToast extends RobotEvent {
  dismissed?: boolean;
}

export const activeToasts = writable<EventToast[]>([]);

export function dismissToast(id: string): void {
  activeToasts.update((toasts) => toasts.filter((t) => t.id !== id));
}

/** Adds an event to the feed and raises a toast that auto-dismisses per its severity. */
function pushEvent(event: RobotEvent): void {
  eventsInternal.update((prev) => [event, ...prev.filter((e) => e.id !== event.id)]);
  activeToasts.update((toasts) => [event, ...toasts.filter((t) => t.id !== event.id)]);

  const delay = EVENTS_CONFIG.AUTO_DISMISS_MS[event.severity];
  if (delay !== null && delay !== undefined) {
    setTimeout(() => dismissToast(event.id), delay);
  }
}

let eventsChannel: RealtimeChannel | null = null;
let initialized = false;

function mapEventRow(row: Record<string, unknown>): RobotEvent {
  return {
    id: String(row.id ?? crypto.randomUUID()),
    robotId: row.robot_id ? String(row.robot_id) : undefined,
    severity: (row.severity as EventSeverity) ?? 'info',
    title: String(row.title ?? 'Alert'),
    message: row.message ? String(row.message) : undefined,
    acknowledged: Boolean(row.acknowledged),
    acknowledgedBy: row.acknowledged_by ? String(row.acknowledged_by) : undefined,
    createdAt: String(row.created_at ?? new Date().toISOString())
  };
}

export async function initEvents(): Promise<void> {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  try {
    // 1. Initial fetch of existing events
    const { data, error } = await supabaseClient
      .from(EVENTS_TABLE)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(EVENTS_CONFIG.MAX_INITIAL_FETCH_LIMIT);

    if (error) {
      console.warn('[events] Failed to fetch existing events from Supabase:', error.message);
    } else if (data) {
      eventsInternal.set(data.map(mapEventRow));
    }
  } catch (err) {
    console.warn('[events] Error during initial events fetch:', err);
  }

  // 2. Realtime subscription to events table
  try {
    eventsChannel = supabaseClient
      .channel(EVENTS_CONFIG.REALTIME_CHANNEL_NAME)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: EVENTS_TABLE },
        (payload) => {
          pushEvent(mapEventRow(payload.new as Record<string, unknown>));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: EVENTS_TABLE },
        (payload) => {
          const updatedEvent = mapEventRow(payload.new as Record<string, unknown>);
          eventsInternal.update((prev) =>
            prev.map((e) => (e.id === updatedEvent.id ? updatedEvent : e))
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: EVENTS_TABLE },
        (payload) => {
          const deletedId = String((payload.old as Record<string, unknown>)?.id);
          if (deletedId) {
            eventsInternal.update((prev) => prev.filter((e) => e.id !== deletedId));
            dismissToast(deletedId);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.info('[events] Supabase Realtime channel connected for events.');
        }
      });
  } catch (err) {
    console.warn('[events] Failed to subscribe to realtime events:', err);
  }
}

export async function acknowledgeEvent(id: string): Promise<void> {
  const user = get(currentUser);
  // Optimistic UI update
  eventsInternal.update((prev) =>
    prev.map((e) => (e.id === id ? { ...e, acknowledged: true, acknowledgedBy: user?.id } : e))
  );
  dismissToast(id);

  try {
    const { error } = await supabaseClient
      .from(EVENTS_TABLE)
      .update({
        acknowledged: true,
        acknowledged_by: user?.id ?? null
      })
      .eq('id', id);

    if (error) {
      console.warn('[events] Supabase update acknowledge failed:', error.message);
    }
  } catch (err) {
    console.warn('[events] Error acknowledging event:', err);
  }
}

export async function acknowledgeAll(): Promise<void> {
  const unackIds = get(unacknowledgedEvents).map((e) => e.id);
  if (unackIds.length === 0) return;

  const user = get(currentUser);
  eventsInternal.update((prev) =>
    prev.map((e) => ({ ...e, acknowledged: true, acknowledgedBy: user?.id }))
  );
  activeToasts.set([]);

  try {
    await supabaseClient
      .from(EVENTS_TABLE)
      .update({
        acknowledged: true,
        acknowledged_by: user?.id ?? null
      })
      .in('id', unackIds);
  } catch (err) {
    console.warn('[events] Error acknowledging all events:', err);
  }
}

/**
 * Emit an event: shown immediately, and by default also inserted into Supabase.
 * Pass `persist: false` for local-only alerts (e.g. a client-side watchdog).
 */
export async function emitEvent(event: {
  robotId?: string;
  severity: EventSeverity;
  title: string;
  message?: string;
  persist?: boolean;
}): Promise<RobotEvent> {
  const localEvent: RobotEvent = {
    id: crypto.randomUUID(),
    robotId: event.robotId,
    severity: event.severity,
    title: event.title,
    message: event.message,
    acknowledged: false,
    createdAt: new Date().toISOString()
  };

  // Immediate local feedback
  pushEvent(localEvent);

  if (event.persist === false) return localEvent;

  try {
    const { error } = await supabaseClient.from(EVENTS_TABLE).insert({
      id: localEvent.id,
      robot_id: localEvent.robotId ?? null,
      severity: localEvent.severity,
      title: localEvent.title,
      message: localEvent.message ?? null,
      acknowledged: false,
      created_at: localEvent.createdAt
    });

    if (error) {
      console.warn('[events] Supabase insert event fallback:', error.message);
    }
  } catch (err) {
    console.warn('[events] Network error on insert event:', err);
  }

  return localEvent;
}
