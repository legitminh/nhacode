<script lang="ts">
  import { Document, min_box, must_view } from '@legitminh/keyflow';
  import { layoutSystems, type MeasureLayout, type StreamLayout } from './layout';
  import type { Song } from './types';
  import { octaveLineColor } from '../colors';

  const files = import.meta.glob<Song>(['../../songs/*.json', '!../../songs/index.json'], { import: 'default' });
  import type { LineWidths } from './lines';

  let { songId, lineWidths, separateHands = false }: { songId: string; lineWidths: LineWidths; separateHands?: boolean } = $props();

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
  const HAND_NAMES: Record<string, string> = { right: 'Right hand', left: 'Left hand' };

  $effect(() => {
    const id = songId;
    const load = files[`../../songs/${id}.json`];
    song = undefined;
    error = '';
    if (!load) return;
    load().then((value) => { if (songId === id) song = value; })
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
          <!-- One system: a single stream, or the right hand above the left hand. Paging never splits it. -->
          <div class="sheet-stream-box" class:hands={system.hands.length > 1} data-system={index} use:must_view>
          {#each system.hands as { hand, stream }}
          {@const xs = offsets(stream)}
          {@const height = streamHeight(stream)}
          <svg class="sheet-stream" data-stream={index} data-hand={hand} width={stream.frames * CELL} height={height}
            viewBox={`0 0 ${stream.frames * CELL} ${height}`} role="img"
            aria-label={`${hand === 'both' ? '' : `${HAND_NAMES[hand]}, `}measures ${stream.measures[0].number} to ${stream.measures.at(-1)!.number}`}>
            <line class="octave-zero" data-line="0" style:stroke={octaveLineColor(0)} x1="0" x2={stream.frames * CELL}
              y1={ORIGIN / 2} y2={ORIGIN / 2} stroke-width={ORIGIN} />
            {#each stream.measures as measure, m}
              <g class="sheet-measure" data-measure={measure.number} transform={`translate(${xs[m]} 0)`}>
                {#if m > 0}<line class="barline" x1="0" x2="0" y1="0" y2={height} />{/if}
                {#each stream.lanes as _, octave}
                  {#if octave > 0}
                    {#each lineRuns(measure, octave) as [from, to]}
                      <line class="octave-line" data-octave={octave} data-line={octave} style:stroke={octaveLineColor(octave)} stroke-width={OCTAVE} x1={from * CELL + 1} x2={to * CELL - 1}
                        y1={blockTop(stream, octave) - GAP / 2} y2={blockTop(stream, octave) - GAP / 2} />
                    {/each}
                  {/if}
                {/each}
                {#each measure.notes as note}
                  {@const y = blockTop(stream, note.octave) + note.lane * ROW + ROW / 2}
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
  /* Separate hands: the right-hand stream sits just above the left-hand one, joined by a bracket. */
  .sheet-stream-box.hands {
    display: flex;
    flex-direction: column;
    gap: calc(var(--min-box) / 4);
    padding-left: calc(var(--min-box) / 8);
    border-left: 2px solid var(--tertiary);
  }
  .octave-zero, .octave-line { stroke: currentColor; }
  .barline { stroke: var(--tertiary); stroke-width: 1; }
  .hold { stroke: currentColor; stroke-width: 1.5; }
  .sheet-note {
    fill: currentColor;
    font-size: calc(var(--min-box) * .8);
    font-family: var(--font-mono, ui-monospace, monospace);
    text-anchor: middle;
    dominant-baseline: central;
  }
</style>
