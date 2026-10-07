import { fxList, type FxRow } from './mw.ts'

/**
 * The TSF regions (ZSGTSFDT_TSF_REG_ID) every Region drop-down offers.
 *
 * SAP's search help ZSGTSFSH_REGION has no table the middleware or an OData service serves, so the
 * list is built from the SAP tables that do carry the region:
 *   codes  ZSGTSFTR_COMP-ZREG_ID (the region each TSF entity belongs to) and ZSGSLCTR_BPEXT-ZREG_ID
 *   names  ZSGSLCTR_BPEXT-ZREGION (Region Short Name). It is typed per bank partner, so a code gets a
 *          name only where every partner of that region agrees on it; otherwise the code stands alone.
 */
export type RegionOption = { id: string; name: string }

const val = (r: FxRow, k: string) => String(r[k] ?? '').trim()

/** The region codes of COMP and BPEXT, named where BPEXT names them consistently. Pure. */
export function regionOptions(comp: readonly FxRow[], bpext: readonly FxRow[]): RegionOption[] {
  const names = new Map<string, Set<string>>()
  const ids = new Set<string>()
  for (const r of comp) if (val(r, 'ZREG_ID')) ids.add(val(r, 'ZREG_ID'))
  for (const r of bpext) {
    const id = val(r, 'ZREG_ID')
    if (!id) continue
    ids.add(id)
    const name = val(r, 'ZREGION')
    if (!name) continue
    if (!names.has(id)) names.set(id, new Set())
    names.get(id)!.add(name)
  }
  return [...ids]
    .sort()
    .map((id) => {
      const n = names.get(id)
      return { id, name: n && n.size === 1 ? [...n][0]! : '' }
    })
}

/** "R03 · Americas", or the bare code. */
export const regionLabel = (r: RegionOption) => (r.name ? `${r.id} · ${r.name}` : r.id)

let cached: Promise<RegionOption[]> | undefined

/**
 * Reads the regions once per page load. A failed BPEXT read only costs the names; a failed COMP read
 * fails the list (and is retried on the next call).
 */
export function loadRegions(signal?: AbortSignal): Promise<RegionOption[]> {
  cached ??= (async () => {
    const [comp, bpext] = await Promise.all([
      fxList('comp'),
      fxList('bpext').catch((error: unknown) => {
        console.warn('[fx] ZSGSLCTR_BPEXT unavailable: regions without names', error)
        return [] as FxRow[]
      }),
    ])
    return regionOptions(comp, bpext)
  })()
  const p = cached
  p.catch(() => {
    if (cached === p) cached = undefined
  })
  if (!signal) return p
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
    if (signal.aborted) return abort()
    signal.addEventListener('abort', abort, { once: true })
    p.then(resolve, reject)
  })
}
