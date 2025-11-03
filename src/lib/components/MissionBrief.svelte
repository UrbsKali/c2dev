<script lang="ts">
  import { marked } from 'marked';
  import { missionBriefMarkdown } from '$stores/missions';

  $: content = marked.parse($missionBriefMarkdown ?? 'Mission briefing unavailable.');
</script>

<section class="h-full overflow-y-auto bg-slate-950/80 p-4 text-slate-200">
  <header class="mb-3 border-b border-slate-700 pb-3">
    <h2 class="text-lg font-semibold">Mission Brief</h2>
    <p class="text-sm text-slate-400">Stay aligned on objectives, rules of engagement, and comms plans.</p>
  </header>
  <div class="prose prose-invert max-w-none">{@html content}</div>
</section>
