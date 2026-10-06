/*
 * SAP data for UA1: TSF NDF Fixing (ZSGTSFR050 / ZSGTSF_RFX_NDF_FIX), read as the ABAP reads it.
 * Nothing falls back to sample data.
 *
 *   Company Code (S_BUKRS)  T001 (API_COMPANYCODE_SRV / A_CompanyCode); the ABAP then keeps only
 *                           the codes the user passes AUTHORITY-CHECK F_BKPF_BUK for (WAITING FOR AUTH)
 *   Trader (P_TRD)          FORM drop_down: ZSGTRMTR_TRD_GRP WHERE ztcode <> space, sorted, one row per
 *                           ZTCODE, "<code> - <name>"  (SLC middleware "trdGrp")
 *   Worklist                FORM get_data: ZSGTSFV_FX WHERE bukrs IN s_bukrs AND txn_status = '07'
 *                           AND saktiv <> 3 AND v_date = p_date; then ztrcode = p_trd and
 *                           sgsart+2(1) = 'D'   (middleware "tsfvFx" -> WAITING FOR API, see below)
 *   9001 default rate       TCURR kurst 'RBI', fcurr/tcurr = curr1/curr2, gdatu = p_date, USD:INR only
 *   9001 rate scaling       TCURF kurst 'MTM'
 *   9001 reference text     FTRT_FIX_DEF_T fix_id -> fix_id_text
 */
import { apiFetch, service } from '@slc/api-client'
import { txt } from '../../shared/fx/masters.ts'
import { fxColumns, fxList, isAbort, type FxRow } from '../../shared/fx/mw.ts'
import { dmyFromIso, num } from '../../shared/fx/sap.ts'
import type { NdfDeal, Side } from './types.ts'

const companyApi = service('companycode')
const middleware = service('middleware')

export const WAITING = 'WAITING FOR API'

/** The middleware resource behind ZSGTSFV_FX. */
export const FX_VIEW = 'tsfvFx'

/** ZSGTSFV_FX fields GET_DATA filters on or the screen shows. */
export const VIEW_REQUIRED_COLUMNS = [
  'BUKRS',
  'RFHA',
  'SAKTIV',
  'SGSART',
  'TXN_STATUS',
  'V_DATE',
  'ZTRCODE',
  'TRD_NAME',
  'NDF_DATE',
  'NDF_REF',
  'CPAIR',
  'CASH_CURR',
  'ZCASH_AMT',
  'BS_1',
  'CURR1',
  'CURR2',
  'AMT1',
  'AMT2',
  'OSPOT',
  'OSWAP',
  'OTOT_RATE',
  'EXT_STAT_DESC',
] as const

/** GET_DATA's constants. */
export const TXN_STATUS_TO_FIX = '07'
export const RBI = 'RBI' /* TEXT-008 */
export const RBI_PAIR = 'USD:INR' /* TEXT-009 */

export type Option = { value: string; label: string; title?: string }
export type Avail<T> = { state: 'ok'; value: T } | { state: 'waiting' | 'error'; reason: string }

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

export const missingColumns = (have: readonly string[], need: readonly string[]) => {
  const present = new Set(have.map((c) => c.toUpperCase()))
  return need.filter((c) => !present.has(c))
}

/** One ZSGTSFV_FX row as a worklist deal. */
export function dealFromView(r: FxRow): NdfDeal {
  const c1 = txt(r, 'CURR1')
  const c2 = txt(r, 'CURR2')
  return {
    id: txt(r, 'RFHA'),
    company: txt(r, 'BUKRS'),
    trader: txt(r, 'TRD_NAME'),
    traderCode: txt(r, 'ZTRCODE'),
    side: (txt(r, 'BS_1') === 'Sell' ? 'Sell' : 'Buy') as Side,
    pair: `${c1}/${c2}`,
    amt1: num(r['AMT1']),
    c1,
    amt2: num(r['AMT2']),
    c2,
    spot: num(r['OSPOT']),
    swap: num(r['OSWAP']),
    fwd: num(r['OTOT_RATE']),
    date: dmyFromIso(txt(r, 'NDF_DATE')),
    vDate: dmyFromIso(txt(r, 'V_DATE')),
    ndf: num(r['ZCASH_AMT']),
    cashCurr: txt(r, 'CASH_CURR'),
    cpair: txt(r, 'CPAIR'),
    ref: txt(r, 'NDF_REF'),
    status: txt(r, 'EXT_STAT_DESC'),
    txnStatus: txt(r, 'TXN_STATUS'),
    remarks: '',
    moRemarks: '',
  }
}

/** GET_DATA's in-program deletes: P_TRD when given, and NDF product types only (sgsart+2(1) = 'D'). */
export function eligible(rows: readonly FxRow[], traderCode: string): FxRow[] {
  return rows.filter(
    (r) =>
      txt(r, 'TXN_STATUS') === TXN_STATUS_TO_FIX &&
      txt(r, 'SAKTIV') !== '3' &&
      txt(r, 'SGSART').charAt(2) === 'D' &&
      (!traderCode || txt(r, 'ZTRCODE') === traderCode),
  )
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

/**
 * GET_DATA for one Fixing Date. Checks the view's columns first: without TXN_STATUS, V_DATE and
 * the NDF fields the eligibility cannot be reproduced, so the worklist says WAITING FOR API
 * instead of listing unrelated FX transactions.
 */
export async function loadWorklist(fixingDateDmy: string, signal?: AbortSignal): Promise<Avail<NdfDeal[]>> {
  try {
    const missing = missingColumns(await fxColumns(FX_VIEW, signal), VIEW_REQUIRED_COLUMNS)
    if (missing.length)
      return { state: 'waiting', reason: `${WAITING} — ZSGTSFV_FX (middleware "${FX_VIEW}") does not serve ${missing.join(', ')}.` }
    const iso = isoOf(fixingDateDmy)
    if (!iso) return { state: 'ok', value: [] }
    const rows = await fxList(FX_VIEW, { TXN_STATUS: TXN_STATUS_TO_FIX, 'SAKTIV[ne]': '3', V_DATE: iso }, { signal })
    return { state: 'ok', value: eligible(rows, '').map(dealFromView) }
  } catch (error) {
    return failure('ZSGTSFV_FX', error)
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
