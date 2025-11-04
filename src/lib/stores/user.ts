import { derived, writable } from 'svelte/store';
import { supabaseAuth } from '$services/supabase';

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
  const user = await supabaseAuth.getCurrentUser();
  currentUserStore.set(user);
}

export async function login(email: string, password: string): Promise<void> {
  const user = await supabaseAuth.login(email, password);
  currentUserStore.set(user);
}

export async function logout(): Promise<void> {
  await supabaseAuth.logout();
  currentUserStore.set(null);
}

export async function updateProfile(updates: { name?: string }): Promise<void> {
  const user = await supabaseAuth.updateProfile(updates);
  currentUserStore.set(user);
}

export async function changePassword(newPassword: string): Promise<void> {
  await supabaseAuth.updatePassword(newPassword);
}
