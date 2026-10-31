import type { EventSeverity, Robot } from '$types';

/** What a rule reports for a robot while a problem persists. */
export interface HealthFinding {
  title: string;
  message?: string;
  severity: EventSeverity;
}

export interface HealthContext {
  robot: Robot;
  /** Epoch ms, injected so rules are deterministic and testable. */
  now: number;
  /** Severity this rule reported on the previous evaluation, if the alert is still active. */
  previous?: EventSeverity;
}

/**
 * A rule inspects one robot and returns a finding (problem) or null (healthy).
 * The monitor takes care of dedupe, escalation and "recovered" notices.
 */
export interface HealthRule {
  id: string;
  evaluate(ctx: HealthContext): HealthFinding | null;
}

/** Push-style source (ROS diagnostics, a gateway websocket, ...). Returns an unsubscribe fn. */
export type EventSource = (emit: EmitAlert) => () => void;

export type EmitAlert = (alert: {
  robotId?: string;
  severity: EventSeverity;
  title: string;
  message?: string;
  persist?: boolean;
}) => void;
