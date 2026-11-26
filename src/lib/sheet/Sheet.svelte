<script lang="ts">
  import { ButtonPositional, Document, InputFrame, StaticButton, create_input_frame, input_frame_manager, min_box, must_view } from '@legitminh/keyflow';
  import { columnAt, layoutMarks, layoutPedals, layoutSystems, stackStream, type SheetNote, type StackedStream, type StreamLayout } from './layout';
  import type { Song } from './types';
  import { octaveLineColor } from '../colors';

  const files = import.meta.glob<Song>(['../../songs/*.json', '!../../songs/index.json'], { import: 'default' });
  import type { LineWidths } from './lines';

  import type { Position } from './timeline';

  let { songId, lineWidths, separateHands = false, inverted = false, articulations = true, modifierPosition = 'above', follow, pedalPosition = 'below', playhead, metronomeHead, picking = false, onpick, oncancelpick,
    onseek, onsong }: {
    songId: string; lineWidths: LineWidths; separateHands?: boolean; inverted?: boolean;
    /** Show staccato, accent and fermata above notes and arpeggios left of chords. */
    articulations?: boolean;
    /** Where note modifiers (staccato, accent, trill, grace cross…) go relative to the digit, whatever the order. */
    modifierPosition?: 'above' | 'below';
    /** Autoscroll: keep the line holding this position at the top of the view. */
    follow?: Position;
    /** Where the sustain-pedal stream goes, when the score has pedal marks. */
    pedalPosition?: 'below' | 'above';
    /** Where playback is; its time frame is highlighted. */
    playhead?: Position;
    /** Where the metronome is; outlined. */
    metronomeHead?: Position;
    /** "Start playback from": a triangle button at each measure start picks where playback starts. */
    picking?: boolean;
    onpick?: (measure: number) => void;
    oncancelpick?: () => void;
    /** Clicking a measure moves the playhead there. */
    onseek?: (measure: number) => void;
    onsong?: (song: Song | undefined) => void;
  } = $props();

  // Sizes follow Keyflow's min-box: a row is one box tall, a time frame is half a box
  // (one monospace glyph at 0.8 box), and an octave line takes an eighth of a box.
  const ROW = $derived(min_box.value);
  const CELL = $derived(min_box.value / 2);
  const ORIGIN = $derived(lineWidths.origin * min_box.value);
  const OCTAVE = $derived(lineWidths.octave * min_box.value);
  const GAP = $derived(Math.max(4, min_box.value / 8, ORIGIN + 2, OCTAVE + 2));

  let song = $state<Song | undefined>();
  let error = $state('');
  let width = $state(0);
  const systems = $derived(song ? layoutSystems(song.measures, Math.max(1, Math.floor((width - 16) / CELL)), separateHands) : []);
  const marks = $derived(layoutMarks(systems));
  const hasPedal = $derived(!!song?.measures.some((measure) => measure.pedals?.length));
  const pedals = $derived(song && hasPedal ? layoutPedals(systems, song.measures) : []);
  const HAND_NAMES: Record<string, string> = { right: 'Right hand', left: 'Left hand' };
  /** Inverted order mirrors each stream vertically: octave 0 and its border go to the bottom. */
  const flip = (y: number, height: number) => (inverted ? height - y : y);

  // Picking runs in its own Keyflow input frame: only the visible measure triangles
  // (ButtonPositional) and Escape respond, and the sheet still scrolls.
  const pickFrame = create_input_frame({ name: 'start-playback-from' });
  $effect(() => {
    if (!picking) return;
    input_frame_manager.push(pickFrame);
    return () => pickFrame.deactivate();
  });

  $effect(() => {
    const id = songId;
    const load = files[`../../songs/${id}.json`];
    song = undefined;
    error = '';
    if (!load) return;
    load().then((value) => { if (songId === id) { song = value; onsong?.(value); } })
      .catch(() => { if (songId === id) error = 'Could not load this song.'; });
  });

  // Autoscroll: when the followed cursor reaches another line, bring that line to the top.
  let streamsBox = $state<HTMLElement>();
  let followed = -1;
  $effect(() => {
    const measure = follow?.measure;
    if (measure === undefined || !streamsBox) { followed = -1; return; }
    const line = streamsBox.querySelector(`[data-index="${measure}"]`)?.closest<HTMLElement>('.sheet-stream-box');
    const index = Number(line?.dataset.system ?? -1);
    if (!line || index === followed) return;
    followed = index;
    line.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });

  // A note with modifiers gets an extra half row for them, above or below the digit.
  const MOD = $derived(ROW / 2);
  /** Each column stacks outward from the origin line on its own (see stackStream). */
  const stack = (stream: StreamLayout) => stackStream(stream, { row: ROW, mod: articulations ? MOD : 0, gap: GAP });

  /** Where a note's digit and its modifiers sit, after any inversion. */
  function place(stacked: StackedStream, note: SheetNote, height: number) {
    const top = stacked.tops.get(note)!;
    const h = stacked.heights.get(note)!;
    const visualTop = inverted ? height - top - h : top;
    const room = h > ROW;
    const below = modifierPosition === 'below';
    if (note.skip) return { y: visualTop + h / 2, modY: visualTop + h / 2 };
    return {
      y: visualTop + (room && !below ? MOD : 0) + ROW / 2,
      modY: below ? visualTop + ROW + MOD / 2 : visualTop + MOD / 2,
    };
  }

  function offsets(stream: StreamLayout) {
    let x = 0;
    return stream.measures.map((measure) => { const start = x; x += measure.frames * CELL; return start; });
  }
</script>

<section class="sheet-screen" aria-label="Sheet">
  <div class="sheet-scroll" bind:clientWidth={width}>
    <!-- Keyflow's Document: native scrolling, or lockstep paging when that setting is on. -->
    <Document>
    {#if error}
      <p role="alert">{error}</p>
    {:else if song}
      <InputFrame frame={pickFrame}>
      {#if picking}
        <div class="pick-banner" role="status">
          <span>Pick where playback starts</span>
          <StaticButton keys="escape" on_close={() => oncancelpick?.()}>Cancel</StaticButton>
        </div>
      {/if}
      <div class="sheet-streams" bind:this={streamsBox} data-song={song.id} aria-label={`${song.title}, ${song.composer}`}>
        {#each systems as system, index}
          {@const top = system.hands[0].stream}
          {@const marked = marks[index]}
          <!-- One system: markings, then a stream or a mega stream of both hands. Paging never splits it. -->
          <div class="sheet-stream-box" class:hands={system.hands.length > 1} class:inverted data-system={index} use:must_view>
          {#if marked.texts.length || marked.hairpins.length}
            <svg class="sheet-marks" width={top.frames * CELL} height={ROW * marked.rows} viewBox={`0 0 ${top.frames * CELL} ${ROW * marked.rows}`}
              role="img" aria-label="Markings">
              {#each marked.texts as mark}
                <text class="sheet-mark" data-row={mark.row} x={mark.frame * CELL} y={mark.row * ROW + ROW / 2}
                  >{#each mark.parts as part, i}<tspan class="sheet-mark-part" data-kind={part.kind}>{i ? ' ' : ''}{part.text}</tspan>{/each}</text>
              {/each}
              {#each marked.hairpins as pin}
                {@const x1 = pin.from * CELL + CELL / 4}
                {@const x2 = Math.max(x1 + CELL, pin.to * CELL - CELL / 4)}
                {@const wide = ROW * .3}
                {@const narrow = pin.continued ? wide / 2 : 0}
                {@const mid = pin.row * ROW + ROW / 2}
                {@const [a, b] = pin.kind === 'crescendo' ? [narrow, pin.open ? wide / 2 : wide] : [pin.continued ? wide / 2 : wide, pin.open ? wide / 2 : 0]}
                <polyline class="hairpin" data-kind={pin.kind} fill="none"
                  points={`${x1},${mid - a} ${x2},${mid - b}`} />
                <polyline class="hairpin" data-kind={pin.kind} fill="none"
                  points={`${x1},${mid + a} ${x2},${mid + b}`} />
              {/each}
            </svg>
          {/if}
          {#snippet pedalStream()}
            {@const h = ROW * .6}
            <svg class="sheet-pedal" data-position={pedalPosition} width={top.frames * CELL} height={h}
              viewBox={`0 0 ${top.frames * CELL} ${h}`} role="img" aria-label="Sustain pedal">
              {#each pedals[index] as span}
                {@const x1 = span.from * CELL + 1}
                {@const x2 = span.to * CELL - 1}
                {@const base = pedalPosition === 'below' ? h * .8 : h * .2}
                {@const tip = pedalPosition === 'below' ? h * .25 : h * .75}
                <g class="pedal-span" data-from={span.from} data-to={span.to}>
                  {#if !span.continued}<line x1={x1} x2={x1} y1={tip} y2={base} />{/if}
                  <line {x1} x2={x2} y1={base} y2={base} />
                  {#each span.changes as change}
                    {@const cx = change * CELL}
                    <polyline fill="none" points={`${cx - CELL / 3},${base} ${cx},${tip} ${cx + CELL / 3},${base}`} />
                  {/each}
                  {#if !span.open}<line x1={x2} x2={x2} y1={tip} y2={base} />{/if}
                </g>
              {/each}
            </svg>
          {/snippet}
          {#if hasPedal && pedalPosition === 'above'}{@render pedalStream()}{/if}
          <div class="sheet-hands">
          {#if picking}
            <div class="pick-layer">
              {#each offsets(top) as x, m}
                <div class="pick-start" style:left={`${x}px`} data-index={top.measures[m].index}>
                  <ButtonPositional on_close={() => onpick?.(top.measures[m].index)}
                    ><span class="visually-hidden">Start from measure {top.measures[m].number}</span><span aria-hidden="true">▶</span></ButtonPositional>
                </div>
              {/each}
            </div>
          {/if}
          {#each inverted ? [...system.hands].reverse() : system.hands as { hand, stream }}
          {@const xs = offsets(stream)}
          {@const stacked = stack(stream)}
          {@const height = stacked.height}
          <svg class="sheet-stream" data-stream={index} data-hand={hand} width={stream.frames * CELL} height={height}
            viewBox={`0 0 ${stream.frames * CELL} ${height}`} role="img"
            aria-label={`${hand === 'both' ? '' : `${HAND_NAMES[hand]}, `}measures ${stream.measures[0].number} to ${stream.measures.at(-1)!.number}`}>
            <line class="octave-zero" data-line="0" style:stroke={octaveLineColor(0)} x1="0" x2={stream.frames * CELL}
              y1={flip(ORIGIN / 2, height)} y2={flip(ORIGIN / 2, height)} stroke-width={ORIGIN} />
            {#each stacked.lines as line}
              {@const y = flip(line.y, height)}
              <line class="octave-line" data-octave={line.octave} data-line={line.octave} style:stroke={octaveLineColor(line.octave)} stroke-width={OCTAVE}
                x1={line.from * CELL + 1} x2={line.to * CELL - 1} y1={y} y2={y} />
            {/each}
            {#each stream.measures as measure, m}
              <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
              <g class="sheet-measure" class:seekable={!!onseek} data-measure={measure.number} data-index={measure.index}
                transform={`translate(${xs[m]} 0)`} onclick={() => onseek?.(measure.index)}>
                <rect class="measure-hit" x="0" y="0" width={measure.frames * CELL} {height} />
                {#if playhead && playhead.measure === measure.index}
                  <rect class="playhead" x={columnAt(measure, playhead.tick) * CELL} y="0"
                    width={CELL} {height} />
                {/if}
                {#if metronomeHead && metronomeHead.measure === measure.index}
                  <rect class="metronome-head" x={columnAt(measure, metronomeHead.tick) * CELL + 1} y="1"
                    width={CELL - 2} height={height - 2} />
                {/if}
                {#if m > 0}<line class="barline" x1="0" x2="0" y1="0" y2={height} />{/if}
                {#each measure.notes as note}
                  {@const spot = place(stacked, note, height)}
                  {@const y = spot.y}
                  {#if !note.tied}
                    {@const x = note.frame * CELL + CELL / 2}
                    {#if !note.skip}<text class="sheet-note" class:grace={note.grace} data-midi={note.midi} style:fill={octaveLineColor(note.octave)} {x} {y}>{note.digit}</text>{/if}
                    {#if articulations && (note.art.length || note.grace)}
                      {@const marks = [...(note.grace ? ['grace'] : []), ...note.art.filter((a) => a !== 'arpeggio')]}
                      {@const size = Math.min(CELL * .85, MOD * .85)}
                      {@const my = spot.modY}
                      <g class="articulations" class:skip={note.skip} data-art={note.skip ? 'skip' : [...(note.grace ? ['grace'] : []), ...note.art].join(' ')}
                        style:stroke={octaveLineColor(note.octave)} style:fill={octaveLineColor(note.octave)}>
                        {#each marks as art, i}
                          {@const ax = x + (i - (marks.length - 1) / 2) * size * 1.15}
                          {#if art === 'staccato'}
                            <circle class="art-staccato" cx={ax} cy={my} r={size * .12} />
                          {:else if art === 'tenuto'}
                            <line class="art-tenuto" x1={ax - size / 2} x2={ax + size / 2} y1={my} y2={my} />
                          {:else if art === 'accent'}
                            <polyline class="art-accent" fill="none" points={`${ax - size / 2},${my - size / 3} ${ax + size / 2},${my} ${ax - size / 2},${my + size / 3}`} />
                          {:else if art === 'fermata'}
                            <path class="art-fermata" fill="none" d={`M ${ax - size / 2} ${my + size / 4} A ${size / 2} ${size / 2} 0 0 1 ${ax + size / 2} ${my + size / 4}`} />
                            <circle cx={ax} cy={my + size / 6} r={size * .1} />
                          {:else if art === 'trill'}
                            <text class="art-trill" x={ax} y={my} font-size={size * 1.1}>tr</text>
                          {:else if art === 'grace'}
                            <!-- Squished cross: a grace note takes (almost) no time. -->
                            <path class="art-grace" fill="none" d={`M ${ax - size / 2} ${my - size / 5} L ${ax + size / 2} ${my + size / 5} M ${ax - size / 2} ${my + size / 5} L ${ax + size / 2} ${my - size / 5}`} />
                          {/if}
                        {/each}
                        {#if note.art.includes('arpeggio')}
                          <!-- A rolled chord gets its own column just before the chord. -->
                          {@const ax = x - CELL}
                          {@const h = ROW / 2 - 1}
                          <path class="art-arpeggio" fill="none"
                            d={`M ${ax} ${y - h} q ${CELL * .15} ${h / 4} 0 ${h / 2} q ${-CELL * .15} ${h / 4} 0 ${h / 2} q ${CELL * .15} ${h / 4} 0 ${h / 2} q ${-CELL * .15} ${h / 4} 0 ${h / 2}`} />
                        {/if}
                      </g>
                    {/if}
                  {/if}
                  {#each { length: note.frames - (note.tied ? 0 : 1) } as _, i}
                    {@const frame = note.frame + (note.tied ? 0 : 1) + i}
                    <line class="hold" style:stroke={octaveLineColor(note.octave)} x1={frame * CELL + CELL / 5} x2={(frame + 1) * CELL - CELL / 5} y1={y} y2={y} />
                  {/each}
                {/each}
              </g>
            {/each}
          </svg>
          {/each}
          </div>
          {#if hasPedal && pedalPosition === 'below'}{@render pedalStream()}{/if}
          </div>
        {/each}
      </div>
      </InputFrame>
    {/if}
    </Document>
  </div>
</section>

<style>
  .sheet-screen {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    height: 100%;
    color: var(--primary);
    background: var(--background);
  }
  .sheet-scroll {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 0 .5rem;
    -webkit-user-select: text;
    user-select: text;
  }
  .sheet-streams { display: flex; flex-direction: column; gap: calc(var(--min-box) / 2); padding-bottom: var(--min-box); }
  .sheet-stream { display: block; overflow: visible; }
  /* Separate hands: one mega stream, left hand above right hand, under a thick black bar
     (inverted: right hand above left hand, bar at the bottom). */
  .sheet-hands { display: flex; flex-direction: column; gap: calc(var(--min-box) / 4); width: fit-content; }
  .sheet-stream-box.hands .sheet-hands { border-top: calc(var(--min-box) / 8) solid var(--primary); padding-top: calc(var(--min-box) / 8); }
  .sheet-stream-box.hands.inverted .sheet-hands {
    border-top: 0;
    padding-top: 0;
    border-bottom: calc(var(--min-box) / 8) solid var(--primary);
    padding-bottom: calc(var(--min-box) / 8);
  }
  .sheet-marks { display: block; overflow: visible; }
  .sheet-mark {
    fill: currentColor;
    font-size: calc(var(--min-box) * .8);
    font-family: var(--font-mono, ui-monospace, monospace);
    dominant-baseline: central;
    white-space: pre;
  }
  .sheet-mark-part[data-kind='dynamic'] { font-style: italic; font-weight: bold; }
  .sheet-mark-part[data-kind='words'] { font-style: italic; }
  .hairpin { stroke: currentColor; stroke-width: 1.5; }
  .octave-zero, .octave-line { stroke: currentColor; }
  .barline { stroke: var(--tertiary); stroke-width: 1; }
  .hold { stroke: currentColor; stroke-width: 1.5; }
  .measure-hit { fill: transparent; }
  .sheet-measure.seekable { cursor: pointer; }
  .sheet-measure.seekable:hover .measure-hit { fill: var(--tertiary); fill-opacity: .08; }
  .playhead { fill: var(--primary); fill-opacity: .15; }
  .articulations { stroke-width: 1.5; }
  .sheet-pedal { display: block; overflow: visible; }
  .pedal-span line, .pedal-span polyline { stroke: currentColor; stroke-width: 1.5; }
  .articulations polyline, .articulations path, .articulations line { stroke-linecap: round; stroke-linejoin: round; }
  .art-trill { stroke: none; font-style: italic; font-weight: bold; text-anchor: middle; dominant-baseline: central; font-family: serif; }
  .metronome-head { fill: none; stroke: var(--primary); stroke-width: 2; stroke-dasharray: 4 3; }
  .sheet-hands { position: relative; }
  .pick-layer { position: absolute; inset: 0; pointer-events: none; z-index: 1; }
  .pick-start { position: absolute; top: 0; pointer-events: auto; font-size: calc(var(--min-box) * .5); line-height: 1; }
  .pick-start :global(button) { background: var(--background); border: 1px solid var(--primary); border-radius: .25rem; }
  .pick-banner { display: flex; align-items: center; gap: .5rem; padding: 0 0 .25rem; color: var(--primary); }
  .pick-banner :global(button) { border: 1px solid var(--primary); border-radius: .25rem; padding: 0 calc(var(--min-box) / 4); }
  .sheet-note {
    fill: currentColor;
    font-size: calc(var(--min-box) * .8);
    font-family: var(--font-mono, ui-monospace, monospace);
    text-anchor: middle;
    dominant-baseline: central;
  }
</style>
