import { derived, writable } from 'svelte/store';
import { appwriteAuth } from '$services/appwrite';

export type UserRole = 'operator' | 'commander' | 'mission_commander' | 'admin';

export interface UserProfile {
  id: string;
  name: string;
  role: UserRole;
  assignedRobots: string[];
}

const currentUserStore = writable<UserProfile | null>(null);

export const currentUser = {
  subscribe: currentUserStore.subscribe
};

export const isAuthenticated = derived(currentUserStore, (user: UserProfile | null) => Boolean(user));
export const userRole = derived(currentUserStore, (user: UserProfile | null) => user?.role ?? 'operator');

export async function hydrateUser(): Promise<void> {
  const user = await appwriteAuth.getCurrentUser();
  currentUserStore.set(user);
}

export async function login(email: string, password: string): Promise<void> {
  const user = await appwriteAuth.login(email, password);
  currentUserStore.set(user);
}

export async function logout(): Promise<void> {
  await appwriteAuth.logout();
  currentUserStore.set(null);
}
