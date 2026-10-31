import type { HealthRule } from '../types';
import { batteryRule } from './battery';
import { telemetryLostRule } from './telemetry-lost';
import { statusFaultRule } from './status-fault';

/** Built-in rules. Add a file here + one line below to monitor something new. */
export const BUILTIN_RULES: HealthRule[] = [batteryRule, telemetryLostRule, statusFaultRule];
