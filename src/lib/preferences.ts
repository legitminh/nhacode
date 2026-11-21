/**
 * User settings live in localStorage (permanent per-origin storage that an installed
 * PWA keeps across launches), and the app asks the browser to mark that storage
 * persistent so it is not evicted under storage pressure.
 *
 * Keyflow 0.7 saves its own preferences (min-box, lockstep scrolling, theme) in
 * sessionStorage, which is cleared when the tab or PWA window closes. We mirror
 * those keys into localStorage and seed them back before Keyflow starts.
 */
export const PREFIX = 'nhacode:';
const KEYFLOW_KEYS = ['min_box', 'lockstep_scrolling', 'theme_id'] as const;
export type KeyflowKey = (typeof KEYFLOW_KEYS)[number];

export function readPref<T>(key: string, fallback: T, valid: (value: unknown) => value is T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    const value: unknown = JSON.parse(raw);
    return valid(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function writePref(key: string, value: unknown) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch {}
}

export const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
export const isString = (value: unknown): value is string => typeof value === 'string';
export const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Copy Keyflow's saved preferences into sessionStorage before Keyflow reads them. */
export function restoreKeyflowPreferences() {
  for (const key of KEYFLOW_KEYS) {
    try {
      const saved = localStorage.getItem(`${PREFIX}keyflow:${key}`);
      if (saved !== null) sessionStorage.setItem(PREFIX + key, saved);
    } catch {}
  }
}

/** Save one Keyflow preference permanently, in the same string form Keyflow uses. */
export function saveKeyflowPreference(key: KeyflowKey, value: string) {
  try { localStorage.setItem(`${PREFIX}keyflow:${key}`, value); } catch {}
}

/** Ask the browser not to evict this origin's storage. Resolves to whether it is persistent. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch {
    return false;
  }
}
