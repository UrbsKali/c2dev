import { derived, get, writable } from 'svelte/store';
import type { Robot } from '$types';
import type { AxisDef, DeviceProfile, WireSpec } from './types';
import { BUILTIN_PROFILES, DEFAULT_PROFILE_ID } from './profiles';

/**
 * Device profile registry.
 *
 * Resolution order for a robot (see resolveProfileForRobot):
 *   1. a descriptor announced by the robot itself (Robot.extra.controlDescriptor)
 *   2. a profile id announced by the robot (Robot.controlProfileId)
 *   3. a built-in profile matching Robot.type
 *   4. the default profile
 *
 * Steps 1-2 are what makes "connect to the robot and auto-detect its controls"
 * possible later: only the telemetry/handshake layer has to fill those fields.
 */

const registry = writable<Map<string, DeviceProfile>>(
  new Map(BUILTIN_PROFILES.map((p) => [p.id, { ...p, origin: 'builtin' as const }]))
);

export const profiles = derived(registry, (map) => Array.from(map.values()));

export function getProfile(id: string | null | undefined): DeviceProfile | undefined {
  return id ? get(registry).get(id) : undefined;
}

export function getDefaultProfile(): DeviceProfile {
  return get(registry).get(DEFAULT_PROFILE_ID) as DeviceProfile;
}

export function registerProfile(profile: DeviceProfile, origin: DeviceProfile['origin'] = 'user'): void {
  const existing = get(registry).get(profile.id);
  // No-op when unchanged so that re-announcing the same descriptor never re-triggers subscribers.
  if (existing && JSON.stringify({ ...existing, origin }) === JSON.stringify({ ...profile, origin })) return;
  registry.update((map) => new Map(map).set(profile.id, { ...profile, origin }));
}

export function unregisterProfile(id: string): void {
  registry.update((map) => {
    const next = new Map(map);
    if (next.get(id)?.origin !== 'builtin') next.delete(id);
    return next;
  });
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

function validWire(v: unknown, axisIds: Set<string>): WireSpec | null {
  if (!isObj(v) || !isStr(v.commandType)) return null;
  if (v.format === 'axes') return { format: 'axes', commandType: v.commandType };
  if (v.format === 'twist' && isObj(v.twist)) {
    const twist: Record<string, string> = {};
    for (const [slot, axisId] of Object.entries(v.twist)) {
      if (!['lx', 'ly', 'lz', 'ax', 'ay', 'az'].includes(slot)) return null;
      if (!isStr(axisId) || !axisIds.has(axisId)) return null;
      twist[slot] = axisId;
    }
    return { format: 'twist', commandType: v.commandType, twist: twist as Extract<WireSpec, { format: 'twist' }>['twist'] };
  }
  return null;
}

/**
 * Validates an untrusted descriptor (e.g. coming from a robot) and returns a
 * well-formed profile, or null. Never throws.
 */
export function validateProfileDescriptor(raw: unknown): DeviceProfile | null {
  if (!isObj(raw) || !isStr(raw.id) || !isStr(raw.name) || !Array.isArray(raw.axes)) return null;
  if (raw.axes.length === 0 || raw.axes.length > 16) return null;

  const axes: AxisDef[] = [];
  for (const a of raw.axes) {
    if (!isObj(a) || !isStr(a.id) || axes.some((x) => x.id === a.id)) return null;
    axes.push({
      id: a.id,
      label: isStr(a.label) ? a.label : a.id,
      gamepad: a.gamepad as AxisDef['gamepad'],
      keys: a.keys as AxisDef['keys'],
      scaledBySpeed: a.scaledBySpeed === false ? false : undefined
    });
  }
  const axisIds = new Set(axes.map((a) => a.id));

  const wire = validWire(raw.wire, axisIds);
  if (!wire) return null;

  const actions = Array.isArray(raw.actions)
    ? raw.actions
        .filter((a): a is Record<string, unknown> => isObj(a) && isStr(a.id))
        .map((a) => ({
          id: String(a.id),
          label: isStr(a.label) ? a.label : String(a.id),
          kind: 'trigger' as const,
          gamepadButton: typeof a.gamepadButton === 'number' ? a.gamepadButton : undefined,
          key: a.key as DeviceProfile['actions'][number]['key'],
          danger: a.danger === true
        }))
    : [];

  const first = axes[0].id;
  const second = axes[1]?.id ?? first;
  const gizmo = Array.isArray(raw.gizmo)
    ? raw.gizmo
        .filter((g): g is Record<string, unknown> => isObj(g) && axisIds.has(String(g.x)) && axisIds.has(String(g.y)))
        .map((g) => ({ label: isStr(g.label) ? g.label : 'Stick', x: String(g.x), y: String(g.y) }))
    : [];
  const dpadRaw = isObj(raw.dpad) ? raw.dpad : {};

  return {
    id: raw.id,
    name: raw.name,
    description: isStr(raw.description) ? raw.description : '',
    category: (['ground', 'aerial', 'maritime', 'other'] as const).find((c) => c === raw.category) ?? 'other',
    robotTypes: Array.isArray(raw.robotTypes) ? raw.robotTypes.filter(isStr) : undefined,
    axes,
    actions,
    gizmo: gizmo.length ? gizmo : [{ label: 'Drive', x: second, y: first }],
    dpad: {
      x: axisIds.has(String(dpadRaw.x)) ? String(dpadRaw.x) : second,
      y: axisIds.has(String(dpadRaw.y)) ? String(dpadRaw.y) : first
    },
    deadzone: typeof raw.deadzone === 'number' ? Math.min(Math.max(raw.deadzone, 0), 0.5) : 0.1,
    wire
  };
}

/** Registers a descriptor announced by a robot. Built-in ids can never be overwritten. */
export function registerRemoteProfile(raw: unknown): DeviceProfile | null {
  const profile = validateProfileDescriptor(raw);
  if (!profile) return null;
  if (get(registry).get(profile.id)?.origin === 'builtin') return getProfile(profile.id) ?? null;
  registerProfile(profile, 'remote');
  return { ...profile, origin: 'remote' };
}

export function resolveProfileForRobot(robot: Robot | undefined | null): DeviceProfile {
  if (robot) {
    const announced = registerRemoteProfile(robot.extra?.controlDescriptor);
    if (announced) return announced;

    const byId = getProfile(robot.controlProfileId);
    if (byId) return byId;

    const byType = get(profiles).find((p) => p.robotTypes?.includes(robot.type));
    if (byType) return byType;
  }
  return getDefaultProfile();
}
