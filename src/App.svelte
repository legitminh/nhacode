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
    if (editing(event.target) || event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
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

<main aria-label="Piano keyboard" aria-busy={status === 'loading'} data-audio-state={status}>
  <KeyboardDisplay class="piano-matrix">
    {#each NOTE_ROWS as row}
      <div class="piano-row">
        {#each row as note (note.id)}
          <PianoKey {note} pressed={sounding.has(note.id)} onpress={press} onrelease={release} />
        {/each}
      </div>
    {/each}
  </KeyboardDisplay>
</main>
