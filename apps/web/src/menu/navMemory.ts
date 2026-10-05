/**
 * Where the user was in a tile browser, kept for the length of the browser tab.
 *
 * Opening a screen unmounts the menu page, and Back remounts it, so folder state held in
 * component state is lost: Back used to land on the top of the main menu instead of the folder
 * the screen was opened from. This remembers the open folder, and the scroll position of every
 * level the user has left, so the page can be put back as it was.
 *
 * sessionStorage only: it is per tab, survives a reload, and is gone when the tab closes. Every
 * read and write is guarded, since storage can be blocked or full and the menu must work without.
 */

export type NavMemory = {
  /** Indexes of the folder that is open; empty when the top level is showing. */
  path: number[]
  /** Scroll offset of each level the user left, keyed by {@link levelKey}. */
  scroll: Record<string, number>
}

export const EMPTY_MEMORY: NavMemory = { path: [], scroll: {} }

const PREFIX = 'tsf.menu.nav:'

/** The scroll key of a level: '' for the top, '2/0' for the folder at path [2, 0]. */
export const levelKey = (path: readonly number[]): string => path.join('/')

const isIndexList = (v: unknown): v is number[] =>
  Array.isArray(v) && v.every((n) => Number.isInteger(n) && (n as number) >= 0)

/** Accepts only a well-formed record; anything else is treated as nothing remembered. */
export function parseMemory(raw: string | null): NavMemory {
  if (!raw) return EMPTY_MEMORY
  try {
    const v = JSON.parse(raw) as { path?: unknown; scroll?: unknown }
    const path = isIndexList(v.path) ? v.path : []
    const scroll: Record<string, number> = {}
    if (v.scroll && typeof v.scroll === 'object') {
      for (const [k, y] of Object.entries(v.scroll as Record<string, unknown>)) {
        if (typeof y === 'number' && Number.isFinite(y) && y >= 0) scroll[k] = y
      }
    }
    return { path, scroll }
  } catch {
    return EMPTY_MEMORY
  }
}

export function loadMemory(key: string): NavMemory {
  try {
    return parseMemory(window.sessionStorage.getItem(PREFIX + key))
  } catch {
    return EMPTY_MEMORY
  }
}

export function saveMemory(key: string, memory: NavMemory): void {
  try {
    window.sessionStorage.setItem(PREFIX + key, JSON.stringify(memory))
  } catch {
    // Storage unavailable: the menu still works, it just forgets where it was.
  }
}

/** The memory with the scroll offset of one level recorded. */
export function withScroll(memory: NavMemory, path: readonly number[], y: number): NavMemory {
  return { ...memory, scroll: { ...memory.scroll, [levelKey(path)]: Math.max(0, Math.round(y)) } }
}

/** The memory with the scroll offset of one level forgotten, so that level opens at the top. */
export function withoutScroll(memory: NavMemory, path: readonly number[]): NavMemory {
  const { [levelKey(path)]: _dropped, ...rest } = memory.scroll
  return { ...memory, scroll: rest }
}
