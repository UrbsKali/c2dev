import { Account, Client, Databases, ID, Query } from 'appwrite';
import type { Mission } from '$types';
import type { UserProfile } from '$stores/user';

const endpoint =
  import.meta.env.PUBLIC_APPWRITE_ENDPOINT ??
  import.meta.env.VITE_APPWRITE_ENDPOINT ??
  'http://localhost/v1';
const project =
  import.meta.env.PUBLIC_APPWRITE_PROJECT_ID ??
  import.meta.env.VITE_APPWRITE_PROJECT_ID ??
  'rcc-dev';
const projectName =
  import.meta.env.PUBLIC_APPWRITE_PROJECT_NAME ??
  import.meta.env.VITE_APPWRITE_PROJECT_NAME ??
  'Robot Command Center';

const client = new Client();
client.setEndpoint(endpoint).setProject(project);

const account = new Account(client);
const databases = new Databases(client);

export const APPWRITE_DATABASE_ID = 'c2';
export const MISSIONS_COLLECTION = 'missions';
export const appwriteClient = client;
export const appwriteDatabases = databases;
export const TELEMETRY_COLLECTION = 'telemetry_points';
export const COMMANDS_COLLECTION = 'commands';

function mapUserDoc(doc: Record<string, unknown>): UserProfile {
  return {
    id: String(doc.$id ?? 'unknown-user'),
    name: String(doc.name ?? 'Unknown Operator'),
    role: (doc.role as UserProfile['role']) ?? 'operator',
    assignedRobots: (doc.assignedRobots as string[]) ?? []
  };
}

export const appwriteAuth = {
  async getCurrentUser(): Promise<UserProfile | null> {
    try {
      const session = await account.get();
      return mapUserDoc({
        $id: session.$id,
        name: session.name ?? session.email ?? projectName,
        role: (session.prefs as Record<string, unknown>)?.role ?? 'operator',
        assignedRobots: (session.prefs as Record<string, unknown>)?.assignedRobots as string[]
      });
    } catch (error) {
      console.warn('Appwrite auth getCurrentUser fallback', error);
      return null;
    }
  },
  async login(email: string, password: string): Promise<UserProfile> {
    await account.createEmailPasswordSession(email, password);
    const user = await this.getCurrentUser();
    if (!user) throw new Error('Failed to fetch user profile');
    return user;
  },
  async logout(): Promise<void> {
    try {
      await account.deleteSession('current');
    } catch (error) {
      console.warn('Appwrite logout fallback', error);
    }
  }
};

export const appwriteMissions = {
  async getActiveMission(): Promise<Mission | null> {
    try {
      const response = await databases.listDocuments(APPWRITE_DATABASE_ID, MISSIONS_COLLECTION, [
        Query.equal('status', 'active'),
        Query.limit(1)
      ]);
      if (response.documents.length === 0) return null;
      return response.documents[0] as unknown as Mission;
    } catch (error) {
      console.warn('Appwrite missions fallback', error);
      return {
        id: 'sim-mission',
        title: 'Simulation Patrol North Sector',
        briefing: `### Patrol Overview\n\n- Primary Objective: Maintain situational awareness across the north sector industrial zone.\n- Secondary Objective: Validate sensor calibration and relay anomalies to command.\n- Rules of Engagement: Observe and report. Autonomous intervention requires commander approval.`,
        assignedOperators: [],
        assignedRobots: [],
        status: 'draft'
      };
    }
  },
  async getMissionById(id: string): Promise<Mission | null> {
    try {
      const document = await databases.getDocument(APPWRITE_DATABASE_ID, MISSIONS_COLLECTION, id);
      return document as unknown as Mission;
    } catch (error) {
      console.warn('Appwrite mission by id fallback', error);
      return null;
    }
  }
};

export interface MissionDraft
  extends Pick<Mission, 'title' | 'briefing' | 'assignedOperators' | 'assignedRobots' | 'status'> {
  ownerId?: string;
}

export const APPWRITE_ROLES_COLLECTION = 'roles';

export const missionAdminService = {
  async listMissions(): Promise<Mission[]> {
    try {
      const response = await databases.listDocuments(APPWRITE_DATABASE_ID, MISSIONS_COLLECTION, [
        Query.orderDesc('$createdAt'),
        Query.limit(24)
      ]);
      return response.documents as unknown as Mission[];
    } catch (error) {
      console.warn('Appwrite listMissions fallback', error);
      return [
        {
          id: 'sim-mission',
          title: 'Simulation Patrol North Sector',
          briefing: 'Fallback mission briefing',
          assignedOperators: [],
          assignedRobots: [],
          status: 'draft',
          createdAt: new Date().toISOString()
        }
      ];
    }
  },
  async listUsersByRole(role: UserProfile['role']): Promise<UserProfile[]> {
    try {
      const response = await databases.listDocuments(APPWRITE_DATABASE_ID, APPWRITE_ROLES_COLLECTION, [
        Query.equal('role', role)
      ]);
      return response.documents.map((doc) => mapUserDoc(doc as Record<string, unknown>));
    } catch (error) {
      console.warn('Appwrite listUsersByRole fallback', error);
      return [];
    }
  },
  async createMission(draft: MissionDraft): Promise<Mission> {
    try {
      const document = await databases.createDocument(APPWRITE_DATABASE_ID, MISSIONS_COLLECTION, ID.unique(), {
        title: draft.title,
        briefing: draft.briefing,
        assignedOperators: draft.assignedOperators,
        assignedRobots: draft.assignedRobots,
        status: draft.status,
        ownerId: draft.ownerId,
        createdAt: new Date().toISOString()
      });
      return document as unknown as Mission;
    } catch (error) {
      console.warn('Appwrite createMission fallback', error);
      return {
        id: `draft-${crypto.randomUUID()}`,
        title: draft.title,
        briefing: draft.briefing,
        assignedOperators: draft.assignedOperators,
        assignedRobots: draft.assignedRobots,
        status: draft.status,
        ownerId: draft.ownerId,
        createdAt: new Date().toISOString()
      };
    }
  },
  async assignUsersToMission(missionId: string, operatorIds: string[]): Promise<Mission | null> {
    try {
      const document = await databases.updateDocument(APPWRITE_DATABASE_ID, MISSIONS_COLLECTION, missionId, {
        assignedOperators: operatorIds
      });
      return document as unknown as Mission;
    } catch (error) {
      console.warn('Appwrite assignUsersToMission fallback', error);
      return null;
    }
  },
  async updateMissionStatus(missionId: string, status: Mission['status']): Promise<Mission | null> {
    try {
      const document = await databases.updateDocument(APPWRITE_DATABASE_ID, MISSIONS_COLLECTION, missionId, {
        status
      });
      return document as unknown as Mission;
    } catch (error) {
      console.warn('Appwrite updateMissionStatus fallback', error);
      return null;
    }
  },
  async promoteToMissionCommander(userId: string): Promise<void> {
    try {
      await databases.updateDocument(APPWRITE_DATABASE_ID, APPWRITE_ROLES_COLLECTION, userId, {
        role: 'mission_commander'
      });
    } catch (error) {
      console.warn('Appwrite promoteToMissionCommander fallback', error);
    }
  }
};
