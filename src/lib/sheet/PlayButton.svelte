<script lang="ts">
  import { StaticButton } from '@legitminh/keyflow';

  let { playing, disabled = false, ontoggle, keys = 'p', name = 'playback', class: className = 'play-toggle' }: {
    playing: boolean; disabled?: boolean; ontoggle: () => void; keys?: string; name?: string; class?: string;
  } = $props();
</script>

<!-- Start/pause toggle (sheet playback, metronome) with a fixed Keyflow shortcut. -->
<div class="view-toggle {className}" class:on={playing} data-playing={playing}
  title={`${playing ? 'Pause' : 'Start'} ${name} (${keys.toUpperCase()})`}>
  <StaticButton {keys} on_close={ontoggle} {disabled}>
    <span class="view-toggle-content"><span class="visually-hidden">{playing ? `Pause ${name}` : `Start ${name}`}</span><span aria-hidden="true">{playing ? '⏸' : '▶'}</span></span>
  </StaticButton>
</div>
