import type { DeviceProfile } from '../types';

/** Quadcopter, Mode 2 layout: left stick = throttle + yaw, right stick = pitch + roll. */
export const aerialMultirotor: DeviceProfile = {
  id: 'aerial-multirotor',
  name: 'Aerial Drone / Quadcopter (UAV)',
  description:
    'Mode 2: left stick = throttle & yaw, right stick = pitch & roll. A = takeoff, Y = land, X = arm.',
  category: 'aerial',
  robotTypes: ['UAV'],
  axes: [
    {
      id: 'throttle',
      label: 'Throttle',
      scaledBySpeed: false,
      gamepad: { axis: 1, sign: -1 },
      keys: {
        positive: { azerty: 'r', qwerty: 'r', arrows: 'PageUp' },
        negative: { azerty: 'f', qwerty: 'f', arrows: 'PageDown' }
      }
    },
    {
      id: 'yaw',
      label: 'Yaw',
      gamepad: { axis: 0, sign: 1 },
      keys: {
        positive: { azerty: 'd', qwerty: 'd', arrows: 'ArrowRight' },
        negative: { azerty: 'q', qwerty: 'a', arrows: 'ArrowLeft' }
      }
    },
    {
      id: 'pitch',
      label: 'Pitch',
      gamepad: { axis: 3, sign: -1 },
      keys: {
        positive: { azerty: 'z', qwerty: 'w', arrows: 'ArrowUp' },
        negative: { azerty: 's', qwerty: 's', arrows: 'ArrowDown' }
      }
    },
    {
      id: 'roll',
      label: 'Roll',
      gamepad: { axis: 2, sign: 1 },
      keys: {
        positive: { azerty: 'e', qwerty: 'e', arrows: '.' },
        negative: { azerty: 'a', qwerty: 'q', arrows: ',' }
      }
    }
  ],
  actions: [
    { id: 'arm', label: 'Arm', kind: 'trigger', gamepadButton: 2, key: { azerty: 'x', qwerty: 'x', arrows: 'x' } },
    { id: 'takeoff', label: 'Takeoff', kind: 'trigger', gamepadButton: 0, key: { azerty: 't', qwerty: 't', arrows: 't' } },
    { id: 'land', label: 'Land', kind: 'trigger', gamepadButton: 3, key: { azerty: 'l', qwerty: 'l', arrows: 'l' } },
    { id: 'rtl', label: 'Return home', kind: 'trigger', key: { azerty: 'h', qwerty: 'h', arrows: 'h' }, danger: true }
  ],
  gizmo: [
    { label: 'Throttle / Yaw', x: 'yaw', y: 'throttle' },
    { label: 'Pitch / Roll', x: 'roll', y: 'pitch' }
  ],
  dpad: { x: 'roll', y: 'pitch' },
  deadzone: 0.08,
  wire: {
    format: 'twist',
    commandType: 'teleop',
    twist: { lx: 'pitch', ly: 'roll', lz: 'throttle', az: 'yaw' }
  }
};
