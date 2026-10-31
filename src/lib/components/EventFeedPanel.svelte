<script lang="ts">
  import {
    events,
    unacknowledgedCount,
    activeFilter,
    filteredEvents,
    acknowledgeEvent,
    acknowledgeAll,
    emitEvent
  } from '$stores/events';
  import { robots, selectedRobotId } from '$stores/robots';
  import type { EventSeverity } from '$types';

  let testTitle = 'Obstacle Detected';
  let testSeverity: EventSeverity = 'warning';
  let testMessage = 'Infrared proximity sensor triggered at 0.45m';

  async function handleSimulateEvent(): Promise<void> {
    await emitEvent({
      robotId: $selectedRobotId ?? $robots[0]?.id ?? 'ROBOT-ALPHA',
      severity: testSeverity,
      title: testTitle,
      message: testMessage
    });
  }
</script>

<div class="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/80 p-4 text-slate-100 shadow-xl backdrop-blur-sm">
  <div class="flex items-center justify-between border-b border-slate-800 pb-3">
    <div class="flex items-center gap-2">
      <div class="h-2 w-2 rounded-full bg-accent"></div>
      <h3 class="text-xs font-mono font-bold tracking-wider text-white uppercase">Mission Alerts &amp; Events</h3>
      {#if $unacknowledgedCount > 0}
        <span class="rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-bold text-red-400 border border-red-500/40 animate-pulse">
          {$unacknowledgedCount} new
        </span>
      {/if}
    </div>
    {#if $unacknowledgedCount > 0}
      <button
        type="button"
        class="rounded bg-slate-800 px-2.5 py-1 text-xs text-slate-300 transition hover:bg-slate-700 hover:text-white"
        on:click={acknowledgeAll}
      >
        Acknowledge All
      </button>
    {/if}
  </div>

  <!-- Filters -->
  <div class="flex flex-wrap items-center gap-2 text-xs">
    <select
      class="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-300 focus:border-accent focus:outline-none"
      bind:value={$activeFilter.severity}
    >
      <option value="all">All Severities</option>
      <option value="critical">Critical / Error</option>
      <option value="warning">Warning</option>
      <option value="info">Info</option>
    </select>

    <select
      class="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-300 focus:border-accent focus:outline-none"
      bind:value={$activeFilter.robotId}
    >
      <option value={null}>All Robots</option>
      {#each $robots as robot}
        <option value={robot.id}>{robot.id} ({robot.name ?? robot.type})</option>
      {/each}
    </select>
  </div>

  <!-- Event list -->
  <div class="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
    {#if $filteredEvents.length === 0}
      <p class="py-6 text-center text-xs text-slate-500">No events recorded matching criteria.</p>
    {:else}
      {#each $filteredEvents as event (event.id)}
        <div
          class="flex items-start justify-between gap-2 rounded border p-2.5 text-xs transition
            {event.acknowledged
              ? 'border-slate-800 bg-slate-950/40 text-slate-400'
              : event.severity === 'critical' || event.severity === 'error'
              ? 'border-red-500/50 bg-red-950/30 text-red-200'
              : event.severity === 'warning'
              ? 'border-amber-500/40 bg-amber-950/20 text-amber-200'
              : 'border-cyan-500/30 bg-cyan-950/20 text-cyan-200'}"
        >
          <div class="flex flex-col gap-0.5">
            <div class="flex items-center gap-1.5">
              <span class="font-semibold">{event.title}</span>
              {#if event.robotId}
                <span class="rounded bg-slate-800/80 px-1 py-0.2 font-mono text-[10px] text-slate-300">
                  {event.robotId}
                </span>
              {/if}
            </div>
            {#if event.message}
              <p class="text-[11px] opacity-90">{event.message}</p>
            {/if}
            <span class="text-[10px] text-slate-500">
              {new Date(event.createdAt).toLocaleTimeString()}
              {#if event.acknowledged}
                • <span class="text-emerald-400">Acknowledged</span>
              {/if}
            </span>
          </div>

          {#if !event.acknowledged}
            <button
              type="button"
              class="shrink-0 rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-300 transition hover:bg-slate-700 hover:text-white"
              on:click={() => acknowledgeEvent(event.id)}
            >
              Ack
            </button>
          {/if}
        </div>
      {/each}
    {/if}
  </div>

  <!-- Dev simulator box -->
  <details class="mt-2 rounded border border-slate-800 bg-slate-950/60 p-2.5 text-xs">
    <summary class="cursor-pointer font-medium text-slate-400 hover:text-slate-200">
      Simulate New Alert (Dev Tool)
    </summary>
    <div class="mt-3 flex flex-col gap-2">
      <div class="grid grid-cols-2 gap-2">
        <input
          class="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200"
          type="text"
          bind:value={testTitle}
          placeholder="Title"
        />
        <select
          class="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200"
          bind:value={testSeverity}
        >
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
          <option value="error">Error</option>
        </select>
      </div>
      <input
        class="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200"
        type="text"
        bind:value={testMessage}
        placeholder="Details message"
      />
      <button
        type="button"
        class="rounded bg-accent/20 border border-accent/50 px-3 py-1.5 font-semibold text-accent transition hover:bg-accent hover:text-slate-950"
        on:click={handleSimulateEvent}
      >
        Trigger Alert
      </button>
    </div>
  </details>
</div>
