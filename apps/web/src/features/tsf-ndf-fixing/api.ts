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
 *                           sgsart+2(1) = 'D'. The legacy view lacks the VTBFHA appends, so the
 *                           same selection is read from TrmFxApp (service "trmfxapp") joined with
 *                           FxTransaction (service "fx"):
 *                             txn_status = '07'     TrmFxApp.TxnStatus eq '07' (server side)
 *                             saktiv <> 3           FxTransaction.ActiveStatus <> '3'
 *                             sgsart+2(1) = 'D'     FxTransaction.ProductType 3rd character
 *                             v_date = p_date       FxTransaction.ValueDate
 *                             ztrcode = p_trd       TrmFxApp.Ztrcode (name: ZSGTRMTR_TRD_GRP)
 *                           Blank on a status-07 deal because nothing has written them yet: NDF_DATE,
 *                           NDF_REF, CASH_CURR, ZCASH_AMT (all set by the fixing itself); not served by
 *                           any service either way. NDF_FO_REM / NDF_MO_REM come from TrmFxApp.
 *   9001 default rate       TCURR kurst 'RBI', fcurr/tcurr = curr1/curr2, gdatu = p_date, USD:INR only
 *   9001 rate scaling       TCURF kurst 'MTM'
 *   9001 reference text     FTRT_FIX_DEF_T fix_id -> fix_id_text
 */
import { apiFetch, service } from '@slc/api-client'
import { txt } from '../../shared/fx/masters.ts'
import { fxList, isAbort, type FxRow } from '../../shared/fx/mw.ts'
import { dmyFromIso, num } from '../../shared/fx/sap.ts'
import { loadFxWithApp, statusFilter, type TrmFxApp } from '../../shared/fx/app-str.ts'
import { fxTxnStatusLabel } from '../../shared/fx/txn-status.ts'
import type { FxTransaction } from '../mo-fx-deal-confirmation/api.ts'
import type { NdfDeal, Side } from './types.ts'

const companyApi = service('companycode')
const middleware = service('middleware')

export const WAITING = 'WAITING FOR API'

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

const ACTIVE_REVERSED = '3'
const n = (v: unknown): number => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

/** sgsart+2(1) = 'D': an NDF product type (12D). */
export const isNdfProduct = (productType: string | undefined): boolean => (productType ?? '').charAt(2) === 'D'

/**
 * GET_DATA's in-program deletes on the joined rows: saktiv <> 3, NDF product types only, v_date = P_DATE
 * (ValueDate) and P_TRD when given. TXN_STATUS 07 is already in the TrmFxApp filter.
 */
export function eligible(rows: readonly { fx: FxTransaction; app: TrmFxApp }[], valueDateIso: string, traderCode = '') {
  return rows.filter(
    ({ fx, app }) =>
      app.TxnStatus === TXN_STATUS_TO_FIX &&
      fx.ActiveStatus !== ACTIVE_REVERSED &&
      isNdfProduct(fx.ProductType) &&
      (fx.ValueDate ?? '').slice(0, 10) === valueDateIso &&
      (!traderCode || (app.Ztrcode ?? '') === traderCode),
  )
}

/**
 * One transaction (SAP) with its TrmFxApp row as a worklist deal. Leg 1 is SAP's lead currency; amounts carry
 * the sign the old view had (bought leg +, sold leg -). NDF_DATE, NDF_REF, CASH_CURR, ZCASH_AMT are blank:
 * no service serves them, and a deal waiting for its fixing has none yet.
 */
export function dealFromApp(fx: FxTransaction, app: TrmFxApp, traderNames: Readonly<Record<string, string>> = {}): NdfDeal {
  const c1 = fx.LeadCurrency || fx.BuyCurrency || ''
  const c2 = fx.FollowCurrency || fx.SellCurrency || ''
  const buysLead = fx.BuyCurrency === c1
  const code = app.Ztrcode ?? ''
  return {
    id: fx.FinancialTransaction,
    company: fx.CompanyCode,
    trader: traderNames[code] ?? '',
    traderCode: code,
    side: buysLead ? 'Buy' : 'Sell',
    pair: `${c1}/${c2}`,
    amt1: buysLead ? n(fx.BuyAmount) : -n(fx.SellAmount),
    c1,
    amt2: buysLead ? -n(fx.SellAmount) : n(fx.BuyAmount),
    c2,
    spot: n(fx.SpotRate),
    swap: n(fx.SwapRate),
    fwd: n(fx.ForwardRate),
    date: '',
    vDate: dmyFromIso((fx.ValueDate ?? '').slice(0, 10)),
    ndf: 0,
    cashCurr: '',
    cpair: c1 && c2 ? `${c1}:${c2}` : '',
    ref: '',
    status: fxTxnStatusLabel(app.TxnStatus ?? ''),
    txnStatus: app.TxnStatus ?? '',
    remarks: '',
    moRemarks: app.NdfMoRem ?? '',
    foRemarks: app.NdfFoRem ?? '',
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

/** ZTCODE -> trader name (ZSGTRMTR_TRD_GRP); a failed read leaves the names blank. */
export async function loadTraderNames(signal?: AbortSignal): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  try {
    for (const r of await fxList('trdGrp', {}, { signal })) {
      const code = txt(r, 'ZTCODE')
      if (code && !(code in out)) out[code] = txt(r, 'ZTRADER')
    }
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[ndf-fixing] trader names unavailable', error)
  }
  return out
}

/** GET_DATA for one Fixing Date: TrmFxApp rows in TXN_STATUS 07, joined with FxTransaction (see the header). */
export async function loadWorklist(fixingDateDmy: string, signal?: AbortSignal): Promise<Avail<NdfDeal[]>> {
  try {
    const iso = isoOf(fixingDateDmy)
    if (!iso) return { state: 'ok', value: [] }
    const [joined, names] = await Promise.all([loadFxWithApp(statusFilter([TXN_STATUS_TO_FIX]), signal), loadTraderNames(signal)])
    return { state: 'ok', value: eligible(joined, iso).map(({ fx, app }) => dealFromApp(fx, app, names)) }
  } catch (error) {
    return failure('NDF transactions (TrmFxApp / FxTransaction)', error)
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
