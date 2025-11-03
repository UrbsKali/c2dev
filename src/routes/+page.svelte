<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  onMount(() => {
    void goto('/map');
  });
</script>

<div class="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
  <p class="text-sm text-slate-400">Routing to primary mission map…</p>
</div>
