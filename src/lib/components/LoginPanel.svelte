<script lang="ts">
  import { login } from '$stores/user';
  import { get, writable } from 'svelte/store';

  const email = writable('');
  const password = writable('');
  const isSubmitting = writable(false);
  const errorMessage = writable('');

  async function handleSubmit(event: Event): Promise<void> {
    event.preventDefault();
    errorMessage.set('');
    isSubmitting.set(true);
    try {
  await login(get(email), get(password));
    } catch (error) {
      errorMessage.set(error instanceof Error ? error.message : 'Unable to sign in.');
    } finally {
      isSubmitting.set(false);
    }
  }

</script>

<section class="mx-auto flex w-full max-w-sm flex-col gap-6 rounded-lg border border-slate-700 bg-slate-950/90 p-6 text-slate-100">
  <header class="space-y-1 text-center">
    <h1 class="text-2xl font-semibold">C2 Login</h1>
    <p class="text-sm text-slate-400">Authenticate with your Appwrite credentials to access the command deck.</p>
  </header>

  <form class="flex flex-col gap-4" on:submit|preventDefault={handleSubmit}>
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-slate-300">Email</span>
      <input
        class="rounded border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 focus:border-accent focus:outline-none"
        type="email"
        bind:value={$email}
        required
      />
    </label>

    <label class="flex flex-col gap-1 text-sm">
      <span class="text-slate-300">Password</span>
      <input
        class="rounded border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 focus:border-accent focus:outline-none"
        type="password"
        bind:value={$password}
        required
      />
    </label>

    {#if $errorMessage}
      <div class="rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs text-red-300">
        {$errorMessage}
      </div>
    {/if}

    <button
      class="rounded bg-accent px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-accent/90 disabled:opacity-60"
      type="submit"
      disabled={$isSubmitting}
    >
      {$isSubmitting ? 'Signing In…' : 'Sign In'}
    </button>
  </form>
</section>
