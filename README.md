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
  size (48px, reduced only to fit smaller cells). Each pitch class 0–b has its own
  hue from Keyflow's `distribute_color`, shared with the sheet screen.
- Hold the primary mouse button and glide between keys, or drag a finger across
  them. Notes stop when the cursor/contact leaves, lifts, or is cancelled.
  Hovering without pressing is silent.
- Every font size follows Keyflow's `--min-box` (glyphs at 0.8 box, one box per
  line). **Settings → Min box** has Increase and Decrease buttons that scale it by
  1.25, like Keyflow's zoom, between 12 and 160 px; Keyflow remembers the value.
- **Settings → Keyboard margins** sets the keyboard's top, right, bottom and left
  margins with − and + buttons (8 px per press, 0–480 px). Keys shrink to fit
  inside the margins, and the margins are remembered per browser.
- The settings icon at the top left opens with a click or **Escape**; its shortcut
  appears on hover or keyboard focus. It contains instrument, octave-range and
  transpose controls, implemented with Keyflow's `SubKeyframe` and interaction action.
- In the default
  layout, each octave runs down a column. Transposed, the twelve notes run left
  to right, and higher octaves follow in rows below. The pitches stay unchanged.
- The octave range has two digit-only endpoint fields and uses **[start,end)**:
  include the first octave, exclude the last. It defaults to **[0,8)**. Press
  Enter or leave a field to apply the range immediately. **[6,8)** renders only
  two octave columns, 6 and 7 (or two rows when transposed). Endpoints may be 0
  through 8; an invalid or empty interval leaves the previous range intact.
  Escape leaves an endpoint field; Escape/Back then returns one menu level.
- The play area cannot be text-selected. Settings text and endpoint fields
  remain selectable for copying and editing.
- Tab to a note and hold **Enter** or **Space** for Keyflow's native keyboard
  activation. Keyflow also owns menu shortcuts, navigation and focus restoration.
- Audio unlocks on a user gesture. Samples preload in the background; a later key
  press retries after a loading failure. Leaving the window stops held notes.
  On supported platforms the engine requests a playback audio session, activating
  the system-selected output route instead of relying on another Safari page to
  initialize it. Touch release and click retry activation for stricter iOS gesture
  policies. Headphone pairing and output-device selection remain system settings.

### Sheet screen

The top bar has two Keyflow toggles: **sheet** (shortcut S) and the keyboard icon
(shortcut K). Either screen can be on or off; when both are on they sit side by
side. The choice is remembered per browser. While the sheet is on, the **Song**
menu (M) sits on the same toolbar line.

The sheet has no stave; it only shows which key is pressed when:

- Each measure is divided into time frames of its *resolution*, the smallest
  note or rest unit in that measure. One frame is one character cell.
- A note's start shows its pitch class in lowercase hex (0 = A … b = G♯); each
  further frame it is held shows a dash. Ties from the previous measure show
  dashes only. Empty frames are blank.
- Notes sounding together stack by ascending pitch (lower on top); notes that
  don't overlap share a row.
- Each stream (line of measures) starts with one thick line above octave 0. Each
  higher octave adds a thin line above its block, drawn only over the frames that
  reach that octave, so the number of lines above a digit is its octave.
- Measures wrap to a new stream at the screen edge.

Scores come from [PDMX](https://github.com/pnlong/PDMX) (Zenodo record
15571083). `scripts/pdmx.py` searches `PDMX.csv`, streams `mxl.tar.gz` until the
score is found, and caches the raw MXL in `data/pdmx/pdmx.sqlite` (gitignored).
It then writes the simplified song to `src/songs/<id>.json`, which is committed:

```bash
python3 scripts/pdmx.py search "fur elise"
python3 scripts/pdmx.py fetch fur-elise "fur elise"
python3 scripts/pdmx.py simplify fur-elise "Für Elise"
```

Repeats are shown as written, not unrolled. Grace notes are omitted.

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

Version **0.7.0**, latest release verified on 2026-11-15, from upstream revision
`dc0c68a65ea1bf8a2721b13403d4e303e9b02e82`.
The official release archive is committed in `vendor/` and locked in
`package-lock.json`, so a clean checkout needs no Keyflow source build.
Source: https://github.com/legitminh/keyflow

`PianoKey.svelte` connects Keyflow's four press/cursor callbacks to audio voices.
Keyflow handles mouse/pen tracking, touch hit testing under implicit capture,
contact aggregation, cancellation and native keyboard activation. Its interaction
action ends a mouse hold even after gliding away from the key where it began.
`SubKeyframe` owns settings and instrument dropdown frames, item buttons, outside
dismissal, Back/Escape behavior and focus restoration. Native single-line endpoint
inputs use Keyflow's interaction action and menu activation state; input handlers
filter digits and commit on Enter/blur. The app adds no document/window input
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
Use `PLAYWRIGHT_BROWSER=webkit npm run test:browser -- -g 'mobile audio|octave endpoint'`
to run the Safari-engine touch tests. CI runs these alongside the full Chromium
suite, including its mouse-selection and glide checks. These checks do
not emulate physical iOS headphone routing; that still requires an iPhone/iPad.

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
