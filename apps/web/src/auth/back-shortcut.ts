/**
 * F3 is Back, as in SAP GUI. Every BackButton on the page registers here; one window listener presses the right one.
 * Kept free of React and the DOM so the choice can be tested.
 */
export type BackEntry = { label: string; run: () => void }

/** The button F3 presses: the one labelled "Back" (an Exit button is F15's, not F3's), else the first one mounted. */
export function pickBackTarget(entries: readonly BackEntry[]): BackEntry | undefined {
  return entries.find((e) => e.label === 'Back') ?? entries[0]
}

/** Whether a key event is a plain F3: no modifier (Ctrl+F3 and Shift+F3 are the browser's), and not a held-down repeat. */
export function isPlainF3(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; repeat: boolean }): boolean {
  return e.key === 'F3' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && !e.repeat
}

/** What counts as an open popup across the screens: F3 leaves the page only when none is up. */
export const OPEN_POPUP_SELECTOR = [
  '[aria-modal="true"]',
  'dialog[open]',
  '.modal-overlay.open',
  '.modal-backdrop.open',
  '.std-pop-overlay',
  '.overlay.open',
].join(', ')
