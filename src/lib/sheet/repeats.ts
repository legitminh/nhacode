import type { Song, SongMeasure } from './types';

/**
 * How the sheet shows repeated sections. Playback always follows the repeats.
 * - traditional: the score as written, with repeat barlines, ending brackets, D.C./D.S./Coda/Fine.
 * - expand: the repeats written out, one continuous stream.
 * - programmatic: each replayed section is drawn once, bracketed as `[§ id … ]`, and every
 *   replay is a one-column § measure; putting the section back for each § gives the expanded stream.
 */
export type RepeatMode = 'traditional' | 'expand' | 'programmatic';
export const REPEAT_MODES: RepeatMode[] = ['expand', 'traditional', 'programmatic'];
export const REPEAT_NAMES: Record<RepeatMode, string> = { traditional: 'Traditional', expand: 'Expand', programmatic: 'Programmatic' };

/** The highest ending number in the volta group (consecutive measures with endings) holding measure i. */
function lastEnding(measures: SongMeasure[], i: number): number {
  let a = i;
  let b = i;
  while (a > 0 && measures[a - 1].ending) a--;
  while (b + 1 < measures.length && measures[b + 1].ending) b++;
  return Math.max(...measures.slice(a, b + 1).flatMap((m) => m.ending ?? [1]));
}

/**
 * The order the score's measures are played in: repeat barlines (back to the last forward
 * repeat, or the last finished section), 1st/2nd endings, then D.C. / D.S. with Fine and
 * To Coda. After a D.C. or D.S. repeats are not taken again and only the last ending plays.
 */
export function playOrder(measures: SongMeasure[]): number[] {
  const order: number[] = [];
  const taken = new Map<number, number>();
  let i = 0;
  let start = 0;
  let pass = 1;
  let sawEnding = false;
  let jumped = false;
  const limit = measures.length * 32;
  while (i < measures.length && order.length < limit) {
    const measure = measures[i];
    if (measure.repeat?.start && start !== i) { start = i; pass = 1; sawEnding = false; }
    if (measure.ending) {
      sawEnding = true;
      if (!measure.ending.includes(jumped ? lastEnding(measures, i) : pass)) { i++; continue; }
    } else if (sawEnding && (pass > 1 || jumped)) {
      // Past the endings: a later backward repeat goes back to here.
      start = i;
      pass = 1;
      sawEnding = false;
    }
    order.push(i);
    const times = measure.repeat?.end;
    if (times && !jumped) {
      const count = taken.get(i) ?? 1;
      if (count < times) {
        taken.set(i, count + 1);
        pass++;
        sawEnding = false;
        i = start;
        continue;
      }
      if (!measure.ending) { start = i + 1; pass = 1; }
    }
    const jump = measure.jump;
    if (jumped && jump?.fine) break;
    if (jumped && jump?.toCoda) {
      const coda = measures.findIndex((m, k) => k > i && m.jump?.coda);
      if (coda >= 0) { i = coda; continue; }
    }
    if (!jumped && (jump?.dacapo || jump?.dalsegno)) {
      jumped = true;
      pass = 1;
      sawEnding = false;
      let segno = -1;
      if (jump.dalsegno) for (let k = i; k >= 0 && segno < 0; k--) if (measures[k].jump?.segno) segno = k;
      i = Math.max(0, segno);
      continue;
    }
    i++;
  }
  return order;
}

/** The full length of a measure in ticks for each measure, from the time signatures (4/4 until one is set). */
export function fullLengths(measures: SongMeasure[], ticksPerQuarter: number): number[] {
  let meter: [number, number] = [4, 4];
  return measures.map((measure) => {
    if (measure.time) meter = measure.time;
    return Math.max(measure.duration, meter[0] * ticksPerQuarter * 4 / meter[1]);
  });
}

/**
 * The song as played: its measures copied in play order. A copy of the pickup that follows a
 * short measure (a first ending going back to the start) makes one full measure with it: both
 * are marked `joined`, so neither shows deleted time frames.
 */
export function expandSong(song: Song): { song: Song; order: number[] } {
  const order = playOrder(song.measures);
  const full = fullLengths(song.measures, song.ticksPerQuarter);
  const measures: SongMeasure[] = order.map((source) => ({ ...song.measures[source], source, ...(source === 0 ? { pickup: true } : {}) }));
  for (let k = 1; k < measures.length; k++) {
    const previous = measures[k - 1];
    if (order[k] !== 0 || order[k - 1] === 0) continue;
    if (previous.duration < full[order[k - 1]] && previous.duration + measures[k].duration <= full[order[k - 1]]) {
      previous.joined = true;
      measures[k].joined = true;
    }
  }
  return { song: { ...song, measures }, order };
}

/** A section's label: its id in lowercase hexadecimal, least significant digit first (16 is "01"). */
export const sectionLabel = (id: number) => [...id.toString(16)].reverse().join('');

/** One thing on the sheet: a measure of the score, or (programmatic) a § measure replaying a section. */
export type DisplayItem =
  | { kind: 'measure'; measure: SongMeasure; source: number; index: number; plays: number[]; full: number; pickup: boolean;
      /** Draw the score's repeat barlines, endings and navigation (traditional mode). */
      traditional: boolean;
      /** Section brackets that open ("[§ id") or close ("]") on this measure (programmatic mode). */
      opens: number[]; closes: number[] }
  | { kind: 'section'; id: number; index: number; plays: number[] };

/**
 * What the sheet shows for a song in a repeat mode. `index` is the played-measure index a
 * click seeks to; `plays` lists every played-measure index the item stands for (for the
 * playhead and autoscroll).
 */
export function displayItems(song: Song, mode: RepeatMode): DisplayItem[] {
  const { song: played, order } = expandSong(song);
  const full = fullLengths(song.measures, song.ticksPerQuarter);
  const measureItem = (source: number, index: number, plays: number[], measure = song.measures[source]): DisplayItem => ({
    kind: 'measure', measure, source, index, plays, pickup: source === 0 || !!measure.pickup,
    full: measure.joined ? measure.duration : full[source], traditional: mode === 'traditional', opens: [], closes: [],
  });
  if (mode === 'expand') return played.measures.map((measure, k) => measureItem(order[k], k, [k], measure));
  if (mode === 'traditional') {
    return song.measures.map((_, source) => {
      const plays = order.flatMap((s, k) => (s === source ? [k] : []));
      return measureItem(source, plays[0] ?? 0, plays.length ? plays : [0]);
    });
  }
  // Programmatic: walk the play order; a run of measures already shown, in the same order,
  // becomes one § measure. Sections are numbered by first use.
  const items: DisplayItem[] = [];
  const shown = new Map<number, DisplayItem & { kind: 'measure' }>();
  const sections = new Map<string, number>();
  let k = 0;
  while (k < order.length) {
    if (!shown.has(order[k])) {
      const item = measureItem(order[k], k, [k], played.measures[k]) as DisplayItem & { kind: 'measure' };
      shown.set(order[k], item);
      items.push(item);
      k++;
      continue;
    }
    let end = k;
    while (end + 1 < order.length && order[end + 1] === order[end] + 1 && shown.has(order[end + 1])) end++;
    const key = `${order[k]}-${order[end]}`;
    let id = sections.get(key);
    if (id === undefined) {
      id = sections.size;
      sections.set(key, id);
      shown.get(order[k])!.opens.push(id);
      shown.get(order[end])!.closes.push(id);
    }
    items.push({ kind: 'section', id, index: k, plays: Array.from({ length: end - k + 1 }, (_, j) => k + j) });
    k = end + 1;
  }
  return items;
}
