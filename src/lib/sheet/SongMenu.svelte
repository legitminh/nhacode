<script lang="ts">
  import { SubKeyframe } from '@legitminh/keyflow';
  import { songs } from './songs';

  let { songId, disabled = false, onselect }: {
    songId: string;
    disabled?: boolean;
    onselect: (id: string) => void;
  } = $props();
  const selected = $derived(songs.find((entry) => entry.id === songId));
  const choices = $derived(songs.map((entry) => ({
    id: entry.id, label: entry.title, on_select: () => onselect(entry.id),
  })));
</script>

<SubKeyframe label={`Song: ${selected?.title ?? 'None'}`} items={choices} enterTrigger="m" {disabled} class="song-select" />
