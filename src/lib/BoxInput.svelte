<script lang="ts">
  import { interaction } from '@legitminh/keyflow';

  /** A number field measured in min-box units, wired to Keyflow like the octave fields. */
  let { label, value, min, max, step, disabled = false, onchange }: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    disabled?: boolean;
    onchange: (value: number) => void;
  } = $props();
  let error = $state('');

  function apply(input: HTMLInputElement, final: boolean) {
    const next = input.valueAsNumber;
    if (Number.isFinite(next) && next >= min && next <= max) {
      error = '';
      if (next !== value) onchange(next);
    } else if (final) {
      input.value = String(value);
      error = '';
    } else {
      error = `Use ${min} to ${max}.`;
    }
  }

  function keydown(event: KeyboardEvent) {
    const input = event.currentTarget as HTMLInputElement;
    if (event.key === 'Enter') {
      event.preventDefault();
      apply(input, true);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      input.blur();
    }
  }
</script>

<label class="box-input">
  <span>{label}</span>
  <input type="number" inputmode="decimal" enterkeyhint="done" autocomplete="off" {min} {max} {step}
    {value} {disabled} use:interaction={{ disabled }}
    oninput={(event) => apply(event.currentTarget, false)}
    onchange={(event) => apply(event.currentTarget, true)}
    onblur={(event) => apply(event.currentTarget, true)} onkeydown={keydown} />
</label>
{#if error}<p class="range-error" role="alert">{error}</p>{/if}
