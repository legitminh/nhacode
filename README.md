# nhacode

A full-screen piano matrix: **12 rows × 8 octave columns**, built with Svelte 5,
Vite and Keyflow's `KeyboardDisplay` / `KeyboardKeyDisplay` components.
Every column repeats hexadecimal labels **0–b**. Press and hold with a mouse,
touch multiple keys for chords, or play with a computer keyboard.

```sh
npm ci
npm run dev
```

Requires Node 22.18+ (Node 24 recommended). Open the local URL printed by Vite.

## Playing

- Rows, top to bottom: A, A♯, B, C, C♯, D, D♯, E, F, F♯, G, G♯.
- Columns run from the lowest octave on the left to the highest on the right.
- Keys on the selected column show their computer-keyboard shortcuts:
  `A W S E D F T G Y H U J`.
- Left/right arrows, the markers below the grid, or pressing a key select an octave.
- Hold Space for sustain, or click Sustain to latch the pedal. Escape stops all notes.
- Audio unlocks on the first press. Samples preload in the background; loading failures
  show a Retry audio control. Leaving the window stops held notes.

### Octave convention

Displayed octaves are **A-based**, matching the requested A0 → G♯0 → A1 layout.
A0 is MIDI 21 / 27.5 Hz. Each step down a column is one semitone and each
column advances twelve semitones. The bottom-right key is G♯7 in this layout,
MIDI 116 (G♯8 in conventional C-based scientific pitch notation). C0 in this
layout is conventional C1. The 96 keys span eight complete octaves.

## Instruments and samples

`src/lib/audio/types.ts` defines the `Instrument` and `Voice` interfaces.
`src/lib/audio/instruments.ts` is the instrument registry; add another bank or
an implementation of the same interface to try a different instrument.
`SampledInstrument` handles decoding, nearest-sample pitch shifting and release
envelopes. `AudioEngine` owns the output, volume, polyphony and sustain.
The grid only sends note-on and note-off events and does not depend on sample format.

The default instrument is **FluidR3 Grand Piano**, with 88 real piano samples
bundled locally (about 2 MB). The eight notes above conventional C8 use pitch-shifted
C8 audio. Playing does not require an external audio service.
See [sample attribution](public/audio/ATTRIBUTION.md) for source and CC BY 3.0 credits.
Regenerate the sample files with `npm run samples:fetch`; the script pins the
upstream revision and parses the data without evaluating downloaded JavaScript.

## Keyflow

Version **0.4.0**, latest release verified on 2026-11-14, from upstream revision
`a2271a8d0ddcb171e9e80dec9b0eb761e59a9020`.
The official release archive is committed in `vendor/` and locked in
`package-lock.json`, so a clean checkout needs no Keyflow source build.
Source: https://github.com/legitminh/keyflow

Keyflow keycaps emit taps on click. `PianoKey.svelte` adapts pointer and focused
keyboard press/release events to musical note lifetimes, retaining the actual
library components and preventing a second note from the subsequent click.

## Validation

```sh
npm run check
npm test
npm run test:browser
npm run build
```

Browser tests use installed Google Chrome by default. Set `CHROME_PATH` to use
another Chromium executable. They exercise real sample decoding and nonzero Web
Audio output, note onset before release, pointer capture, hardware chords, sustain,
touch cancellation, pitch shifting, focus loss and no-scroll layouts at desktop,
mobile and landscape dimensions. `npm run build` produces a static site in `dist/`.
