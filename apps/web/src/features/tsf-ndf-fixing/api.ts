/*
 * SAP data for UA1: TSF NDF Fixing (ZSGTSFR050 / ZSGTSF_RFX_NDF_FIX), read as the ABAP reads it.
 * Nothing falls back to sample data.
 *
 *   Company Code (S_BUKRS)  T001 (API_COMPANYCODE_SRV / A_CompanyCode); the ABAP then keeps only
 *                           the codes the user passes AUTHORITY-CHECK F_BKPF_BUK for (WAITING FOR AUTH)
 *   Trader (P_TRD)          FORM drop_down: ZSGTRMTR_TRD_GRP WHERE ztcode <> space, sorted, one row per
 *                           ZTCODE, "<code> - <name>"  (SLC middleware "trdGrp")
 *   Worklist                FORM get_data: TXN_STATUS = 07, SAKTIV <> 3, NDF product types
 *                           (sgsart+2(1) = 'D'), ZTRCODE = P_TRD. Read from the TSF append (TrmFxApp OData)
 *                           joined to the FTR deal (FxTransaction OData) — see shared/fx/ndf.ts. The Fixing
 *                           Date (P_DATE) is compared with the deal's NDF_DATE, or its value date without one.
 *   9001 default rate       TCURR kurst 'RBI', fcurr/tcurr = curr1/curr2, gdatu = p_date, USD:INR only
 *   9001 rate scaling       TCURF kurst 'MTM'
 *   9001 reference text     FTRT_FIX_DEF_T fix_id -> fix_id_text
 *   9001 Save Fixing        NdfFixing action (BAPI_FTR_FXT_NDF_FIXING with the rate), then TXN_STATUS 10 + NDF_FO_REM.
 *                           Enabled only once ZFS_SD_TRMFX declares NdfFixing (fixNdfAvailable in shared/fx/ndf.ts).
 */
import { apiFetch, service } from '@slc/api-client'
import { txt } from '../../shared/fx/masters.ts'
import { fxList, isAbort, type FxRow } from '../../shared/fx/mw.ts'
import { TXN, loadNdfQueue, statusLabel, type NdfRecord } from '../../shared/fx/ndf.ts'
import { dmyFromIso, num } from '../../shared/fx/sap.ts'
import type { NdfDeal } from './types.ts'

const companyApi = service('companycode')
const middleware = service('middleware')

/** GET_DATA's constants. */
export const TXN_STATUS_TO_FIX = TXN.RELEASED
export const RBI = 'RBI' /* TEXT-008 */
export const RBI_PAIR = 'USD:INR' /* TEXT-009 */

export type Option = { value: string; label: string; title?: string }
export type Avail<T> = { state: 'ok'; value: T } | { state: 'error'; reason: string }

const sortBy = <T,>(key: (x: T) => string) => (a: T, b: T) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)
const isoOf = (dmy: string) => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dmy)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}
/** TCURR-GDATU is stored inverted (99999999 − yyyymmdd). */
export const invertedDate = (iso: string) => String(99999999 - Number(iso.replace(/-/g, '')))

/* ---------------- pure mappings (tested) ---------------- */

/** FORM drop_down: sorted by code, duplicates by ZTCODE removed (first kept), "<code> - <name>". */
export function traderOptions(rows: readonly FxRow[]): Option[] {
  const seen = new Set<string>()
  return rows
    .filter((r) => txt(r, 'ZTCODE') !== '')
    .sort(sortBy((r) => txt(r, 'ZTCODE')))
    .filter((r) => !seen.has(txt(r, 'ZTCODE')) && !!seen.add(txt(r, 'ZTCODE')))
    .map((r) => ({ value: txt(r, 'ZTCODE'), label: `${txt(r, 'ZTCODE')} - ${txt(r, 'ZTRADER')}` }))
}

/** T001 by code, shown as "<code> - <name>". */
export function companyOptions(rows: readonly { CompanyCode?: string; CompanyCodeName?: string }[]): Option[] {
  return rows
    .filter((r) => r.CompanyCode)
    .map((r) => {
      const code = String(r.CompanyCode)
      const name = String(r.CompanyCodeName ?? '').trim()
      return { value: code, label: name ? `${code} - ${name}` : code, title: name }
    })
    .sort(sortBy((o) => o.value))
}

/** The trader value help as code -> name, for the grid's Trader column (TRD_NAME). */
export function traderNames(options: readonly Option[]): Record<string, string> {
  return Object.fromEntries(options.map((o) => [o.value, o.label.replace(/^[^-]*-\s*/, '')]))
}

/** One queued deal as a worklist row. */
export function dealFromRecord(
  r: NdfRecord,
  names: Readonly<Record<string, string>>,
  statusTexts: Readonly<Record<string, string>>,
): NdfDeal {
  return {
    id: r.rfha,
    company: r.bukrs,
    trader: names[r.traderCode] ?? r.traderCode,
    traderCode: r.traderCode,
    side: r.side,
    pair: `${r.c1}/${r.c2}`,
    amt1: r.amt1,
    c1: r.c1,
    amt2: r.amt2,
    c2: r.c2,
    spot: r.spot,
    swap: r.swap,
    fwd: r.fwd,
    date: dmyFromIso(r.fixingDate),
    vDate: dmyFromIso(r.fixingDate),
    // ZCASH_AMT is written by the fixing itself; a deal still waiting to be fixed has none.
    ndf: 0,
    cashCurr: '',
    cpair: `${r.c1}:${r.c2}`,
    ref: r.ndfRef,
    status: statusLabel(r.txnStatus, statusTexts),
    txnStatus: r.txnStatus,
    partner: r.partnerName,
    valueDate: dmyFromIso(r.valueDate),
    foRemarks: r.foRemark,
    etag: r.etag,
  }
}

/* ---------------- reads ---------------- */

const failure = <T,>(what: string, error: unknown): Avail<T> => {
  if (isAbort(error)) throw error
  console.warn(`[ndf-fixing] ${what} unavailable`, error)
  return { state: 'error', reason: `${what} could not be read from SAP.` }
}

export async function loadCompanies(signal?: AbortSignal): Promise<Avail<Option[]>> {
  try {
    const params = new URLSearchParams({ $select: 'CompanyCode,CompanyCodeName', $top: '5000', $format: 'json' })
    const v2 = await apiFetch<{ d?: { results?: { CompanyCode?: string; CompanyCodeName?: string }[] } }>(
      `${companyApi('A_CompanyCode')}?${params.toString()}`,
      signal ? { signal } : undefined,
    )
    return { state: 'ok', value: companyOptions(v2?.d?.results ?? []) }
  } catch (error) {
    return failure('Company codes (T001)', error)
  }
}

export async function loadTraders(signal?: AbortSignal): Promise<Avail<Option[]>> {
  try {
    return { state: 'ok', value: traderOptions(await fxList('trdGrp', {}, { signal })) }
  } catch (error) {
    return failure('Traders (ZSGTRMTR_TRD_GRP)', error)
  }
}

/** GET_DATA: every NDF deal released for fixing (TXN_STATUS 07); date and trader are filtered on screen. */
export async function loadWorklist(
  names: Readonly<Record<string, string>>,
  statusTexts: Readonly<Record<string, string>>,
  signal?: AbortSignal,
): Promise<Avail<NdfDeal[]>> {
  try {
    const records = await loadNdfQueue([TXN_STATUS_TO_FIX], signal)
    return { state: 'ok', value: records.map((r) => dealFromRecord(r, names, statusTexts)) }
  } catch (error) {
    return failure('NDF deals (TrmFxApp / FxTransaction)', error)
  }
}

/** TCURR kurst RBI on the Fixing Date — 9001's default rate for a USD:INR deal (0 when none). */
export async function loadRbiRate(deal: NdfDeal, fixingDateDmy: string, signal?: AbortSignal): Promise<number> {
  const iso = isoOf(fixingDateDmy)
  if (deal.cpair !== RBI_PAIR || !iso) return 0
  const params = new URLSearchParams({ KURST: RBI, FCURR: deal.c1, TCURR: deal.c2, GDATU: invertedDate(iso), limit: '1' })
  try {
    const body = await apiFetch<{ rows?: FxRow[] }>(`${middleware('data/tcurr')}?${params.toString()}`, signal ? { signal } : undefined)
    const row = body?.rows?.[0]
    return row ? num(row['UKURS']) : 0
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[ndf-fixing] TCURR RBI unavailable', error)
    return 0
  }
}

/** TCURF kurst MTM by "from>to": CHECK_RATE scales the fixing rate with these factors. */
export async function loadTcurf(signal?: AbortSignal): Promise<Record<string, { ffact: number; tfact: number }>> {
  const out: Record<string, { ffact: number; tfact: number }> = {}
  try {
    for (const r of await fxList('tcurf', { KURST: 'MTM' }, { signal })) {
      const key = `${txt(r, 'FCURR')}>${txt(r, 'TCURR')}`
      if (!(key in out)) out[key] = { ffact: num(r['FFACT']), tfact: num(r['TFACT']) }
    }
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[ndf-fixing] TCURF MTM unavailable', error)
  }
  return out
}

/** FTRT_FIX_DEF_T: fix_id -> fix_id_text (the 9001 reference description). */
export async function loadFixingReferences(signal?: AbortSignal): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  try {
    // SELECT SINGLE fix_id_text ... WHERE fix_id = …: no language condition, so the first row wins.
    for (const r of await fxList('ftrtFixDefT', {}, { signal })) {
      const id = txt(r, 'FIX_ID')
      if (id && !(id in out)) out[id] = txt(r, 'FIX_ID_TEXT')
    }
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[ndf-fixing] FTRT_FIX_DEF_T unavailable', error)
  }
  return out
}
