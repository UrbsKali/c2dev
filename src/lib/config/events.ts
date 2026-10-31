/**
 * Alerts / events configuration (feed, toasts and health monitoring).
 */
import type { EventSeverity } from '$types';

export const EVENTS_CONFIG = {
  MAX_INITIAL_FETCH_LIMIT: 100,
  REALTIME_CHANNEL_NAME: 'public:events',

  /** Toast auto-dismiss delay per severity. `null` = stays until acknowledged. */
  AUTO_DISMISS_MS: {
    info: 7000,
    warning: 12000,
    critical: null,
    error: null
  } as Record<EventSeverity, number | null>
} as const;

export const HEALTH_CONFIG = {
  /** How often rules are re-evaluated (also catches silence, which no message would signal). */
  CHECK_INTERVAL_MS: 2000,

  /**
   * Persist monitor alerts in Supabase. Keep false while every browser tab runs its own
   * monitor (it would insert duplicates). Switch on once a single gateway/edge function
   * owns the monitoring, or when only one tab is the monitor.
   */
  PERSIST_EVENTS: false,

  BATTERY: {
    WARNING_PCT: 25,
    CRITICAL_PCT: 10,
    /** Hysteresis: the alert clears only above threshold + this margin (avoids flapping). */
    RECOVERY_MARGIN_PCT: 5
  },

  TELEMETRY: {
    /** No telemetry for this long => warning. */
    STALE_WARNING_MS: 10_000,
    /** ...and critical after this long. */
    STALE_CRITICAL_MS: 30_000
  },

  /** Robot.status values (lower-case) treated as a fault. */
  FAULT_STATUSES: ['fault', 'error', 'failsafe', 'emergency']
} as const;
