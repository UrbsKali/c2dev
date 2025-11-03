<script lang="ts">
  import MapView from '$components/MapView.svelte';
  import RobotPanel from '$components/RobotPanel.svelte';
  import CommandPanel from '$components/CommandPanel.svelte';
  import MissionBrief from '$components/MissionBrief.svelte';
  import LoginPanel from '$components/LoginPanel.svelte';
  import CameraView from '$components/CameraView.svelte';
  import TimelineScrubber from '$components/TimelineScrubber.svelte';
  import { currentUser, userRole, isAuthenticated } from '$stores/user';
  import { robots, controllableRobots } from '$stores/robots';
  import { assignedRobotIds } from '$stores/missions';

  let lastDrawnWaypoints: [number, number][] = [];

  function handleWaypointCreated(event: CustomEvent<{ robotId: string | null; coordinates: [number, number][] }>): void {
    lastDrawnWaypoints = event.detail.coordinates;
  }
</script>

{#if $isAuthenticated}
<div class="flex h-screen flex-col bg-slate-950 text-slate-100">
  <header class="flex items-center justify-between border-b border-slate-800 px-6 py-3">
    <div>
      <h1 class="text-xl font-semibold">Robot Command &amp; Control</h1>
      <p class="text-xs text-slate-400">Real-time telemetry, command orchestration, and mission oversight.</p>
    </div>
    <div class="text-right text-xs text-slate-300">
      {#if $currentUser}
        <p class="text-sm font-semibold text-white">{$currentUser.name}</p>
        <p class="uppercase tracking-wide">Role: {$userRole}</p>
      {:else}
        <p class="text-sm text-slate-500">Not authenticated</p>
      {/if}
  <p class="text-[11px] text-slate-500">Robots connected: {$robots.length}</p>
    </div>
  </header>

  <main class="grid flex-1 grid-rows-[minmax(320px,60vh)_auto]">
    <section class="relative">
      <MapView on:waypointCreated={handleWaypointCreated} />
      <div class="absolute bottom-4 left-1/2 -translate-x-1/2">
        <TimelineScrubber max={2400} />
      </div>
    </section>

    <section class="grid grid-cols-1 gap-4 overflow-hidden border-t border-slate-800 bg-slate-950/90 p-4 lg:grid-cols-[minmax(280px,320px)_auto_minmax(320px,360px)]">
      <div class="flex h-full flex-col gap-4 overflow-hidden">
        <RobotPanel />
        <div class="rounded border border-slate-700 bg-slate-900/60 p-3 text-xs text-slate-400">
          <p>Controllable robots: {$controllableRobots.length}</p>
        </div>
      </div>

      <div class="flex h-full flex-col gap-4 overflow-hidden">
        <CommandPanel lastDrawnWaypoints={lastDrawnWaypoints} />
        <CameraView robotId={$currentUser?.assignedRobots?.[0] ?? null} />
      </div>

      <div class="flex h-full flex-col gap-4 overflow-hidden">
        <MissionBrief />

        {#if $userRole !== 'operator'}
          <div class="rounded border border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-200">
            <h3 class="text-sm font-semibold text-white">Mission Oversight</h3>
            <p class="text-xs text-slate-400">Robots assigned to mission: {$assignedRobotIds.length}</p>
            <ul class="mt-2 space-y-1 text-xs text-slate-300">
              {#each $assignedRobotIds as robotId}
                <li>{robotId}</li>
              {/each}
            </ul>
            {#if $userRole === 'admin'}
              <button
                class="mt-3 w-full rounded border border-dashed border-slate-600 px-3 py-2 text-xs uppercase tracking-wide text-slate-400 hover:bg-slate-800"
                type="button"
              >
                Launch Admin Console
              </button>
            {/if}
          </div>
        {/if}
      </div>
    </section>
  </main>
</div>
{:else}
  <div class="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
    <LoginPanel />
  </div>
{/if}
