import { HEALTH_CONFIG } from '$config/events';
import type { HealthRule } from '../types';

const { STALE_WARNING_MS, STALE_CRITICAL_MS } = HEALTH_CONFIG.TELEMETRY;

export const telemetryLostRule: HealthRule = {
  id: 'telemetry-lost',
  evaluate({ robot, now }) {
    const stamp = robot.serverReceived ?? robot.lastSeen;
    const last = stamp ? Date.parse(stamp) : NaN;
    if (!Number.isFinite(last)) return null;

    const silentMs = now - last;
    const seconds = Math.round(silentMs / 1000);
    if (silentMs >= STALE_CRITICAL_MS) {
      return { severity: 'critical', title: 'Telemetry lost', message: `${robot.id}: no data for ${seconds}s` };
    }
    if (silentMs >= STALE_WARNING_MS) {
      return { severity: 'warning', title: 'Telemetry delayed', message: `${robot.id}: no data for ${seconds}s` };
    }
    return null;
  }
};
