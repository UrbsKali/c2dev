import { get, writable } from 'svelte/store';
import { TELEOP_CONFIG } from '$config/teleop';
import type { DeviceProfile, KeyboardLayout } from './types';

/**
 * User input preferences, layered over each profile's defaults:
 *   keyboard layout  -> profile default keys for that layout
 *   key overrides    -> per profile, per slot ("forward:+", "forward:-", "action:land")
 *   gamepad overrides-> per profile, per axis (physical axis index, inversion)
 */

const KEYS = TELEOP_CONFIG.STORAGE_KEYS;

export type KeySlot = string;
export type GamepadAxisOverride = { axis?: number; invert?: boolean };

export const axisSlot = (axisId: string, dir: '+' | '-'): KeySlot => `${axisId}:${dir}`;
export const actionSlot = (actionId: string): KeySlot => `action:${actionId}`;

function load<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable: preferences just won't persist
  }
}

export const keyboardLayout = writable<KeyboardLayout>(load<KeyboardLayout>(KEYS.KEYBOARD_LAYOUT, 'azerty'));
export const keyOverrides = writable<Record<string, Record<KeySlot, string>>>(load(KEYS.KEY_OVERRIDES, {}));
export const gamepadOverrides = writable<Record<string, Record<string, GamepadAxisOverride>>>(
  load(KEYS.GAMEPAD_OVERRIDES, {})
);

/** Gamepad button that triggers the emergency stop (-1 = none). Global, not per profile. */
export const emergencyButton = writable<number>(load<number>(KEYS.EMERGENCY_BUTTON, TELEOP_CONFIG.EMERGENCY_STOP_BUTTON));

export function setEmergencyButton(button: number): void {
  emergencyButton.set(button);
  save(KEYS.EMERGENCY_BUTTON, button);
}

export function setKeyboardLayout(layout: KeyboardLayout): void {
  keyboardLayout.set(layout);
  save(KEYS.KEYBOARD_LAYOUT, layout);
}

export function setKeyOverride(profileId: string, slot: KeySlot, key: string): void {
  keyOverrides.update((all) => {
    const next = { ...all, [profileId]: { ...(all[profileId] ?? {}), [slot]: key } };
    save(KEYS.KEY_OVERRIDES, next);
    return next;
  });
}

export function resetKeyOverrides(profileId: string): void {
  keyOverrides.update((all) => {
    const { [profileId]: _removed, ...rest } = all;
    save(KEYS.KEY_OVERRIDES, rest);
    return rest;
  });
}

export function setGamepadOverride(profileId: string, axisId: string, patch: GamepadAxisOverride): void {
  gamepadOverrides.update((all) => {
    const forProfile = { ...(all[profileId] ?? {}) };
    forProfile[axisId] = { ...forProfile[axisId], ...patch };
    const next = { ...all, [profileId]: forProfile };
    save(KEYS.GAMEPAD_OVERRIDES, next);
    return next;
  });
}

/** Effective key for a slot (override > layout default), lower-cased for matching. */
export function effectiveKey(
  profile: DeviceProfile,
  slot: KeySlot,
  layout: KeyboardLayout = get(keyboardLayout),
  overrides: Record<string, Record<KeySlot, string>> = get(keyOverrides)
): string | undefined {
  const override = overrides[profile.id]?.[slot];
  if (override) return override;

  if (slot.startsWith('action:')) {
    return profile.actions.find((a) => a.id === slot.slice(7))?.key?.[layout];
  }
  const [axisId, dir] = slot.split(':');
  const axis = profile.axes.find((a) => a.id === axisId);
  return (dir === '+' ? axis?.keys?.positive : axis?.keys?.negative)?.[layout];
}

export type KeyTarget = { kind: 'axis'; axisId: string; dir: 1 | -1 } | { kind: 'action'; actionId: string };

/** Lower-cased key -> what it does, for the active profile. */
export function buildKeyMap(
  profile: DeviceProfile,
  layout: KeyboardLayout = get(keyboardLayout),
  overrides: Record<string, Record<KeySlot, string>> = get(keyOverrides)
): Map<string, KeyTarget> {
  const map = new Map<string, KeyTarget>();
  const add = (slot: KeySlot, target: KeyTarget): void => {
    const key = effectiveKey(profile, slot, layout, overrides);
    if (key) map.set(key.toLowerCase(), target);
  };
  for (const axis of profile.axes) {
    add(axisSlot(axis.id, '+'), { kind: 'axis', axisId: axis.id, dir: 1 });
    add(axisSlot(axis.id, '-'), { kind: 'axis', axisId: axis.id, dir: -1 });
  }
  for (const action of profile.actions) {
    add(actionSlot(action.id), { kind: 'action', actionId: action.id });
  }
  return map;
}

/** Physical axis index + total sign (inherent orientation x user inversion). */
export function effectiveGamepadAxis(
  profile: DeviceProfile,
  axisId: string,
  overrides: Record<string, Record<string, GamepadAxisOverride>> = get(gamepadOverrides)
): { axis: number; sign: 1 | -1 } | null {
  const def = profile.axes.find((a) => a.id === axisId)?.gamepad;
  const o = overrides[profile.id]?.[axisId];
  const axis = o?.axis ?? def?.axis;
  if (axis === undefined) return null;
  const sign = ((def?.sign ?? 1) * (o?.invert ? -1 : 1)) as 1 | -1;
  return { axis, sign };
}
