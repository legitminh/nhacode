import catalogue from '../../songs/index.json';

export type SongEntry = { id: string; title: string; composer: string };
export const songs = catalogue as SongEntry[];
