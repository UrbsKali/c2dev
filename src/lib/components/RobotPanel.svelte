<script lang="ts">
  import { derived } from 'svelte/store';
  import RobotMarker from '$components/RobotMarker.svelte';
  import { robots, selectedRobotId } from '$stores/robots';
  import type { Robot } from '$types';

  let search = '';

  const filteredRobots = derived(robots, ($robots) => {
    if (!search) return $robots;
    return $robots.filter((robot) =>
      (robot.name ?? robot.id).toLowerCase().includes(search.toLowerCase())
    );
  });

  const activeRobot = derived([robots, selectedRobotId], ([$robots, $selected]) =>
    $robots.find((robot) => robot.id === $selected) ?? null
  );

  function handleSelect(robot: Robot): void {
    selectedRobotId.set(robot.id);
  }
</script>

<section class="flex h-full flex-col gap-4 overflow-hidden bg-slate-950/70 p-4 text-slate-200">
  <div>
    <h2 class="text-lg font-semibold">Robots</h2>
    <p class="text-sm text-slate-400">Monitor telemetry and select a platform to issue commands.</p>
  </div>

  <input
    class="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm focus:border-accent focus:outline-none"
    bind:value={search}
    placeholder="Search robots"
    type="search"
  />

  <div class="flex-1 overflow-y-auto space-y-2 pr-1">
    {#if $filteredRobots.length === 0}
      <p class="text-sm text-slate-500">No robots match the current filter.</p>
    {:else}
      {#each $filteredRobots as robot (robot.id)}
        <button
          class="w-full text-left transition hover:scale-[1.01]"
          class:bg-slate-800={robot.id === $selectedRobotId}
          on:click={() => handleSelect(robot)}
          type="button"
        >
          <RobotMarker {robot} />
        </button>
      {/each}
    {/if}
  </div>

  {#if $activeRobot}
    <div class="rounded border border-slate-700 bg-slate-900/60 p-4">
      <h3 class="text-md font-semibold text-white">{$activeRobot.name ?? $activeRobot.id}</h3>
      <dl class="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-300">
        <div>
          <dt class="uppercase text-[11px] tracking-wide text-slate-500">Type</dt>
          <dd>{$activeRobot.type}</dd>
        </div>
        <div>
          <dt class="uppercase text-[11px] tracking-wide text-slate-500">Status</dt>
          <dd>{$activeRobot.status ?? 'Unknown'}</dd>
        </div>
        <div>
          <dt class="uppercase text-[11px] tracking-wide text-slate-500">Heading</dt>
          <dd>{($activeRobot.heading ?? 0).toFixed(0)}°</dd>
        </div>
        <div>
          <dt class="uppercase text-[11px] tracking-wide text-slate-500">Speed</dt>
          <dd>{($activeRobot.speed ?? 0).toFixed(1)} m/s</dd>
        </div>
        {#if $activeRobot.position}
          <div class="col-span-2">
            <dt class="uppercase text-[11px] tracking-wide text-slate-500">Position</dt>
            <dd>{$activeRobot.position.lat.toFixed(5)}, {$activeRobot.position.lon.toFixed(5)}</dd>
          </div>
        {/if}
        {#if $activeRobot.lastSeen}
          <div class="col-span-2">
            <dt class="uppercase text-[11px] tracking-wide text-slate-500">Last Seen</dt>
            <dd>{$activeRobot.lastSeen}</dd>
          </div>
        {/if}
      </dl>
    </div>
  {/if}
</section>
