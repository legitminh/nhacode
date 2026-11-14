# nhacode

A full-screen piano matrix: **12 rows × 8 octave columns**, built with Svelte 5,
Vite and Keyflow's `KeyboardDisplay` / `KeyboardKeyDisplay` components.
Every column repeats hexadecimal labels **0–b**. Press and hold with a mouse,
touch multiple keys for chords, or play with a computer keyboard.

**Play:** https://legitminh.github.io/nhacode/

```sh
npm ci
npm run dev
```

Requires Node 22.18+ (Node 24 recommended). Open the local URL printed by Vite.

## Playing

- Rows, top to bottom: A, A♯, B, C, C♯, D, D♯, E, F, F♯, G, G♯.
- Columns run from the lowest octave on the left to the highest on the right.
- Keys use centered, unbracketed hexadecimal labels at Keyflow's `--min-box` font
  size (48px, reduced only to fit smaller cells), all in the same theme color.
- The settings icon at the top left opens **Transpose display**. In the default
  layout, each octave runs down a column. Transposed, the twelve notes run left
  to right, and higher octaves follow in rows below. The pitches stay unchanged.
- Computer-keyboard shortcuts: `A W S E D F T G Y H U J` (top to bottom).
- Left/right arrows or pressing a key select an octave. The fourth column is selected initially.
- Hold Space for sustain. Escape stops all notes.
- Audio unlocks on the first press. Samples preload in the background; a later key
  press retries after a loading failure. Leaving the window stops held notes.

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

Version **0.5.0**, latest release verified on 2026-11-14, from upstream revision
`295385d42356a96d862a12d75628d15e1f5ed99a`.
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

## Deployment

GitHub Pages publishes the site at https://legitminh.github.io/nhacode/.
`.github/workflows/pages.yml` runs type checks, note-mapping tests, browser tests
and a production build on pull requests and pushes to `main`. Successful pushes
to `main` deploy automatically; the workflow can also be run manually from Actions.
Only the deployment job has permission to publish. Pull requests never deploy.

The workflow uses Node 24, `npm ci` with the committed lockfile, and the bundled
Keyflow archive and piano samples. No deployment secret is required. Repository
Settings → Pages must use **GitHub Actions** as its source.

`BASE_PATH=/nhacode/ npm run build` sets the production asset prefix. Local
development uses `/` by default. To run the browser suite against a deployed
site or a production preview, set `PLAYWRIGHT_BASE_URL` to its full URL, including
the trailing slash; the tests will use that site without starting a dev server.
