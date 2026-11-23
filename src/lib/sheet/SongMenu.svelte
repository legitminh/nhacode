<script lang="ts">
  import { Button, SubKeyframe, TextBox, type SubKeyframeContext } from '@legitminh/keyflow';
  import { TAGS, findSongs, songs, type Tag } from './songs';

  let { songId, disabled = false, onselect }: {
    songId: string;
    disabled?: boolean;
    onselect: (id: string) => void;
  } = $props();
  let query = $state('');
  let tags = $state(new Set<Tag>());
  let search = $state<TextBox>();
  const selected = $derived(songs.find((entry) => entry.id === songId));
  const results = $derived(findSongs(songs, query, tags));

  function toggleTag(tag: Tag) {
    const next = new Set(tags);
    if (!next.delete(tag)) next.add(tag);
    tags = next;
  }

  function choose(id: string, menu: SubKeyframeContext) {
    onselect(id);
    menu.exit();
  }

  let screen = $state<SubKeyframe>();
  /** Enter in the search box picks the first match instead of adding a line. */
  $effect(() => {
    if (!query.includes('\n')) return;
    query = query.replace(/\n/g, '');
    const first = results[0];
    if (first) void search?.exit().then(() => { onselect(first.id); screen?.exit(); });
    else void search?.exit();
  });
</script>

<!-- The song selection screen: search by name and filter by tags. Keyflow owns its frame and shortcuts. -->
<SubKeyframe bind:this={screen} label={`Song: ${selected?.title ?? 'None'}`} enterTrigger="m" {disabled} class="song-select">
  {#snippet children(menu)}
    <div class="song-screen">
      <!-- Keyflow's TextBox: the screen opens with its shortcuts live; / starts typing, Escape or Enter stops. -->
      <TextBox bind:this={search} bind:value={query} label="Search songs" placeholder="Search songs" rows={1}
        wrap="off" enterTrigger="/" class="song-search" />
      <div class="song-tags" role="group" aria-label="Tags">
        {#each TAGS as tag}
          <div class="song-tag" class:on={tags.has(tag)} data-tag={tag}>
            <Button on_close={() => toggleTag(tag)} disabled={!menu.active}
              >{tag}<span class="visually-hidden">{tags.has(tag) ? ' (on)' : ' (off)'}</span></Button>
          </div>
        {/each}
      </div>
      <p class="song-count" aria-live="polite">{results.length} of {songs.length} songs</p>
      <ul class="song-results" aria-label="Songs">
        {#each results as song (song.id)}
          <li class:current={song.id === songId} data-song={song.id}>
            <Button on_close={() => choose(song.id, menu)} disabled={!menu.active}>
              <span class="song-title">{song.title}</span>
              <span class="song-meta">{song.composer}{song.composer && song.tags?.length ? ' · ' : ''}{song.tags?.join(', ')}</span>
            </Button>
          </li>
        {/each}
      </ul>
    </div>
  {/snippet}
</SubKeyframe>
