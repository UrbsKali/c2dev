import { writable, derived } from 'svelte/store';
import type { Mission } from '$types';
import { supabaseMissions } from '$services/supabase';

const activeMissionStore = writable<Mission | null>(null);

export const activeMission = {
  subscribe: activeMissionStore.subscribe,
  set: activeMissionStore.set
};

export const missionBriefMarkdown = derived(activeMissionStore, (mission: Mission | null) => mission?.briefing ?? '');

export const assignedRobotIds = derived(activeMissionStore, (mission: Mission | null) => mission?.assignedRobots ?? []);

export async function loadActiveMission(): Promise<void> {
  const mission = await supabaseMissions.getActiveMission();
  activeMissionStore.set(mission);
}

export async function refreshMission(id: string): Promise<void> {
  const mission = await supabaseMissions.getMissionById(id);
  activeMissionStore.set(mission);
}
