/**
 * Teleoperation configuration. Tuning constants live here, never inline.
 */

export const TELEOP_CONFIG = {
  // Command rate limiter (10 Hz = 100ms)
  THROTTLE_INTERVAL_MS: 100,

  // Speed factor constraints
  DEFAULT_SPEED_FACTOR: 1.0,
  MIN_SPEED_FACTOR: 0.2,
  MAX_SPEED_FACTOR: 1.0,
  SPEED_FACTOR_STEP: 0.05,

  // Zero velocity threshold to prevent network spam
  ZERO_VELOCITY_EPSILON: 0.01,

  // Keyboard polling period while keys are held
  KEYBOARD_POLL_MS: 100,

  // Universal emergency stop inputs (work whatever the device profile)
  EMERGENCY_STOP_KEY: 'k',
  EMERGENCY_STOP_BUTTON: 1,
  // Extra gamepad buttons that always trigger the emergency stop: LB, RB, Select, Start
  EMERGENCY_STOP_EXTRA_BUTTONS: [4, 5, 8, 9],

  // Fallback operator id if no profile is hydrated
  FALLBACK_OPERATOR_ID: 'teleop-operator',

  // LocalStorage persistence keys
  STORAGE_KEYS: {
    KEYBOARD_LAYOUT: 'c2_teleop_layout',
    KEY_OVERRIDES: 'c2_teleop_key_overrides',
    GAMEPAD_OVERRIDES: 'c2_teleop_gamepad_overrides',
    PROFILE_OVERRIDE: 'c2_teleop_profile_override',
    EMERGENCY_BUTTON: 'c2_teleop_estop_button'
  }
} as const;
