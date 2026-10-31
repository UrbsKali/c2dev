import type { ControlFrame, ControlSource, DeviceProfile, EncodedCommand } from './types';

export interface EncodeContext {
  source: ControlSource;
  speedFactor: number;
}

/** Applies the speed limiter (except on axes that opt out) and clamps to [-1, 1]. */
export function scaleFrame(profile: DeviceProfile, frame: ControlFrame, speedFactor: number): ControlFrame {
  const out: ControlFrame = {};
  for (const axis of profile.axes) {
    const raw = Math.max(-1, Math.min(1, frame[axis.id] ?? 0));
    out[axis.id] = axis.scaledBySpeed === false ? raw : raw * speedFactor;
  }
  return out;
}

export function isNeutral(frame: ControlFrame, epsilon: number): boolean {
  return Object.values(frame).every((v) => Math.abs(v) < epsilon);
}

/** Turns an (already scaled) frame into the wire command described by the profile. */
export function encodeFrame(profile: DeviceProfile, frame: ControlFrame, ctx: EncodeContext): EncodedCommand {
  const meta = { profile: profile.id, source: ctx.source, speedFactor: ctx.speedFactor };
  const wire = profile.wire;

  if (wire.format === 'twist') {
    const v = (slot: keyof typeof wire.twist): number => {
      const axisId = wire.twist[slot];
      return axisId ? (frame[axisId] ?? 0) : 0;
    };
    return {
      commandType: wire.commandType,
      payload: {
        linear: { x: v('lx'), y: v('ly'), z: v('lz') },
        angular: { x: v('ax'), y: v('ay'), z: v('az') },
        ...meta
      }
    };
  }

  return { commandType: wire.commandType, payload: { axes: { ...frame }, ...meta } };
}

export const ACTION_COMMAND_TYPE = 'action';

export function encodeAction(profile: DeviceProfile, actionId: string, source: ControlSource): EncodedCommand {
  return {
    commandType: ACTION_COMMAND_TYPE,
    payload: { action: actionId, profile: profile.id, source }
  };
}
