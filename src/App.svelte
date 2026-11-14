<script lang="ts">
  import { onMount } from 'svelte';
  import { KeyboardDisplay } from '@legitminh/keyflow';
  import PianoKey from './lib/PianoKey.svelte';
  import { NOTE_ROWS, SHORTCUTS, noteAt, type PianoNote } from './lib/notes';
  import { AudioEngine } from './lib/audio/engine';
  import { instruments } from './lib/audio/instruments';

  const engine = new AudioEngine(instruments[0]);
  let held = $state(new Map<string, PianoNote>());
  let selectedOctave = $state(3);
  let spaceHeld = $state(false);
  let status = $state<'loading' | 'ready' | 'playing' | 'error'>('loading');
  let settingsOpen = $state(false);
  let transposed = $state(false);
  const displayRows = $derived(transposed
    ? Array.from({ length: 8 }, (_, octave) => NOTE_ROWS.map((row) => row[octave]))
    : NOTE_ROWS);
  const sounding = $derived(new Set([...held.values()].map((note) => note.id)));
  $effect(() => engine.setSustain(spaceHeld));

  async function preload() {
    status = 'loading';
    try {
      await engine.prepare();
      status = 'ready';
    } catch {
      status = 'error';
    }
  }

  async function press(source: string, note: PianoNote) {
    if (held.has(source)) return;
    held = new Map(held).set(source, note);
    selectedOctave = note.octave;
    try {
      // Resume synchronously in the gesture, before waiting for sample loading.
      await engine.unlock();
      if (held.get(source) !== note) return;
      engine.noteOn(source, note.midi);
      status = 'playing';
    } catch {
      release(source);
      status = 'error';
    }
  }

  function release(source: string) {
    if (!held.has(source)) return;
    const next = new Map(held);
    next.delete(source);
    held = next;
    engine.noteOff(source);
  }

  function stopAll() {
    held = new Map();
    spaceHeld = false;
    engine.setSustain(false);
    engine.stopAll();
  }

  function editing(target: EventTarget | null) {
    return target instanceof HTMLElement && !!target.closest('input, select, textarea, [contenteditable="true"]');
  }

  function keydown(event: KeyboardEvent) {
    if (settingsOpen || editing(event.target) || event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
    const row = SHORTCUTS.indexOf(event.key.toLowerCase() as typeof SHORTCUTS[number]);
    if (row >= 0) {
      event.preventDefault();
      if (!event.repeat) void press(`hardware:${event.code}`, noteAt(selectedOctave, row));
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      selectedOctave = Math.max(0, Math.min(7, selectedOctave + (event.key === 'ArrowLeft' ? -1 : 1)));
    } else if (event.code === 'Space' && !(event.target instanceof HTMLElement && event.target.closest('button'))) {
      event.preventDefault();
      spaceHeld = true;
    } else if (event.key === 'Escape') stopAll();
  }

  function keyup(event: KeyboardEvent) {
    // Always release, including after focus or modifiers changed while held.
    release(`hardware:${event.code}`);
    if (event.code === 'Space') spaceHeld = false;
  }

  function pointerup(event: PointerEvent) { release(`pointer:${event.pointerId}`); }

  onMount(() => {
    void preload();
    const visibility = () => { if (document.hidden) stopAll(); };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      engine.dispose();
    };
  });
</script>

<svelte:window onkeydown={keydown} onkeyup={keyup} onblur={stopAll} onpointerup={pointerup} onpointercancel={pointerup} />

<main class:transposed aria-label="Piano keyboard" aria-busy={status === 'loading'} data-audio-state={status}>
  <div class="settings-bar">
    <button class="settings-toggle" aria-label="Settings" aria-haspopup="dialog" aria-expanded={settingsOpen} popovertarget="settings">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <path stroke-linejoin="round" d="m9.5 3-.6 2.1-1.6.9-2.1-.5L2.7 9.8l1.5 1.6v1.8l-1.5 1.6 2.5 4.3 2.1-.5 1.6.9.6 2.1h5l.6-2.1 1.6-.9 2.1.5 2.5-4.3-1.5-1.6v-1.8l1.5-1.6-2.5-4.3-2.1.5-1.6-.9L14.5 3z" />
        <circle cx="12" cy="12.2" r="3" />
      </svg>
    </button>
  </div>
  <div id="settings" popover="auto" role="dialog" aria-label="Settings"
    onbeforetoggle={(event) => {
      settingsOpen = event.newState === 'open';
      if (settingsOpen) stopAll();
    }}>
    <label class="transpose-option">
      <input type="checkbox" checked={transposed} onchange={(event) => {
        stopAll();
        transposed = event.currentTarget.checked;
      }} />
      Transpose display
    </label>
  </div>
  <KeyboardDisplay class="piano-matrix">
    {#each displayRows as row}
      <div class="piano-row">
        {#each row as note (note.id)}
          <PianoKey {note} pressed={sounding.has(note.id)} onpress={press} onrelease={release} />
        {/each}
      </div>
    {/each}
  </KeyboardDisplay>
</main>
