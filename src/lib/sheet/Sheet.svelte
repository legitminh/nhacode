<script lang="ts">
  import { Document, min_box, must_view } from '@legitminh/keyflow';
  import { layoutMarks, layoutSystems, type MeasureLayout, type StreamLayout } from './layout';
  import type { Song } from './types';
  import { octaveLineColor } from '../colors';

  const files = import.meta.glob<Song>(['../../songs/*.json', '!../../songs/index.json'], { import: 'default' });
  import type { LineWidths } from './lines';

  import type { Position } from './timeline';

  let { songId, lineWidths, separateHands = false, inverted = false, playhead, onseek, onsong }: {
    songId: string; lineWidths: LineWidths; separateHands?: boolean; inverted?: boolean;
    /** Where playback is; its time frame is highlighted. */
    playhead?: Position;
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
  const HAND_NAMES: Record<string, string> = { right: 'Right hand', left: 'Left hand' };
  /** Inverted order mirrors each stream vertically: octave 0 and its border go to the bottom. */
  const flip = (y: number, height: number) => (inverted ? height - y : y);

  $effect(() => {
    const id = songId;
    const load = files[`../../songs/${id}.json`];
    song = undefined;
    error = '';
    if (!load) return;
    load().then((value) => { if (songId === id) { song = value; onsong?.(value); } })
      .catch(() => { if (songId === id) error = 'Could not load this song.'; });
  });

  /** Top of the octave block o (just below its line) inside a stream. */
  function blockTop(stream: StreamLayout, octave: number) {
    let y = GAP;
    for (let o = 0; o < octave; o++) y += stream.lanes[o] * ROW + GAP;
    return y;
  }

  function streamHeight(stream: StreamLayout) {
    return blockTop(stream, stream.lanes.length - 1) + stream.lanes[stream.lanes.length - 1] * ROW;
  }

  /** Runs of consecutive frames where octave line o is needed. */
  function lineRuns(measure: MeasureLayout, octave: number) {
    const runs: [number, number][] = [];
    measure.reach.forEach((reach, frame) => {
      if (reach < octave) return;
      const last = runs.at(-1);
      if (last && last[1] === frame) last[1] = frame + 1;
      else runs.push([frame, frame + 1]);
    });
    return runs;
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
      <div class="sheet-streams" data-song={song.id} aria-label={`${song.title}, ${song.composer}`}>
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
          <div class="sheet-hands">
          {#each inverted ? [...system.hands].reverse() : system.hands as { hand, stream }}
          {@const xs = offsets(stream)}
          {@const height = streamHeight(stream)}
          <svg class="sheet-stream" data-stream={index} data-hand={hand} width={stream.frames * CELL} height={height}
            viewBox={`0 0 ${stream.frames * CELL} ${height}`} role="img"
            aria-label={`${hand === 'both' ? '' : `${HAND_NAMES[hand]}, `}measures ${stream.measures[0].number} to ${stream.measures.at(-1)!.number}`}>
            <line class="octave-zero" data-line="0" style:stroke={octaveLineColor(0)} x1="0" x2={stream.frames * CELL}
              y1={flip(ORIGIN / 2, height)} y2={flip(ORIGIN / 2, height)} stroke-width={ORIGIN} />
            {#each stream.measures as measure, m}
              <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
              <g class="sheet-measure" class:seekable={!!onseek} data-measure={measure.number} data-index={measure.index}
                transform={`translate(${xs[m]} 0)`} onclick={() => onseek?.(measure.index)}>
                <rect class="measure-hit" x="0" y="0" width={measure.frames * CELL} {height} />
                {#if playhead && playhead.measure === measure.index}
                  <rect class="playhead" x={Math.min(measure.frames - 1, Math.floor(playhead.tick / measure.resolution)) * CELL} y="0"
                    width={CELL} {height} />
                {/if}
                {#if m > 0}<line class="barline" x1="0" x2="0" y1="0" y2={height} />{/if}
                {#each stream.lanes as _, octave}
                  {#if octave > 0}
                    {#each lineRuns(measure, octave) as [from, to]}
                      {@const y = flip(blockTop(stream, octave) - GAP / 2, height)}
                      <line class="octave-line" data-octave={octave} data-line={octave} style:stroke={octaveLineColor(octave)} stroke-width={OCTAVE} x1={from * CELL + 1} x2={to * CELL - 1}
                        y1={y} y2={y} />
                    {/each}
                  {/if}
                {/each}
                {#each measure.notes as note}
                  {@const y = flip(blockTop(stream, note.octave) + note.lane * ROW + ROW / 2, height)}
                  {#if !note.tied}
                    <text class="sheet-note" data-midi={note.midi} style:fill={octaveLineColor(note.octave)} x={note.frame * CELL + CELL / 2} {y}>{note.digit}</text>
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
          </div>
        {/each}
      </div>
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
  .sheet-note {
    fill: currentColor;
    font-size: calc(var(--min-box) * .8);
    font-family: var(--font-mono, ui-monospace, monospace);
    text-anchor: middle;
    dominant-baseline: central;
  }
</style>
