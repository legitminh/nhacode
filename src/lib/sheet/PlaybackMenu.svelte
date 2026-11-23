<script lang="ts">
  import { SubKeyframe } from '@legitminh/keyflow';

  let { disabled = false, onpick }: { disabled?: boolean; onpick: () => void } = $props();
  const items = [{ id: 'start-from', label: 'Start playback from', on_select: () => onpick() }];
</script>

<!-- "playback" menu (O): Start playback from → pick a measure on the sheet. -->
<SubKeyframe label="playback" {items} enterTrigger="o" {disabled} class="toolbar-menu playback-menu" />
