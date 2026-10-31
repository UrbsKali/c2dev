import type { DeviceProfile } from '../types';

/** Car-like robot: speed + steering angle. */
export const ackermann: DeviceProfile = {
  id: 'ackermann',
  name: 'Car / Wheeled Robot (Ackermann)',
  description: 'Left stick: speed (Y) and steering angle (X).',
  category: 'ground',
  axes: [
    {
      id: 'speed',
      label: 'Speed',
      gamepad: { axis: 1, sign: -1 },
      keys: {
        positive: { azerty: 'z', qwerty: 'w', arrows: 'ArrowUp' },
        negative: { azerty: 's', qwerty: 's', arrows: 'ArrowDown' }
      }
    },
    {
      id: 'steer',
      label: 'Steering',
      gamepad: { axis: 0, sign: 1 },
      keys: {
        positive: { azerty: 'd', qwerty: 'd', arrows: 'ArrowRight' },
        negative: { azerty: 'q', qwerty: 'a', arrows: 'ArrowLeft' }
      }
    }
  ],
  actions: [],
  gizmo: [{ label: 'Drive', x: 'steer', y: 'speed' }],
  dpad: { x: 'steer', y: 'speed' },
  deadzone: 0.1,
  wire: { format: 'twist', commandType: 'teleop', twist: { lx: 'speed', az: 'steer' } }
};
