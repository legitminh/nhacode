<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Keyflow, KeyboardDisplay, interaction, type InteractionEvent } from '@legitminh/keyflow';
  import PianoKey from './lib/PianoKey.svelte';
  import Settings from './lib/Settings.svelte';
  import ViewToggle from './lib/ViewToggle.svelte';
  import Sheet from './lib/sheet/Sheet.svelte';
  import SongMenu from './lib/sheet/SongMenu.svelte';
  import PlayButton from './lib/sheet/PlayButton.svelte';
  import { Player } from './lib/sheet/player.svelte';
  import { DEFAULT_METRONOME, Metronome, type MetronomeSettings } from './lib/sheet/metronome.svelte';
  import PlaybackMenu from './lib/sheet/PlaybackMenu.svelte';
  import MetronomeMenu from './lib/sheet/MetronomeMenu.svelte';
  import { songs } from './lib/sheet/songs';
  import { NOTE_NAMES, noteAt, parseOctaveRange, type PianoNote } from './lib/notes';
  import { AudioEngine } from './lib/audio/engine';
  import { instruments } from './lib/audio/instruments';
  import type { InstrumentDefinition } from './lib/audio/types';
  import { clampMargin, loadMargins, saveMargins, type Side } from './lib/margins';
  import { clampKeyBorder, clampLine, loadKeyBorder, loadLineWidths, saveKeyBorder, saveLineWidths, type LineWidths } from './lib/sheet/lines';
  import { isBoolean, isString, readPref, writePref } from './lib/preferences';

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
  let keyBorder = $state(loadKeyBorder());
  let separateHands = $state(readPref('sheet:separate-hands', false, isBoolean));
  let inverted = $state(readPref('sheet:inverted', false, isBoolean));
  let articulations = $state(readPref('sheet:articulations', true, isBoolean));
  let playback = $state(readPref('sheet:playback', true, isBoolean));
  const savedPlaybackInstrument = instruments.find((item) => item.id === readPref('sheet:playback-instrument', '', isString)) ?? instruments[0];
  let playbackInstrumentId = $state(savedPlaybackInstrument.id);
  const player = new Player(savedPlaybackInstrument);
  const isSpeed = (value: unknown): value is number => typeof value === 'number' && value >= 0.25 && value <= 2;
  let playbackSpeed = $state(readPref('sheet:playback-speed', 1, isSpeed));
  player.setSpeed(readPref('sheet:playback-speed', 1, isSpeed));
  let pedalPosition = $state(readPref('sheet:pedal', 'below', (value): value is 'below' | 'above' => value === 'below' || value === 'above'));
  const isMetronome = (value: unknown): value is MetronomeSettings => typeof value === 'object' && value !== null
    && (['strong', 'weak', 'between', 'sub'] as const).every((key) => Number.isInteger((value as MetronomeSettings)[key]));
  const savedMetronome = readPref('sheet:metronome', DEFAULT_METRONOME, isMetronome);
  let metronomeSettings = $state(savedMetronome);
  const metronome = new Metronome(savedMetronome);
  // The metronome follows whichever song the player has loaded.
  $effect(() => { metronome.load(player.timeline); });
  let picking = $state(false);
  // Playback only runs while the sheet and its playback tool are shown.
  $effect(() => { if (!showSheet || !playback) { player.pause(); picking = false; } });
  $effect(() => { if (!showSheet) metronome.stop(); });
  let songId = $state(readPref('song', (songs.find((song) => song.id === 'fur-elise') ?? songs[0])?.id ?? '', (value): value is string => songs.some((song) => song.id === value)));
  let generation = 0;
  const noteRows = $derived(NOTE_NAMES.map((_, row) => octaves.map((octave) => noteAt(octave, row))));
  const displayRows = $derived(transposed
    ? octaves.map((_, index) => noteRows.map((row) => row[index]))
    : noteRows);
  const sounding = $derived(new Set([...held.values()].map((note) => note.id)));
  $effect(() => { if (settingsOpen) stopAll(); });

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

  function setMetronome(settings: MetronomeSettings) {
    metronomeSettings = settings;
    metronome.configure(settings);
    writePref('sheet:metronome', settings);
  }

  function toggleMetronome() {
    if (metronome.running) metronome.stop();
    else void metronome.start(player.songTime());
  }

  function setPlaybackSpeed(speed: number) {
    playbackSpeed = speed;
    player.setSpeed(speed);
    writePref('sheet:playback-speed', speed);
  }

  function setPedalPosition(value: 'below' | 'above') {
    pedalPosition = value;
    writePref('sheet:pedal', value);
  }

  function pickStart(measure: number) {
    picking = false;
    player.seek(measure);
  }

  function setPlayback(value: boolean) {
    playback = value;
    writePref('sheet:playback', value);
  }

  function setPlaybackInstrument(id: string) {
    playbackInstrumentId = id;
    writePref('sheet:playback-instrument', id);
    player.setInstrument(instruments.find((item) => item.id === id)!);
  }

  function setArticulations(value: boolean) {
    articulations = value;
    writePref('sheet:articulations', value);
  }

  function setInverted(value: boolean) {
    inverted = value;
    writePref('sheet:inverted', value);
  }

  function setSeparateHands(value: boolean) {
    separateHands = value;
    writePref('sheet:separate-hands', value);
  }

  function setKeyBorder(value: number) {
    keyBorder = clampKeyBorder(value);
    saveKeyBorder(keyBorder);
  }

  function setLineWidth(line: keyof LineWidths, value: number) {
    lineWidths = { ...lineWidths, [line]: clampLine(value) };
    saveLineWidths(lineWidths);
  }

  onMount(() => { void prepare(); });
  onDestroy(() => { engine.dispose(); player.dispose(); metronome.dispose(); });
</script>

<Keyflow options={{ storagePrefix: 'nhacode:', lockstep: false, themes: [
  { name: 'light', name_to_color: { '--primary': '#000000', '--secondary': '#000000', '--tertiary': '#808080', '--background': '#ffffff' } },
  { name: 'dark', name_to_color: { '--primary': '#ffffff', '--secondary': '#ffffff', '--tertiary': '#8c8c8c', '--background': '#000000' } },
  { name: 'sepia', name_to_color: { '--primary': '#3b2f1e', '--secondary': '#3b2f1e', '--tertiary': '#9a8b73', '--background': '#f4ecd8' } },
] }}>
  <main class:transposed aria-label="Piano keyboard" aria-busy={status === 'loading'}
    data-audio-state={status} data-instrument={instrumentId} data-range={range}
    data-views={[showKeyboard && 'keyboard', showSheet && 'sheet'].filter(Boolean).join(' ')}
    use:interaction={{ on_pressed_down: pointerDown, on_pressed_up: pointerUp,
      on_cursor_exit: (event) => { if (event.pointer_type !== 'touch') releaseMouse(); } }}
    style:--key-border={keyBorder} style:--rows={transposed ? octaves.length : 12} style:--columns={transposed ? 12 : octaves.length}>
    <div class="settings-bar">
      <Settings bind:open={settingsOpen} {transposed} {instrumentId} {range}
        ontranspose={setTransposed} oninstrument={selectInstrument} onrange={selectRange}
        {margins} onmargin={setMargin} {lineWidths} online={setLineWidth}
        {keyBorder} onkeyborder={setKeyBorder} {separateHands} onseparatehands={setSeparateHands}
        {inverted} oninverted={setInverted} {articulations} onarticulations={setArticulations} {pedalPosition} onpedal={setPedalPosition}
        {playback} onplayback={setPlayback} {playbackInstrumentId} onplaybackinstrument={setPlaybackInstrument} />
      <ViewToggle label="Sheet" shortcut="s" on={showSheet} disabled={settingsOpen} ontoggle={() => toggleView('sheet')}>sheet</ViewToggle>
      <ViewToggle label="Keyboard" shortcut="k" on={showKeyboard} disabled={settingsOpen} ontoggle={() => toggleView('keyboard')}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <rect x="2.5" y="6" width="19" height="12" rx="1" />
          <path d="M6 9.5h1M9.5 9.5h1M13 9.5h1M16.5 9.5h1M6 12.5h1M9.5 12.5h1M13 12.5h1M16.5 12.5h1M8 15.5h8" stroke-linecap="round" />
        </svg>
      </ViewToggle>
      {#if showSheet}
        {#if playback}
          <PlaybackMenu disabled={settingsOpen} speed={playbackSpeed} onspeed={setPlaybackSpeed} onpick={() => { picking = true; }} />
          <PlayButton playing={player.playing} disabled={settingsOpen} ontoggle={() => player.toggle()} />
        {/if}
        <SongMenu {songId} disabled={settingsOpen} onselect={selectSong} />
        <MetronomeMenu settings={metronomeSettings} disabled={settingsOpen} onchange={setMetronome} />
        <PlayButton playing={metronome.running} disabled={settingsOpen} ontoggle={toggleMetronome}
          keys="n" name="metronome" class="metronome-toggle" />
      {/if}
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
        <div class="sheet-view"><Sheet {songId} {lineWidths} {separateHands} {inverted} {articulations} {pedalPosition}
          playhead={playback ? player.position : undefined} onseek={playback ? (measure) => player.seek(measure) : undefined}
          metronomeHead={metronome.position} {picking} onpick={pickStart} oncancelpick={() => { picking = false; }}
          onsong={(song) => player.load(song)} /></div>
      {/if}
    </div>
  </main>
</Keyflow>
