/**
 * Runs `fn` over `items` with at most `limit` calls in flight. For writes that are independent of each other (one row each),
 * so hundreds of them do not wait one after another. The first failure stops starting new calls and is thrown once the calls
 * already started have finished; results keep the order of `items`.
 */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  let failure: { error: unknown } | null = null
  const worker = async (): Promise<void> => {
    while (!failure) {
      const i = next++
      if (i >= items.length) return
      try {
        out[i] = await fn(items[i] as T, i)
      } catch (error) {
        failure ??= { error }
        return
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
  if (failure) throw (failure as { error: unknown }).error
  return out
}
