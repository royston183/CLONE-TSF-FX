// The product line the loading screen starts on: the next one after the line the previous opening started on, so each opening of
// Propose Tradeflow begins somewhere else and a full cycle passes before any line starts twice. Kept in the browser session only.
const KEY = 'tsf-propose-loader-start';

/** The start after `last` (null: nothing stored yet) among `count` lines; always inside 0..count-1, 0 for an empty or single list. */
export function nextStart(last: number | null, count: number): number {
  if (!Number.isFinite(count) || count <= 1) return 0;
  if (last === null || !Number.isInteger(last) || last < 0) return 0;
  return (last + 1) % count;
}

/** The index stored by the previous opening, or null (nothing stored, or the storage is not available). */
export function readLast(): number | null {
  try {
    const v = sessionStorage.getItem(KEY);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}

/** Remembers the line this opening started on (the same value however often it is written). */
export function rememberStart(index: number): void {
  try {
    sessionStorage.setItem(KEY, String(index));
  } catch {
    /* storage blocked: the next opening starts at the first line */
  }
}
