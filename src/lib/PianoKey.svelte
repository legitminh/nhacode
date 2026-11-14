<script lang="ts">
  import { KeyboardKeyDisplay } from '@legitminh/keyflow';
  import type { PianoNote } from './notes';

  let { note, pressed, onpress, onrelease }: {
    note: PianoNote;
    pressed: boolean;
    onpress: (source: string, note: PianoNote) => void;
    onrelease: (source: string) => void;
  } = $props();

  // The library's keycap emits a complete tap on click. Capture the real
  // pointer lifecycle so musical notes begin on down and end on release.
  function hold(node: HTMLDivElement) {
    const sources = new Set<string>();
    function down(event: PointerEvent) {
      if (event.button !== 0) return;
      const button = node.querySelector('button')!;
      button.setPointerCapture(event.pointerId);
      const source = `pointer:${event.pointerId}`;
      sources.add(source);
      onpress(source, note);
    }
    function up(event: PointerEvent) {
      const source = `pointer:${event.pointerId}`;
      sources.delete(source);
      onrelease(source);
    }
    function keydown(event: KeyboardEvent) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      const source = `focus:${note.id}:${event.key}`;
      sources.add(source);
      onpress(source, note);
    }
    function keyup(event: KeyboardEvent) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      const source = `focus:${note.id}:${event.key}`;
      sources.delete(source);
      onrelease(source);
    }
    function blur() {
      sources.forEach(onrelease);
      sources.clear();
    }
    function click(event: MouseEvent) {
      // Prevent the subsequent pointer click from generating a second note.
      if (event.detail > 0) event.stopPropagation();
    }
    node.addEventListener('pointerdown', down, true);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    node.addEventListener('lostpointercapture', up);
    node.addEventListener('keydown', keydown);
    node.addEventListener('keyup', keyup);
    node.addEventListener('focusout', blur);
    node.addEventListener('click', click, true);
    return { destroy() {
      blur();
      node.removeEventListener('pointerdown', down, true);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', up);
      node.removeEventListener('lostpointercapture', up);
      node.removeEventListener('keydown', keydown);
      node.removeEventListener('keyup', keyup);
      node.removeEventListener('focusout', blur);
      node.removeEventListener('click', click, true);
    } };
  }

  function accessibleTap() {
    const source = `accessible:${note.id}`;
    onpress(source, note);
    setTimeout(() => onrelease(source), 180);
  }
</script>

<div class="piano-cell" class:sounding={pressed}
  data-note={note.id} data-midi={note.midi} use:hold>
  <KeyboardKeyDisplay key={note.hex} label={`${note.name}, octave ${note.octave}, key ${note.hex}`}
    {pressed}
    onkey={(event) => { if (event.type === 'keydown') accessibleTap(); }}>
    <span aria-hidden="true">[{note.hex}]</span>
  </KeyboardKeyDisplay>
</div>
