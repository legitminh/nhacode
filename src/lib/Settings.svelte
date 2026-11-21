<script lang="ts">
  import { Button, SubKeyframe, interaction, lockstep_scrolling, min_box } from '@legitminh/keyflow';
  import { instruments } from './audio/instruments';
  import { parseOctaveRange } from './notes';
  import { MARGIN_MAX, MARGIN_STEP, SIDES, type Margins, type Side } from './margins';
  import { LINE_MAX, LINE_MIN, LINE_STEP, type LineWidths } from './sheet/lines';
  import BoxInput from './BoxInput.svelte';

  let { open = $bindable(false), transposed, instrumentId, range, margins, lineWidths,
    ontranspose, oninstrument, onrange, onmargin, online }: {
    open?: boolean;
    transposed: boolean;
    instrumentId: string;
    range: string;
    ontranspose: (value: boolean) => void;
    oninstrument: (id: string) => void;
    onrange: (value: string, octaves: number[]) => void;
    margins: Margins;
    onmargin: (side: Side, value: number) => void;
    lineWidths: LineWidths;
    online: (line: keyof LineWidths, value: number) => void;
  } = $props();
  const sideName = (side: Side) => side[0].toUpperCase() + side.slice(1);
  const LINES = [['origin', 'Origin line'], ['octave', 'Octave lines']] as const;
  let lower = $state('0');
  let upper = $state('8');
  let rangeError = $state('');
  // Keyflow's zoom step: min-box grows or shrinks by a factor of 1.25. Keyflow saves it.
  const ZOOM = 1.25;
  function zoom(direction: 1 | -1) {
    const next = min_box.value * ZOOM ** direction;
    min_box.set(Math.min(160, Math.max(12, Math.round(next * 100) / 100)));
  }
  const instrument = $derived(instruments.find((item) => item.id === instrumentId)!);
  const choices = instruments.map((option) => ({
    id: option.id, label: option.name, on_select: () => oninstrument(option.id),
  }));

  function applyRange() {
    try {
      if (!lower || !upper) throw new Error('Enter both octave endpoints.');
      const value = `[${Number(lower)},${Number(upper)})`;
      const octaves = parseOctaveRange(value);
      if (value !== range) onrange(value, octaves);
      rangeError = '';
    } catch (cause) {
      rangeError = cause instanceof Error ? cause.message : 'Invalid octave range.';
    }
  }

  function digits(event: Event, endpoint: 'lower' | 'upper') {
    const input = event.currentTarget as HTMLInputElement;
    input.value = input.value.replace(/[^0-9]/g, '');
    if (endpoint === 'lower') lower = input.value;
    else upper = input.value;
    rangeError = '';
  }

  function confirm(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyRange();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      (event.currentTarget as HTMLInputElement).blur();
    }
  }
</script>

  <SubKeyframe label="Settings" enterTrigger="esc" class="settings-menu" bind:open
    onopen={() => {
      const endpoints = range.match(/\d+/g)!;
      [lower, upper] = endpoints;
      rangeError = '';
    }} onclose={applyRange}>
    {#snippet triggerContent()}
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <path stroke-linejoin="round" d="m9.5 3-.6 2.1-1.6.9-2.1-.5L2.7 9.8l1.5 1.6v1.8l-1.5 1.6 2.5 4.3 2.1-.5 1.6.9.6 2.1h5l.6-2.1 1.6-.9 2.1.5 2.5-4.3-1.5-1.6v-1.8l1.5-1.6-2.5-4.3-2.1.5-1.6-.9L14.5 3z" />
        <circle cx="12" cy="12.2" r="3" />
      </svg>
    {/snippet}
    {#snippet children(menu)}
      <SubKeyframe label={`Instrument: ${instrument.name}`} items={choices} class="instrument-select" />
      <div class="octave-range">
        <span>Octave range</span>
        <div class="range-endpoints">
          <span aria-hidden="true">[</span>
          <input aria-label="First octave (included)" type="text" inputmode="numeric" pattern="[0-9]*"
            enterkeyhint="done" autocomplete="off" spellcheck={false} value={lower} disabled={!menu.active}
            use:interaction={{ disabled: !menu.active }}
            oninput={(event) => digits(event, 'lower')} onkeydown={confirm} onblur={applyRange} />
          <span aria-hidden="true">,</span>
          <input aria-label="Last octave (excluded)" type="text" inputmode="numeric" pattern="[0-9]*"
            enterkeyhint="done" autocomplete="off" spellcheck={false} value={upper} disabled={!menu.active}
            use:interaction={{ disabled: !menu.active }}
            oninput={(event) => digits(event, 'upper')} onkeydown={confirm} onblur={applyRange} />
          <span aria-hidden="true">)</span>
        </div>
        {#if rangeError}<p class="range-error" role="alert">{rangeError}</p>{/if}
      </div>
      <div class="min-box-setting">
        <span>Min box: {Math.round(min_box.value)}px</span>
        <Button on_close={() => zoom(1)} disabled={min_box.value >= 160}>Increase</Button>
        <Button on_close={() => zoom(-1)} disabled={min_box.value <= 12}>Decrease</Button>
      </div>
      <SubKeyframe label="Keyboard margins" class="margin-menu">
        {#snippet children(sub)}
          {#each SIDES as side}
            <BoxInput label={sideName(side)} value={margins[side]} min={0} max={MARGIN_MAX} step={MARGIN_STEP}
              disabled={!sub.active} onchange={(value) => onmargin(side, value)} />
          {/each}
        {/snippet}
      </SubKeyframe>
      <SubKeyframe label="Sheet lines" class="margin-menu">
        {#snippet children(sub)}
          {#each LINES as [line, name]}
            <BoxInput label={name} value={lineWidths[line]} min={LINE_MIN} max={LINE_MAX} step={LINE_STEP}
              disabled={!sub.active} onchange={(value) => online(line, value)} />
          {/each}
        {/snippet}
      </SubKeyframe>
      <Button on_close={() => ontranspose(!transposed)}>Transpose display: {transposed ? 'On' : 'Off'}</Button>
      <Button on_close={() => lockstep_scrolling.set(!lockstep_scrolling.enabled)}
        >Lockstep scrolling: {lockstep_scrolling.enabled ? 'On' : 'Off'}</Button>
    {/snippet}
  </SubKeyframe>
