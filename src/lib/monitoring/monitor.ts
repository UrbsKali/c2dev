import { get } from 'svelte/store';
import { HEALTH_CONFIG } from '$config/events';
import { emitEvent } from '$stores/events';
import { robots } from '$stores/robots';
import type { EventSeverity, Robot } from '$types';
import { BUILTIN_RULES } from './rules';
import type { EmitAlert, EventSource, HealthRule } from './types';

/**
 * Health monitor: turns robot state into alerts.
 *
 * Today it reads the `robots` store, which is already fed by real telemetry (Supabase
 * realtime) or the simulator, so real data starts raising alerts with no extra wiring.
 * Anything that cannot be derived from telemetry plugs in through registerEventSource().
 */

const rules = new Map<string, HealthRule>(BUILTIN_RULES.map((r) => [r.id, r]));
const sources = new Set<EventSource>();
const sourceDisposers = new Map<EventSource, () => void>();

/** key = `${robotId}|${ruleId}`; value = severity currently alerted. */
const active = new Map<string, EventSeverity>();

let timer: ReturnType<typeof setInterval> | null = null;
let unsubscribeRobots: (() => void) | null = null;

export function registerHealthRule(rule: HealthRule): void {
  rules.set(rule.id, rule);
}

export function unregisterHealthRule(id: string): void {
  rules.delete(id);
  for (const key of [...active.keys()]) if (key.endsWith(`|${id}`)) active.delete(key);
}

const emitAlert: EmitAlert = (alert) => {
  void emitEvent({
    robotId: alert.robotId,
    severity: alert.severity,
    title: alert.title,
    message: alert.message,
    persist: alert.persist ?? HEALTH_CONFIG.PERSIST_EVENTS
  });
};

export function registerEventSource(source: EventSource): () => void {
  sources.add(source);
  if (timer) sourceDisposers.set(source, source(emitAlert));
  return () => {
    sourceDisposers.get(source)?.();
    sourceDisposers.delete(source);
    sources.delete(source);
  };
}

const RANK: Record<EventSeverity, number> = { info: 0, warning: 1, error: 2, critical: 3 };

/** One evaluation pass over all robots. Exported for tests; the monitor calls it by itself. */
export function evaluateHealth(list: Robot[] = get(robots), now = Date.now()): void {
  const seen = new Set<string>();

  for (const robot of list) {
    for (const rule of rules.values()) {
      const key = `${robot.id}|${rule.id}`;
      const previous = active.get(key);
      const finding = rule.evaluate({ robot, now, previous });

      if (finding) {
        seen.add(key);
        // Alert on first occurrence and on escalation only (no spam while the state persists).
        if (previous === undefined || RANK[finding.severity] > RANK[previous]) {
          emitAlert({ robotId: robot.id, ...finding });
        }
        active.set(key, finding.severity);
      } else if (previous !== undefined) {
        active.delete(key);
        emitAlert({ robotId: robot.id, severity: 'info', title: 'Recovered', message: `${robot.id}: ${rule.id} back to normal` });
      }
    }
  }

  // Robots that disappeared: drop their state silently.
  for (const key of [...active.keys()]) if (!seen.has(key) && !list.some((r) => key.startsWith(`${r.id}|`))) active.delete(key);
}

export function startHealthMonitor(): void {
  if (timer || typeof window === 'undefined') return;
  timer = setInterval(() => evaluateHealth(), HEALTH_CONFIG.CHECK_INTERVAL_MS);
  unsubscribeRobots = robots.subscribe((list) => evaluateHealth(list));
  for (const source of sources) sourceDisposers.set(source, source(emitAlert));
}

export function stopHealthMonitor(): void {
  if (timer) clearInterval(timer);
  timer = null;
  unsubscribeRobots?.();
  unsubscribeRobots = null;
  for (const dispose of sourceDisposers.values()) dispose();
  sourceDisposers.clear();
  active.clear();
}
