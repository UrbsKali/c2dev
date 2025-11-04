<script lang="ts">
  import { onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import LoginPanel from '$components/LoginPanel.svelte';
  import { changePassword, currentUser, isAuthenticated, logout, updateProfile, userRole } from '$stores/user';
  import type { UserRole } from '$stores/user';
  import { writable } from 'svelte/store';

  const navLinks = [
    { href: '/map', label: 'Carte' },
    { href: '/control', label: 'Contrôle' },
    { href: '/admin', label: 'Administration' },
    { href: '/user', label: 'Profil' }
  ];

  const displayName = writable('');
  const nameDirty = writable(false);
  const profileBusy = writable(false);
  const passwordBusy = writable(false);
  const password = writable('');
  const confirmPassword = writable('');
  const profileFeedback = writable<{ message: string; tone: 'success' | 'error' } | null>(null);
  const passwordFeedback = writable<{ message: string; tone: 'success' | 'error' } | null>(null);

  let profileTimer: ReturnType<typeof setTimeout> | null = null;
  let passwordTimer: ReturnType<typeof setTimeout> | null = null;

  const unsubscribe = currentUser.subscribe((user) => {
    if (!user) {
      displayName.set('');
      nameDirty.set(false);
      return;
    }
    nameDirty.update((dirty) => {
      if (dirty) return true;
      displayName.set(user.name);
      return false;
    });
  });

  onDestroy(() => {
    unsubscribe();
    if (profileTimer) {
      clearTimeout(profileTimer);
      profileTimer = null;
    }
    if (passwordTimer) {
      clearTimeout(passwordTimer);
      passwordTimer = null;
    }
  });

  function formatRole(role: UserRole): string {
    switch (role) {
      case 'admin':
        return 'Administrateur';
      case 'mission_commander':
        return 'Mission commander';
      case 'commander':
        return 'Commander';
      default:
        return 'Opérateur';
    }
  }

  function setProfileFeedback(message: string, tone: 'success' | 'error'): void {
    profileFeedback.set({ message, tone });
    if (profileTimer) {
      clearTimeout(profileTimer);
    }
    profileTimer = setTimeout(() => {
      profileFeedback.set(null);
      profileTimer = null;
    }, 4000);
  }

  function setPasswordFeedback(message: string, tone: 'success' | 'error'): void {
    passwordFeedback.set({ message, tone });
    if (passwordTimer) {
      clearTimeout(passwordTimer);
    }
    passwordTimer = setTimeout(() => {
      passwordFeedback.set(null);
      passwordTimer = null;
    }, 4000);
  }

  async function handleProfileSubmit(event: Event): Promise<void> {
    event.preventDefault();
    profileFeedback.set(null);
    profileBusy.set(true);
    try {
      const nameValue = $displayName.trim();
      if (!nameValue) {
        setProfileFeedback('Merci de fournir un nom à afficher.', 'error');
        return;
      }
      await updateProfile({ name: nameValue });
      nameDirty.set(false);
      setProfileFeedback('Identité mise à jour.', 'success');
    } catch (error) {
      console.error('Profile update failed', error);
      setProfileFeedback("Impossible de mettre à jour votre profil.", 'error');
    } finally {
      profileBusy.set(false);
    }
  }

  async function handlePasswordSubmit(event: Event): Promise<void> {
    event.preventDefault();
    passwordFeedback.set(null);
    passwordBusy.set(true);
    try {
      const newPassword = $password.trim();
      const confirmation = $confirmPassword.trim();
      if (!newPassword || !confirmation) {
        setPasswordFeedback('Les deux champs de mot de passe sont requis.', 'error');
        return;
      }
      if (newPassword !== confirmation) {
        setPasswordFeedback('Les mots de passe ne correspondent pas.', 'error');
        return;
      }
      await changePassword(newPassword);
      password.set('');
      confirmPassword.set('');
      setPasswordFeedback('Mot de passe mis à jour.', 'success');
    } catch (error) {
      console.error('Password change failed', error);
      const message = error instanceof Error ? error.message : 'Impossible de mettre à jour le mot de passe.';
      setPasswordFeedback(message, 'error');
    } finally {
      passwordBusy.set(false);
    }
  }

  async function handleLogout(): Promise<void> {
    await logout();
  }
</script>

{#if !$isAuthenticated}
  <div class="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
    <LoginPanel />
  </div>
{:else}
  <div class="flex min-h-screen flex-col bg-slate-950 text-slate-100">
    <header class="flex items-center justify-between border-b border-slate-800 px-6 py-4">
      <div>
        <h1 class="text-xl font-semibold">Profil utilisateur</h1>
        <p class="text-xs text-slate-400">Gérer vos informations personnelles et la sécurité de votre compte.</p>
      </div>
      <div class="flex items-center gap-3 text-xs text-slate-300">
        <nav class="flex items-center gap-1 rounded-full border border-slate-800 bg-slate-900/60 px-2 py-1">
          {#each navLinks as link}
            {#if link.href !== '/admin' || $userRole === 'admin' || $userRole === 'mission_commander'}
              <a
                class="rounded-full px-3 py-1 text-[11px] uppercase tracking-wide transition hover:bg-slate-800"
                class:bg-accent={$page.url.pathname.startsWith(link.href)}
                class:text-slate-950={$page.url.pathname.startsWith(link.href)}
                class:text-slate-300={!$page.url.pathname.startsWith(link.href)}
                href={link.href}
              >
                {link.label}
              </a>
            {/if}
          {/each}
        </nav>
        <button
          class="rounded border border-slate-700 px-3 py-1.5 text-[11px] uppercase tracking-wide text-slate-200 transition hover:border-slate-500 hover:text-white"
          type="button"
          on:click={handleLogout}
        >
          Déconnexion
        </button>
      </div>
    </header>

    <main class="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
      <section class="rounded border border-slate-800 bg-slate-900/60 p-6">
        <h2 class="text-sm font-semibold text-white">Informations générales</h2>
        <dl class="mt-4 grid gap-3 text-xs text-slate-300 md:grid-cols-2">
          <div>
            <dt class="uppercase tracking-wide text-slate-500">Identifiant</dt>
            <dd class="text-sm font-semibold text-white">{$currentUser?.id}</dd>
          </div>
          <div>
            <dt class="uppercase tracking-wide text-slate-500">Rôle</dt>
            <dd class="text-sm font-semibold text-white">{formatRole($userRole)}</dd>
          </div>
          <div class="md:col-span-2">
            <dt class="uppercase tracking-wide text-slate-500">Robots assignés</dt>
            <dd class="text-sm text-white">{($currentUser?.assignedRobots ?? []).length > 0 ? ($currentUser?.assignedRobots ?? []).join(', ') : 'Aucun robot attribué'}</dd>
          </div>
        </dl>
      </section>

      <section class="grid gap-6 lg:grid-cols-[minmax(300px,360px)_minmax(320px,1fr)]">
        <form class="rounded border border-slate-800 bg-slate-900/60 p-6" on:submit|preventDefault={handleProfileSubmit}>
          <h2 class="text-sm font-semibold text-white">Profil</h2>
          <p class="mt-1 text-xs text-slate-400">Mettre à jour votre nom affiché dans l'interface.</p>
          <label class="mt-4 block text-xs uppercase tracking-wide text-slate-400">
            Nom affiché
            <input
              class="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-accent/70 focus:outline-none"
              bind:value={$displayName}
              on:input={() => nameDirty.set(true)}
              placeholder="Indicatif d'appel"
            />
          </label>
          {#if $profileFeedback}
            <div
              class={`mt-3 rounded border px-3 py-2 text-xs ${
                $profileFeedback.tone === 'error'
                  ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                  : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              }`}
            >
              {$profileFeedback.message}
            </div>
          {/if}
          <button
            class="mt-4 w-full rounded bg-accent px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={$profileBusy}
          >
            {$profileBusy ? 'Enregistrement…' : 'Sauvegarder'}
          </button>
        </form>

        <form class="rounded border border-slate-800 bg-slate-900/60 p-6" on:submit|preventDefault={handlePasswordSubmit}>
          <h2 class="text-sm font-semibold text-white">Sécurité</h2>
          <p class="mt-1 text-xs text-slate-400">Changer votre mot de passe Supabase.</p>
          <label class="mt-4 block text-xs uppercase tracking-wide text-slate-400">
            Nouveau mot de passe
            <input
              class="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-accent/70 focus:outline-none"
              type="password"
              bind:value={$password}
              placeholder="12 caractères minimum"
            />
          </label>
          <label class="mt-3 block text-xs uppercase tracking-wide text-slate-400">
            Confirmer le mot de passe
            <input
              class="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-accent/70 focus:outline-none"
              type="password"
              bind:value={$confirmPassword}
              placeholder="Répétez le mot de passe"
            />
          </label>
          {#if $passwordFeedback}
            <div
              class={`mt-3 rounded border px-3 py-2 text-xs ${
                $passwordFeedback.tone === 'error'
                  ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                  : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              }`}
            >
              {$passwordFeedback.message}
            </div>
          {/if}
          <button
            class="mt-4 w-full rounded bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={$passwordBusy}
          >
            {$passwordBusy ? 'Mise à jour…' : 'Modifier le mot de passe'}
          </button>
        </form>
      </section>
    </main>
  </div>
{/if}
