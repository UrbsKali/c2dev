import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('../../../src/lib/services/websocket', () => ({ sendCommand: vi.fn().mockResolvedValue(undefined) }));

import { initGamepadListener, gamepadInfo, __pollGamepadForTests } from '../../../src/lib/services/gamepad';
import { teleopState, inputToggles } from '../../../src/lib/services/teleop';

type Pad = { id: string; index: number; connected: boolean; mapping: string; axes: number[]; buttons: { pressed: boolean; value: number }[] };

const pad = (over: Partial<Pad> = {}): Pad => ({
  id: 'test pad',
  index: 0,
  connected: true,
  mapping: 'standard',
  axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  ...over
});

function setPads(...pads: Pad[]): void {
  vi.stubGlobal('navigator', { getGamepads: () => pads });
}

describe('gamepad polling', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { addEventListener: vi.fn() });
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    inputToggles.set({ keyboardEnabled: true, gamepadEnabled: true });
    teleopState.set({ axes: {}, activeSource: 'none', speedFactor: 1, lastSentAt: 0 });
    initGamepadListener();
  });

  it('drives the gizmo from the left stick of a standard pad', () => {
    setPads(pad({ axes: [0.5, -1, 0, 0] })); // stick pushed up and slightly right
    __pollGamepadForTests();
    const s = get(teleopState);
    expect(s.activeSource).toBe('gamepad');
    expect(s.axes.forward).toBeCloseTo(1);
    expect(s.axes.turn).toBeCloseTo(0.5);
  });

  it('reports the emergency stop as held and zeroes the output', () => {
    const p = pad({ axes: [0, -1, 0, 0] });
    p.buttons[1] = { pressed: true, value: 1 }; // Circle
    setPads(p);
    __pollGamepadForTests();
    expect(get(gamepadInfo).eStopHeld).toBe(true);
    expect(get(teleopState).axes.forward ?? 0).toBe(0);
  });

  it('ignores the extra e-stop buttons on a non-standard device (RC transmitter switches)', () => {
    const p = pad({ mapping: '', axes: [0, -1, 0, 0] });
    p.buttons[4] = { pressed: true, value: 1 }; // a switch resting in the "on" position
    setPads(p);
    __pollGamepadForTests();
    expect(get(gamepadInfo).eStopHeld).toBe(false);
    expect(get(teleopState).axes.forward).toBeCloseTo(1);
  });
});
