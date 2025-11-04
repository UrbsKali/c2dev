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
