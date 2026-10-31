import { describe, it, expect } from 'vitest';
import {
  getProfile,
  registerRemoteProfile,
  resolveProfileForRobot,
  validateProfileDescriptor,
  unregisterProfile
} from '../../../src/lib/teleop/registry';
import type { Robot } from '../../../src/lib/types';

const robot = (over: Partial<Robot> = {}): Robot => ({ id: 'r1', type: 'OTHER', controllable: true, ...over });

const boat = {
  id: 'boat-usv',
  name: 'Surface vessel',
  category: 'maritime',
  axes: [{ id: 'thrust' }, { id: 'rudder' }],
  wire: { format: 'twist', commandType: 'teleop', twist: { lx: 'thrust', az: 'rudder' } }
};

describe('device profile registry', () => {
  it('ships ground, aerial, omni and ackermann profiles', () => {
    for (const id of ['ground-differential', 'aerial-multirotor', 'omnidirectional', 'ackermann']) {
      expect(getProfile(id)).toBeDefined();
    }
  });

  it('picks the aerial profile for a UAV and falls back to ground otherwise', () => {
    expect(resolveProfileForRobot(robot({ type: 'UAV' })).id).toBe('aerial-multirotor');
    expect(resolveProfileForRobot(robot({ type: 'OTHER' })).id).toBe('ground-differential');
    expect(resolveProfileForRobot(undefined).id).toBe('ground-differential');
  });

  it('prefers the profile id announced by the robot over its type', () => {
    expect(resolveProfileForRobot(robot({ type: 'UAV', controlProfileId: 'omnidirectional' })).id).toBe('omnidirectional');
  });

  it('adopts a descriptor announced by the robot, without any code change', () => {
    const r = robot({ extra: { controlDescriptor: boat } });
    const profile = resolveProfileForRobot(r);
    expect(profile.id).toBe('boat-usv');
    expect(profile.origin).toBe('remote');
    expect(getProfile('boat-usv')).toBeDefined();
    unregisterProfile('boat-usv');
  });

  it('rejects malformed descriptors and never lets a robot overwrite a built-in', () => {
    expect(validateProfileDescriptor({ id: 'x' })).toBeNull();
    expect(validateProfileDescriptor({ ...boat, wire: { format: 'twist', commandType: 'teleop', twist: { lx: 'nope' } } })).toBeNull();
    const before = getProfile('aerial-multirotor');
    registerRemoteProfile({ ...boat, id: 'aerial-multirotor' });
    expect(getProfile('aerial-multirotor')).toEqual(before);
  });
});
