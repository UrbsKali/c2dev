<script lang="ts">
  import type { Robot } from '$types';

  export let robot: Robot;
</script>

<div class="flex items-center gap-3 rounded border border-slate-700 bg-slate-900/70 px-3 py-2">
  <div class="flex flex-col text-xs text-slate-300">
    <span class="text-sm font-semibold text-white">{robot.name ?? robot.id}</span>
    <span class="uppercase tracking-wide">{robot.type}</span>
    <span class="text-[11px]">Status: {robot.status ?? 'Unknown'}</span>
  </div>
  {#if robot.position}
    <div class="text-right text-xs text-slate-400">
      <div>{robot.position.lat.toFixed(5)}, {robot.position.lon.toFixed(5)}</div>
      {#if robot.speed}
        <div>{robot.speed.toFixed(1)} m/s</div>
      {/if}
    </div>
  {/if}
</div>
