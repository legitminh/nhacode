<script lang="ts">
  import { KeyboardKeyDisplay, type InteractionEvent } from '@legitminh/keyflow';
  import type { PianoNote } from './notes';
  import { octaveLineColor, pitchColor } from './colors';

  let { note, pressed, disabled, mouseDown, onpress, onrelease, onactivate }: {
    note: PianoNote;
    pressed: boolean;
    disabled: boolean;
    mouseDown: boolean;
    onpress: (source: string, note: PianoNote) => void;
    onrelease: (source: string) => void;
    onactivate: () => void;
  } = $props();
  const pointerSource = (event: InteractionEvent) => `${event.pointer_type === 'touch' ? 'touch' : 'mouse'}:${note.id}`;
  const keyboardSource = (event: InteractionEvent) => `keyboard:${note.id}:${event.code ?? ''}`;

  function down(event: InteractionEvent) {
    if (event.source === 'pointer') onpress(pointerSource(event), note);
    else onpress(keyboardSource(event), note);
  }
  function up(event: InteractionEvent) {
    if (!event.cancelled) onactivate();
    // Touch contact exit handles lift, including multiple contacts on one key.
    if (event.source !== 'pointer') onrelease(keyboardSource(event));
    else if (event.pointer_type !== 'touch') onrelease(pointerSource(event));
  }
  function enter(event: InteractionEvent) {
    if (event.pointer_type === 'touch' || mouseDown) onpress(pointerSource(event), note);
  }
  function exit(event: InteractionEvent) { onrelease(pointerSource(event)); }
</script>

<div class="piano-cell" class:sounding={pressed} style:--octave-color={octaveLineColor(note.octave)} data-note={note.id} data-midi={note.midi}>
  <KeyboardKeyDisplay key={note.hex} label={`${note.name}, octave ${note.octave}, key ${note.hex}`}
    {pressed} {disabled} color={pitchColor(note.row)} on_pressed_down={down} on_pressed_up={up}
    on_cursor_enter={enter} on_cursor_exit={exit}
    onkey={(event) => { if (event.type === 'keydown') onactivate(); }}>
    <span aria-hidden="true">{note.hex}</span>
  </KeyboardKeyDisplay>
</div>
