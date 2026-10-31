import type { DeviceProfile } from '../types';

/** Holonomic / mecanum: planar translation + in-place rotation. */
export const omnidirectional: DeviceProfile = {
  id: 'omnidirectional',
  name: 'Holonomic / Omnidirectional (Mecanum)',
  description: 'Left stick = planar translation, right stick X = rotation.',
  category: 'ground',
  axes: [
    {
      id: 'forward',
      label: 'Forward',
      gamepad: { axis: 1, sign: -1 },
      keys: {
        positive: { azerty: 'z', qwerty: 'w', arrows: 'ArrowUp' },
        negative: { azerty: 's', qwerty: 's', arrows: 'ArrowDown' }
      }
    },
    {
      id: 'strafe',
      label: 'Strafe',
      gamepad: { axis: 0, sign: 1 },
      keys: {
        positive: { azerty: 'd', qwerty: 'd', arrows: 'ArrowRight' },
        negative: { azerty: 'q', qwerty: 'a', arrows: 'ArrowLeft' }
      }
    },
    {
      id: 'turn',
      label: 'Turn',
      gamepad: { axis: 2, sign: 1 },
      keys: {
        positive: { azerty: 'e', qwerty: 'e', arrows: '.' },
        negative: { azerty: 'a', qwerty: 'q', arrows: ',' }
      }
    }
  ],
  actions: [],
  gizmo: [{ label: 'Translate', x: 'strafe', y: 'forward' }],
  dpad: { x: 'strafe', y: 'forward' },
  deadzone: 0.1,
  wire: { format: 'twist', commandType: 'teleop', twist: { lx: 'forward', ly: 'strafe', az: 'turn' } }
};
