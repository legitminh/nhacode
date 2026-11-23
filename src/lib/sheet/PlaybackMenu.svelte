<script lang="ts">
  import { Button, HorizontalSlider, SubKeyframe } from '@legitminh/keyflow';

  let { disabled = false, speed, onspeed, onpick }: {
    disabled?: boolean;
    speed: number;
    onspeed: (speed: number) => void;
    onpick: () => void;
  } = $props();
</script>

<!-- "playback" menu (O): Start playback from → pick a measure on the sheet; Speed scales the tempo. -->
<SubKeyframe label="playback" enterTrigger="o" {disabled} class="toolbar-menu playback-menu">
  {#snippet children(menu)}
    <Button on_close={() => { menu.exit(); onpick(); }}>Start playback from</Button>
    <div class="speed-setting">
      <span>Speed ×{speed.toFixed(2)}</span>
      <HorizontalSlider label="Playback speed" value={speed} min={0.25} max={2} step={0.05}
        valueText={(value) => `${value.toFixed(2)} times`} onchange={onspeed} class="speed-slider" />
    </div>
  {/snippet}
</SubKeyframe>
