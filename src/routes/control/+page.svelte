<script lang="ts">
  import CommandPanel from '$components/CommandPanel.svelte';
  import RobotPanel from '$components/RobotPanel.svelte';
  import CameraView from '$components/CameraView.svelte';
  import MissionBrief from '$components/MissionBrief.svelte';
  import LoginPanel from '$components/LoginPanel.svelte';
  import { currentUser, userRole, isAuthenticated } from '$stores/user';
  import { controllableRobots } from '$stores/robots';
  import { assignedRobotIds } from '$stores/missions';
  import { drawnWaypoints } from '$stores/mapInteractions';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';

  const navLinks = [
    { href: '/map', label: 'Map' },
    { href: '/control', label: 'Control' },
    { href: '/admin', label: 'Mission' }
  ];

  function handleShortcuts(event: KeyboardEvent): void {
    if (event.key === 'm' && event.ctrlKey) {
      event.preventDefault();
      void goto('/map');
    }
  }

  $: currentPath = $page.url.pathname;
</script>

<svelte:window on:keydown={handleShortcuts} />

{#if $isAuthenticated}
  <div class="flex h-screen flex-col bg-slate-950 text-slate-100">
    <header class="flex items-center justify-between border-b border-slate-800 px-6 py-4">
      <div>
        <h1 class="text-xl font-semibold">Control Deck</h1>
        <p class="text-xs text-slate-400">Command issuance, robot roster, and mission orchestration.</p>
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
          {#if $currentUser}
            <p class="text-sm font-semibold text-white">{$currentUser.name}</p>
            <p class="uppercase tracking-wide">Role: {$userRole}</p>
          {:else}
            <p class="text-sm text-slate-500">Not authenticated</p>
          {/if}
          <p class="text-[11px] text-slate-500">Controllable robots: {$controllableRobots.length}</p>
        </div>
      </div>
    </header>

    <main class="flex flex-1 overflow-hidden">
      <section class="flex w-full flex-col gap-6 overflow-y-auto bg-slate-950 px-6 py-6 lg:grid lg:grid-cols-[minmax(340px,360px)_minmax(320px,1fr)_minmax(360px,380px)] lg:gap-6">
        <div class="flex flex-col gap-4">
          <CommandPanel lastDrawnWaypoints={$drawnWaypoints} />
          <div class="rounded border border-slate-700 bg-slate-900/60 p-4 text-xs text-slate-300">
            <p class="uppercase tracking-wide text-slate-400">Latest Waypoints</p>
            {#if $drawnWaypoints.length}
              <ul class="mt-2 space-y-1">
                {#each $drawnWaypoints as [lat, lon], index}
                  <li>
                    <span class="text-slate-500">#{index + 1}</span>
                    <span class="ml-2">{lat.toFixed(5)}, {lon.toFixed(5)}</span>
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="mt-2 text-slate-500">No waypoints recorded yet. Plot a route on the map.</p>
            {/if}
          </div>
        </div>

        <div class="flex flex-col gap-4">
          <RobotPanel />
          <CameraView robotId={$currentUser?.assignedRobots?.[0] ?? null} />
        </div>

        <div class="flex flex-col gap-4">
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
