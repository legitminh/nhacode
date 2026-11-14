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
  let volume = $state(65);
  let sustainLatch = $state(false);
  let spaceHeld = $state(false);
  let status = $state<'loading' | 'ready' | 'playing' | 'error'>('loading');
  let error = $state('');
  let lastNote = $state<PianoNote>();
  const sounding = $derived(new Set([...held.values()].map((note) => note.id)));
  const sustain = $derived(sustainLatch || spaceHeld);
  const statusLabel = $derived(status === 'loading' ? 'Loading piano' : status === 'error' ? 'Audio unavailable' : status === 'playing' ? 'Sound on' : 'Ready to play');

  $effect(() => engine.setSustain(sustain));
  $effect(() => engine.setVolume(volume / 100));

  async function preload() {
    status = 'loading';
    error = '';
    try {
      await engine.prepare();
      status = 'ready';
    } catch (cause) {
      status = 'error';
      error = cause instanceof Error ? cause.message : 'Could not load the piano.';
    }
  }

  async function press(source: string, note: PianoNote) {
    if (held.has(source)) return;
    held = new Map(held).set(source, note);
    lastNote = note;
    selectedOctave = note.octave;
    try {
      // Resume synchronously in the gesture, before waiting for sample loading.
      await engine.unlock();
      if (held.get(source) !== note) return;
      engine.noteOn(source, note.midi);
      status = 'playing';
      error = '';
    } catch (cause) {
      release(source);
      status = 'error';
      error = cause instanceof Error ? cause.message : 'Could not start audio.';
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
    sustainLatch = false;
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

<main class="studio">
  <header class="topbar">
    <div class="identity">
      <div class="mark" aria-hidden="true"><i></i><i></i><i></i></div>
      <div><h1>nhacode<span class="brand-dot">.</span></h1><p>A room for sound</p></div>
    </div>
    <div class="instrument"><span class="instrument-icon" aria-hidden="true">▥</span><div><strong>Grand piano</strong><span>FLUIDR3 · 01</span></div></div>
    <div class="controls">
      <button class="pedal" class:enabled={sustain} aria-pressed={sustain} onclick={() => sustainLatch = !sustainLatch} title="Sustain pedal · hold Space">
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 13h12M7 13V7a3 3 0 0 1 6 0v6M4 16h12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        <span>Sustain</span><span class="control-state">{sustain ? 'ON' : 'OFF'}</span>
      </button>
      <label class="volume" title={`Volume ${volume}%`}>
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M9 5 5.5 8H3v4h2.5L9 15V5ZM12 7a5 5 0 0 1 0 6m2-8a8 8 0 0 1 0 10" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"/></svg>
        <span class="sr-only">Volume</span><input type="range" min="0" max="100" bind:value={volume} />
      </label>
    </div>
  </header>

  <div class="grid-meta">
    <div class="grid-title"><span class="tiny-square" aria-hidden="true"></span><h2>OCTAVE MATRIX</h2><span class="dimensions">08 × 0c</span></div>
    <p class="play-status" class:failed={status === 'error'} role="status"><span class="status-dot" class:live={status === 'playing'}></span>{statusLabel}</p>
  </div>

  <div class="keyboard-area">
    <div class="register" aria-hidden="true"><span>LOW</span><span class="register-line"></span><span>HIGH</span></div>
    <KeyboardDisplay class="piano-matrix">
      {#each NOTE_ROWS as row}
        <div class="piano-row">
          {#each row as note (note.id)}
            <PianoKey {note} pressed={sounding.has(note.id)} selected={selectedOctave === note.octave}
              onpress={press} onrelease={release} />
          {/each}
        </div>
      {/each}
    </KeyboardDisplay>
    <div class="octave-selector" role="group" aria-label="Keyboard octave">
      {#each Array.from({ length: 8 }) as _, octave}
        <button class:active={selectedOctave === octave} aria-label={`Play octave ${octave} with computer keyboard`}
          aria-pressed={selectedOctave === octave} onclick={() => selectedOctave = octave}>
          <span class="octave-tick"></span><span class="octave-caption">{selectedOctave === octave ? 'KEYBOARD' : '·'}</span>
        </button>
      {/each}
    </div>
  </div>

  <footer class="footer">
    <div class="instructions"><span class="desktop-hint"><kbd>←</kbd><kbd>→</kbd> octave<span class="divider">/</span></span><span>press & hold to play</span><span class="divider">/</span><span class="range">A0—G♯7</span></div>
    <div class="footer-right">
      {#if status === 'error'}<button class="retry" onclick={preload} title={error}>Retry audio ↗</button>{/if}
      <span class="note-readout" aria-label="Last played note">{lastNote ? `${lastNote.hex.toUpperCase()} / ${lastNote.name}` : '96 KEYS. MAKE SOMETHING.'}</span>
      <a href="/audio/ATTRIBUTION.md" target="_blank" rel="noreferrer" title="Piano sample credits">Sound credits ↗</a>
    </div>
  </footer>
</main>
