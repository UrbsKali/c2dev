import { writable } from 'svelte/store';
import type { RealtimeChannel, RealtimePostgresInsertPayload } from '@supabase/supabase-js';
import { applyTelemetry, upsertRobot } from '$stores/robots';
import type { Command, TelemetryMessage, Position } from '$types';
import {
  supabaseClient,
  COMMANDS_TABLE,
  TELEMETRY_TABLE
} from '$services/supabase';

export type SocketState = 'disconnected' | 'connecting' | 'connected' | 'error';

const stateStore = writable<SocketState>('disconnected');

export const socketState = {
  subscribe: stateStore.subscribe
};

type SimulationModeSnapshot = { active: boolean; forced: boolean };

const simulationModeStore = writable<SimulationModeSnapshot>({ active: false, forced: false });

export const simulationMode = {
  subscribe: simulationModeStore.subscribe
};

const REALTIME_LOG_PREFIX = '[Realtime]';
const SIM_LOG_PREFIX = '[Simulator]';
const CHANNEL_NAME = 'c2dev-simulation-sync';

const logRealtime = (...args: unknown[]): void => {
  console.info(REALTIME_LOG_PREFIX, ...args);
};

const warnRealtime = (...args: unknown[]): void => {
  console.warn(REALTIME_LOG_PREFIX, ...args);
};

const logSimulator = (...args: unknown[]): void => {
  console.info(SIM_LOG_PREFIX, ...args);
};

const debugSimulator = (...args: unknown[]): void => {
  console.debug(SIM_LOG_PREFIX, ...args);
};

type TelemetryRow = {
  id?: number;
  robot_id?: string | null;
  mission_id?: string | null;
  position?: unknown;
  heading?: number | null;
  speed?: number | null;
  status?: string | null;
  timestamp?: string | null;
  server_received?: string | null;
  type?: string | null;
};

type TelemetryListener = (message: TelemetryMessage) => void;

const listeners = new Set<TelemetryListener>();

let telemetryChannel: RealtimeChannel | null = null;

export const SIM_ROBOT_ID = 'sim-ghost';
const SIM_DEFAULT_WAYPOINTS: Position[] = [
  { lat: 48.8566, lon: 2.3522, alt: 120 },
  { lat: 48.8595, lon: 2.3478, alt: 120 },
  { lat: 48.8612, lon: 2.3557, alt: 120 },
  { lat: 48.858, lon: 2.3605, alt: 120 }
];
const SIMULATION_TICK_MS = 1000;
const SIMULATION_STEP_DEGREES = 0.00025;

let simulationWaypoints: Position[] = [...SIM_DEFAULT_WAYPOINTS];
let simulationCurrent: Position = { ...SIM_DEFAULT_WAYPOINTS[0] };
let simulationIndex = 0;
let simulationTimer: number | null = null;
let simulationActive = false;
let simulationForced = false;
let simulationStatus = 'Simulated patrol route';
let simulationSeq = Date.now();

const broadcastChannel = typeof window !== 'undefined' && 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL_NAME) : null;
const storageKey = 'c2dev-sim-sync';
const hasStorage = typeof window !== 'undefined' && typeof window.addEventListener === 'function' && 'localStorage' in window;

interface SimulationSyncMessage {
  source: string;
  type: 'state' | 'command';
  payload: unknown;
  timestamp: number;
}

const instanceId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `sim-${Math.random().toString(36).slice(2)}`;
let suppressIncoming = false;

function withSuppressed<T>(fn: () => T): T {
  suppressIncoming = true;
  try {
    return fn();
  } finally {
    suppressIncoming = false;
  }
}

function broadcastSync(type: SimulationSyncMessage['type'], payload: unknown): void {
  if (suppressIncoming) return;
  const message: SimulationSyncMessage = {
    source: instanceId,
    type,
    payload,
    timestamp: Date.now()
  };

  if (broadcastChannel) {
    broadcastChannel.postMessage(message);
    return;
  }

  if (hasStorage) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(message));
      window.localStorage.removeItem(storageKey);
    } catch (error) {
      console.warn('[Simulator] Failed to broadcast via storage', error);
    }
  }
}

function handleIncomingSync(message: SimulationSyncMessage): void {
  if (!message || message.source === instanceId) return;
  if (message.type === 'state') {
    const incoming = message.payload as {
      current: Position;
      waypoints: Position[];
      index: number;
      status: string;
      seq: number;
      active: boolean;
      telemetry: TelemetryMessage;
    };
    if (!incoming) return;
    withSuppressed(() => {
      simulationCurrent = incoming.current ? { ...incoming.current } : { ...SIM_DEFAULT_WAYPOINTS[0] };
      simulationWaypoints = Array.isArray(incoming.waypoints) && incoming.waypoints.length > 0 ? incoming.waypoints.map((point) => ({ ...point })) : [...SIM_DEFAULT_WAYPOINTS];
      simulationIndex = Number.isFinite(incoming.index) ? Math.max(Math.min(incoming.index, simulationWaypoints.length - 1), 0) : 0;
      simulationStatus = typeof incoming.status === 'string' ? incoming.status : simulationStatus;
      simulationSeq = Number.isFinite(incoming.seq) ? incoming.seq : simulationSeq;
      simulationActive = Boolean(incoming.active);
      if (incoming.active) {
        stateStore.set('connected');
      }
      if (incoming.telemetry) {
        applyTelemetry({ ...incoming.telemetry, robotId: SIM_ROBOT_ID });
        upsertRobot({
          id: SIM_ROBOT_ID,
          controllable: true,
          position: incoming.telemetry.position ? { ...incoming.telemetry.position } : { ...simulationCurrent },
          heading: incoming.telemetry.heading,
          speed: incoming.telemetry.speed,
          status: incoming.telemetry.status ?? simulationStatus,
          lastSeen: incoming.telemetry.lastSeen,
          type: incoming.telemetry.type ?? 'UAV',
          extra: { simulated: true }
        });
      }
      updateSimulationModeSnapshot();
    });
    logSimulator('Applied simulation state from peer', {
      active: simulationActive,
      waypointCount: simulationWaypoints.length,
      index: simulationIndex
    });
  } else if (message.type === 'command') {
    const incoming = message.payload as Command;
    if (!incoming || !incoming.robotId) return;
    withSuppressed(() => {
      if (incoming.robotId === SIM_ROBOT_ID) {
        handleSimulationCommand(incoming);
      }
    });
  }
}

if (typeof window !== 'undefined') {
  if (broadcastChannel) {
    broadcastChannel.addEventListener('message', (event: MessageEvent<SimulationSyncMessage>) => handleIncomingSync(event.data));
    window.addEventListener('beforeunload', () => broadcastChannel.close(), { once: true });
  } else if (hasStorage) {
    window.addEventListener('storage', (event: StorageEvent) => {
      if (event.key !== storageKey || !event.newValue) return;
      try {
        const data = JSON.parse(event.newValue) as SimulationSyncMessage;
        handleIncomingSync(data);
      } catch (error) {
        console.warn('[Simulator] Failed to parse incoming storage event', error);
      }
    });
  }
}

function updateSimulationModeSnapshot(): void {
  simulationModeStore.set({ active: simulationActive, forced: simulationForced });
}

export function addMessageListener(listener: TelemetryListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyListeners(message: TelemetryMessage): void {
  listeners.forEach((listener) => listener(message));
}

function clearRealtimeChannel(): void {
  if (telemetryChannel) {
    supabaseClient.removeChannel(telemetryChannel);
    telemetryChannel = null;
  }
}

function parsePosition(value: unknown): Position | undefined {
  if (!value) return undefined;

  if (typeof value === 'string') {
    const wktMatch = value.match(/POINT\s*\(([-0-9.]+) ([-0-9.]+)(?: ([-0-9.]+))?\)/i);
    if (wktMatch) {
      const lon = Number(wktMatch[1]);
      const lat = Number(wktMatch[2]);
      const alt = wktMatch[3] ? Number(wktMatch[3]) : undefined;
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        return {
          lat,
          lon,
          alt: Number.isFinite(alt ?? NaN) ? (alt as number) : undefined
        };
      }
    }
    try {
      const parsed = JSON.parse(value);
      return parsePosition(parsed);
    } catch (error) {
      console.warn('[Realtime] Failed to parse geometry string', error);
    }
    return undefined;
  }

  if (typeof value === 'object') {
    const maybeGeo = value as { coordinates?: number[]; lat?: number; lon?: number; lng?: number; latitude?: number; longitude?: number; altitude?: number; alt?: number };
    if (Array.isArray(maybeGeo.coordinates) && maybeGeo.coordinates.length >= 2) {
      const [lon, lat, alt] = maybeGeo.coordinates;
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        return {
          lat,
          lon,
          alt: Number.isFinite(alt ?? NaN) ? (alt as number) : undefined
        };
      }
    }
    const lat = Number.isFinite(maybeGeo.lat) ? (maybeGeo.lat as number) : Number.isFinite(maybeGeo.latitude) ? (maybeGeo.latitude as number) : undefined;
    const lon = Number.isFinite(maybeGeo.lon) ? (maybeGeo.lon as number) : Number.isFinite(maybeGeo.lng) ? (maybeGeo.lng as number) : Number.isFinite(maybeGeo.longitude) ? (maybeGeo.longitude as number) : undefined;
    const alt = Number.isFinite(maybeGeo.alt) ? (maybeGeo.alt as number) : Number.isFinite(maybeGeo.altitude) ? (maybeGeo.altitude as number) : undefined;
    if (lat !== undefined && lon !== undefined) {
      return {
        lat,
        lon,
        alt
      };
    }
  }

  return undefined;
}

function mapTelemetry(row: TelemetryRow): TelemetryMessage | null {
  const robotId = typeof row.robot_id === 'string' ? row.robot_id : undefined;
  if (!robotId) return null;

  const telemetry: TelemetryMessage = {
    msgType: 'telemetry',
    robotId,
    seq: Number.isFinite(row.id) ? Number(row.id) : Date.now(),
    position: parsePosition(row.position),
    heading: typeof row.heading === 'number' ? row.heading : undefined,
    speed: typeof row.speed === 'number' ? row.speed : undefined,
    status: typeof row.status === 'string' ? row.status : undefined,
    lastSeen: typeof row.timestamp === 'string' ? row.timestamp : undefined,
    serverReceived:
      typeof row.server_received === 'string'
        ? row.server_received
        : typeof row.timestamp === 'string'
          ? row.timestamp
          : new Date().toISOString()
  };

  if (typeof row.type === 'string') {
    telemetry.type = row.type as TelemetryMessage['type'];
  }

  return telemetry;
}

export function connectRealtime(): void {
  if (typeof window === 'undefined') return;
  if (simulationForced) {
    logRealtime('Skipping realtime connection because simulator override is active');
    startSimulation({ forced: true });
    return;
  }
  if (telemetryChannel) {
    logRealtime('Already subscribed to Supabase Realtime; skipping duplicate connect');
    return;
  }

  stateStore.set('connecting');
  logRealtime('Connecting to Supabase Realtime…');

  telemetryChannel = supabaseClient
    .channel('c2dev-telemetry')
    .on<TelemetryRow>(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: TELEMETRY_TABLE },
      (payload: RealtimePostgresInsertPayload<TelemetryRow>) => {
        const row = payload.new ?? {};
        logRealtime('Received realtime telemetry event', {
          table: TELEMETRY_TABLE,
          id: (row as { id?: number }).id
        });
        const telemetry = mapTelemetry(row);
        if (telemetry) {
          notifyListeners(telemetry);
          applyTelemetry(telemetry);
        } else {
          warnRealtime('Telemetry payload missing robot_id; ignoring event', row);
        }
      }
    )
    .subscribe((status: string, err?: { message?: string }) => {
      if (status === 'SUBSCRIBED') {
        stateStore.set('connected');
        logRealtime('Realtime subscription established; stopping simulator fallback if active');
        simulationForced = false;
        stopSimulation();
        updateSimulationModeSnapshot();
      } else if (status === 'CHANNEL_ERROR') {
        warnRealtime('Supabase realtime channel error; enabling simulator fallback', err);
        clearRealtimeChannel();
        stateStore.set('error');
        startSimulation();
      } else if (status === 'TIMED_OUT') {
        warnRealtime('Supabase realtime subscription timed out; enabling simulator fallback');
        clearRealtimeChannel();
        stateStore.set('error');
        startSimulation();
      } else if (status === 'CLOSED') {
        logRealtime('Supabase realtime channel closed by server');
        clearRealtimeChannel();
        stateStore.set('disconnected');
      }
    });
}

export function disconnectRealtime(): void {
  if (telemetryChannel) {
    clearRealtimeChannel();
    logRealtime('Realtime subscription cancelled by client');
  }
  stateStore.set('disconnected');
  logRealtime('Realtime disconnected; starting simulator fallback');
  startSimulation({ forced: simulationForced });
}

export async function sendCommand(command: Command): Promise<void> {
  if (simulationActive && command.robotId === SIM_ROBOT_ID) {
    logSimulator('Routing command to simulator', {
      commandType: command.commandType,
      commandId: command.id
    });
    handleSimulationCommand(command);
    broadcastSync('command', command);
    return;
  }

  const documentId = command.id || crypto.randomUUID();
  const payload = {
    id: documentId,
    robot_id: command.robotId,
    command_type: command.commandType,
    payload: command.payload,
    status: command.status,
    issued_by: command.issuedBy,
    issued_at: command.issuedAt
  };

  const { error } = await supabaseClient.from(COMMANDS_TABLE).insert(payload);
  if (error) {
    warnRealtime('Failed to send command via Supabase', error);
    throw error;
  }
}

export function enableSimulationMode(): void {
  if (typeof window === 'undefined') return;
  logSimulator('Operator enabled manual simulation override');
  simulationForced = true;
  if (telemetryChannel) {
    clearRealtimeChannel();
    logRealtime('Realtime subscription cancelled for simulator override');
  }
  stateStore.set('connected');
  startSimulation({ forced: true });
}

export function disableSimulationMode(): void {
  if (typeof window === 'undefined') return;
  if (!simulationForced) {
    logSimulator('Manual simulation override already inactive');
    return;
  }
  logSimulator('Operator disabled manual simulation override; reconnecting realtime');
  simulationForced = false;
  stopSimulation();
  stateStore.set('disconnected');
  connectRealtime();
}

function startSimulation(options: { forced?: boolean } = {}): void {
  if (typeof window === 'undefined') {
    return;
  }

  const { forced = false } = options;

  if (simulationActive) {
    simulationForced = simulationForced || forced;
    stateStore.set('connected');
    updateSimulationModeSnapshot();
    logSimulator('Simulation already active; ignoring redundant start request', {
      forcedRequest: forced,
      simulationForced
    });
    return;
  }

  simulationForced = forced;
  simulationActive = true;
  stateStore.set('connected');
  simulationWaypoints = simulationWaypoints.length > 0 ? [...simulationWaypoints] : [...SIM_DEFAULT_WAYPOINTS];
  simulationCurrent = { ...(simulationWaypoints[0] ?? SIM_DEFAULT_WAYPOINTS[0]) };
  simulationIndex = simulationWaypoints.length > 1 ? 1 : 0;
  simulationStatus = 'Simulated patrol route';
  logSimulator('Starting simulation fallback', {
    waypoints: simulationWaypoints.length,
    start: simulationCurrent,
    forced
  });

  upsertRobot({
    id: SIM_ROBOT_ID,
    name: 'Simulated Patrol UAV',
    type: 'UAV',
    controllable: true,
    status: simulationStatus,
    position: { ...simulationCurrent },
    heading: 0,
    speed: 0,
    lastSeen: new Date().toISOString(),
    extra: { simulated: true }
  });

  simulationTimer = window.setInterval(stepSimulation, SIMULATION_TICK_MS);
  stepSimulation();
  updateSimulationModeSnapshot();
}

function stopSimulation(): void {
  if (!simulationActive) return;
  simulationActive = false;
  logSimulator('Stopping simulation fallback');
  if (simulationTimer) {
    window.clearInterval(simulationTimer);
    simulationTimer = null;
  }
  updateSimulationModeSnapshot();
}

function handleSimulationCommand(command: Command): void {
  if (!simulationActive) return;

  if (command.commandType === 'assign_waypoint') {
    const waypoints = Array.isArray((command.payload as { waypoints?: Position[] })?.waypoints)
      ? ((command.payload as { waypoints?: Position[] }).waypoints as Position[])
      : [];
    if (waypoints.length > 0) {
      simulationWaypoints = waypoints.map((wp) => ({ lat: Number(wp.lat), lon: Number(wp.lon), alt: wp.alt }));
      simulationIndex = 0;
      simulationStatus = 'Executing assigned waypoint';
      logSimulator('Simulator received new waypoint assignment', {
        count: simulationWaypoints.length
      });
    }
  } else if (command.commandType === 'follow_robot') {
    const targetId = (command.payload as { targetRobotId?: string })?.targetRobotId ?? 'unknown';
    simulationStatus = `Following ${targetId}`;
    logSimulator('Simulator switching to follow target', { targetId });
  } else if (command.commandType === 'request_camera_stream') {
    simulationStatus = 'Streaming camera feed';
    logSimulator('Simulator received camera stream request');
  }
}

function stepSimulation(): void {
  if (!simulationActive || simulationWaypoints.length === 0) return;

  const target = simulationWaypoints[simulationIndex] ?? simulationWaypoints[0];
  if (!target) return;

  const dLat = target.lat - simulationCurrent.lat;
  const dLon = target.lon - simulationCurrent.lon;
  const distance = Math.sqrt(dLat * dLat + dLon * dLon);

  let nextPosition: Position = simulationCurrent;
  let reachedTarget = false;

  if (distance <= SIMULATION_STEP_DEGREES || distance === 0) {
    nextPosition = { ...target };
    reachedTarget = true;
  } else {
    const ratio = SIMULATION_STEP_DEGREES / distance;
    nextPosition = {
      lat: simulationCurrent.lat + dLat * ratio,
      lon: simulationCurrent.lon + dLon * ratio,
      alt: target.alt ?? simulationCurrent.alt
    };
  }

  const headingRadians = Math.atan2(dLon, dLat);
  const heading = Number.isNaN(headingRadians) ? 0 : ((headingRadians * 180) / Math.PI + 360) % 360;
  const speedMetersPerSecond = (SIMULATION_STEP_DEGREES * 111139) / (SIMULATION_TICK_MS / 1000);
  const timestamp = new Date().toISOString();

  simulationCurrent = nextPosition;

  if (reachedTarget) {
    simulationIndex = (simulationIndex + 1) % simulationWaypoints.length;
    logSimulator('Reached waypoint; advancing to next target', {
      nextIndex: simulationIndex,
      looped: simulationIndex === 0
    });
  }

  upsertRobot({
    id: SIM_ROBOT_ID,
    controllable: true,
    position: { ...simulationCurrent },
    heading,
    speed: speedMetersPerSecond,
    status: simulationStatus,
    lastSeen: timestamp,
    type: 'UAV',
    extra: { simulated: true }
  });

  const telemetry: TelemetryMessage = {
    msgType: 'telemetry',
    robotId: SIM_ROBOT_ID,
    seq: simulationSeq++,
    position: { ...simulationCurrent },
    heading,
    speed: speedMetersPerSecond,
    status: simulationStatus,
    type: 'UAV',
    lastSeen: timestamp,
    serverReceived: timestamp
  };

  applyTelemetry(telemetry);
  debugSimulator('Simulation tick', { position: simulationCurrent, heading, speed: speedMetersPerSecond });

  broadcastSync('state', {
    current: { ...simulationCurrent },
    waypoints: simulationWaypoints.map((point) => ({ ...point })),
    index: simulationIndex,
    status: simulationStatus,
    seq: simulationSeq,
    active: simulationActive,
    telemetry
  });

  notifyListeners(telemetry);
}
