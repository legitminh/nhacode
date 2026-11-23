export const TAGS = ['classical', 'western', 'eastern', 'electronic', 'orchestral'] as const;
export type Tag = (typeof TAGS)[number];
export type SongEntry = { id: string; title: string; composer: string; tags?: Tag[] };

const fold = (text: string) => text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Songs whose title or composer contains every word of the query and that carry every
 * selected tag. "classical" covers western and eastern classical music alike.
 */
export function findSongs(list: readonly SongEntry[], query: string, tags: ReadonlySet<Tag>): SongEntry[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return list.filter((song) => {
    const text = fold(`${song.title} ${song.composer}`);
    return words.every((word) => text.includes(word)) && [...tags].every((tag) => song.tags?.includes(tag));
  });
}
