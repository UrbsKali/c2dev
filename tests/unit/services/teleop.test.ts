import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('../../../src/lib/services/websocket', () => ({ sendCommand: vi.fn().mockResolvedValue(undefined) }));

import { sendCommand } from '../../../src/lib/services/websocket';
import { teleopState, inputToggles, sendControlFrame, triggerAction, emergencyStop } from '../../../src/lib/services/teleop';
import { selectedRobotId, upsertRobot, resetRobots } from '../../../src/lib/stores/robots';
import { setProfileOverride } from '../../../src/lib/teleop/session';

describe('Teleop pipeline', () => {
  beforeEach(() => {
    vi.mocked(sendCommand).mockClear();
    resetRobots();
    selectedRobotId.set(null);
    setProfileOverride(null);
    inputToggles.set({ keyboardEnabled: true, gamepadEnabled: true });
    teleopState.set({ axes: {}, activeSource: 'none', speedFactor: 1, lastSentAt: 0 });
  });

  it('updates state with clamped axes', async () => {
    await sendControlFrame({ forward: 0.8, turn: -0.5 }, 'keyboard');
    const s = get(teleopState);
    expect(s.axes.forward).toBeCloseTo(0.8);
    expect(s.axes.turn).toBeCloseTo(-0.5);
    expect(s.activeSource).toBe('keyboard');
  });

  it('respects speedFactor scaling', async () => {
    teleopState.update((s) => ({ ...s, speedFactor: 0.5 }));
    await sendControlFrame({ forward: 1, turn: 1 }, 'keyboard', true);
    expect(get(teleopState).axes.forward).toBeCloseTo(0.5);
  });

  it('ignores a source that is toggled off', async () => {
    inputToggles.update((t) => ({ ...t, keyboardEnabled: false }));
    await sendControlFrame({ forward: 1 }, 'keyboard');
    expect(get(teleopState).activeSource).toBe('none');
  });

  it('does not send to the backend without a selected robot', async () => {
    await sendControlFrame({ forward: 1 }, 'ui', true);
    expect(sendCommand).not.toHaveBeenCalled();
  });

  it('sends a command shaped by the selected robot profile (UAV => aerial Twist)', async () => {
    upsertRobot({ id: 'uav-1', type: 'UAV', controllable: true });
    selectedRobotId.set('uav-1');
    await sendControlFrame({ throttle: 0.6, yaw: 0.2 }, 'gamepad', true);
    const cmd = vi.mocked(sendCommand).mock.calls[0][0];
    expect(cmd.robotId).toBe('uav-1');
    expect(cmd.commandType).toBe('teleop');
    expect(cmd.payload).toMatchObject({ profile: 'aerial-multirotor', linear: { z: 0.6 }, angular: { z: 0.2 } });
  });

  it('triggers only actions that the active profile declares', async () => {
    upsertRobot({ id: 'uav-1', type: 'UAV', controllable: true });
    selectedRobotId.set('uav-1');
    await triggerAction('takeoff');
    await triggerAction('does-not-exist');
    expect(sendCommand).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendCommand).mock.calls[0][0]).toMatchObject({ commandType: 'action', payload: { action: 'takeoff' } });
  });

  it('emergencyStop zeroes every axis', async () => {
    await sendControlFrame({ forward: 0.9, turn: 0.4 }, 'keyboard');
    await emergencyStop();
    const s = get(teleopState);
    expect(Object.values(s.axes).every((v) => v === 0)).toBe(true);
  });
});
