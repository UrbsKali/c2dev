<script lang="ts">
  import { playbackCursor, isPlaybackMode } from '$stores/robots';

  export let max = 1000;

  function togglePlayback(): void {
    isPlaybackMode.update((value) => !value);
  }
</script>

<div class="flex items-center gap-3 rounded border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-200">
  <button
    class="rounded bg-slate-800 px-3 py-1 text-xs font-semibold uppercase tracking-wide hover:bg-slate-700"
    on:click={togglePlayback}
    type="button"
  >
    {$isPlaybackMode ? 'Live' : 'Playback'}
  </button>

  <input
    class="flex-1 accent-accent"
    type="range"
    min="0"
    {max}
    bind:value={$playbackCursor}
  />
  <span class="text-xs text-slate-400">Frame {$playbackCursor}</span>
</div>
