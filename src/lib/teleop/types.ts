/**
 * Teleoperation domain types.
 *
 * A DeviceProfile is a *pure data* description of how an appliance (ground rover,
 * quadcopter, boat, ...) is driven: its control axes, its discrete actions, its
 * default input bindings and how a control frame is encoded on the wire.
 *
 * Because it is serialisable data (no functions), a profile can come from the
 * built-in catalog today, or from the robot itself tomorrow (see registry.ts).
 */

export type KeyboardLayout = 'azerty' | 'qwerty' | 'arrows';

/** Default key per keyboard layout. Missing layout = unbound. */
export type KeyChoice = Partial<Record<KeyboardLayout, string>>;

export type DeviceCategory = 'ground' | 'aerial' | 'maritime' | 'other';

export interface AxisDef {
  /** Stable id, used in control frames and in the wire payload (e.g. "forward", "throttle"). */
  id: string;
  label: string;
  /** Default Gamepad API binding. `sign` is the axis' inherent orientation (vertical axes are -1). */
  gamepad?: { axis: number; sign: 1 | -1 };
  /** Default keys for the positive / negative direction. */
  keys?: { positive?: KeyChoice; negative?: KeyChoice };
  /** If false the global speed limiter does not scale this axis (e.g. altitude). Default true. */
  scaledBySpeed?: boolean;
}

export interface ActionDef {
  id: string;
  label: string;
  /** "trigger" sends once per press. */
  kind: 'trigger';
  /** Default standard-mapping gamepad button index. */
  gamepadButton?: number;
  key?: KeyChoice;
  /** Rendered with a warning style in the UI. */
  danger?: boolean;
}

export interface GizmoStick {
  label: string;
  x: string; // axis id on the horizontal direction
  y: string; // axis id on the vertical direction
}

/** How a frame becomes a Command (command_type + payload). Data only, so it can be remote. */
export type WireSpec =
  | {
      /** ROS-like Twist: linear {x,y,z}, angular {x,y,z}; each component names an axis id. */
      format: 'twist';
      commandType: string;
      twist: Partial<Record<'lx' | 'ly' | 'lz' | 'ax' | 'ay' | 'az', string>>;
    }
  | {
      /** Free-form: `{ axes: { <axisId>: value } }`. */
      format: 'axes';
      commandType: string;
    };

export interface DeviceProfile {
  id: string;
  name: string;
  description: string;
  category: DeviceCategory;
  /** Robot.type values (APP6E roles) this profile is the natural fit for. */
  robotTypes?: string[];
  axes: AxisDef[];
  actions: ActionDef[];
  /** Sticks drawn in the gizmo. */
  gizmo: GizmoStick[];
  /** Which two axes the on-screen D-pad drives. */
  dpad: { x: string; y: string };
  deadzone: number;
  wire: WireSpec;
  /** Where the profile came from. */
  origin?: 'builtin' | 'remote' | 'user';
}

/** One tick of operator intent: axis values in [-1, 1] keyed by AxisDef.id. */
export type ControlFrame = Record<string, number>;

export type ControlSource = 'keyboard' | 'gamepad' | 'ui' | 'custom';

/** Result of encoding a frame, ready to be put in a Command. */
export interface EncodedCommand {
  commandType: string;
  payload: Record<string, unknown>;
}
