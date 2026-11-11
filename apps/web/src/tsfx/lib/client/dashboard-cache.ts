/** Short-lived, tab-only results. Concurrent mounts share a read; Refresh invalidates it. */
const results = new Map<string, { expires: number; value: Promise<unknown> }>();
export function clearDashboardCache(): void { results.clear(); }
export function cachedDashboard<T>(key: string, read: () => Promise<T>): Promise<T> {
  const now = Date.now();
  for (const [id, entry] of results) if (entry.expires <= now) results.delete(id);
  const hit = results.get(key);
  if (hit) return hit.value as Promise<T>;
  const value = Promise.resolve().then(read);
  const entry = { expires: now + 30_000, value };
  results.set(key, entry);
  void value.then(() => { if (results.get(key) === entry) entry.expires = Date.now() + 30_000; }, () => { if (results.get(key) === entry) results.delete(key); });
  return value;
}
