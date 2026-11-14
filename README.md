# nhacode

A full-screen sampled instrument grid: **12 rows × 8 octave columns** by default, built with Svelte 5,
Vite and Keyflow's `KeyboardDisplay` / `KeyboardKeyDisplay` components.
Every column repeats hexadecimal labels **0–b**. Press and hold with a mouse,
glide across keys, or use multiple touch contacts for chords.

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
- Hold the primary mouse button and glide between keys, or drag a finger across
  them. Notes stop when the cursor/contact leaves, lifts, or is cancelled.
  Hovering without pressing is silent.
- The settings icon at the top left opens with a click or **Escape**; its shortcut
  appears on hover or keyboard focus. It contains instrument, octave-range and
  transpose controls, implemented with Keyflow's `SubKeyframe` and `TextBox`.
- In the default
  layout, each octave runs down a column. Transposed, the twelve notes run left
  to right, and higher octaves follow in rows below. The pitches stay unchanged.
- The octave range defaults to **[0,8)**: include octave 0, exclude octave 8.
  Brackets include endpoints and parentheses exclude them; `[2,4]` selects 2, 3
  and 4, while `(2,4)` selects only 3. Endpoints may be 0 through 8; empty or
  malformed intervals leave the previous range intact. Escape exits the editor
  and applies a valid range. Escape/Back returns one menu level at a time.
- Tab to a note and hold **Enter** or **Space** for Keyflow's native keyboard
  activation. Keyflow also owns menu shortcuts, navigation and focus restoration.
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

The instrument dropdown offers **Grand piano, Violin, Cello and Flute** from
FluidR3. The piano includes 88 samples, with 30 samples each for the other three
instruments. Other pitches use the nearest sample at an adjusted playback rate.
Strings and winds crossfade into a sustain loop until release; piano notes use
their natural decay. Switching instruments stops current voices and cancels old
sample loads. All samples are bundled locally (about 4.5 MB); playing does not
require an external audio service.
See [sample attribution](public/audio/ATTRIBUTION.md) for source and CC BY 3.0 credits.
Regenerate the sample files with `npm run samples:fetch`; the script pins the
upstream revision and parses the data without evaluating downloaded JavaScript.

## Keyflow

Version **0.6.0**, latest release verified on 2026-11-14, from upstream revision
`1842810e87f9fc4b62d488eeaddce4050ae81294`.
The official release archive is committed in `vendor/` and locked in
`package-lock.json`, so a clean checkout needs no Keyflow source build.
Source: https://github.com/legitminh/keyflow

`PianoKey.svelte` connects Keyflow's four press/cursor callbacks to audio voices.
Keyflow handles mouse/pen tracking, touch hit testing under implicit capture,
contact aggregation, cancellation and native keyboard activation. Its interaction
action ends a mouse hold even after gliding away from the key where it began.
`SubKeyframe` owns settings and instrument dropdown frames, item buttons, outside
dismissal, Back/Escape behavior and focus restoration. The app adds no DOM input
listeners or custom button gesture implementation.

## Validation

```sh
npm run check
npm test
npm run test:browser
npm run build
```

Browser tests use installed Google Chrome by default. Set `CHROME_PATH` to use
another Chromium executable. They exercise real sample decoding and nonzero Web
Audio output for each instrument, note onset before release, mouse/finger gliding,
touch chords and cancellation, pitch shifting, focus loss, octave intervals,
nested menus, hover shortcuts and no-scroll layouts at desktop,
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
