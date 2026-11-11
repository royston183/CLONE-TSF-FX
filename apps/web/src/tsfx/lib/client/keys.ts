interface KeyLike { key: string; target: EventTarget | { closest?: (selector: string) => unknown } | null }

/**
 * Whether a document-level Enter should run a dialog's primary action. Enter on a focused button, link or field
 * belongs to that control: Enter on "Cancel" must cancel, not delete.
 */
export function confirmsOnEnter(e: KeyLike): boolean {
  if (e.key !== 'Enter') return false;
  const target = e.target as { closest?: (selector: string) => unknown } | null;
  return !target?.closest?.('button, a, input, select, textarea');
}
