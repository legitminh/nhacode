<script lang="ts">
  import { Button, SubKeyframe, TextBox } from '@legitminh/keyflow';
  import { instruments } from './audio/instruments';
  import { parseOctaveRange } from './notes';

  let { open = $bindable(false), transposed, instrumentId, range,
    ontranspose, oninstrument, onrange }: {
    open?: boolean;
    transposed: boolean;
    instrumentId: string;
    range: string;
    ontranspose: (value: boolean) => void;
    oninstrument: (id: string) => void;
    onrange: (value: string, octaves: number[]) => void;
  } = $props();
  let draft = $state('[0,8)');
  let rangeError = $state('');
  const instrument = $derived(instruments.find((item) => item.id === instrumentId)!);
  const choices = instruments.map((option) => ({
    id: option.id, label: option.name, on_select: () => oninstrument(option.id),
  }));

  function applyRange(value: string) {
    try {
      const octaves = parseOctaveRange(value);
      onrange(value.trim(), octaves);
      rangeError = '';
    } catch (cause) {
      rangeError = cause instanceof Error ? cause.message : 'Invalid octave range.';
    }
  }
</script>

<div class="settings-bar">
  <SubKeyframe label="Settings" enterTrigger="esc" class="settings-menu" bind:open
    onopen={() => { draft = range; rangeError = ''; }}>
    {#snippet triggerContent()}
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <path stroke-linejoin="round" d="m9.5 3-.6 2.1-1.6.9-2.1-.5L2.7 9.8l1.5 1.6v1.8l-1.5 1.6 2.5 4.3 2.1-.5 1.6.9.6 2.1h5l.6-2.1 1.6-.9 2.1.5 2.5-4.3-1.5-1.6v-1.8l1.5-1.6-2.5-4.3-2.1.5-1.6-.9L14.5 3z" />
        <circle cx="12" cy="12.2" r="3" />
      </svg>
    {/snippet}
    {#snippet children()}
      <SubKeyframe label={`Instrument: ${instrument.name}`} items={choices} class="instrument-select" />
      <div class="octave-range">
        <span>Octave range</span>
        <TextBox bind:value={draft} label="Octave range" placeholder="[0,8)" rows={1} onexit={applyRange} />
        {#if rangeError}<p class="range-error" role="alert">{rangeError}</p>{/if}
      </div>
      <Button on_close={() => ontranspose(!transposed)}>Transpose display: {transposed ? 'On' : 'Off'}</Button>
    {/snippet}
  </SubKeyframe>
</div>
