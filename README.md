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
  size (48px, reduced only to fit smaller cells). Color marks the octave, not the
  note: octave n uses Keyflow's `distribute_color` index n for the key's text and
  border, shared with the sheet screen. The hex label alone names the note.
- Hold the primary mouse button and glide between keys, or drag a finger across
  them. Notes stop when the cursor/contact leaves, lifts, or is cancelled.
  Hovering without pressing is silent.
- Every font size follows Keyflow's `--min-box` (glyphs at 0.8 box, one box per
  line). **Settings → Min box** has Increase and Decrease buttons that scale it by
  1.25, like Keyflow's zoom, between 12 and 160 px; Keyflow remembers the value.
- The settings icon at the top left opens with a click or **Escape**; its shortcut
  appears on hover or keyboard focus. Settings has a **Keyboard pane** submenu
  (instrument, octave range, transpose, key border width and margins), a **Sheet
  pane** submenu (hands, order, lockstep scrolling, line widths), and the shared
  min-box and Keyflow **Theme** (light, dark, sepia) controls, all built with
  Keyflow's `SubKeyframe`, `Button`, `ThemeToggle` and interaction action.
- **Keyboard pane → Key border** and **Margins** are number fields in min-box units:
  border width 0–0.25 (default 0.04), margins 0–10 in steps of 0.25. Keys shrink
  to fit.
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
side. The choice is remembered per browser. While the sheet is on, the toolbar
also shows a **▶/⏸** play button (P) and the song title, a 16-character Keyflow
`BoundedText` that scrolls when longer; the title (M) opens the song screen.

Playback works like MuseScore's: ▶ plays the song from the playhead with the
app's instrument pack, following the score's tempo changes, and ⏸ pauses. The
current time frame is highlighted, and clicking any measure moves the playhead
there (playback continues from it). **Sheet pane → Playback** hides the tool and
**Playback instrument** picks grand piano, violin, cello or flute.

The toolbar reads, left to right: **playback** (O), ▶/⏸ (P), the song title (M),
**metronome** (T) and the metronome's ▶/⏸ (N).

- **playback → Start playback from** puts a ▶ triangle (a Keyflow `ButtonPositional`)
  at the start of every measure in its own input frame: click one or type its
  shortcut to start there, Escape cancels, and the sheet keeps scrolling.
- The metronome follows the score's meter and tempo from the playhead (or along with
  playback): a strong click on each measure's downbeat, weaker clicks on the other
  beats (compound meters such as 6/8 beat in dotted quarters; pickups have no
  downbeat), and optional in-between clicks. Its dashed cursor moves across the
  sheet. **metronome** sets Strong beat, Beat and In-between strength (0–8, 0 is
  silent) and In-between beats per beat (0–7) with Keyflow `NumberBox` fields.
- Playback follows the notated dynamics (pp … ff set the loudness, sf/sfz accent a
  single note, and hairpins ramp to the next dynamic or one step), accents play
  louder, staccato notes sound half as long, and arpeggiated chords roll low to high.
- The sustain pedal gets its own thin stream (a bracket while held, a notch on a
  pedal change) when the score has pedal marks: below the music by default, or above
  via **Sheet pane → Pedal**. Playback presses and lifts the pedal too.
- **playback** and **metronome** each have a Keyflow `HorizontalSlider` for speed
  (×0.25–×2, step 0.05), remembered per browser.
- **Sheet pane → Articulations** (on by default) shows note modifiers: staccato
  dots, tenuto lines, accents, trills (*tr*), fermatas and, on grace notes, a
  squished cross (they take almost no time). A lane with modifiers gets an extra
  half row for them, above the digit by default or below via **Modifiers**,
  whatever the order. Grace notes get their own columns just before the note they
  lead into, and a rolled chord gets a column for its wavy arpeggio line.
- Playback plays grace notes quickly just before the beat, alternates trills with
  the note a whole step up, leans on tenuto notes, and pauses on fermatas (the
  metronome pauses with it).
- **Sheet pane → Autoscroll** (on by default) keeps the line holding the playback
  or metronome cursor at the top of the view.
- Playback, instrument and metronome settings are saved in the browser. Its search
box is Keyflow's `TextBox`: the screen opens with its tag and song shortcuts live,
**/** starts typing (results filter as you type), Escape stops typing, and Enter
picks the first match.
Search covers titles and composers; toggle the **classical**, **western**, **eastern**, **electronic** and
**orchestral** tags to filter. Selected tags must all match; classical covers
both western and eastern classical music. Each result has a Keyflow shortcut.

The sheet has no stave; it only shows which key is pressed when:

- Each measure is divided into time frames of its *resolution*, the smallest
  note or rest unit in that measure. One frame is one character cell.
- A note's start shows its pitch class in lowercase hex (0 = A … b = G♯); each
  further frame it is held shows a dash. Ties from the previous measure show
  dashes only. Empty frames are blank.
- Each column stacks on its own, outward from the origin line: octave lines and
  notes in pitch order (lower nearer the origin), each note as close to the origin
  as it can sit. A note keeps one height for its digit and its dashes, so it clears
  everything lower in pitch in every column it covers: a held 8 pushes a later 0 of
  a higher octave above its dash, and a 0 in the same octave pushes the held 8 up.
  Notes of the same octave need not share a row across the line.
- Each stream (line of measures) starts with one thick line above octave 0. Each
  higher octave adds a thin line just before its first note in a column, drawn only
  over the columns that reach that octave (so lines step between columns), and the
  number of lines above a digit is its octave. Lines are
  colored with Keyflow's `distribute_color` by index: the thick origin line is 0,
  the line above octave n is n. Digits and hold dashes take their octave's color
  too, so each octave block matches the line above it.
- A measure shorter than its time signature keeps its full width: each missing time
  frame shows a tall cross over the whole stream (that time is removed, played
  instantly). A pickup loses its start; any other short measure, such as a first
  ending that hands its last beat back to the pickup, loses its end. Scores that
  write such a measure too long are corrected in `scripts/songs.json` with
  `measure_lengths` (measure number to quarter notes); Für Elise's measure 8 is one.
- Measures wrap to a new stream at the screen edge.
- Score markings sit above each line: tempo as `bpm=N` when it changes, dynamics
  (bold italic), short directions such as *dim.* or *a tempo*, and crescendo/
  diminuendo hairpins (which continue onto the next line when needed). Time
  signatures are left out. Markings that would overlap move to a new row, and text
  near the right edge slides left to stay inside the line.
- **Sheet pane → Hands** switches between one stream per line (Together) and one
  mega stream per line (Separate): the left-hand stream above the right-hand
  stream under a thick bar, both wrapped at the same measures. The left and right
  streams share their columns, so a column is the same moment in both: when one hand
  needs extra columns (grace notes, a rolled chord), the other hand skips them, and
  each skipped column shows the grace cross on its origin line, like an invisible
  grace note in octave 0. Hands come from the score: a piano grand staff's
  lower staff is the left hand; other staves count as left hand when in bass clef.
- **Sheet pane → Order: Inverted** flips each stream vertically: octave 0 and its
  thick line go to the bottom, higher octaves sit above, and in a mega stream the
  left hand and the thick bar go to the bottom.
- **Sheet pane → Origin line / Octave lines** are number fields for the origin line and octave line
  stroke widths, in min-box units (0.01–0.25; defaults 0.06 and 0.03).
- The sheet sits in Keyflow's `Document`. **Sheet pane → Lockstep scrolling** switches
  between native scrolling and Keyflow's lockstep paging (wheel, swipe, or the ↓/↑
  buttons move one page, landing on a stream's top). Keyflow remembers the mode.

Scores come from [PDMX](https://github.com/pnlong/PDMX) (Zenodo record
15571083). PDMX only ships as large archives with no per-score download, so the
app cannot fetch songs on demand; requested songs are added to the song db
instead. `scripts/songs.json` lists every requested song (PDMX path, title, and
optional composer/tag overrides). `scripts/pdmx.py` searches `PDMX.csv`, reads
each score from `mxl.tar.gz` (a local copy in `data/pdmx/` makes this take
seconds), caches the raw MXL and tags in `data/pdmx/pdmx.sqlite` (gitignored),
and writes the simplified song to `src/songs/<id>.json` plus the searchable
`src/songs/index.json`, both committed. Tags come from PDMX genres, tags, title
and instruments: classical genre (or eastern folk/world music), eastern for
Chinese/Japanese/Korean/Indian/Middle Eastern and similar keywords (otherwise
western), electronic genre, and orchestral for symphonic keywords or orchestral
instrumentation.

```bash
python3 scripts/pdmx.py search "fur elise"   # candidates with their tags
python3 scripts/pdmx.py sync                  # fetch + simplify everything in scripts/songs.json
```

Repeats are shown as written, not unrolled. Grace notes are omitted.
An entry's `tempo_scale` corrects a score whose tempo marking is off: PDMX's
Für Elise marks ♩=100 in 3/8 (about twice a usual *Poco moto*), so it is scaled
by 0.65 to ♩=65.

### Saved settings

Every setting (views, song, instrument, octave range, transpose, margins, sheet
line widths, min-box and lockstep scrolling) is stored in `localStorage` under
`nhacode:`, which an installed PWA keeps across launches. On start the app calls
`navigator.storage.persist()` so the browser does not evict that storage;
`<html data-storage>` reports `persistent` or `best-effort`. Keyflow 0.7 itself
writes its preferences to `sessionStorage`, so `src/lib/preferences.ts` mirrors
min-box, lockstep and theme into `localStorage` and seeds them back before
Keyflow starts.

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
