/**
 * Start an effect's asynchronous request after the current commit. Cleanup cancels a
 * queued start as well as an already running request, including StrictMode's probe.
 * Keeping the whole request in one task also batches its initial loading updates.
 */
export function requestTask(start: () => void | (() => void)): () => void {
  let cancelled = false
  let cleanup: void | (() => void)
  queueMicrotask(() => {
    if (!cancelled) cleanup = start()
  })
  return () => {
    cancelled = true
    cleanup?.()
  }
}
