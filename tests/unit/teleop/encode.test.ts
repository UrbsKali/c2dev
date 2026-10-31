import { describe, it, expect } from 'vitest';
import { getProfile } from '../../../src/lib/teleop/registry';
import { encodeAction, encodeFrame, isNeutral, scaleFrame } from '../../../src/lib/teleop/encode';
import type { DeviceProfile } from '../../../src/lib/teleop/types';

const ground = getProfile('ground-differential') as DeviceProfile;
const drone = getProfile('aerial-multirotor') as DeviceProfile;

describe('frame encoding', () => {
  it('encodes a ground frame as a Twist (backward compatible with the ROS bridge)', () => {
    const { commandType, payload } = encodeFrame(ground, { forward: 0.5, turn: -0.25 }, { source: 'keyboard', speedFactor: 1 });
    expect(commandType).toBe('teleop');
    expect(payload).toMatchObject({ linear: { x: 0.5, y: 0, z: 0 }, angular: { x: 0, y: 0, z: -0.25 }, profile: 'ground-differential' });
  });

  it('maps all four drone axes (pitch, roll, throttle, yaw) onto the Twist', () => {
    const { payload } = encodeFrame(drone, { pitch: 0.1, roll: 0.2, throttle: 0.3, yaw: 0.4 }, { source: 'gamepad', speedFactor: 1 });
    expect(payload).toMatchObject({ linear: { x: 0.1, y: 0.2, z: 0.3 }, angular: { z: 0.4 } });
  });

  it('applies the speed limiter but not on axes that opt out (throttle)', () => {
    const scaled = scaleFrame(drone, { pitch: 1, throttle: 1 }, 0.5);
    expect(scaled.pitch).toBeCloseTo(0.5);
    expect(scaled.throttle).toBe(1);
  });

  it('clamps out-of-range input and detects neutral frames', () => {
    expect(scaleFrame(ground, { forward: 5 }, 1).forward).toBe(1);
    expect(isNeutral(scaleFrame(ground, {}, 1), 0.01)).toBe(true);
  });

  it('encodes discrete actions with a generic command type', () => {
    expect(encodeAction(drone, 'land', 'ui')).toEqual({
      commandType: 'action',
      payload: { action: 'land', profile: 'aerial-multirotor', source: 'ui' }
    });
  });
});
