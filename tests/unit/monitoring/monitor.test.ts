import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/lib/stores/events', () => ({ emitEvent: vi.fn().mockResolvedValue({}) }));

import { emitEvent } from '../../../src/lib/stores/events';
import { evaluateHealth, registerHealthRule, stopHealthMonitor, unregisterHealthRule } from '../../../src/lib/monitoring/monitor';
import type { Robot } from '../../../src/lib/types';

const NOW = Date.parse('2026-10-31T12:00:00Z');
const robot = (over: Partial<Robot> = {}): Robot => ({
  id: 'r1', type: 'UAV', controllable: true, serverReceived: new Date(NOW - 1000).toISOString(), ...over
});
const emitted = () => vi.mocked(emitEvent).mock.calls.map((c) => c[0]);

describe('health monitor', () => {
  beforeEach(() => {
    stopHealthMonitor();
    vi.mocked(emitEvent).mockClear();
  });

  it('stays silent for a healthy robot', () => {
    evaluateHealth([robot({ battery: 80 })], NOW);
    expect(emitted()).toHaveLength(0);
  });

  it('raises a battery warning once, not on every tick', () => {
    evaluateHealth([robot({ battery: 20 })], NOW);
    evaluateHealth([robot({ battery: 19 })], NOW + 2000);
    expect(emitted()).toHaveLength(1);
    expect(emitted()[0]).toMatchObject({ robotId: 'r1', severity: 'warning', title: 'Battery low', persist: false });
  });

  it('escalates to critical, then reports recovery with hysteresis', () => {
    evaluateHealth([robot({ battery: 20 })], NOW);
    evaluateHealth([robot({ battery: 8 })], NOW);
    expect(emitted().map((e) => e.severity)).toEqual(['warning', 'critical']);

    evaluateHealth([robot({ battery: 27 })], NOW); // still inside the 25% + 5% margin: no flapping
    expect(emitted()).toHaveLength(2);

    evaluateHealth([robot({ battery: 60 })], NOW);
    expect(emitted().at(-1)).toMatchObject({ severity: 'info', title: 'Recovered' });
  });

  it('detects lost telemetry on silence alone (no message needed)', () => {
    const stale = robot({ serverReceived: new Date(NOW - 45_000).toISOString() });
    evaluateHealth([stale], NOW);
    expect(emitted()[0]).toMatchObject({ severity: 'critical', title: 'Telemetry lost' });
  });

  it('reports faults and supports custom rules', () => {
    registerHealthRule({
      id: 'overheat',
      evaluate: ({ robot: r }) => (r.extra?.temp === 90 ? { severity: 'error', title: 'Overheat' } : null)
    });
    evaluateHealth([robot({ status: 'FAULT', extra: { temp: 90 } })], NOW);
    expect(emitted().map((e) => e.title).sort()).toEqual(['Overheat', 'Robot fault']);
    unregisterHealthRule('overheat');
  });
});
