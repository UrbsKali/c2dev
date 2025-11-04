<script lang="ts">
  import { onDestroy } from 'svelte';

  export let robotId: string | null = null;
  export let streamUrl: string | null = null;
  export let isStreaming = false;

  let videoElement: HTMLVideoElement | null = null;

  onDestroy(() => {
    if (typeof window === 'undefined' || typeof MediaStream === 'undefined') return;
    if (videoElement?.srcObject instanceof MediaStream) {
      const tracks = videoElement.srcObject.getTracks();
      tracks.forEach((track) => track.stop());
    }
  });
</script>

<section class="flex h-full flex-col gap-3 rounded border border-slate-700 bg-slate-950/80 p-4 text-slate-200">
  <header>
    <h2 class="text-lg font-semibold">Camera Preview</h2>
    <p class="text-sm text-slate-400">WebRTC integration hook for live sensor feeds.</p>
  </header>

  <div class="flex-1 rounded border border-slate-700 bg-black/80">
    {#if isStreaming && streamUrl}
      <video
        bind:this={videoElement}
        autoplay
        controls
        muted
        playsinline
        src={streamUrl}
        class="h-full w-full object-contain"
      ></video>
    {:else}
      <div class="flex h-full w-full flex-col items-center justify-center gap-2 text-xs uppercase tracking-wide text-slate-500">
        <span>No active stream</span>
        {#if robotId}
          <span>Request from commands panel</span>
        {:else}
          <span>Select a robot to request stream</span>
        {/if}
      </div>
    {/if}
  </div>

  <p class="text-xs text-slate-500">
    Implementation note: integrate WebRTC signaling via Supabase Edge Functions and coordinated ICE configuration once available.
  </p>
</section>
