import type { DeviceProfile } from '../types';
import { groundDifferential } from './ground-differential';
import { aerialMultirotor } from './aerial-multirotor';
import { omnidirectional } from './omnidirectional';
import { ackermann } from './ackermann';

/**
 * Built-in catalog. To support a new kind of device, add a file in this folder
 * and list it here: nothing else in the app needs to change.
 */
export const BUILTIN_PROFILES: DeviceProfile[] = [
  groundDifferential,
  aerialMultirotor,
  omnidirectional,
  ackermann
];

export const DEFAULT_PROFILE_ID = groundDifferential.id;
