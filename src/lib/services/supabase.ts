import { createClient } from '@supabase/supabase-js';
import type { Mission } from '$types';
import type { UserProfile } from '$stores/user';

const supabaseUrl =
  import.meta.env.PUBLIC_SUPABASE_URL ??
  import.meta.env.VITE_SUPABASE_URL ??
  'http://localhost:54321';
const supabaseAnonKey =
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.PUBLIC_SUPABASE_KEY ??
  import.meta.env.VITE_SUPABASE_KEY ??
  'public-anon-key';

export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: typeof window !== 'undefined'
  }
});

export const PROFILES_TABLE = 'profiles';
export const MISSIONS_TABLE = 'missions';
export const MISSION_ASSIGNMENTS_TABLE = 'mission_assignments';
export const ROBOTS_TABLE = 'robots';
export const TELEMETRY_TABLE = 'telemetry_points';
export const COMMANDS_TABLE = 'commands';

const MISSION_SELECT = `
  id,
  title,
  briefing,
  status,
  created_by,
  created_at,
  updated_at,
  mission_assignments (
    operator_id,
    robot_id
  )
`;

type MissionAssignmentRow = {
  operator_id: string | null;
  robot_id: string | null;
};

type MissionRow = {
  id: string;
  title: string | null;
  briefing: string | null;
  status: Mission['status'] | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  mission_assignments?: MissionAssignmentRow[] | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  role: string | null;
};

type RobotRow = {
  id: string;
  owner: string | null;
};

type RobotDirectoryRow = {
  id: string;
  owner?: string | null;
  name?: string | null;
  call_sign?: string | null;
  callsign?: string | null;
  type?: string | null;
  status?: string | null;
};

export interface MissionRobot {
  id: string;
  label: string;
  ownerId?: string;
  type?: string;
  status?: string;
}

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(
    values
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .reduce((set, value) => set.add(value), new Set<string>())
  );
}

function mapMission(row: MissionRow): Mission {
  const assignments = row.mission_assignments ?? [];
  const operatorIds = unique(assignments.map((assignment) => assignment.operator_id));
  const robotIds = unique(assignments.map((assignment) => assignment.robot_id));
  const roster = assignments.map((entry) => ({
    operatorId: entry.operator_id,
    robotId: entry.robot_id
  }));

  return {
    id: row.id,
    title: row.title ?? 'Untitled Mission',
    briefing: row.briefing ?? '',
    status: row.status ?? 'draft',
    assignedOperators: operatorIds,
    assignedRobots: robotIds,
    assignments: roster,
    ownerId: row.created_by ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined
  };
}

async function loadRobotAssignments(userIds: string[]): Promise<Map<string, string[]>> {
  const assignments = new Map<string, string[]>();
  if (userIds.length === 0) return assignments;

  const { data, error } = await supabaseClient
    .from(ROBOTS_TABLE)
    .select('id, owner')
    .in('owner', userIds);

  if (error) {
    console.warn('Supabase robot assignment lookup fallback', error);
    return assignments;
  }

  const rows = (data ?? []) as RobotRow[];

  for (const row of rows) {
    if (!row.owner) continue;
    const list = assignments.get(row.owner) ?? [];
    list.push(row.id);
    assignments.set(row.owner, list);
  }

  return assignments;
}

function mapProfile(row: ProfileRow, robots: Map<string, string[]>): UserProfile {
  return {
    id: row.id,
    name: row.display_name ?? 'Mission Operator',
    role: (row.role as UserProfile['role']) ?? 'operator',
    assignedRobots: robots.get(row.id) ?? []
  };
}

function mapDirectoryRobot(row: RobotDirectoryRow): MissionRobot {
  const labelCandidate =
    row.name ?? row.call_sign ?? row.callsign ?? (row.id ? `Robot ${row.id}` : 'Robot');
  return {
    id: row.id,
    label: labelCandidate,
    ownerId: row.owner ?? undefined,
    type: (row.type as string | undefined) ?? undefined,
    status: (row.status as string | undefined) ?? undefined
  };
}

async function fetchMissionById(missionId: string): Promise<Mission | null> {
  const { data, error } = await supabaseClient
    .from(MISSIONS_TABLE)
    .select(MISSION_SELECT)
    .eq('id', missionId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapMission(data as MissionRow) : null;
}

export const supabaseAuth = {
  async getCurrentUser(): Promise<UserProfile | null> {
    try {
      const { data, error } = await supabaseClient.auth.getUser();
      if (error || !data.user) {
        if (error) console.warn('Supabase auth getUser fallback', error);
        return null;
      }

      const { data: profileRow, error: profileError } = await supabaseClient
        .from(PROFILES_TABLE)
        .select('id, display_name, role')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profileError && profileError.code !== 'PGRST116') {
        console.warn('Supabase profile lookup fallback', profileError);
      }

      const resolvedProfile: ProfileRow =
        profileRow ?? {
          id: data.user.id,
          display_name:
            (data.user.user_metadata?.name as string | undefined) ?? data.user.email ?? 'Mission Operator',
          role: (data.user.user_metadata?.role as string | undefined) ?? 'operator'
        };

      const robots = await loadRobotAssignments([resolvedProfile.id]);
      return mapProfile(resolvedProfile, robots);
    } catch (error) {
      console.warn('Supabase auth getCurrentUser fallback', error);
      return null;
    }
  },
  async login(email: string, password: string): Promise<UserProfile> {
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const user = await this.getCurrentUser();
    if (!user) throw new Error('Failed to fetch user profile');
    return user;
  },
  async logout(): Promise<void> {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
      console.warn('Supabase logout fallback', error);
    }
  },
  async updateProfile(updates: { name?: string }): Promise<UserProfile> {
    const { data, error } = await supabaseClient.auth.getUser();
    if (error || !data.user) throw new Error('Not authenticated');

    const userId = data.user.id;

    if (typeof updates.name === 'string' && updates.name.trim().length > 0) {
      const trimmedName = updates.name.trim();
      const { data: existingProfile, error: profileError } = await supabaseClient
        .from(PROFILES_TABLE)
        .select('role')
        .eq('id', userId)
        .maybeSingle();

      if (profileError && profileError.code !== 'PGRST116') {
        throw profileError;
      }

      const role = existingProfile?.role ?? (data.user.user_metadata?.role as string | undefined) ?? 'operator';

      const { error: upsertError } = await supabaseClient.from(PROFILES_TABLE).upsert(
        {
          id: userId,
          display_name: trimmedName,
          role
        }
      );

      if (upsertError) throw upsertError;
    }

    const profile = await this.getCurrentUser();
    if (!profile) throw new Error('Failed to refresh profile');
    return profile;
  },
  async updatePassword(newPassword: string): Promise<void> {
    if (newPassword.length < 12) {
      throw new Error('Le mot de passe doit contenir au moins 12 caractères.');
    }

    const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }
};

function missionFallback(): Mission {
  return {
    id: 'sim-mission',
    title: 'Simulation Patrol North Sector',
    briefing: `### Patrol Overview\n\n- Primary Objective: Maintain situational awareness across the north sector industrial zone.\n- Secondary Objective: Validate sensor calibration and relay anomalies to command.\n- Rules of Engagement: Observe and report. Autonomous intervention requires commander approval.`,
    assignedOperators: [],
    assignedRobots: [],
    assignments: [],
    status: 'draft'
  };
}

export const supabaseMissions = {
  async getActiveMission(): Promise<Mission | null> {
    try {
      const { data, error } = await supabaseClient
        .from(MISSIONS_TABLE)
        .select(MISSION_SELECT)
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data ? mapMission(data as MissionRow) : null;
    } catch (error) {
      console.warn('Supabase missions fallback', error);
      return missionFallback();
    }
  },
  async getMissionById(id: string): Promise<Mission | null> {
    try {
      return await fetchMissionById(id);
    } catch (error) {
      console.warn('Supabase mission by id fallback', error);
      return null;
    }
  }
};

export interface MissionDraft
  extends Pick<Mission, 'title' | 'briefing' | 'assignedOperators' | 'assignedRobots' | 'status'> {
  assignments?: Array<{ operatorId: string | null; robotId: string | null }>;
  ownerId?: string;
}

export const missionAdminService = {
  async listMissions(): Promise<Mission[]> {
    try {
      const { data, error } = await supabaseClient
        .from(MISSIONS_TABLE)
        .select(MISSION_SELECT)
        .order('created_at', { ascending: false })
        .limit(24);

      if (error) throw error;
      return ((data ?? []) as MissionRow[]).map(mapMission);
    } catch (error) {
      console.warn('Supabase listMissions fallback', error);
      return [missionFallback()];
    }
  },
  async listUsersByRole(role: UserProfile['role']): Promise<UserProfile[]> {
    try {
      const { data, error } = await supabaseClient
        .from(PROFILES_TABLE)
        .select('id, display_name, role')
        .eq('role', role);

      if (error) throw error;

      const rows: ProfileRow[] = (data ?? []) as ProfileRow[];
      const robots = await loadRobotAssignments(rows.map((row) => row.id));
      return rows.map((row) => mapProfile(row, robots));
    } catch (error) {
      console.warn('Supabase listUsersByRole fallback', error);
      return [];
    }
  },
  async listMissionRobots(): Promise<MissionRobot[]> {
    try {
      const { data, error } = await supabaseClient.from(ROBOTS_TABLE).select();
      if (error) throw error;
      const rows: RobotDirectoryRow[] = (data ?? []) as RobotDirectoryRow[];
      return rows.map(mapDirectoryRobot);
    } catch (error) {
      console.warn('Supabase listMissionRobots fallback', error);
      return [];
    }
  },
  async createMission(draft: MissionDraft): Promise<Mission> {
    try {
      const initialRosterSource =
        draft.assignments && draft.assignments.length > 0
          ? draft.assignments
          : [
              ...draft.assignedOperators.map((operatorId) => ({ operatorId, robotId: null })),
              ...draft.assignedRobots.map((robotId) => ({ operatorId: null, robotId }))
            ];

      const normalizedRoster = initialRosterSource.map((entry) => ({
        operatorId: entry.operatorId ?? null,
        robotId: entry.robotId ?? null
      }));
      const rosterOperators = unique(normalizedRoster.map((entry) => entry.operatorId));
      const rosterRobots = unique(normalizedRoster.map((entry) => entry.robotId));

      const { data, error } = await supabaseClient
        .from(MISSIONS_TABLE)
        .insert({
          title: draft.title,
          briefing: draft.briefing,
          status: draft.status,
          created_by: draft.ownerId ?? null
        })
        .select('id')
        .single();

      if (error) throw error;
      let mission: Mission | null = null;
      if (data?.id) {
        try {
          await this.updateMissionAssignments(data.id, normalizedRoster);
        } catch (assignmentError) {
          console.warn('Supabase createMission assignment sync fallback', assignmentError);
        }
        mission = await fetchMissionById(data.id);
      }
      if (mission) return mission;
      return {
        id: data?.id ?? `draft-${crypto.randomUUID()}`,
        title: draft.title,
        briefing: draft.briefing,
        assignedOperators: rosterOperators,
        assignedRobots: rosterRobots,
        assignments: normalizedRoster,
        status: draft.status,
        ownerId: draft.ownerId,
        createdAt: new Date().toISOString()
      };
    } catch (error) {
      console.warn('Supabase createMission fallback', error);
      const fallbackAssignments =
        draft.assignments && draft.assignments.length > 0
          ? draft.assignments.map((entry) => ({
              operatorId: entry.operatorId ?? null,
              robotId: entry.robotId ?? null
            }))
          : [
              ...draft.assignedOperators.map((operatorId) => ({ operatorId, robotId: null })),
              ...draft.assignedRobots.map((robotId) => ({ operatorId: null, robotId }))
            ];
      const fallbackOperators = unique(fallbackAssignments.map((entry) => entry.operatorId));
      const fallbackRobots = unique(fallbackAssignments.map((entry) => entry.robotId));
      return {
        id: `draft-${crypto.randomUUID()}`,
        title: draft.title,
        briefing: draft.briefing,
        assignedOperators: fallbackOperators,
        assignedRobots: fallbackRobots,
        assignments: fallbackAssignments,
        status: draft.status,
        ownerId: draft.ownerId,
        createdAt: new Date().toISOString()
      };
    }
  },
  async updateMissionAssignments(
    missionId: string,
    assignments: Array<{ operatorId: string | null; robotId: string | null }>
  ): Promise<Mission | null> {
    try {
      await supabaseClient
        .from(MISSION_ASSIGNMENTS_TABLE)
        .delete()
        .eq('mission_id', missionId);

      const rows = assignments
        .filter((entry) => entry.operatorId || entry.robotId)
        .map((entry) => ({
          mission_id: missionId,
          operator_id: entry.operatorId ?? null,
          robot_id: entry.robotId ?? null
        }));

      if (rows.length > 0) {
        const { error: insertError } = await supabaseClient.from(MISSION_ASSIGNMENTS_TABLE).insert(rows);
        if (insertError) throw insertError;
      }

      return await fetchMissionById(missionId);
    } catch (error) {
      console.warn('Supabase updateMissionAssignments fallback', error);
      return null;
    }
  },
  async updateMissionStatus(missionId: string, status: Mission['status']): Promise<Mission | null> {
    try {
      const { error } = await supabaseClient
        .from(MISSIONS_TABLE)
        .update({ status })
        .eq('id', missionId);

      if (error) throw error;
      return await fetchMissionById(missionId);
    } catch (error) {
      console.warn('Supabase updateMissionStatus fallback', error);
      return null;
    }
  },
  async promoteToMissionCommander(userId: string): Promise<void> {
    try {
      const { error } = await supabaseClient
        .from(PROFILES_TABLE)
        .update({ role: 'mission_commander' })
        .eq('id', userId);
      if (error) throw error;
    } catch (error) {
      console.warn('Supabase promoteToMissionCommander fallback', error);
    }
  }
};
