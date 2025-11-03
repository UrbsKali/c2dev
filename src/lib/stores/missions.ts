import { writable, derived } from 'svelte/store';
import type { Mission } from '$types';
import { appwriteMissions } from '$services/appwrite';

const activeMissionStore = writable<Mission | null>(null);

export const activeMission = {
  subscribe: activeMissionStore.subscribe,
  set: activeMissionStore.set
};

export const missionBriefMarkdown = derived(activeMissionStore, (mission: Mission | null) => mission?.briefing ?? '');

export const assignedRobotIds = derived(activeMissionStore, (mission: Mission | null) => mission?.assignedRobots ?? []);

export async function loadActiveMission(): Promise<void> {
  const mission = await appwriteMissions.getActiveMission();
  activeMissionStore.set(mission);
}

export async function refreshMission(id: string): Promise<void> {
  const mission = await appwriteMissions.getMissionById(id);
  activeMissionStore.set(mission);
}
