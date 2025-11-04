<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import MissionBrief from '$components/MissionBrief.svelte';
  import LoginPanel from '$components/LoginPanel.svelte';
  import { isAuthenticated, userRole, currentUser, type UserProfile } from '$stores/user';
  import { missionAdminService, type MissionDraft, type MissionRobot } from '$services/supabase';
  import { loadActiveMission } from '$stores/missions';
  import type { Mission } from '$types';

  const navLinks = [
    { href: '/map', label: 'Map' },
    { href: '/control', label: 'Control' },
    { href: '/admin', label: 'Mission' }
  ];

  type AdminTab = 'missions' | 'users';
  type RoleFilter = UserProfile['role'] | 'all';

  const statusOptions: Mission['status'][] = ['draft', 'active', 'completed', 'aborted'];
  const statusBadgeStyles: Record<Mission['status'], string> = {
    draft: 'border border-slate-700 bg-slate-900 text-slate-300',
    active: 'border border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
    completed: 'border border-sky-400/40 bg-sky-400/10 text-sky-300',
    aborted: 'border border-rose-400/40 bg-rose-400/10 text-rose-300'
  };
  const adminTabs: Array<{ id: AdminTab; label: string; description: string }> = [
    { id: 'missions', label: 'Missions', description: 'Gestion des opérations' },
    { id: 'users', label: 'Utilisateurs', description: 'Gestion des accès' }
  ];
  const roleFilterOptions: Array<{ value: RoleFilter; label: string }> = [
    { value: 'all', label: 'Tous les rôles' },
    { value: 'admin', label: 'Administrateurs' },
    { value: 'mission_commander', label: 'Mission commanders' },
    { value: 'operator', label: 'Opérateurs' }
  ];

  interface RosterEntry {
    id: string;
    operatorId: string | null;
    robotId: string | null;
  }

  const rosterKey = (): string =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  let missions: Mission[] = [];
  let assignableUsers: UserProfile[] = [];
  let assignableRobots: MissionRobot[] = [];
  let selectedMissionId: string | null = null;
  let selectedMission: Mission | null = null;
  let selectedRoster: RosterEntry[] = [];
  let missionStatus: Mission['status'] = 'draft';
  let promoteUserId = '';
  let busy = false;
  let userBusy = false;
  let feedback: { message: string; tone: 'success' | 'error' } | null = null;
  let feedbackTimer: ReturnType<typeof setTimeout> | null = null;

  let newMissionTitle = '';
  let newMissionBriefing = '';
  let newMissionStatus: Mission['status'] = 'draft';
  let newMissionOwner = '';
  let newMissionRoster: RosterEntry[] = [];
  let adminTab: AdminTab = 'missions';
  let roleFilter: RoleFilter = 'all';
  let userQuery = '';

  $: currentPath = $page.url.pathname;
  $: totalMissions = missions.length;
  $: activeCount = missions.filter((mission) => mission.status === 'active').length;
  $: readyCount = missions.filter((mission) => mission.status === 'draft').length;
  $: totalUsers = assignableUsers.length;
  $: operatorRoster = assignableUsers.filter((user) => user.role === 'operator');
  $: missionCommanderCount = assignableUsers.filter((user) => user.role === 'mission_commander').length;
  $: adminCount = assignableUsers.filter((user) => user.role === 'admin').length;
  $: totalRobots = assignableRobots.length;
  $: promotableCandidates = operatorRoster;
  $: selectedOperatorIds = Array.from(
    new Set(
      selectedRoster
        .map((entry) => entry.operatorId)
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
    )
  );
  $: selectedRobotIds = Array.from(
    new Set(
      selectedRoster
        .map((entry) => entry.robotId)
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
    )
  );
  $: normalizedQuery = userQuery.trim().toLowerCase();
  $: filteredDirectory = assignableUsers.filter((user) => {
    if (!normalizedQuery) return true;
    const haystack = `${user.name} ${user.id} ${user.role}`.toLowerCase();
    return haystack.includes(normalizedQuery);
  });
  $: displayedDirectory =
    roleFilter === 'all' ? filteredDirectory : filteredDirectory.filter((user) => user.role === roleFilter);

  function toRosterEntries(assignments?: Mission['assignments']): RosterEntry[] {
    if (!assignments) return [];
    return assignments.map((entry) => ({
      id: rosterKey(),
      operatorId: entry.operatorId ?? null,
      robotId: entry.robotId ?? null
    }));
  }

  function addRosterEntry(target: 'mission' | 'new'): void {
    const entry: RosterEntry = { id: rosterKey(), operatorId: null, robotId: null };
    if (target === 'mission') {
      selectedRoster = [...selectedRoster, entry];
    } else {
      newMissionRoster = [...newMissionRoster, entry];
    }
  }

  function removeRosterEntry(target: 'mission' | 'new', id: string): void {
    if (target === 'mission') {
      selectedRoster = selectedRoster.filter((entry) => entry.id !== id);
    } else {
      newMissionRoster = newMissionRoster.filter((entry) => entry.id !== id);
    }
  }

  function patchRosterEntry(target: 'mission' | 'new', id: string, patch: Partial<RosterEntry>): void {
    const patcher = (entry: RosterEntry): RosterEntry =>
      entry.id === id
        ? {
            ...entry,
            ...patch
          }
        : entry;
    if (target === 'mission') {
      selectedRoster = selectedRoster.map(patcher);
    } else {
      newMissionRoster = newMissionRoster.map(patcher);
    }
  }

  function mergeUsers(...groups: UserProfile[][]): UserProfile[] {
    const map = new Map<string, UserProfile>();
    for (const group of groups) {
      for (const user of group) {
        map.set(user.id, user);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  function hydrateSelection(target: Mission | null): void {
    selectedMission = target;
    selectedRoster = target ? toRosterEntries(target.assignments) : [];
    missionStatus = target?.status ?? 'draft';
  }

  function selectMission(id: string): void {
    selectedMissionId = id;
    const mission = missions.find((entry) => entry.id === id) ?? null;
    hydrateSelection(mission);
  }

  function clearFeedback(): void {
    if (feedbackTimer) {
      clearTimeout(feedbackTimer);
      feedbackTimer = null;
    }
  }

  function report(message: string, tone: 'success' | 'error' = 'success'): void {
    clearFeedback();
    feedback = { message, tone };
    feedbackTimer = setTimeout(() => {
      feedback = null;
      feedbackTimer = null;
    }, 4000);
  }

  function selectAdminTab(target: AdminTab): void {
    adminTab = target;
  }

  function formatRole(role: UserProfile['role']): string {
    switch (role) {
      case 'admin':
        return 'Administrateur';
      case 'mission_commander':
        return 'Mission commander';
      default:
        return 'Opérateur';
    }
  }

  function shortDate(iso?: string): string {
    if (!iso) return '—';
    const date = new Date(iso);
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date);
  }

  async function loadAssignableUsers(): Promise<void> {
    try {
      const [operators, commanders, admins] = await Promise.all([
        missionAdminService.listUsersByRole('operator'),
        missionAdminService.listUsersByRole('mission_commander'),
        missionAdminService.listUsersByRole('admin')
      ]);
      assignableUsers = mergeUsers(operators, commanders, admins);
    } catch (error) {
      console.warn('Failed to load user pool', error);
      assignableUsers = [];
    }
  }

  async function loadAssignableRobots(): Promise<void> {
    try {
      assignableRobots = await missionAdminService.listMissionRobots();
    } catch (error) {
      console.warn('Failed to load robot directory', error);
      assignableRobots = [];
    }
  }

  async function loadMissionResources(): Promise<void> {
    try {
      const missionList = await missionAdminService.listMissions();
      missions = missionList;
      const defaultMission = missions.find((mission) => mission.status === 'active') ?? missions[0] ?? null;
      selectedMissionId = defaultMission?.id ?? null;
      hydrateSelection(defaultMission ?? null);
    } catch (error) {
      console.error('Mission list retrieval failed', error);
      missions = [];
      selectedMissionId = null;
      hydrateSelection(null);
    }
  }

  async function initialize(): Promise<void> {
    await Promise.all([loadMissionResources(), loadAssignableUsers(), loadAssignableRobots(), loadActiveMission()]);
  }

  async function handleCreateMission(): Promise<void> {
    if (!newMissionTitle.trim()) {
      report('A mission name is required.', 'error');
      return;
    }
    busy = true;
    try {
      const rosterPayload = newMissionRoster
        .filter((entry) => entry.operatorId || entry.robotId)
        .map((entry) => ({
          operatorId: entry.operatorId ?? null,
          robotId: entry.robotId ?? null
        }));
      const rosterOperators = Array.from(
        new Set(
          rosterPayload
            .map((entry) => entry.operatorId)
            .filter((value): value is string => typeof value === 'string' && value.length > 0)
        )
      );
      const rosterRobots = Array.from(
        new Set(
          rosterPayload
            .map((entry) => entry.robotId)
            .filter((value): value is string => typeof value === 'string' && value.length > 0)
        )
      );

      const draft: MissionDraft = {
        title: newMissionTitle.trim(),
        briefing: newMissionBriefing.trim() || 'No briefing provided.',
        assignedOperators: rosterOperators,
        assignedRobots: rosterRobots,
        assignments: rosterPayload,
        status: newMissionStatus,
        ownerId: newMissionOwner.trim() || undefined
      };

      const created = await missionAdminService.createMission(draft);
      missions = [created, ...missions];
      selectMission(created.id);
      newMissionTitle = '';
      newMissionBriefing = '';
      newMissionStatus = 'draft';
      newMissionOwner = '';
      newMissionRoster = [];
      report('Mission draft registered.');
      if (created.status === 'active') {
        await loadActiveMission();
      }
    } catch (error) {
      console.error('Mission creation failed', error);
      report('Unable to create mission. Retry shortly.', 'error');
    } finally {
      busy = false;
    }
  }

  async function handleAssignmentUpdate(): Promise<void> {
    if (!selectedMissionId) {
      report('Pick a mission before updating assignments.', 'error');
      return;
    }
    busy = true;
    try {
      const rosterPayload = selectedRoster
        .filter((entry) => entry.operatorId || entry.robotId)
        .map((entry) => ({
          operatorId: entry.operatorId ?? null,
          robotId: entry.robotId ?? null
        }));
      const updated = await missionAdminService.updateMissionAssignments(selectedMissionId, rosterPayload);
      if (updated) {
        missions = missions.map((mission) => (mission.id === updated.id ? updated : mission));
        hydrateSelection(updated);
        report('Mission roster updated.');
        await loadActiveMission();
      } else {
        report('No response from mission service.', 'error');
      }
    } catch (error) {
      console.error('Assignment update failed', error);
      report('Failed to update mission roster.', 'error');
    } finally {
      busy = false;
    }
  }

  async function handleStatusUpdate(): Promise<void> {
    if (!selectedMissionId) {
      report('Select a mission before changing status.', 'error');
      return;
    }
    busy = true;
    try {
      const updated = await missionAdminService.updateMissionStatus(selectedMissionId, missionStatus);
      if (updated) {
        missions = missions.map((mission) => (mission.id === updated.id ? updated : mission));
        hydrateSelection(updated);
        report('Mission status synchronized.');
        await loadActiveMission();
      } else {
        report('Status update unavailable.', 'error');
      }
    } catch (error) {
      console.error('Mission status change failed', error);
      report('Status change failed. Verify your permissions.', 'error');
    } finally {
      busy = false;
    }
  }

  async function handlePromote(): Promise<void> {
    if (!promoteUserId) {
      report('Choose an operator to promote.', 'error');
      return;
    }
    userBusy = true;
    try {
      await missionAdminService.promoteToMissionCommander(promoteUserId);
      report('Operator promoted to mission commander.');
      promoteUserId = '';
      await loadAssignableUsers();
    } catch (error) {
      console.error('Promotion failed', error);
      report('Could not escalate user role.', 'error');
    } finally {
      userBusy = false;
    }
  }

  async function refreshUserDirectory(): Promise<void> {
    userBusy = true;
    try {
      await loadAssignableUsers();
      report('User roster refreshed.');
    } catch (error) {
      console.error('User directory refresh failed', error);
      report('Unable to refresh user roster.', 'error');
    } finally {
      userBusy = false;
    }
  }

  function statusLabel(status: Mission['status']): string {
    switch (status) {
      case 'active':
        return 'Active';
      case 'completed':
        return 'Completed';
      case 'aborted':
        return 'Aborted';
      default:
        return 'Draft';
    }
  }

  onMount(() => {
    void initialize();
  });

  onDestroy(() => {
    clearFeedback();
  });
</script>

{#if !$isAuthenticated}
  <div class="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
    <LoginPanel />
  </div>
{:else if $userRole !== 'admin' && $userRole !== 'mission_commander'}
  <div class="flex min-h-screen flex-col bg-slate-950 text-slate-100">
    <header class="flex items-center justify-between border-b border-slate-800 px-6 py-4">
      <div>
        <h1 class="text-xl font-semibold">Restricted Access</h1>
        <p class="text-xs text-slate-400">Mission governance is limited to elevated roles.</p>
      </div>
      <nav class="flex items-center gap-1 rounded-full border border-slate-800 bg-slate-900/60 px-2 py-1">
        {#each navLinks as link}
          <a
            class="rounded-full px-3 py-1 text-[11px] uppercase tracking-wide transition hover:bg-slate-800"
            class:bg-accent={currentPath.startsWith(link.href)}
            class:text-slate-950={currentPath.startsWith(link.href)}
            class:text-slate-300={!currentPath.startsWith(link.href)}
            href={link.href}
          >
            {link.label}
          </a>
        {/each}
      </nav>
    </header>
    <main class="flex flex-1 items-center justify-center p-8">
      <div class="max-w-md rounded border border-slate-800 bg-slate-900/70 p-6 text-sm text-slate-300">
        <p class="font-semibold text-white">Permission denied</p>
        <p class="mt-2 text-slate-400">
          Contact an administrator to elevate your access or switch to the Control and Map views.
        </p>
      </div>
    </main>
  </div>
{:else}
  <div class="flex h-screen flex-col bg-slate-950 text-slate-100">
    <header class="flex items-center justify-between border-b border-slate-800 px-6 py-4">
      <div>
        <h1 class="text-xl font-semibold">Mission Governance</h1>
        <p class="text-xs text-slate-400">Create missions, assign crews, and elevate commanders.</p>
      </div>
      <div class="flex items-center gap-3 text-xs text-slate-300">
        <nav class="flex items-center gap-1 rounded-full border border-slate-800 bg-slate-900/60 px-2 py-1">
          {#each navLinks as link}
            <a
              class="rounded-full px-3 py-1 text-[11px] uppercase tracking-wide transition hover:bg-slate-800"
              class:bg-accent={currentPath.startsWith(link.href)}
              class:text-slate-950={currentPath.startsWith(link.href)}
              class:text-slate-300={!currentPath.startsWith(link.href)}
              href={link.href}
            >
              {link.label}
            </a>
          {/each}
        </nav>
        <div class="text-right">
          <button
            type="button"
            class="block rounded border border-transparent px-3 py-2 text-right transition hover:border-slate-700 hover:bg-slate-900 focus:outline-none focus-visible:border-accent"
            on:click={() => goto('/user')}
          >
            <p class="text-sm font-semibold text-white">{$currentUser?.name ?? 'Mission Staff'}</p>
            <p class="uppercase tracking-wide">Role: {$userRole}</p>
          </button>
        </div>
      </div>
    </header>

    <main class="flex flex-1 flex-col overflow-hidden">
      <div class="border-b border-slate-800 bg-slate-950 px-6">
        <div class="flex items-center gap-2 py-4">
          {#each adminTabs as tab}
            <button
              type="button"
              class={`rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
                adminTab === tab.id
                  ? 'border-accent bg-accent text-slate-950 shadow'
                  : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:bg-slate-800/70'
              }`}
              on:click={() => selectAdminTab(tab.id)}
            >
              <span class="flex flex-col">
                <span>{tab.label}</span>
                <span class="text-[10px] font-normal normal-case text-slate-400">{tab.description}</span>
              </span>
            </button>
          {/each}
        </div>
      </div>

      {#if adminTab === 'missions'}
        <section class="flex w-full flex-col gap-6 overflow-y-auto bg-slate-950 px-6 py-6 xl:grid xl:grid-cols-[minmax(360px,420px)_minmax(420px,1fr)] xl:gap-6">
          <div class="flex flex-col gap-4">
          <div class="rounded border border-slate-800 bg-slate-900/60 p-4">
            <h2 class="text-sm font-semibold text-white">Mission Summary</h2>
            <dl class="mt-4 grid grid-cols-2 gap-4 text-xs text-slate-300">
              <div>
                <dt class="uppercase tracking-wide text-slate-500">Total missions</dt>
                <dd class="text-lg font-semibold text-white">{totalMissions}</dd>
              </div>
              <div>
                <dt class="uppercase tracking-wide text-slate-500">Active</dt>
                <dd class="text-lg font-semibold text-white">{activeCount}</dd>
              </div>
              <div>
                <dt class="uppercase tracking-wide text-slate-500">Drafts</dt>
                <dd class="text-lg font-semibold text-white">{readyCount}</dd>
              </div>
              <div>
                <dt class="uppercase tracking-wide text-slate-500">Crewed</dt>
                <dd class="text-lg font-semibold text-white">{selectedMission?.assignedOperators.length ?? 0}</dd>
              </div>
              <div>
                <dt class="uppercase tracking-wide text-slate-500">Robots assignés</dt>
                <dd class="text-lg font-semibold text-white">{selectedMission?.assignedRobots.length ?? 0}</dd>
              </div>
            </dl>
            {#if feedback}
              <div
                class={`mt-4 rounded border px-3 py-2 text-xs ${
                  feedback.tone === 'error'
                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                }`}
              >
                {feedback.message}
              </div>
            {/if}
          </div>

          <div class="rounded border border-slate-800 bg-slate-900/60 p-4">
            <h2 class="text-sm font-semibold text-white">Mission Queue</h2>
            {#if missions.length === 0}
              <p class="mt-3 text-xs text-slate-400">No missions found. Draft one below to get started.</p>
            {:else}
              <ul class="mt-3 space-y-2">
                {#each missions as mission}
                  <li>
                    <button
                      class={`flex w-full items-center justify-between rounded border border-transparent px-3 py-2 text-left text-sm transition ${
                        mission.id === selectedMissionId ? 'bg-slate-800 text-white' : 'bg-slate-900/40 text-slate-300 hover:bg-slate-800/60'
                      }`}
                      on:click={() => selectMission(mission.id)}
                    >
                      <div>
                        <p class="font-semibold">{mission.title}</p>
                        <p class="text-[11px] uppercase tracking-wide text-slate-400">{shortDate(mission.createdAt)}</p>
                      </div>
                      <span class={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${statusBadgeStyles[mission.status]}`}>
                        {statusLabel(mission.status)}
                      </span>
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>

          <div class="rounded border border-slate-800 bg-slate-900/60 p-4">
            <h2 class="text-sm font-semibold text-white">Create Mission</h2>
            <form class="mt-4 space-y-3" on:submit|preventDefault={handleCreateMission}>
              <label class="block text-xs uppercase tracking-wide text-slate-400">
                Name
                <input
                  class="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-accent/70 focus:outline-none"
                  placeholder="Operation callsign"
                  bind:value={newMissionTitle}
                  required
                />
              </label>
              <label class="block text-xs uppercase tracking-wide text-slate-400">
                Briefing
                <textarea
                  class="mt-1 h-32 w-full resize-none rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-accent/70 focus:outline-none"
                  placeholder="Markdown-supported briefing"
                  bind:value={newMissionBriefing}
                ></textarea>
              </label>
              <label class="block text-xs uppercase tracking-wide text-slate-400">
                Initial status
                <select
                  class="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-accent/70 focus:outline-none"
                  bind:value={newMissionStatus}
                >
                  {#each statusOptions as status}
                    <option value={status}>{statusLabel(status)}</option>
                  {/each}
                </select>
              </label>
              <label class="block text-xs uppercase tracking-wide text-slate-400">
                Owner (optional)
                <input
                  class="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-accent/70 focus:outline-none"
                  placeholder="User id for mission owner"
                  bind:value={newMissionOwner}
                />
              </label>
              <div class="rounded border border-slate-800/60 bg-slate-950/40 p-3 text-xs text-slate-300">
                <div class="flex items-center justify-between">
                  <span class="uppercase tracking-wide text-slate-400">Affectations initiales</span>
                  <button
                    type="button"
                    class="rounded border border-slate-700 px-2 py-1 text-[11px] uppercase tracking-wide text-slate-200 transition hover:border-slate-500 hover:text-white"
                    on:click={() => addRosterEntry('new')}
                    disabled={busy}
                  >
                    Ajouter
                  </button>
                </div>
                {#if newMissionRoster.length === 0}
                  <p class="mt-3 text-xs text-slate-500">Ajoutez une ligne pour lier un opérateur à un robot. Laissez le robot vide pour réserver un opérateur.</p>
                {:else}
                  <ul class="mt-3 space-y-2">
                    {#each newMissionRoster as entry (entry.id)}
                      <li class="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                        <select
                          class="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-accent/70 focus:outline-none"
                          value={entry.operatorId ?? ''}
                          on:change={(event) =>
                            patchRosterEntry('new', entry.id, {
                              operatorId: event.currentTarget.value ? event.currentTarget.value : null
                            })}
                          disabled={busy}
                        >
                          <option value="">Aucun opérateur</option>
                          {#each assignableUsers as user}
                            <option value={user.id}>{user.name}</option>
                          {/each}
                        </select>
                        <select
                          class="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-accent/70 focus:outline-none"
                          value={entry.robotId ?? ''}
                          on:change={(event) =>
                            patchRosterEntry('new', entry.id, {
                              robotId: event.currentTarget.value ? event.currentTarget.value : null
                            })}
                          disabled={busy}
                        >
                          <option value="">Aucun robot</option>
                          {#each assignableRobots as robot}
                            <option value={robot.id}>{robot.label}</option>
                          {/each}
                        </select>
                        <button
                          type="button"
                          class="rounded border border-slate-700 px-2 py-1 text-[11px] uppercase tracking-wide text-slate-200 transition hover:border-rose-500 hover:text-rose-300"
                          on:click={() => removeRosterEntry('new', entry.id)}
                          disabled={busy}
                        >
                          Retirer
                        </button>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </div>
              <button
                class="w-full rounded bg-accent px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
                type="submit"
                disabled={busy}
              >
                Register mission
              </button>
            </form>
          </div>
        </div>

        <div class="flex flex-col gap-4">
          <div class="rounded border border-slate-800 bg-slate-900/60">
            <MissionBrief />
          </div>

          <div class="rounded border border-slate-800 bg-slate-900/60 p-4">
            <h2 class="text-sm font-semibold text-white">Affecter équipage & robots</h2>
            <form class="mt-3 space-y-3" on:submit|preventDefault={handleAssignmentUpdate}>
              <div class="flex items-center justify-between">
                <p class="text-xs text-slate-400">Créez des paires opérateur/robot. Les doublons sont autorisés.</p>
                <button
                  type="button"
                  class="rounded border border-slate-700 px-2 py-1 text-[11px] uppercase tracking-wide text-slate-200 transition hover:border-slate-500 hover:text-white"
                  on:click={() => addRosterEntry('mission')}
                  disabled={!selectedMission || busy}
                >
                  Ajouter une ligne
                </button>
              </div>
              {#if !selectedMission}
                <p class="text-xs text-slate-500">Sélectionnez d'abord une mission.</p>
              {:else}
                {#if selectedRoster.length === 0}
                  <p class="text-xs text-slate-500">Aucune affectation définie. Ajoutez une ligne pour démarrer.</p>
                {:else}
                  <ul class="space-y-2">
                    {#each selectedRoster as entry (entry.id)}
                      <li class="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                        <select
                          class="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-accent/70 focus:outline-none"
                          value={entry.operatorId ?? ''}
                          on:change={(event) =>
                            patchRosterEntry('mission', entry.id, {
                              operatorId: event.currentTarget.value ? event.currentTarget.value : null
                            })}
                          disabled={busy}
                        >
                          <option value="">Aucun opérateur</option>
                          {#each assignableUsers as user}
                            <option value={user.id}>{user.name}</option>
                          {/each}
                        </select>
                        <select
                          class="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-accent/70 focus:outline-none"
                          value={entry.robotId ?? ''}
                          on:change={(event) =>
                            patchRosterEntry('mission', entry.id, {
                              robotId: event.currentTarget.value ? event.currentTarget.value : null
                            })}
                          disabled={busy}
                        >
                          <option value="">Aucun robot</option>
                          {#each assignableRobots as robot}
                            <option value={robot.id}>{robot.label}</option>
                          {/each}
                        </select>
                        <button
                          type="button"
                          class="rounded border border-slate-700 px-2 py-1 text-[11px] uppercase tracking-wide text-slate-200 transition hover:border-rose-500 hover:text-rose-300"
                          on:click={() => removeRosterEntry('mission', entry.id)}
                          disabled={busy}
                        >
                          Retirer
                        </button>
                      </li>
                    {/each}
                  </ul>
                {/if}
              {/if}

              <button
                class="w-full rounded bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                type="submit"
                disabled={!selectedMission || busy}
              >
                Synchroniser l'affectation
              </button>
            </form>
          </div>
          <div class="rounded border border-slate-800 bg-slate-900/60 p-4">
            <h2 class="text-sm font-semibold text-white">Mission Status</h2>
            <form class="mt-3 space-y-3" on:submit|preventDefault={handleStatusUpdate}>
              <label class="block text-xs uppercase tracking-wide text-slate-400">
                Current state
                <select
                  class="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-accent/70 focus:outline-none"
                  bind:value={missionStatus}
                  disabled={!selectedMission || busy}
                >
                  {#each statusOptions as status}
                    <option value={status}>{statusLabel(status)}</option>
                  {/each}
                </select>
              </label>
              <button
                class="w-full rounded bg-emerald-500 px-3 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                type="submit"
                disabled={!selectedMission || busy}
              >
                Sync status
              </button>
            </form>
          </div>
        </div>
        </section>
      {:else}
        <section class="flex w-full flex-col gap-6 overflow-y-auto bg-slate-950 px-6 py-6 xl:grid xl:grid-cols-[minmax(340px,360px)_minmax(480px,1fr)] xl:gap-6">
          <div class="flex flex-col gap-4">
            <div class="rounded border border-slate-800 bg-slate-900/60 p-4">
              <h2 class="text-sm font-semibold text-white">Synthèse des utilisateurs</h2>
              <dl class="mt-4 grid grid-cols-2 gap-4 text-xs text-slate-300">
                <div>
                  <dt class="uppercase tracking-wide text-slate-500">Total</dt>
                  <dd class="text-lg font-semibold text-white">{totalUsers}</dd>
                </div>
                <div>
                  <dt class="uppercase tracking-wide text-slate-500">Administrateurs</dt>
                  <dd class="text-lg font-semibold text-white">{adminCount}</dd>
                </div>
                <div>
                  <dt class="uppercase tracking-wide text-slate-500">Mission commanders</dt>
                  <dd class="text-lg font-semibold text-white">{missionCommanderCount}</dd>
                </div>
                <div>
                  <dt class="uppercase tracking-wide text-slate-500">Opérateurs</dt>
                  <dd class="text-lg font-semibold text-white">{operatorRoster.length}</dd>
                </div>
              </dl>
              {#if feedback}
                <div
                  class={`mt-4 rounded border px-3 py-2 text-xs ${
                    feedback.tone === 'error'
                      ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                      : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                  }`}
                >
                  {feedback.message}
                </div>
              {/if}
            </div>

            <div class="rounded border border-slate-800 bg-slate-900/60 p-4">
              <h2 class="text-sm font-semibold text-white">Promouvoir un mission commander</h2>
              {#if promotableCandidates.length === 0}
                <p class="mt-3 text-xs text-slate-400">Tous les opérateurs sont déjà promus ou indisponibles.</p>
              {:else}
                <form class="mt-3 space-y-3" on:submit|preventDefault={handlePromote}>
                  <select
                    class="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-accent/70 focus:outline-none"
                    bind:value={promoteUserId}
                    disabled={userBusy}
                  >
                    <option value="">Sélectionner un opérateur</option>
                    {#each promotableCandidates as candidate}
                      <option value={candidate.id}>{candidate.name}</option>
                    {/each}
                  </select>
                  <button
                    class="w-full rounded bg-amber-400 px-3 py-2 text-sm font-semibold text-amber-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
                    type="submit"
                    disabled={!promoteUserId || userBusy}
                  >
                    Promouvoir
                  </button>
                </form>
              {/if}
            </div>
          </div>

          <div class="rounded border border-slate-800 bg-slate-900/60 p-4">
            <div class="flex items-center justify-between">
              <h2 class="text-sm font-semibold text-white">Répertoire des utilisateurs</h2>
              <button
                type="button"
                class="rounded border border-slate-700 px-3 py-1 text-[11px] uppercase tracking-wide text-slate-200 transition hover:border-slate-500 hover:text-white"
                on:click={refreshUserDirectory}
                disabled={userBusy}
              >
                Rafraîchir
              </button>
            </div>
            <div class="mt-4 flex flex-col gap-3 text-xs text-slate-300 md:flex-row md:items-center md:justify-between">
              <label class="flex w-full items-center gap-2 md:max-w-xs">
                <span class="uppercase tracking-wide text-slate-500">Recherche</span>
                <input
                  class="flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-accent/70 focus:outline-none"
                  placeholder="Nom, identifiant ou rôle"
                  bind:value={userQuery}
                  type="search"
                />
              </label>
              <div class="flex flex-wrap items-center gap-2">
                {#each roleFilterOptions as option}
                  <button
                    type="button"
                    class={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-wide transition ${
                      roleFilter === option.value
                        ? 'border-accent bg-accent text-slate-950'
                        : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:bg-slate-800/70'
                    }`}
                    on:click={() => (roleFilter = option.value)}
                  >
                    {option.label}
                  </button>
                {/each}
              </div>
            </div>

            {#if displayedDirectory.length === 0}
              <p class="mt-6 text-xs text-slate-400">Aucun utilisateur ne correspond à cette recherche.</p>
            {:else}
              <ul class="mt-4 divide-y divide-slate-800">
                {#each displayedDirectory as user}
                  <li class="py-3">
                    <div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p class="text-sm font-semibold text-white">{user.name}</p>
                        <p class="text-[11px] uppercase tracking-wide text-slate-400">Identifiant&nbsp;: {user.id}</p>
                        {#if user.assignedRobots.length > 0}
                          <p class="text-xs text-slate-400">Robots attribués&nbsp;: {user.assignedRobots.join(', ')}</p>
                        {/if}
                      </div>
                      <span class="self-start rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] uppercase tracking-wide text-slate-200">
                        {formatRole(user.role)}
                      </span>
                    </div>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        </section>
      {/if}
    </main>
  </div>
{/if}
