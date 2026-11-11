import { fxList } from '../../shared/fx/mw.ts'
import type { Companies } from './invoice-pdf.ts'

let cached: Promise<Companies> | null = null

/** The company master (ZSGTSFTR_COMP) by TSF entity code (ZCOM_ID: OGA, DMCC, OSIPL …), read once per page visit. */
export function loadCompanies(): Promise<Companies> {
  cached ??= fxList('comp')
    .then((rows) => {
      const out: Record<string, { entity: string; companyCode: string; name: string; country: string }> = {}
      for (const r of rows) {
        const entity = (r['ZCOM_ID'] ?? '').trim().toUpperCase()
        if (entity) out[entity] = { entity, companyCode: (r['ZBUKRS'] ?? '').trim(), name: (r['ZBUTXT'] ?? '').trim(), country: (r['ZLAND1'] ?? '').trim() }
      }
      return out
    })
    .catch((e) => {
      cached = null
      throw e
    })
  return cached
}
