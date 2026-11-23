<script lang="ts">
  import { HorizontalSlider, NumberBox, SubKeyframe } from '@legitminh/keyflow';
  import type { MetronomeSettings } from './metronome.svelte';

  let { settings, disabled = false, onchange }: {
    settings: MetronomeSettings;
    disabled?: boolean;
    onchange: (settings: MetronomeSettings) => void;
  } = $props();
  const FIELDS = [
    ['strong', 'Strong beat', 8], ['weak', 'Beat', 8], ['between', 'In-between beats', 7], ['sub', 'In-between strength', 8],
  ] as const;
  const set = (key: keyof MetronomeSettings) => (value: number) => onchange({ ...settings, [key]: value });
</script>

<!-- "metronome" config (T): click strengths out of 8 and in-between clicks per beat, as Keyflow NumberBoxes. -->
<SubKeyframe label="metronome" enterTrigger="t" {disabled} class="toolbar-menu metronome-menu">
  {#snippet children()}
    <div class="metronome-settings">
      {#each FIELDS as [key, label, max]}
        <div class="metronome-row" data-field={key}>
          <span>{label}</span>
          <NumberBox {label} value={settings[key]} min={0} {max} step={1} onchange={set(key)} class="metronome-field" />
        </div>
      {/each}
      <div class="speed-setting">
        <span>Speed ×{(settings.speed ?? 1).toFixed(2)}</span>
        <HorizontalSlider label="Metronome speed" value={settings.speed ?? 1} min={0.25} max={2} step={0.05}
          valueText={(value) => `${value.toFixed(2)} times`} onchange={set('speed')} class="speed-slider" />
      </div>
    </div>
  {/snippet}
</SubKeyframe>
