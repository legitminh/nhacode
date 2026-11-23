<script lang="ts">
  import { Button, SubKeyframe, interaction, type SubKeyframeContext } from '@legitminh/keyflow';
  import { TAGS, findSongs, songs, type Tag } from './songs';

  let { songId, disabled = false, onselect }: {
    songId: string;
    disabled?: boolean;
    onselect: (id: string) => void;
  } = $props();
  let query = $state('');
  let tags = $state(new Set<Tag>());
  let search = $state<HTMLInputElement>();
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

  function searchKeys(event: KeyboardEvent, menu: SubKeyframeContext) {
    if (event.key === 'Escape') {
      event.preventDefault();
      search?.blur();
    } else if (event.key === 'Enter' && results.length) {
      event.preventDefault();
      choose(results[0].id, menu);
    }
  }
</script>

<!-- The song selection screen: search by name and filter by tags. Keyflow owns its frame and shortcuts. -->
<SubKeyframe label={`Song: ${selected?.title ?? 'None'}`} enterTrigger="m" {disabled} class="song-select"
  onopen={() => { requestAnimationFrame(() => search?.focus()); }}>
  {#snippet children(menu)}
    <div class="song-screen">
      <label class="song-search">
        <span class="visually-hidden">Search songs</span>
        <input bind:this={search} type="search" placeholder="Search songs" autocomplete="off" spellcheck={false}
          enterkeyhint="go" bind:value={query} disabled={!menu.active} use:interaction={{ disabled: !menu.active }}
          onkeydown={(event) => searchKeys(event, menu)} />
      </label>
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
