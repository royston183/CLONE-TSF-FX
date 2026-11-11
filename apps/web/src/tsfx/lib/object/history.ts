// History entries of the object page: which entry the page pushed for an open or new object (spec §4.3).

/** Next.js keeps its router fields in history.state; left in, its patched pushState would skip syncing the URL. */
const NEXT_FIELDS = ['__NA', '_N', '__PRIVATE_NEXTJS_INTERNALS_TREE'];
export type EntryMark = 'objOpen' | 'objCreate';

/** The current entry's own state without Next's fields and our marks, plus `mark` (Next copies its fields back in). */
export function markState(state: unknown, mark?: EntryMark): Record<string, unknown> {
  const own = Object.fromEntries(Object.entries(state && typeof state === 'object' ? state : {}).filter(([k]) => !NEXT_FIELDS.includes(k) && k !== 'objOpen' && k !== 'objCreate'));
  return mark ? { ...own, [mark]: true } : own;
}

/** Whether this page pushed the entry (then closing goes back instead of rewriting the URL). */
export function isPushed(state: unknown): boolean {
  const s = state && typeof state === 'object' ? (state as Record<string, unknown>) : {};
  return s.objOpen === true || s.objCreate === true;
}

type BackGuard = (e: PopStateEvent) => void;
type GuardWindow = Window & { __objBackGuard?: BackGuard; __objBackGuardHook?: boolean };

/**
 * Runs in <head>, before the app adds its popstate listener (src/lib/client/nav.tsx). Listeners on window run in the order they were
 * added, so this one runs first: a refused Back is stopped before the router renders the list and unmounts the pop-up.
 */
export const BACK_GUARD_SCRIPT = `(function(){window.__objBackGuardHook=true;addEventListener('popstate',function(e){var g=window.__objBackGuard;if(g)g(e)},true)})()`;

/** Sets (or clears with null) the page's Back guard; without the <head> hook it falls back to a listener of its own. */
export function setBackGuard(guard: BackGuard | null): void {
  const w = window as GuardWindow;
  if (!w.__objBackGuardHook) {
    w.__objBackGuardHook = true;
    addEventListener('popstate', e => w.__objBackGuard?.(e), { capture: true });
  }
  w.__objBackGuard = guard ?? undefined;
}
