export interface Position {
  lat: number;
  lon: number;
  alt?: number;
}

export type APP6ERole = 'INF' | 'ARM' | 'ENG' | 'UAV' | 'UUV' | 'SPT' | 'OTHER';

export interface Robot {
  id: string;
  name?: string;
  type: APP6ERole;
  position?: Position;
  trail?: Position[];
  heading?: number;
  speed?: number;
  status?: string;
  lastSeen?: string;
  serverReceived?: string;
  controllable: boolean;
  /** Battery level, percent (0-100). */
  battery?: number;
  /** Id of the control profile the robot announces (see teleop/registry). */
  controlProfileId?: string;
  owner?: string;
  icon?: string;
  extra?: Record<string, unknown>;
}

export interface Mission {
  id: string;
  title: string;
  briefing: string;
  assignedOperators: string[];
  assignedRobots: string[];
  assignments: Array<{ operatorId: string | null; robotId: string | null }>;
  status: 'draft' | 'active' | 'completed' | 'aborted';
  ownerId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Command {
  id: string;
  issuedBy: string;
  robotId: string;
  commandType: string;
  payload: unknown;
  status: 'queued' | 'accepted' | 'executing' | 'completed' | 'failed';
  issuedAt: string;
}

export interface TelemetryMessage {
  msgType: 'telemetry';
  robotId: string;
  seq: number;
  position?: Position;
  heading?: number;
  speed?: number;
  type?: APP6ERole;
  status?: string;
  battery?: number;
  controlProfileId?: string;
  controlDescriptor?: unknown;
  lastSeen?: string;
  serverReceived?: string;
  [key: string]: unknown;
}

export interface CommandMessage {
  msgType: 'command';
  commandId: string;
  robotId: string;
  command: string;
  payload: unknown;
  issuedBy: string;
  issuedAt: string;
}

export type EventSeverity = 'info' | 'warning' | 'critical' | 'error';

export interface RobotEvent {
  id: string;
  robotId?: string;
  severity: EventSeverity;
  title: string;
  message?: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  createdAt: string;
}

export interface TeleopPayload {
  linear: { x: number; y: number; z: number };
  angular: { x: number; y: number; z: number };
  source: 'keyboard' | 'gamepad' | 'ui' | 'custom';
  speedFactor?: number;
  raw?: Record<string, unknown>;
}
