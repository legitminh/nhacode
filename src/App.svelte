<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Keyflow, KeyboardDisplay, interaction, lockstep_scrolling, min_box, type InteractionEvent } from '@legitminh/keyflow';
  import PianoKey from './lib/PianoKey.svelte';
  import Settings from './lib/Settings.svelte';
  import ViewToggle from './lib/ViewToggle.svelte';
  import Sheet from './lib/sheet/Sheet.svelte';
  import SongMenu from './lib/sheet/SongMenu.svelte';
  import { songs } from './lib/sheet/songs';
  import { NOTE_NAMES, noteAt, parseOctaveRange, type PianoNote } from './lib/notes';
  import { AudioEngine } from './lib/audio/engine';
  import { instruments } from './lib/audio/instruments';
  import type { InstrumentDefinition } from './lib/audio/types';
  import { clampMargin, loadMargins, saveMargins, type Side } from './lib/margins';
  import { clampLine, loadLineWidths, saveLineWidths, type LineWidths } from './lib/sheet/lines';
  import { isBoolean, isString, readPref, saveKeyflowPreference, writePref } from './lib/preferences';

  // Every user setting is read from, and written to, permanent browser storage.
  const savedInstrument = instruments.find((item) => item.id === readPref('instrument', '', isString)) ?? instruments[0];
  const savedRange = readPref('range', '[0,8)', (value): value is string => {
    try { return isString(value) && parseOctaveRange(value).length > 0; } catch { return false; }
  });
  const engine = new AudioEngine(savedInstrument);
  let held = $state(new Map<string, PianoNote>());
  let mouseDown = $state(false);
  let instrumentId = $state(savedInstrument.id);
  let range = $state(savedRange);
  let octaves = $state(parseOctaveRange(savedRange));
  let status = $state<'loading' | 'ready' | 'playing' | 'error'>('loading');
  let settingsOpen = $state(false);
  let transposed = $state(readPref('transposed', false, isBoolean));
  let showKeyboard = $state(readPref('view:keyboard', true, isBoolean));
  let showSheet = $state(readPref('view:sheet', false, isBoolean));
  let margins = $state(loadMargins());
  let lineWidths = $state(loadLineWidths());
  let songId = $state(readPref('song', songs[0]?.id ?? '', (value): value is string => songs.some((song) => song.id === value)));
  let generation = 0;
  const noteRows = $derived(NOTE_NAMES.map((_, row) => octaves.map((octave) => noteAt(octave, row))));
  const displayRows = $derived(transposed
    ? octaves.map((_, index) => noteRows.map((row) => row[index]))
    : noteRows);
  const sounding = $derived(new Set([...held.values()].map((note) => note.id)));
  $effect(() => { if (settingsOpen) stopAll(); });
  // Keyflow keeps these in sessionStorage; mirror them so they survive closing the app.
  $effect(() => saveKeyflowPreference('min_box', String(min_box.value)));
  $effect(() => saveKeyflowPreference('lockstep_scrolling', String(lockstep_scrolling.enabled)));

  async function prepare(definition?: InstrumentDefinition) {
    const request = ++generation;
    status = 'loading';
    try {
      await (definition ? engine.selectInstrument(definition) : engine.prepare());
      if (request === generation) status = 'ready';
    } catch {
      if (request === generation) status = 'error';
    }
  }

  async function press(source: string, note: PianoNote) {
    if (settingsOpen || held.has(source)) return;
    held = new Map(held).set(source, note);
    try {
      await engine.unlock();
      if (held.get(source) !== note) return;
      engine.noteOn(source, note.midi);
      status = 'playing';
    } catch {
      if (held.get(source) === note) {
        release(source);
        status = 'error';
      }
    }
  }

  function release(source: string) {
    if (!held.has(source)) return;
    const next = new Map(held);
    next.delete(source);
    held = next;
    engine.noteOff(source);
  }

  function activateAudio() {
    // Safari may allow activation at touch release/click but not pointer down.
    void engine.unlock().then(() => {
      if (status === 'error') status = held.size ? 'playing' : 'ready';
    }).catch(() => { status = 'error'; });
  }

  function stopAll() {
    held = new Map();
    mouseDown = false;
    engine.setSustain(false);
    engine.stopAll();
  }

  function selectInstrument(id: string) {
    stopAll();
    instrumentId = id;
    writePref('instrument', id);
    void prepare(instruments.find((item) => item.id === id)!);
  }

  function selectRange(value: string, selected: number[]) {
    stopAll();
    range = value;
    octaves = selected;
    writePref('range', value);
  }

  function releaseMouse() {
    for (const source of held.keys()) if (source.startsWith('mouse:')) release(source);
  }

  function pointerDown(event: InteractionEvent) {
    if (event.source === 'pointer' && event.pointer_type !== 'touch') mouseDown = true;
  }

  function pointerUp(event: InteractionEvent) {
    if (!event.cancelled) activateAudio();
    if (event.source === 'pointer' && event.pointer_type !== 'touch') {
      mouseDown = false;
      releaseMouse();
    }
  }

  function setMargin(side: Side, value: number) {
    margins = { ...margins, [side]: clampMargin(value) };
    saveMargins(margins);
  }

  function selectSong(id: string) {
    songId = id;
    writePref('song', id);
  }

  function toggleView(view: 'keyboard' | 'sheet') {
    if (view === 'keyboard') { stopAll(); showKeyboard = !showKeyboard; }
    else showSheet = !showSheet;
    writePref(`view:${view}`, view === 'keyboard' ? showKeyboard : showSheet);
  }

  function setTransposed(value: boolean) {
    stopAll();
    transposed = value;
    writePref('transposed', value);
  }

  function setLineWidth(line: keyof LineWidths, value: number) {
    lineWidths = { ...lineWidths, [line]: clampLine(value) };
    saveLineWidths(lineWidths);
  }

  onMount(() => { void prepare(); });
  onDestroy(() => engine.dispose());
</script>

<Keyflow options={{ storagePrefix: 'nhacode:', lockstep: false, themes: [{ name: 'default', name_to_color: {
  '--primary': '#000000', '--secondary': '#000000', '--tertiary': '#808080', '--background': '#ffffff',
} }] }}>
  <main class:transposed aria-label="Piano keyboard" aria-busy={status === 'loading'}
    data-audio-state={status} data-instrument={instrumentId} data-range={range}
    data-views={[showKeyboard && 'keyboard', showSheet && 'sheet'].filter(Boolean).join(' ')}
    use:interaction={{ on_pressed_down: pointerDown, on_pressed_up: pointerUp,
      on_cursor_exit: (event) => { if (event.pointer_type !== 'touch') releaseMouse(); } }}
    style:--rows={transposed ? octaves.length : 12} style:--columns={transposed ? 12 : octaves.length}>
    <div class="settings-bar">
      <Settings bind:open={settingsOpen} {transposed} {instrumentId} {range}
        ontranspose={setTransposed} oninstrument={selectInstrument} onrange={selectRange}
        {margins} onmargin={setMargin} {lineWidths} online={setLineWidth} />
      <ViewToggle label="Sheet" shortcut="s" on={showSheet} disabled={settingsOpen} ontoggle={() => toggleView('sheet')}>sheet</ViewToggle>
      <ViewToggle label="Keyboard" shortcut="k" on={showKeyboard} disabled={settingsOpen} ontoggle={() => toggleView('keyboard')}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <rect x="2.5" y="6" width="19" height="12" rx="1" />
          <path d="M6 9.5h1M9.5 9.5h1M13 9.5h1M16.5 9.5h1M6 12.5h1M9.5 12.5h1M13 12.5h1M16.5 12.5h1M8 15.5h8" stroke-linecap="round" />
        </svg>
      </ViewToggle>
      {#if showSheet}<SongMenu {songId} disabled={settingsOpen} onselect={selectSong} />{/if}
    </div>
    <div class="views">
      {#if showKeyboard}
        <section class="keyboard-view" aria-label="Keyboard"
          style:padding={(['top', 'right', 'bottom', 'left'] as const).map((side) => `calc(var(--min-box) * ${margins[side]})`).join(' ')}>
          <KeyboardDisplay class="piano-matrix">
            {#each displayRows as row}
              <div class="piano-row">
                {#each row as note (note.id)}
                  <PianoKey {note} pressed={sounding.has(note.id)} {mouseDown}
                    disabled={settingsOpen} onpress={press} onrelease={release} onactivate={activateAudio} />
                {/each}
              </div>
            {/each}
          </KeyboardDisplay>
        </section>
      {/if}
      {#if showSheet}
        <div class="sheet-view"><Sheet {songId} {lineWidths} /></div>
      {/if}
    </div>
  </main>
</Keyflow>
