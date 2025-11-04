<script lang="ts">
  import MapView from '$components/MapView.svelte';
  import TimelineScrubber from '$components/TimelineScrubber.svelte';
  import LoginPanel from '$components/LoginPanel.svelte';
  import { currentUser, userRole, isAuthenticated } from '$stores/user';
  import { robots, selectedRobotId } from '$stores/robots';
  import { layoutState } from '$stores/layout';
  import { recordWaypoints, sharedSelectedRobotId } from '$stores/mapInteractions';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';

  const navLinks = [
    { href: '/map', label: 'Map' },
    { href: '/control', label: 'Control' },
    { href: '/admin', label: 'Mission' }
  ];

  const viewport = layoutState;
  const FALLBACK_VIEWPORT_HEIGHT = 960;

  function handleWaypointCreated(event: CustomEvent<{ robotId: string | null; coordinates: [number, number][] }>): void {
    recordWaypoints(event.detail.coordinates);
  }

  function handleRobotSelected(event: CustomEvent<{ robotId: string | null }>): void {
    selectedRobotId.set(event.detail.robotId ?? null);
    sharedSelectedRobotId.set(event.detail.robotId ?? null);
  }

  function handleShortcuts(event: KeyboardEvent): void {
    if (event.key === 'c' && event.ctrlKey) {
      event.preventDefault();
      void goto('/control');
    }
  }

  $: currentPath = $page.url.pathname;
  $: effectiveViewportHeight = $viewport.viewportHeight > 0 ? $viewport.viewportHeight : FALLBACK_VIEWPORT_HEIGHT;
  $: mapHeight = Math.max(360, Math.round(effectiveViewportHeight - 160));
</script>

<svelte:window on:keydown={handleShortcuts} />

{#if $isAuthenticated}
  <div class="flex h-screen flex-col bg-slate-950 text-slate-100">
    <header class="flex items-center justify-between border-b border-slate-800 px-6 py-4">
      <div>
        <h1 class="text-xl font-semibold">Operational Map</h1>
        <p class="text-xs text-slate-400">Global situational awareness and waypoint authoring.</p>
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
            <button
              type="button"
              class="block rounded border border-transparent px-3 py-2 text-right transition hover:border-slate-700 hover:bg-slate-900 focus:outline-none focus-visible:border-accent"
              on:click={() => goto('/user')}
            >
              <p class="text-sm font-semibold text-white">{$currentUser.name}</p>
              <p class="uppercase tracking-wide">Role: {$userRole}</p>
            </button>
          {:else}
            <p class="text-sm text-slate-500">Not authenticated</p>
          {/if}
          <p class="text-[11px] text-slate-500">Robots connected: {$robots.length}</p>
        </div>
      </div>
    </header>

    <main class="relative flex-1 overflow-hidden">
      <section class="absolute inset-0" style={`min-height:${mapHeight}px;`}>
  <MapView on:waypointCreated={handleWaypointCreated} on:robotSelected={handleRobotSelected} />
        <div class="pointer-events-none absolute bottom-4 left-1/2 z-[500] -translate-x-1/2">
          <TimelineScrubber max={2400} />
        </div>
      </section>
    </main>
  </div>
{:else}
  <div class="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
    <LoginPanel />
  </div>
{/if}
