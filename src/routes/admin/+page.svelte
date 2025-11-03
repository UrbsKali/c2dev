<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { page } from '$app/stores';
  import MissionBrief from '$components/MissionBrief.svelte';
  import LoginPanel from '$components/LoginPanel.svelte';
  import { isAuthenticated, userRole, currentUser, type UserProfile } from '$stores/user';
  import { missionAdminService, type MissionDraft } from '$services/appwrite';
  import { loadActiveMission } from '$stores/missions';
  import type { Mission } from '$types';

  const navLinks = [
    { href: '/map', label: 'Map' },
    { href: '/control', label: 'Control' },
    { href: '/admin', label: 'Mission' }
  ];

  const statusOptions: Mission['status'][] = ['draft', 'active', 'completed', 'aborted'];
  const statusBadgeStyles: Record<Mission['status'], string> = {
    draft: 'border border-slate-700 bg-slate-900 text-slate-300',
    active: 'border border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
    completed: 'border border-sky-400/40 bg-sky-400/10 text-sky-300',
    aborted: 'border border-rose-400/40 bg-rose-400/10 text-rose-300'
  };

  let missions: Mission[] = [];
  let assignableUsers: UserProfile[] = [];
  let selectedMissionId: string | null = null;
  let selectedMission: Mission | null = null;
  let selectedOperatorIds: string[] = [];
  let missionStatus: Mission['status'] = 'draft';
  let promoteUserId = '';
  let busy = false;
  let feedback: { message: string; tone: 'success' | 'error' } | null = null;
  let feedbackTimer: ReturnType<typeof setTimeout> | null = null;

  let newMissionTitle = '';
  let newMissionBriefing = '';
  let newMissionStatus: Mission['status'] = 'draft';
  let newMissionOwner = '';

  $: currentPath = $page.url.pathname;
  $: totalMissions = missions.length;
  $: activeCount = missions.filter((mission) => mission.status === 'active').length;
  $: readyCount = missions.filter((mission) => mission.status === 'draft').length;
  $: promotableCandidates = assignableUsers.filter((user) => user.role === 'operator');

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
    selectedOperatorIds = target ? [...target.assignedOperators] : [];
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
    await Promise.all([loadMissionResources(), loadAssignableUsers(), loadActiveMission()]);
  }

  async function handleCreateMission(): Promise<void> {
    if (!newMissionTitle.trim()) {
      report('A mission name is required.', 'error');
      return;
    }
    busy = true;
    try {
      const draft: MissionDraft = {
        title: newMissionTitle.trim(),
        briefing: newMissionBriefing.trim() || 'No briefing provided.',
        assignedOperators: [],
        assignedRobots: [],
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

  async function handleAssignUsers(): Promise<void> {
    if (!selectedMissionId) {
      report('Pick a mission before updating assignments.', 'error');
      return;
    }
    busy = true;
    try {
      const updated = await missionAdminService.assignUsersToMission(selectedMissionId, selectedOperatorIds);
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
    busy = true;
    try {
      await missionAdminService.promoteToMissionCommander(promoteUserId);
      report('Operator promoted to mission commander.');
      promoteUserId = '';
      await loadAssignableUsers();
    } catch (error) {
      console.error('Promotion failed', error);
      report('Could not escalate user role.', 'error');
    } finally {
      busy = false;
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
          <p class="text-sm font-semibold text-white">{$currentUser?.name ?? 'Mission Staff'}</p>
          <p class="uppercase tracking-wide">Role: {$userRole}</p>
        </div>
      </div>
    </header>

    <main class="flex flex-1 overflow-hidden">
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
            <h2 class="text-sm font-semibold text-white">Mission Overview</h2>
            {#if selectedMission}
              <dl class="mt-4 space-y-2 text-xs text-slate-300">
                <div>
                  <dt class="uppercase tracking-wide text-slate-500">Title</dt>
                  <dd class="text-sm font-semibold text-white">{selectedMission.title}</dd>
                </div>
                <div>
                  <dt class="uppercase tracking-wide text-slate-500">Status</dt>
                  <dd class="text-sm">{statusLabel(selectedMission.status)}</dd>
                </div>
                <div>
                  <dt class="uppercase tracking-wide text-slate-500">Owner</dt>
                  <dd class="text-sm">{selectedMission.ownerId ?? '—'}</dd>
                </div>
                <div>
                  <dt class="uppercase tracking-wide text-slate-500">Operators assigned</dt>
                  <dd class="text-sm">{selectedMission.assignedOperators.length}</dd>
                </div>
              </dl>
            {:else}
              <p class="mt-3 text-xs text-slate-400">Select a mission to view details.</p>
            {/if}
          </div>

          <div class="rounded border border-slate-800 bg-slate-900/60 p-4">
            <h2 class="text-sm font-semibold text-white">Assign Operators</h2>
            {#if assignableUsers.length === 0}
              <p class="mt-3 text-xs text-slate-400">No operators discovered in Appwrite role collection.</p>
            {:else}
              <form class="mt-3 space-y-3" on:submit|preventDefault={handleAssignUsers}>
                <fieldset class="max-h-40 space-y-2 overflow-y-auto pr-1">
                  {#each assignableUsers as user}
                    <label class="flex items-center justify-between rounded border border-transparent px-2 py-1 text-xs transition hover:border-slate-700 hover:bg-slate-800/60">
                      <span class="flex flex-col text-slate-200">
                        <span class="text-sm font-medium">{user.name}</span>
                        <span class="text-[11px] uppercase tracking-wide text-slate-400">{user.role}</span>
                      </span>
                      <input
                        type="checkbox"
                        class="h-4 w-4 rounded border-slate-600 bg-slate-900 focus:outline-none"
                        value={user.id}
                        bind:group={selectedOperatorIds}
                        disabled={!selectedMission || busy}
                      />
                    </label>
                  {/each}
                </fieldset>
                <button
                  class="w-full rounded bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                  type="submit"
                  disabled={!selectedMission || busy}
                >
                  Update assignment
                </button>
              </form>
            {/if}
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

          <div class="rounded border border-slate-800 bg-slate-900/60 p-4">
            <h2 class="text-sm font-semibold text-white">Promote Commander</h2>
            {#if promotableCandidates.length === 0}
              <p class="mt-3 text-xs text-slate-400">All operators already elevated or unavailable.</p>
            {:else}
              <form class="mt-3 space-y-3" on:submit|preventDefault={handlePromote}>
                <select
                  class="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-accent/70 focus:outline-none"
                  bind:value={promoteUserId}
                  disabled={busy}
                >
                  <option value="">Select operator</option>
                  {#each promotableCandidates as candidate}
                    <option value={candidate.id}>{candidate.name}</option>
                  {/each}
                </select>
                <button
                  class="w-full rounded bg-amber-400 px-3 py-2 text-sm font-semibold text-amber-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
                  type="submit"
                  disabled={!promoteUserId || busy}
                >
                  Promote to mission commander
                </button>
              </form>
            {/if}
          </div>
        </div>
      </section>
    </main>
  </div>
{/if}
