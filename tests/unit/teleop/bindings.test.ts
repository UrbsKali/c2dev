import { describe, it, expect } from 'vitest';
import { buildKeyMap, effectiveGamepadAxis, effectiveKey, axisSlot } from '../../../src/lib/teleop/bindings';
import { getProfile } from '../../../src/lib/teleop/registry';
import type { DeviceProfile } from '../../../src/lib/teleop/types';

const ground = getProfile('ground-differential') as DeviceProfile;
const drone = getProfile('aerial-multirotor') as DeviceProfile;

describe('input bindings', () => {
  it('derives default keys from the layout', () => {
    expect(effectiveKey(ground, axisSlot('forward', '+'), 'azerty', {})).toBe('z');
    expect(effectiveKey(ground, axisSlot('forward', '+'), 'qwerty', {})).toBe('w');
    expect(effectiveKey(ground, axisSlot('forward', '+'), 'arrows', {})).toBe('ArrowUp');
  });

  it('lets a per-profile override win over the layout', () => {
    const overrides = { 'ground-differential': { [axisSlot('forward', '+')]: 'i' } };
    expect(effectiveKey(ground, axisSlot('forward', '+'), 'azerty', overrides)).toBe('i');
    expect(effectiveKey(drone, axisSlot('pitch', '+'), 'azerty', overrides)).toBe('z');
  });

  it('builds a key map exposing drone actions and axes', () => {
    const map = buildKeyMap(drone, 'azerty', {});
    expect(map.get('t')).toEqual({ kind: 'action', actionId: 'takeoff' });
    expect(map.get('r')).toEqual({ kind: 'axis', axisId: 'throttle', dir: 1 });
  });

  it('resolves gamepad axes with inherent sign and user inversion', () => {
    expect(effectiveGamepadAxis(drone, 'pitch', {})).toEqual({ axis: 3, sign: -1 });
    expect(effectiveGamepadAxis(drone, 'pitch', { 'aerial-multirotor': { pitch: { invert: true } } })).toEqual({ axis: 3, sign: 1 });
    expect(effectiveGamepadAxis(drone, 'yaw', { 'aerial-multirotor': { yaw: { axis: 2 } } })).toEqual({ axis: 2, sign: 1 });
  });
});
