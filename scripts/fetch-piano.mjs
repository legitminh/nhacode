import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

// FluidR3 GM, Frank Wen; MIDI.js rendering by Benjamin Gleitzman.
// Pin the upstream revision so regenerating assets stays reproducible.
const revision = '044fab8e1456bfafc5776e86dfd6bb8697149aef';
const url = `https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/${revision}/FluidR3_GM/acoustic_grand_piano-mp3.js`;
const response = await fetch(url);
if (!response.ok) throw new Error(`Sample download failed: ${response.status}`);
const text = await response.text();
const assignment = 'MIDI.Soundfont.acoustic_grand_piano = ';
const start = text.indexOf(assignment);
if (start < 0) throw new Error('Unrecognized soundfont format.');
// Parse data; do not evaluate downloaded JavaScript.
const samples = JSON.parse(text.slice(start + assignment.length).trim().replace(/;$/, '').replace(/,\s*}$/, '}'));
const names = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const directory = new URL('../public/audio/piano/', import.meta.url);
await mkdir(directory, { recursive: true });
for (let midi = 21; midi <= 108; midi++) {
  const note = `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
  const data = samples[note];
  if (typeof data !== 'string' || !data.startsWith('data:audio/mp3;base64,')) throw new Error(`Missing ${note}.`);
  await writeFile(new URL(`${midi}.mp3`, directory), Buffer.from(data.split(',')[1], 'base64'));
}
console.log(`Saved 88 piano samples. Source SHA-256: ${createHash('sha256').update(text).digest('hex')}`);
