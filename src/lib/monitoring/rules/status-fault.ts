import { HEALTH_CONFIG } from '$config/events';
import type { HealthRule } from '../types';

export const statusFaultRule: HealthRule = {
  id: 'status-fault',
  evaluate({ robot }) {
    const status = robot.status?.toLowerCase();
    if (!status || !(HEALTH_CONFIG.FAULT_STATUSES as readonly string[]).includes(status)) return null;
    return { severity: 'error', title: 'Robot fault', message: `${robot.id} reports status "${robot.status}"` };
  }
};
