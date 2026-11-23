import catalogue from '../../songs/index.json';
import type { SongEntry } from './search';

export { TAGS, findSongs, type SongEntry, type Tag } from './search';
export const songs = catalogue as SongEntry[];
