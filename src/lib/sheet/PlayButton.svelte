<script lang="ts">
  import { StaticButton } from '@legitminh/keyflow';

  let { playing, disabled = false, ontoggle }: { playing: boolean; disabled?: boolean; ontoggle: () => void } = $props();
</script>

<!-- Play/pause for sheet playback; Keyflow shortcut P. -->
<div class="view-toggle play-toggle" class:on={playing} data-playing={playing} title={playing ? 'Pause (P)' : 'Play (P)'}>
  <StaticButton keys="p" on_close={ontoggle} {disabled}>
    <span class="view-toggle-content"><span class="visually-hidden">{playing ? 'Pause' : 'Play'}</span><span aria-hidden="true">{playing ? '⏸' : '▶'}</span></span>
  </StaticButton>
</div>
