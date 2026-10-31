import { derived, writable } from 'svelte/store';
import { robots, selectedRobotId } from '$stores/robots';
import { TELEOP_CONFIG } from '$config/teleop';
import { getProfile, resolveProfileForRobot } from './registry';
import type { DeviceProfile } from './types';

function loadOverride(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(TELEOP_CONFIG.STORAGE_KEYS.PROFILE_OVERRIDE);
  } catch {
    return null;
  }
}

/** Manual profile choice. `null` = automatic (derived from the selected robot). */
export const profileOverride = writable<string | null>(loadOverride());

export function setProfileOverride(id: string | null): void {
  profileOverride.set(id);
  if (typeof window === 'undefined') return;
  try {
    if (id) localStorage.setItem(TELEOP_CONFIG.STORAGE_KEYS.PROFILE_OVERRIDE, id);
    else localStorage.removeItem(TELEOP_CONFIG.STORAGE_KEYS.PROFILE_OVERRIDE);
  } catch {
    // ignore
  }
}

/** The profile currently driving the controls: manual override > selected robot > default. */
export const activeProfile = derived(
  [selectedRobotId, robots, profileOverride],
  ([$id, $robots, $override]): DeviceProfile => {
    const manual = getProfile($override);
    if (manual) return manual;
    return resolveProfileForRobot($robots.find((r) => r.id === $id));
  }
);

/** True when the profile is chosen automatically. */
export const profileIsAuto = derived(profileOverride, ($o) => !getProfile($o));
