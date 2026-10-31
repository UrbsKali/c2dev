<script lang="ts">
  import { activeToasts, dismissToast, acknowledgeEvent } from '$stores/events';
  import type { EventSeverity } from '$types';

  function getSeverityClasses(severity: EventSeverity): {
    border: string;
    bg: string;
    text: string;
    badge: string;
    icon: string;
  } {
    switch (severity) {
      case 'critical':
      case 'error':
        return {
          border: 'border-red-500/80',
          bg: 'bg-red-950/90',
          text: 'text-red-200',
          badge: 'bg-red-500 text-white animate-pulse',
          icon: '[!]'
        };
      case 'warning':
        return {
          border: 'border-amber-500/70',
          bg: 'bg-amber-950/90',
          text: 'text-amber-200',
          badge: 'bg-amber-500 text-slate-950 font-bold',
          icon: '[WARN]'
        };
      case 'info':
      default:
        return {
          border: 'border-cyan-500/50',
          bg: 'bg-slate-900/90',
          text: 'text-slate-200',
          badge: 'bg-cyan-500/20 text-cyan-300',
          icon: '[INFO]'
        };
    }
  }
</script>

<div
  class="pointer-events-none fixed right-4 top-20 z-[9999] flex w-full max-w-sm flex-col gap-2.5 transition-all"
  aria-live="polite"
>
  {#each $activeToasts as toast (toast.id)}
    {@const style = getSeverityClasses(toast.severity)}
    <div
      class="pointer-events-auto flex flex-col gap-2 rounded-lg border p-3.5 shadow-2xl backdrop-blur-md transition-all duration-300 hover:shadow-cyan-500/10 {style.bg} {style.border}"
      role="alert"
    >
      <div class="flex items-start justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="text-base">{style.icon}</span>
          <span class="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider {style.badge}">
            {toast.severity}
          </span>
          {#if toast.robotId}
            <span class="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-300">
              {toast.robotId}
            </span>
          {/if}
        </div>
        <button
          type="button"
          class="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          on:click={() => dismissToast(toast.id)}
          aria-label="Dismiss alert"
        >
          ✕
        </button>
      </div>

      <div>
        <h4 class="text-xs font-semibold text-white">{toast.title}</h4>
        {#if toast.message}
          <p class="mt-0.5 text-[11px] {style.text}">{toast.message}</p>
        {/if}
      </div>

      <div class="flex items-center justify-between pt-1 text-[10px] text-slate-400">
        <span>{new Date(toast.createdAt).toLocaleTimeString()}</span>
        {#if !toast.acknowledged}
          <button
            type="button"
            class="rounded bg-slate-800 px-2 py-1 font-medium text-slate-200 transition hover:bg-slate-700 hover:text-white active:scale-95"
            on:click={() => acknowledgeEvent(toast.id)}
          >
            Acknowledge
          </button>
        {/if}
      </div>
    </div>
  {/each}
</div>

