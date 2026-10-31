import { get, writable } from 'svelte/store';
import type { Command } from '$types';
import { sendCommand } from '$services/websocket';
import { selectedRobotId } from '$stores/robots';
import { currentUser } from '$stores/user';
import { TELEOP_CONFIG } from '$config/teleop';
import {
  activeProfile,
  encodeAction,
  encodeFrame,
  isNeutral,
  scaleFrame,
  type ControlFrame,
  type ControlSource
} from '$teleop';

/**
 * Device-agnostic teleoperation pipeline:
 *   inputs (keyboard / gamepad / ui) -> ControlFrame -> active DeviceProfile -> Command
 * Nothing here knows what a "tank" or a "drone" is; that lives in the profile.
 */

export interface TeleopState {
  /** Last scaled axis values, keyed by the active profile's axis ids. */
  axes: ControlFrame;
  activeSource: ControlSource | 'none';
  speedFactor: number; // multiplier (MIN_SPEED_FACTOR to MAX_SPEED_FACTOR)
  lastSentAt: number;
}

export interface ControlInputToggles {
  keyboardEnabled: boolean;
  gamepadEnabled: boolean;
}

export const inputToggles = writable<ControlInputToggles>({
  keyboardEnabled: true,
  gamepadEnabled: true
});

export const teleopState = writable<TeleopState>({
  axes: {},
  activeSource: 'none',
  speedFactor: TELEOP_CONFIG.DEFAULT_SPEED_FACTOR,
  lastSentAt: 0
});

let lastSentSignature = '';

function sourceAllowed(source: ControlSource): boolean {
  const toggles = get(inputToggles);
  if (source === 'keyboard') return toggles.keyboardEnabled;
  if (source === 'gamepad') return toggles.gamepadEnabled;
  return true;
}

async function dispatch(commandType: string, payload: Record<string, unknown>): Promise<void> {
  // Strict check: only send to a robot that is explicitly selected.
  const robotId = get(selectedRobotId);
  if (!robotId) return;

  const user = get(currentUser);
  const command: Command = {
    id: crypto.randomUUID(),
    issuedBy: user?.id ?? TELEOP_CONFIG.FALLBACK_OPERATOR_ID,
    robotId,
    commandType,
    payload,
    status: 'queued',
    issuedAt: new Date().toISOString()
  };

  try {
    await sendCommand(command);
  } catch (err) {
    console.warn('[teleop] Failed to send command:', err);
  }
}

/**
 * Send a control frame (axis values in [-1, 1]) throttled at the configured rate.
 * `forceZero` bypasses throttling and source arbitration (key release, e-stop).
 */
export async function sendControlFrame(
  frame: ControlFrame,
  source: ControlSource,
  forceZero = false
): Promise<void> {
  if (!sourceAllowed(source)) return;

  const profile = get(activeProfile);
  const state = get(teleopState);
  const scaled = scaleFrame(profile, frame, state.speedFactor);
  const isZero = isNeutral(scaled, TELEOP_CONFIG.ZERO_VELOCITY_EPSILON);
  const now = Date.now();

  // An idle source must not cancel movement driven by another source.
  if (isZero && state.activeSource !== 'none' && state.activeSource !== source && !forceZero) return;

  const signature = isZero
    ? 'zero'
    : profile.id + ':' + profile.axes.map((a) => (scaled[a.id] ?? 0).toFixed(2)).join('_');

  if (isZero && lastSentSignature === 'zero' && !forceZero) {
    teleopState.update((s) => ({ ...s, axes: scaled, activeSource: 'none' }));
    return;
  }

  if (!forceZero && now - state.lastSentAt < TELEOP_CONFIG.THROTTLE_INTERVAL_MS) {
    teleopState.update((s) => ({ ...s, axes: scaled, activeSource: source }));
    return;
  }

  lastSentSignature = signature;
  teleopState.set({
    axes: scaled,
    activeSource: isZero ? 'none' : source,
    speedFactor: state.speedFactor,
    lastSentAt: now
  });

  const encoded = encodeFrame(profile, scaled, { source, speedFactor: state.speedFactor });
  await dispatch(encoded.commandType, encoded.payload);
}

/** Fire a discrete action of the active profile (takeoff, land, ...). */
export async function triggerAction(actionId: string, source: ControlSource = 'ui'): Promise<void> {
  if (!sourceAllowed(source)) return;
  const profile = get(activeProfile);
  if (!profile.actions.some((a) => a.id === actionId)) return;
  const encoded = encodeAction(profile, actionId, source);
  await dispatch(encoded.commandType, encoded.payload);
}

/** Emergency stop: zero every axis immediately, whatever the profile. */
export async function emergencyStop(): Promise<void> {
  await sendControlFrame({}, 'ui', true);
}
