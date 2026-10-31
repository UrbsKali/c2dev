import { writable, get } from 'svelte/store';
import { sendControlFrame, triggerAction, emergencyStop } from './teleop';
import { TELEOP_CONFIG } from '$config/teleop';
import { activeProfile, effectiveGamepadAxis, emergencyButton, type ControlFrame } from '$teleop';

export interface GamepadInfo {
  connected: boolean;
  id: string;
  index: number;
  leftStick: { x: number; y: number };
  rightStick: { x: number; y: number };
  triggers: { left: number; right: number };
  axes: number[];
  buttons: boolean[];
  /** 'standard' = browser-recognised layout; '' = raw device (RC transmitter, generic USB pad). */
  mapping: string;
  /** An emergency-stop input is currently held (output is forced to zero). */
  eStopHeld: boolean;
}

export const gamepadInfo = writable<GamepadInfo>({
  connected: false,
  id: '',
  index: -1,
  leftStick: { x: 0, y: 0 },
  rightStick: { x: 0, y: 0 },
  triggers: { left: 0, right: 0 },
  axes: [0, 0, 0, 0],
  buttons: [],
  mapping: '',
  eStopHeld: false
});

let animationFrameId: number | null = null;
let activeGamepadIndex: number | null = null;
// Buttons held on the previous frame, to fire actions on the press edge only.
let previousButtons: boolean[] = [];

function pollGamepad(): void {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return;

  const gamepads = navigator.getGamepads();

  // Find first active connected gamepad if none locked
  let gp = activeGamepadIndex !== null ? gamepads[activeGamepadIndex] : null;
  if (!gp || !gp.connected) {
    for (let i = 0; i < gamepads.length; i++) {
      if (gamepads[i] && gamepads[i]?.connected) {
        activeGamepadIndex = i;
        gp = gamepads[i];
        break;
      }
    }
  }

  if (gp && gp.connected) {
    const profile = get(activeProfile);
    const deadzone = profile.deadzone;
    const rawAxes = gp.axes.map((val) => (Math.abs(val) < deadzone ? 0 : val));
    const pressed = gp.buttons.map((b) => b.pressed);

    // Profile-driven: every axis of the active device reads its own physical axis.
    const frame: ControlFrame = {};
    for (const axis of profile.axes) {
      const binding = effectiveGamepadAxis(profile, axis.id);
      frame[axis.id] = binding ? (rawAxes[binding.axis] ?? 0) * binding.sign : 0;
    }

    // The extra e-stop buttons (bumpers, Select, Start) only mean something on a standard layout.
    // On a raw device (RC transmitter, generic pad) a switch resting "on" would lock the output.
    const standard = gp.mapping === 'standard';
    const eStopButton = get(emergencyButton);
    const eStop =
      (eStopButton >= 0 && Boolean(pressed[eStopButton])) ||
      (standard && TELEOP_CONFIG.EMERGENCY_STOP_EXTRA_BUTTONS.some((i) => pressed[i]));

    if (eStop) {
      void emergencyStop();
    } else {
      void sendControlFrame(frame, 'gamepad');
      for (const action of profile.actions) {
        const btn = action.gamepadButton;
        if (btn !== undefined && pressed[btn] && !previousButtons[btn]) {
          void triggerAction(action.id, 'gamepad');
        }
      }
    }
    previousButtons = pressed;

    // Trigger readings (LT = button 6, RT = button 7 on standard mapping)
    const ltVal = gp.buttons[6]?.value ?? 0;
    const rtVal = gp.buttons[7]?.value ?? 0;

    gamepadInfo.update((info) => ({
      ...info,
      connected: true,
      id: gp.id,
      index: gp.index,
      leftStick: { x: rawAxes[0] ?? 0, y: -(rawAxes[1] ?? 0) },
      rightStick: { x: rawAxes[2] ?? 0, y: -(rawAxes[3] ?? 0) },
      triggers: { left: ltVal, right: rtVal },
      axes: [...rawAxes],
      buttons: pressed,
      mapping: gp.mapping,
      eStopHeld: eStop
    }));
  }

  animationFrameId = requestAnimationFrame(pollGamepad);
}

/** Test hook: run one polling pass synchronously. */
export const __pollGamepadForTests = (): void => pollGamepad();

export function initGamepadListener(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('gamepadconnected', (e: GamepadEvent) => {
    console.info(`[gamepad] Gamepad connected at index ${e.gamepad.index}: ${e.gamepad.id}`);
    activeGamepadIndex = e.gamepad.index;
    gamepadInfo.update((info) => ({
      ...info,
      connected: true,
      id: e.gamepad.id,
      index: e.gamepad.index
    }));

    if (!animationFrameId) {
      animationFrameId = requestAnimationFrame(pollGamepad);
    }
  });

  window.addEventListener('gamepaddisconnected', (e: GamepadEvent) => {
    console.info(`[gamepad] Gamepad disconnected: ${e.gamepad.id}`);
    if (activeGamepadIndex === e.gamepad.index) {
      activeGamepadIndex = null;
      gamepadInfo.set({
        connected: false,
        id: '',
        index: -1,
        leftStick: { x: 0, y: 0 },
        rightStick: { x: 0, y: 0 },
        triggers: { left: 0, right: 0 },
        axes: [0, 0, 0, 0],
        buttons: [],
        mapping: '',
        eStopHeld: false
      });
      void emergencyStop();
    }
  });

  // Start polling loop if gamepad already present
  if (!animationFrameId) {
    animationFrameId = requestAnimationFrame(pollGamepad);
  }
}

export function triggerHapticFeedback(durationMs = 200, strongMagnitude = 0.5): void {
  if (activeGamepadIndex === null || typeof navigator === 'undefined') return;
  const gamepads = navigator.getGamepads();
  const gp = gamepads[activeGamepadIndex];
  if (gp && (gp as unknown as { vibrationActuator?: { playEffect: (type: string, opts: object) => void } }).vibrationActuator) {
    try {
      (gp as unknown as { vibrationActuator: { playEffect: (type: string, opts: object) => void } }).vibrationActuator.playEffect('dual-rumble', {
        startDelay: 0,
        duration: durationMs,
        weakMagnitude: strongMagnitude * 0.5,
        strongMagnitude: strongMagnitude
      });
    } catch {
      // Haptics optional fallback
    }
  }
}

