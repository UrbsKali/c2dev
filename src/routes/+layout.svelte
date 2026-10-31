<script lang="ts">
  import { onMount } from 'svelte';
  import '../app.css';
  import { bootstrap } from '../main';
  import EventToasts from '$components/EventToasts.svelte';

  onMount(() => {
    void bootstrap();
  });
</script>

<svelte:head>
  <title>Robot Command &amp; Control</title>
</svelte:head>

<EventToasts />
<slot />
