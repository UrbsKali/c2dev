import { HEALTH_CONFIG } from '$config/events';
import type { HealthRule } from '../types';

const { WARNING_PCT, CRITICAL_PCT, RECOVERY_MARGIN_PCT } = HEALTH_CONFIG.BATTERY;

export const batteryRule: HealthRule = {
  id: 'battery-low',
  evaluate({ robot, previous }) {
    const level = robot.battery;
    if (typeof level !== 'number') return null;

    // Hysteresis: once raised, the alert only clears above threshold + margin.
    const warnAt = previous ? WARNING_PCT + RECOVERY_MARGIN_PCT : WARNING_PCT;
    const critAt = previous === 'critical' ? CRITICAL_PCT + RECOVERY_MARGIN_PCT : CRITICAL_PCT;

    if (level <= critAt) {
      return { severity: 'critical', title: 'Battery critical', message: `${robot.id} battery at ${Math.round(level)}%` };
    }
    if (level <= warnAt) {
      return { severity: 'warning', title: 'Battery low', message: `${robot.id} battery at ${Math.round(level)}%` };
    }
    return null;
  }
};
