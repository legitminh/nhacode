import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const revision = '044fab8e1456bfafc5776e86dfd6bb8697149aef';
const names = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
for (const instrument of ['violin', 'cello', 'flute']) {
  const url = `https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/${revision}/FluidR3_GM/${instrument}-mp3.js`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${instrument} download failed: ${response.status}`);
  const source = await response.text();
  const assignment = `MIDI.Soundfont.${instrument} = `;
  const start = source.indexOf(assignment);
  if (start < 0) throw new Error('Unrecognized soundfont format.');
  const samples = JSON.parse(source.slice(start + assignment.length).trim().replace(/;$/, '').replace(/,\s*}$/, '}'));
  const directory = new URL(`../public/audio/${instrument}/`, import.meta.url);
  await mkdir(directory, { recursive: true });
  for (let midi = 21; midi <= 108; midi += 3) {
    const note = `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
    const data = samples[note];
    if (typeof data !== 'string' || !data.startsWith('data:audio/mp3;base64,')) throw new Error(`Missing ${instrument} ${note}.`);
    await writeFile(new URL(`${midi}.mp3`, directory), Buffer.from(data.split(',')[1], 'base64'));
  }
  console.log(`Saved 30 ${instrument} samples. Source SHA-256: ${createHash('sha256').update(source).digest('hex')}`);
}
