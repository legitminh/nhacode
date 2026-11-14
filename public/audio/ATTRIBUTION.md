# Instrument samples

FluidR3 General MIDI soundfont by **Frank Wen**, rendered to MP3 for
[MIDI.js Soundfonts](https://github.com/gleitz/midi-js-soundfonts) by **Benjamin Gleitzman**.

Source: https://github.com/gleitz/midi-js-soundfonts/tree/044fab8e1456bfafc5776e86dfd6bb8697149aef/FluidR3_GM

Licensed under [Creative Commons Attribution 3.0 Unported](https://creativecommons.org/licenses/by/3.0/),
as specified by the source project's README. The 88 piano MP3 files are extracted
unchanged from `acoustic_grand_piano-mp3.js`. Thirty samples each are extracted
unchanged from `violin-mp3.js`, `cello-mp3.js`, and `flute-mp3.js` (every third
semitone from MIDI 21 through 108). Other pitches use the nearest sample with
an adjusted playback rate. String and wind samples are crossfaded into a sustain
loop at runtime so held notes continue until released.

These samples are bundled locally; no external audio service is used during play.
To reproduce them, run `npm run samples:fetch`.
