<script lang="ts">
  import { derived, get } from 'svelte/store';
  import {
    sendCommand,
    simulationMode,
    enableSimulationMode,
    disableSimulationMode,
    socketState
  } from '$services/websocket';
  import { robots, selectedRobotId } from '$stores/robots';
  import { currentUser } from '$stores/user';
  import type { Command } from '$types';

  export let lastDrawnWaypoints: [number, number][] = [];

  const activeRobot = derived([robots, selectedRobotId], ([$robots, $selected]) =>
    $robots.find((robot) => robot.id === $selected) ?? null
  );

  const operatorId = derived(currentUser, ($user) => $user?.id ?? 'unknown-operator');

  const connectionSummary = derived([socketState, simulationMode], ([$socket, $sim]) => {
    if ($sim.active) {
      return $sim.forced ? 'Simulated override active' : 'Automatic simulator fallback';
    }
    if ($socket === 'connected') return 'Realtime telemetry link active';
    if ($socket === 'connecting') return 'Connecting to realtime service…';
    if ($socket === 'error') return 'Realtime error; simulator recommended';
    return 'Realtime link offline';
  });

  let followTargetId = '';
  let cameraQuality = 'standard';
  let feedback: string | null = null;

  function handleSimulationToggle(event: Event): void {
    const checked = (event.currentTarget as HTMLInputElement).checked;
    if (checked) {
      enableSimulationMode();
    } else {
      disableSimulationMode();
    }
  }

  function makeCommand(commandType: string, payload: unknown): Command {
    const robotId = get(selectedRobotId);
    const issuedBy = get(operatorId);
    if (!robotId) {
      throw new Error('Select a robot to issue commands.');
    }
    return {
      id: crypto.randomUUID(),
      issuedBy,
      robotId,
      commandType,
      payload,
      status: 'queued',
      issuedAt: new Date().toISOString()
    };
  }

  async function sendWaypointCommand(): Promise<void> {
    if (lastDrawnWaypoints.length === 0) {
      feedback = 'Draw at least one waypoint before issuing.';
      return;
    }
    try {
      const command = makeCommand('assign_waypoint', {
        waypoints: lastDrawnWaypoints.map(([lat, lon]) => ({ lat, lon }))
      });
      await sendCommand(command);
      feedback = `Waypoint command queued for ${command.robotId}.`;
    } catch (error) {
      feedback = error instanceof Error ? error.message : 'Failed to send waypoint command.';
    }
  }

  async function sendFollowCommand(): Promise<void> {
    if (!followTargetId) {
      feedback = 'Choose a target robot to follow.';
      return;
    }
    try {
      const command = makeCommand('follow_robot', { targetRobotId: followTargetId });
      await sendCommand(command);
      feedback = `Follow command issued. ${command.robotId} shadowing ${followTargetId}.`;
    } catch (error) {
      feedback = error instanceof Error ? error.message : 'Failed to send follow command.';
    }
  }

  async function sendCameraCommand(): Promise<void> {
    try {
      const command = makeCommand('request_camera_stream', { quality: cameraQuality });
      await sendCommand(command);
      feedback = `Camera stream request sent (${cameraQuality}).`;
    } catch (error) {
      feedback = error instanceof Error ? error.message : 'Failed to request camera stream.';
    }
  }
</script>

<section class="flex h-full flex-col gap-4 bg-slate-950/70 p-4 text-slate-100">
  <header>
    <h2 class="text-lg font-semibold">Command Console</h2>
    <p class="text-sm text-slate-400">Issue tactical directives to the selected robot.</p>
  </header>

  <div class="rounded border border-slate-700 bg-slate-900/60 p-4 text-sm">
    <div class="flex items-center justify-between gap-3">
      <div>
        <p class="text-slate-300">Telemetry Link</p>
        <p class="text-xs uppercase tracking-wide text-slate-500">{$connectionSummary}</p>
      </div>
      <label class="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <span>Simulated</span>
        <input
          aria-label="Toggle simulated mode"
          class="h-5 w-10 cursor-pointer accent-sky-500"
          checked={$simulationMode.forced}
          on:change={handleSimulationToggle}
          type="checkbox"
        />
      </label>
    </div>
    {#if $simulationMode.active && !$simulationMode.forced}
      <p class="mt-3 text-xs text-slate-500">
        Simulator running automatically while realtime link is unavailable.
      </p>
    {/if}
  </div>

  {#if $activeRobot}
    <div class="rounded border border-slate-700 bg-slate-900/60 p-4 text-sm">
      <p class="text-slate-300">Selected Robot</p>
      <p class="text-lg font-semibold text-white">{$activeRobot.name ?? $activeRobot.id}</p>
      <p class="text-xs uppercase tracking-wide text-slate-500">Type: {$activeRobot.type}</p>
    </div>
  {:else}
    <p class="rounded border border-dashed border-slate-700 bg-slate-900/50 p-4 text-sm text-slate-400">
      Select a robot on the map or list to enable command actions.
    </p>
  {/if}

  <section class="space-y-3">
    <div class="rounded border border-slate-700 bg-slate-900/50 p-4">
      <div class="flex items-center justify-between text-sm">
        <h3 class="font-semibold text-white">Assign Waypoints</h3>
        <span class="text-xs text-slate-400">{lastDrawnWaypoints.length} queued</span>
      </div>
      <p class="mt-1 text-xs text-slate-400">
        Use the draw tool on the map to lay out patrol paths or ingress routes.
      </p>
      <button
        class="mt-3 w-full rounded bg-accent px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-accent/80"
        on:click={sendWaypointCommand}
        type="button"
      >
        Queue Waypoint Command
      </button>
    </div>

    <div class="rounded border border-slate-700 bg-slate-900/50 p-4 space-y-3">
      <h3 class="text-sm font-semibold text-white">Follow Robot</h3>
      <select
        class="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
        bind:value={followTargetId}
      >
        <option value="">Select target robot</option>
        {#each $robots as robot (robot.id)}
          <option value={robot.id} disabled={robot.id === $selectedRobotId}>
            {robot.name ?? robot.id}
          </option>
        {/each}
      </select>
      <button
        class="w-full rounded border border-accent px-3 py-2 text-sm font-semibold text-accent hover:bg-accent/10"
        on:click={sendFollowCommand}
        type="button"
      >
        Issue Follow Command
      </button>
    </div>

    <div class="rounded border border-slate-700 bg-slate-900/50 p-4 space-y-3">
      <h3 class="text-sm font-semibold text-white">Request Camera Stream</h3>
      <select
        class="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
        bind:value={cameraQuality}
      >
        <option value="standard">Standard</option>
        <option value="high">High</option>
        <option value="thermal">Thermal</option>
      </select>
      <button
        class="w-full rounded border border-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        on:click={sendCameraCommand}
        type="button"
      >
        Request Stream
      </button>
    </div>
  </section>

  {#if feedback}
    <div class="rounded border border-slate-700 bg-slate-900/60 p-3 text-xs text-slate-300">
      {feedback}
    </div>
  {/if}
</section>
