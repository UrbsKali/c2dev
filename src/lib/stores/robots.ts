import { derived, writable } from 'svelte/store';
import type { Robot, TelemetryMessage, Position } from '$types';

function clonePosition(position?: Position): Position | undefined {
  if (!position) return undefined;
  return { ...position };
}

function cloneTrail(trail?: Position[]): Position[] | undefined {
  if (!trail) return undefined;
  return trail.map((point) => ({ ...point }));
}

function updateTrail(existing: Position[] | undefined, incoming?: Position): Position[] | undefined {
  if (!incoming) {
    return cloneTrail(existing);
  }
  const base = existing ? cloneTrail(existing) ?? [] : [];
  base.push({ ...incoming });
  if (base.length > 3) {
    return base.slice(base.length - 3);
  }
  return base;
}

const robotMap = writable<Map<string, Robot>>(new Map());

export const robots = derived(robotMap, (map: Map<string, Robot>) => Array.from(map.values()));
export const robotCount = derived(robotMap, (map: Map<string, Robot>) => map.size);
export const controllableRobots = derived(robots, (list: Robot[]) =>
  list.filter((robot: Robot) => robot.controllable)
);

export const selectedRobotId = writable<string | null>(null);
export const playbackCursor = writable<number>(0);
export const isPlaybackMode = writable<boolean>(false);

export function upsertRobot(partial: Partial<Robot> & Pick<Robot, 'id'>): void {
  robotMap.update((current: Map<string, Robot>) => {
    const next = new Map(current);
    const existing = current.get(partial.id);
    const merged: Robot = {
      ...(existing ?? { id: partial.id, controllable: false }),
      ...partial,
      id: partial.id,
      controllable: partial.controllable ?? existing?.controllable ?? false,
      position: clonePosition(partial.position) ?? clonePosition(existing?.position),
      trail:
        partial.trail !== undefined
          ? cloneTrail(partial.trail)
          : cloneTrail(existing?.trail)
    } as Robot;
    next.set(partial.id, merged);
    return next;
  });
}

export function applyTelemetry(message: TelemetryMessage): void {
  if (!message.robotId) return;
  robotMap.update((current: Map<string, Robot>) => {
    const next = new Map(current);
    const existing = current.get(message.robotId);
    const merged: Robot = {
      id: message.robotId,
      controllable: existing?.controllable ?? false,
      ...existing,
      type: message.type ?? existing?.type ?? 'OTHER',
      position: clonePosition(message.position) ?? clonePosition(existing?.position),
      trail: updateTrail(existing?.trail, message.position),
      heading: message.heading ?? existing?.heading,
      speed: message.speed ?? existing?.speed,
      status: (message.status as string | undefined) ?? existing?.status,
      lastSeen: message.lastSeen ?? existing?.lastSeen,
      serverReceived: message.serverReceived ?? existing?.serverReceived,
      extra: {
        ...(existing?.extra ?? {}),
        seq: message.seq
      }
    };
    next.set(message.robotId, merged);
    return next;
  });
}

export function removeRobot(robotId: string): void {
  robotMap.update((current: Map<string, Robot>) => {
    const next = new Map(current);
    next.delete(robotId);
    return next;
  });
}

export function resetRobots(): void {
  robotMap.set(new Map());
}
