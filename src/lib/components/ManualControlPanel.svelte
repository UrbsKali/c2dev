<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { selectedRobotId, robots } from '$stores/robots';
  import {
    teleopState,
    sendControlFrame,
    triggerAction,
    emergencyStop,
    inputToggles
  } from '$services/teleop';
  import { gamepadInfo, initGamepadListener } from '$services/gamepad';
  import { TELEOP_CONFIG } from '$config/teleop';
  import {
    activeProfile,
    profiles,
    profileIsAuto,
    setProfileOverride,
    keyboardLayout,
    setKeyboardLayout,
    keyOverrides,
    setKeyOverride,
    resetKeyOverrides,
    gamepadOverrides,
    setGamepadOverride,
    effectiveGamepadAxis,
    emergencyButton,
    setEmergencyButton,
    effectiveKey,
    buildKeyMap,
    axisSlot,
    actionSlot,
    type ControlFrame,
    type KeyboardLayout
  } from '$teleop';

  const LAYOUTS: KeyboardLayout[] = ['azerty', 'qwerty', 'arrows'];

  $: activeRobot = $robots.find((r) => r.id === $selectedRobotId);
  $: profile = $activeProfile;
  $: keyMap = buildKeyMap(profile, $keyboardLayout, $keyOverrides);
  $: keySlots = [
    ...profile.axes.flatMap((a) => [
      { slot: axisSlot(a.id, '+'), label: `${a.label} +` },
      { slot: axisSlot(a.id, '-'), label: `${a.label} −` }
    ]),
    ...profile.actions.map((a) => ({ slot: actionSlot(a.id), label: a.label }))
  ];
  $: keyFor = (slot: string): string =>
    (effectiveKey(profile, slot, $keyboardLayout, $keyOverrides) ?? '—').toUpperCase();

  let isListeningSlot: string | null = null;
  const pressedKeys = new Set<string>();
  let keyboardInterval: number | null = null;
  let showConfigModal = false;

  function evaluateKeyboardInput(): void {
    if (!$inputToggles.keyboardEnabled) return;

    if (pressedKeys.has(TELEOP_CONFIG.EMERGENCY_STOP_KEY)) {
      void emergencyStop();
      return;
    }

    const frame: ControlFrame = {};
    for (const key of pressedKeys) {
      const target = keyMap.get(key);
      if (target?.kind === 'axis') frame[target.axisId] = (frame[target.axisId] ?? 0) + target.dir;
    }

    if (Object.values(frame).some((v) => v !== 0)) {
      void sendControlFrame(frame, 'keyboard');
    } else if ($teleopState.activeSource === 'keyboard') {
      void sendControlFrame({}, 'keyboard', true);
    }
  }

  function handleKeyDown(e: KeyboardEvent): void {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

    if (isListeningSlot) {
      e.preventDefault();
      setKeyOverride(profile.id, isListeningSlot, e.key.length === 1 ? e.key.toLowerCase() : e.key);
      isListeningSlot = null;
      return;
    }

    const key = e.key.toLowerCase();
    if (pressedKeys.has(key)) return;
    pressedKeys.add(key);

    const target = keyMap.get(key);
    if (target?.kind === 'action' && $inputToggles.keyboardEnabled) {
      void triggerAction(target.actionId, 'keyboard');
    }
    evaluateKeyboardInput();
  }

  function handleKeyUp(e: KeyboardEvent): void {
    const key = e.key.toLowerCase();
    if (pressedKeys.delete(key)) evaluateKeyboardInput();
  }

  function handleDpadPress(dx: -1 | 0 | 1, dy: -1 | 0 | 1): void {
    void sendControlFrame({ [profile.dpad.x]: dx, [profile.dpad.y]: dy }, 'ui');
  }

  function handleButtonRelease(): void {
    if ($teleopState.activeSource === 'ui') {
      void sendControlFrame({}, 'ui', true);
    }
  }

  // Reactive on purpose: a plain function hiding the store read would never re-render the gizmo.
  $: axisVal = (id: string): number => $teleopState.axes[id] ?? 0;

  onMount(() => {
    initGamepadListener();
    keyboardInterval = window.setInterval(evaluateKeyboardInput, TELEOP_CONFIG.KEYBOARD_POLL_MS);
  });

  onDestroy(() => {
    if (keyboardInterval) clearInterval(keyboardInterval);
  });

  const dpadBtn =
    'flex h-11 w-11 items-center justify-center rounded border border-slate-700 bg-slate-800 text-sm font-bold text-slate-200 shadow transition active:scale-90 active:bg-accent active:text-slate-950 hover:bg-slate-700';
</script>

<svelte:window on:keydown={handleKeyDown} on:keyup={handleKeyUp} />

<!-- Main teleop dashboard panel. Everything below is driven by the active device profile. -->
<section class="w-full rounded-lg border border-slate-800 bg-slate-900/90 p-5 text-slate-100 shadow-2xl backdrop-blur-md">
  <!-- Top Bar -->
  <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
    <div class="flex flex-wrap items-center gap-3">
      <div class="flex items-center gap-2">
        <span class="text-xs font-mono font-bold tracking-widest text-accent uppercase">TELEOP SYSTEM</span>
        <span class="text-xs text-slate-600">|</span>
        <h3 class="text-base font-semibold text-white tracking-wide">Manual Control Deck</h3>
      </div>

      <div class="flex items-center gap-2 text-xs">
        <span class="text-slate-400">Target:</span>
        {#if activeRobot}
          <span class="rounded bg-accent/10 border border-accent/30 px-2 py-0.5 font-mono font-bold text-accent">
            {activeRobot.id}
          </span>
          <span class="text-emerald-400 font-semibold text-[11px] uppercase tracking-wide">Ready to drive</span>
        {:else}
          <span class="rounded bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 font-medium text-amber-300 text-[11px]">
            No robot selected (Testing sandbox mode)
          </span>
        {/if}
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <!-- Device profile: automatic from the selected robot, or forced by hand -->
      <div class="flex items-center gap-1.5 rounded border border-slate-800 bg-slate-950 px-2 py-1 text-xs">
        <span class="text-slate-400 text-[11px] font-mono">Device:</span>
        <select
          class="bg-transparent text-accent font-semibold text-xs focus:outline-none cursor-pointer"
          value={$profileIsAuto ? 'auto' : profile.id}
          on:change={(e) => setProfileOverride(e.currentTarget.value === 'auto' ? null : e.currentTarget.value)}
        >
          <option value="auto" class="bg-slate-900 text-slate-200">Auto — {profile.name}</option>
          {#each $profiles as p}
            <option value={p.id} class="bg-slate-900 text-slate-200">{p.name}{p.origin === 'remote' ? ' (robot)' : ''}</option>
          {/each}
        </select>
      </div>

      <div class="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium
        {$gamepadInfo.connected ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' : 'border-slate-800 bg-slate-950 text-slate-400'}">
        <span class="h-2 w-2 rounded-full {$gamepadInfo.connected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}"></span>
        <span>{$gamepadInfo.connected ? 'Gamepad Connected' : 'Gamepad Offline'}</span>
      </div>

      {#if $gamepadInfo.eStopHeld}
        <span class="rounded-full border border-red-500/60 bg-red-500/15 px-2.5 py-1 text-xs font-bold text-red-300 animate-pulse">E-STOP HELD</span>
      {/if}

      <button
        type="button"
        class="rounded border border-cyan-500/50 bg-cyan-950/40 px-3 py-1 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-900/60 active:scale-95 shadow-sm"
        on:click={() => (showConfigModal = true)}
      >
        Configure &amp; Calibration
      </button>
    </div>
  </div>

  <!-- Main Teleop Grid (3 Columns) -->
  <div class="mt-4 grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
    <!-- Col 1: Gizmos (one per stick of the profile) & live readout -->
    <div class="flex flex-col items-center justify-center rounded-lg border border-slate-800 bg-slate-950/60 p-4">
      <div class="flex items-center justify-between w-full mb-3 text-[11px] font-mono text-slate-400">
        <span>LIVE TELEOP GIZMO</span>
        <span class="uppercase text-accent font-bold">{$teleopState.activeSource}</span>
      </div>

      <div class="flex flex-wrap items-start justify-center gap-4">
        {#each profile.gizmo as stick}
          <div class="flex flex-col items-center gap-1.5">
            <div class="relative flex h-32 w-32 items-center justify-center rounded-full border-2 border-slate-700 bg-slate-900 shadow-inner">
              <div class="absolute h-full w-[1px] bg-slate-800"></div>
              <div class="absolute h-[1px] w-full bg-slate-800"></div>
              <div class="absolute h-20 w-20 rounded-full border border-slate-800"></div>
              <div
                class="absolute h-9 w-9 rounded-full border-2 border-accent bg-accent/30 shadow-lg shadow-accent/50 transition-transform duration-75 ease-out"
                style="transform: translate({axisVal(stick.x) * 42}px, {-axisVal(stick.y) * 42}px);"
              >
                <div class="h-full w-full rounded-full bg-accent animate-ping opacity-40"></div>
              </div>
            </div>
            <span class="text-[10px] font-mono uppercase text-slate-500">{stick.label}</span>
          </div>
        {/each}
      </div>

      <div class="mt-4 flex w-full flex-wrap justify-around gap-x-4 gap-y-1 text-xs font-mono border-t border-slate-800/80 pt-3 text-slate-300">
        {#each profile.axes as axis}
          <div>{axis.label}: <strong class="text-white">{axisVal(axis.id).toFixed(2)}</strong></div>
        {/each}
      </div>
    </div>

    <!-- Col 2: D-Pad, profile actions & speed slider -->
    <div class="flex flex-col items-center justify-between h-full rounded-lg border border-slate-800 bg-slate-950/60 p-4">
      <span class="text-[11px] font-mono text-slate-400 uppercase w-full text-left mb-2">Directional Override</span>

      <div class="flex flex-col items-center justify-center gap-2 my-auto">
        <button type="button" class={dpadBtn}
          on:mousedown={() => handleDpadPress(0, 1)} on:mouseup={handleButtonRelease} on:mouseleave={handleButtonRelease}
          on:touchstart|passive={() => handleDpadPress(0, 1)} on:touchend={handleButtonRelease}>▲</button>

        <div class="flex items-center gap-2">
          <button type="button" class={dpadBtn}
            on:mousedown={() => handleDpadPress(-1, 0)} on:mouseup={handleButtonRelease} on:mouseleave={handleButtonRelease}
            on:touchstart|passive={() => handleDpadPress(-1, 0)} on:touchend={handleButtonRelease}>◀</button>

          <button
            type="button"
            class="flex h-11 w-14 items-center justify-center rounded border border-red-500/80 bg-red-950/80 text-xs font-bold text-red-300 shadow transition active:scale-90 hover:bg-red-900"
            on:click={() => emergencyStop()}
          >
            STOP
          </button>

          <button type="button" class={dpadBtn}
            on:mousedown={() => handleDpadPress(1, 0)} on:mouseup={handleButtonRelease} on:mouseleave={handleButtonRelease}
            on:touchstart|passive={() => handleDpadPress(1, 0)} on:touchend={handleButtonRelease}>▶</button>
        </div>

        <button type="button" class={dpadBtn}
          on:mousedown={() => handleDpadPress(0, -1)} on:mouseup={handleButtonRelease} on:mouseleave={handleButtonRelease}
          on:touchstart|passive={() => handleDpadPress(0, -1)} on:touchend={handleButtonRelease}>▼</button>
      </div>

      <!-- Discrete actions exposed by this device (takeoff, land, ...) -->
      {#if profile.actions.length > 0}
        <div class="flex w-full flex-wrap justify-center gap-2 border-t border-slate-800/80 pt-3">
          {#each profile.actions as action}
            <button
              type="button"
              class="rounded border px-3 py-1.5 text-xs font-semibold transition active:scale-95
                {action.danger ? 'border-amber-500/60 bg-amber-950/50 text-amber-300 hover:bg-amber-900/60' : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'}"
              on:click={() => triggerAction(action.id, 'ui')}
            >
              {action.label}
            </button>
          {/each}
        </div>
      {/if}

      <div class="mt-3 flex w-full items-center justify-between border-t border-slate-800/80 pt-3 text-xs">
        <span class="text-slate-400 font-mono">Max Output:</span>
        <div class="flex items-center gap-2">
          <input
            type="range"
            min={TELEOP_CONFIG.MIN_SPEED_FACTOR}
            max={TELEOP_CONFIG.MAX_SPEED_FACTOR}
            step={TELEOP_CONFIG.SPEED_FACTOR_STEP}
            class="w-28 accent-accent cursor-pointer"
            bind:value={$teleopState.speedFactor}
          />
          <span class="font-mono font-bold text-accent w-10 text-right">{Math.round($teleopState.speedFactor * 100)}%</span>
        </div>
      </div>
    </div>

    <!-- Col 3: Input routing & key preview -->
    <div class="flex flex-col justify-between h-full rounded-lg border border-slate-800 bg-slate-950/60 p-4">
      <div>
        <span class="text-[11px] font-mono text-slate-400 uppercase mb-3 block">Input Routing</span>
        <div class="grid grid-cols-2 gap-2 text-xs">
          <label class="flex cursor-pointer items-center justify-between rounded border border-slate-800 bg-slate-900 px-3 py-2 hover:bg-slate-800/80">
            <span class="text-slate-300 font-medium">Keyboard</span>
            <input type="checkbox" class="accent-accent h-4 w-4" bind:checked={$inputToggles.keyboardEnabled} />
          </label>
          <label class="flex cursor-pointer items-center justify-between rounded border border-slate-800 bg-slate-900 px-3 py-2 hover:bg-slate-800/80">
            <span class="text-slate-300 font-medium">Gamepad</span>
            <input type="checkbox" class="accent-accent h-4 w-4" bind:checked={$inputToggles.gamepadEnabled} />
          </label>
        </div>

        <div class="mt-4 flex items-center justify-between text-xs">
          <span class="text-slate-400 font-mono">Key layout:</span>
          <div class="flex gap-1.5">
            {#each LAYOUTS as layout}
              <button
                type="button"
                class="rounded px-2 py-1 text-[11px] uppercase tracking-wider font-semibold transition
                  {$keyboardLayout === layout ? 'bg-accent text-slate-950' : 'bg-slate-800 text-slate-400 hover:text-white'}"
                on:click={() => setKeyboardLayout(layout)}
              >
                {layout}
              </button>
            {/each}
          </div>
        </div>
      </div>

      <div class="grid grid-cols-4 gap-1 pt-3 border-t border-slate-800/80 text-center">
        {#each keySlots as { slot, label }}
          <div class="rounded border border-slate-800/80 bg-slate-900/60 p-1">
            <div class="text-[9px] uppercase tracking-wider text-slate-500 truncate">{label}</div>
            <div class="font-mono font-bold text-accent text-xs">{keyFor(slot)}</div>
          </div>
        {/each}
        <div class="rounded border border-red-900/60 bg-red-950/40 p-1">
          <div class="text-[9px] uppercase tracking-wider text-red-400/80 truncate">E-stop</div>
          <div class="font-mono font-bold text-red-300 text-xs">{TELEOP_CONFIG.EMERGENCY_STOP_KEY.toUpperCase()}</div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- Configuration modal: key remapping & gamepad calibration for the active device -->
{#if showConfigModal}
  <div class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm overflow-y-auto">
    <div class="w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-950 p-6 shadow-2xl text-slate-100 space-y-6 my-auto">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h3 class="text-lg font-bold text-white">Controls Configuration &amp; Diagnostic</h3>
          <p class="text-xs text-slate-400">Bindings are saved per device profile: <strong class="text-white">{profile.name}</strong></p>
        </div>
        <button type="button" class="rounded p-1 text-slate-400 hover:text-white hover:bg-slate-800" on:click={() => (showConfigModal = false)}>✕</button>
      </div>

      <!-- Section 1: keyboard -->
      <div class="rounded-lg border border-slate-800 bg-slate-900/50 p-4 space-y-3">
        <div class="flex items-center justify-between">
          <h4 class="text-xs font-mono font-bold uppercase tracking-wider text-accent">1. Keyboard Key Rebinding</h4>
          <button type="button" class="text-[11px] text-slate-400 underline hover:text-white" on:click={() => resetKeyOverrides(profile.id)}>
            Reset to layout defaults
          </button>
        </div>
        <p class="text-xs text-slate-400">Click an action, then press the key to assign it.</p>

        <div class="grid grid-cols-3 sm:grid-cols-4 gap-2 text-center">
          {#each keySlots as { slot, label }}
            <button
              type="button"
              class="flex flex-col items-center justify-center rounded border p-2.5 transition
                {isListeningSlot === slot ? 'border-accent bg-accent/20 animate-pulse text-white' : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-600'}"
              on:click={() => (isListeningSlot = slot)}
            >
              <span class="text-[10px] uppercase tracking-wider text-slate-400">{label}</span>
              <span class="font-mono font-bold text-accent text-sm mt-1">{isListeningSlot === slot ? 'PRESS KEY' : keyFor(slot)}</span>
            </button>
          {/each}
        </div>
      </div>

      <!-- Section 2: gamepad -->
      <div class="rounded-lg border border-slate-800 bg-slate-900/50 p-4 space-y-4">
        <h4 class="text-xs font-mono font-bold uppercase tracking-wider text-accent">2. Gamepad Axes</h4>

        <p class="text-xs text-slate-300 bg-slate-950 p-2.5 rounded border border-slate-800/80">{profile.description}</p>

        <div class="grid grid-cols-2 gap-4">
          {#each [{ name: 'LEFT STICK', s: $gamepadInfo.leftStick, c: 'emerald' }, { name: 'RIGHT STICK', s: $gamepadInfo.rightStick, c: 'cyan' }] as stick}
            <div class="flex flex-col items-center rounded border border-slate-800 bg-slate-950 p-3">
              <span class="text-xs font-mono text-slate-400 mb-2">{stick.name}</span>
              <div class="relative flex h-24 w-24 items-center justify-center rounded-full border border-slate-700 bg-slate-900">
                <div class="absolute h-full w-[1px] bg-slate-800"></div>
                <div class="absolute h-[1px] w-full bg-slate-800"></div>
                <div
                  class="absolute h-6 w-6 rounded-full {stick.c === 'emerald' ? 'bg-emerald-500' : 'bg-cyan-500'} shadow-md"
                  style="transform: translate({stick.s.x * 30}px, {-stick.s.y * 30}px);"
                ></div>
              </div>
              <div class="mt-2 text-[10px] font-mono text-slate-400">X: {stick.s.x.toFixed(2)} | Y: {stick.s.y.toFixed(2)}</div>
            </div>
          {/each}
        </div>

        <!-- One row per axis of the active device -->
        <div class="space-y-2 text-xs">
          {#each profile.axes as axis}
            {@const binding = effectiveGamepadAxis(profile, axis.id, $gamepadOverrides)}
            <div class="flex items-center justify-between gap-3 rounded bg-slate-950 p-2.5 border border-slate-800">
              <span class="font-semibold text-slate-200 w-24">{axis.label}</span>
              <label class="flex items-center gap-2 text-slate-400">
                Axis
                <select
                  class="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-accent focus:outline-none"
                  value={binding?.axis ?? -1}
                  on:change={(e) => setGamepadOverride(profile.id, axis.id, { axis: Number(e.currentTarget.value) })}
                >
                  {#each Array.from({ length: Math.min(Math.max($gamepadInfo.axes.length, 4), 8) }, (_, i) => i) as i}
                    <option value={i}>{i}{['(L-X)', '(L-Y)', '(R-X)', '(R-Y)'][i] ? ' ' + ['(L-X)', '(L-Y)', '(R-X)', '(R-Y)'][i] : ''}</option>
                  {/each}
                </select>
              </label>
              <label class="flex items-center gap-2 text-slate-400">
                Invert
                <input
                  type="checkbox"
                  class="accent-accent h-4 w-4"
                  checked={$gamepadOverrides[profile.id]?.[axis.id]?.invert ?? false}
                  on:change={(e) => setGamepadOverride(profile.id, axis.id, { invert: e.currentTarget.checked })}
                />
              </label>
              <span class="font-mono w-12 text-right text-white">{axisVal(axis.id).toFixed(2)}</span>
            </div>
          {/each}
        </div>

        <div class="flex items-center justify-between rounded bg-slate-950 p-2.5 border border-slate-800 text-xs">
          <div class="flex flex-col">
            <span class="font-semibold text-slate-200">Gamepad emergency-stop button (all devices)</span>
            <span class="text-[10px] text-slate-400">On standard pads, bumpers, Select and Start also stop. Use "None" if a switch is stuck.</span>
          </div>
          <select
            class="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-accent focus:outline-none"
            value={$emergencyButton}
            on:change={(e) => setEmergencyButton(Number(e.currentTarget.value))}
          >
            <option value={-1}>None</option>
            {#each Array.from({ length: Math.max($gamepadInfo.buttons.length, 12) }, (_, i) => i) as i}
              <option value={i}>Button {i}</option>
            {/each}
          </select>
        </div>
      </div>

      <div class="flex justify-end pt-2">
        <button type="button" class="rounded bg-accent px-5 py-2 text-xs font-bold text-slate-950 hover:bg-accent/90" on:click={() => (showConfigModal = false)}>
          Save &amp; Close
        </button>
      </div>
    </div>
  </div>
{/if}
