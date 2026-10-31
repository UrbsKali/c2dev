import type { DeviceProfile } from '../types';

/** Rover / tank: throttle + steering (differential drive). */
export const groundDifferential: DeviceProfile = {
  id: 'ground-differential',
  name: 'Ground Rover / Tank (UGV)',
  description: 'Left stick: forward / backward and steering.',
  category: 'ground',
  robotTypes: ['INF', 'ARM', 'ENG', 'SPT'],
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
      id: 'turn',
      label: 'Turn',
      gamepad: { axis: 0, sign: 1 },
      keys: {
        positive: { azerty: 'd', qwerty: 'd', arrows: 'ArrowRight' },
        negative: { azerty: 'q', qwerty: 'a', arrows: 'ArrowLeft' }
      }
    }
  ],
  actions: [],
  gizmo: [{ label: 'Drive', x: 'turn', y: 'forward' }],
  dpad: { x: 'turn', y: 'forward' },
  deadzone: 0.1,
  wire: { format: 'twist', commandType: 'teleop', twist: { lx: 'forward', az: 'turn' } }
};
