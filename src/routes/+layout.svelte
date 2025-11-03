<script lang="ts">
  import { onMount } from 'svelte';
  import '../app.css';
  import { bootstrap } from '../main';

  onMount(() => {
    void bootstrap();
  });
</script>

<svelte:head>
  <title>Robot Command &amp; Control</title>
</svelte:head>

<slot />
