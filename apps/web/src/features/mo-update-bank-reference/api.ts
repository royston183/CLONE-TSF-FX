/*
 * SAP data for External Deals: Update Bank Reference (ZSGTSFR002 / ZSGTSF_RFX_EXTDEAL_ALV),
 * read as the ABAP reads it. Nothing falls back to sample data.
 *
 *   Company Code (S_BUKRS)   SELECT-OPTIONS FOR VTBFHA-BUKRS: T001 (API_COMPANYCODE_SRV / A_CompanyCode),
 *                            shown "<code> - <name>"
 *   Key Date (P_DATE)        DELFZ = p_date
 *   Report Type R_FX         FORM get_data: SELECT * FROM ZSGTSFV_FX WHERE bukrs IN s_bukrs AND delfz = p_date.
 *                            The middleware view "tsfvFx" serves every column that selection and the in-program
 *                            deletes use (BUKRS, DELFZ, SAKTIV, NORDEXT, RFHA), so the rows come from it. It lacks the
 *                            VTBFHA append columns, which are read from TrmFxApp (ZSGTSFTR_APP_STR, shared/fx/app-str.ts)
 *                            by company code + transaction: TXN_STATUS, ZTSF_DEAL_ID, ZTSF_MC_REF_NO, ZOLAM_DEAL_NO.
 *                            Still served by neither (shown blank, noted on screen): PRCTR, CPAIR, MAT_UNMAT.
 *   Report Type R_OP         FORM get_data: SELECT * FROM ZSGTSFV_OP ...   (no middleware resource -> WAITING FOR API)
 *   in-program deletes       saktiv = '3' removed; P_RB1 keeps NORDEXT <> space, P_RB2 keeps NORDEXT = space;
 *                            SORT BY rfha
 *   Layout (P_LAYOUT)        ALV variants (LTDX via REUSE_ALV_VARIANT_F4)  -> WAITING FOR API
 *   UPD                      UPDATE vtbfha SET zolam_deal_no, BAPI_FTR_FXT_CHANGE / BAPI_FTR_CHANGE_FXOPTIONS
 *                            (external_reference), BAPI_TRANSACTION_COMMIT  -> WAITING FOR ACTION API
 *   VIEW                     TB_TRANSACTION_TO_DISPLAY (FTR display) - the modal shows the loaded row instead
 */
import { apiFetch, service } from '@slc/api-client'
import { txt } from '../../shared/fx/masters.ts'
import { fxColumns, fxList, isAbort, type FxFilter, type FxRow } from '../../shared/fx/mw.ts'
import { dmyFromIso, num } from '../../shared/fx/sap.ts'
import { attachTrmFxApp, loadFxFor, type TrmFxApp } from '../../shared/fx/app-str.ts'
import type { FxTransaction } from '../mo-fx-deal-confirmation/api.ts'
import { ndfExtras } from '../../shared/fx/ndf-columns.ts'
import type { Company, Deal, DealType } from './types.ts'

const companyApi = service('companycode')

export const WAITING = 'WAITING FOR API'
export const WAITING_ACTION = 'WAITING FOR ACTION API'

/** The middleware resource behind ZSGTSFV_FX. ZSGTSFV_OP has none. */
export const FX_VIEW = 'tsfvFx'

/** GET_DATA's LC_SAKTIV: activity status 3 (reversed) is dropped. */
export const SAKTIV_REVERSED = '3'

/**
 * ZSGTSFV_FX fields GET_DATA filters/sorts on (BUKRS, DELFZ, SAKTIV, NORDEXT, RFHA) and the row key
 * (REFNR). Without them the selection cannot be reproduced, so the list waits.
 */
export const SELECTION_COLUMNS = ['BUKRS', 'RFHA', 'REFNR', 'DELFZ', 'SAKTIV', 'NORDEXT'] as const

/**
 * Every other field the screen's Forex columns show that the view serves. The Spot / Swap / All-in
 * columns are the view's OSPOT / OSWAP / OTOT_RATE (the ALV's 'Spot Rate' / 'Swap Rate' /
 * 'Rate of Foreign Exchange Transaction').
 */
// prettier-ignore
export const DISPLAY_COLUMNS = [
  'BUTXT', 'SFHAART', 'XTEXT', 'BS_1', 'CURR1', 'AMT1', 'BS_2', 'CURR2', 'AMT2', 'DBLFZ', 'OSPOT', 'OSWAP', 'OTOT_RATE',
  'RDEALER', 'BP_NAME', 'KONTRH', 'RBUSA', 'RPORTB',
] as const

/** Columns neither the view nor TrmFxApp serve: PRCTR, CPAIR and MAT_UNMAT stay blank. */
export const UNSERVED_COLUMNS = ['PRCTR', 'CPAIR', 'MAT_UNMAT'] as const

/** What the grid shows blank, in the screen's words. */
export const BLANK_COLUMNS_NOTE = `${WAITING} — Profit Center (PRCTR), Currency Pair (CPAIR) and Match/Unmatch (MAT_UNMAT) are not served by ZSGTSFV_FX (middleware "${FX_VIEW}") or TrmFxApp, so those columns are blank.`

/** Deal ID, Master Contract reference, TXN_STATUS and Int Ref are read from TrmFxApp, not from the view. */
export const APP_COLUMNS = ['TXN_STATUS', 'ZTSF_DEAL_ID', 'ZMC_REF_NO', 'ZOLAM_DEAL_NO'] as const

export const OPTION_VIEW_WAITING = `${WAITING} — ZSGTSFV_OP (Option deal view) is not served by the SLC middleware.`

export const LAYOUT_WAITING = `${WAITING} — ALV layouts (LTDX)`

export type Option = { value: string; label: string }
export type Avail<T> = { state: 'ok'; value: T } | { state: 'waiting' | 'error'; reason: string }

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/* ---------------- pure mappings (tested) ---------------- */

/** T001 by code (leading zeros kept); the dropdown shows "<code> - <name>". */
export function companiesFromT001(rows: readonly { CompanyCode?: string; CompanyCodeName?: string }[]): Company[] {
  return rows
    .filter((r) => r.CompanyCode)
    .map((r) => ({ code: String(r.CompanyCode), name: String(r.CompanyCodeName ?? '').trim() }))
    .sort((a, b) => byText(a.code, b.code))
}

export const missingColumns = (have: readonly string[], need: readonly string[]) => {
  const present = new Set(have.map((c) => c.toUpperCase()))
  return need.filter((c) => !present.has(c))
}

/** S_BUKRS from the From/To boxes: EQ for one code, BT for a range (a reversed range is swapped). */
export function companyFilter(from: string, to: string): FxFilter {
  if (!to || to === from) return { BUKRS: from }
  const [lo, hi] = to < from ? [to, from] : [from, to]
  return { 'BUKRS[gte]': lo, 'BUKRS[lte]': hi }
}

/** The ALPHA conversion exit's output form: leading zeros of an all-digit key are not shown. */
export function alphaOut(value: string): string {
  return /^\d+$/.test(value) ? value.replace(/^0+(?=\d)/, '') : value
}

/** GET_DATA's in-program DELETEs and SORT BY rfha, on the rows SELECTed for s_bukrs / p_date. */
export function eligible(rows: readonly FxRow[], withRef: boolean): FxRow[] {
  return rows
    .filter((r) => txt(r, 'SAKTIV') !== SAKTIV_REVERSED)
    .filter((r) => (withRef ? txt(r, 'NORDEXT') !== '' : txt(r, 'NORDEXT') === ''))
    .sort((a, b) => byText(txt(a, 'RFHA'), txt(b, 'RFHA')))
}

/**
 * One ZSGTSFV_FX row as a grid row. BUKRS+RFHA+REFNR is the view's row key. `app` is the row's TrmFxApp record
 * (company code + transaction), if it has one; without it the application columns are blank.
 */
export function dealFromView(r: FxRow, app?: TrmFxApp, fx?: FxTransaction): Deal {
  // NDF_DATE / NDF_REF come from the view row; rate and cash settlement from FxTransaction (blank, never 0, until served).
  const ndf = ndfExtras(fx, app, r)
  return {
    _id: `${txt(r, 'BUKRS')}-${txt(r, 'RFHA')}-${txt(r, 'REFNR')}`,
    RFHA: alphaOut(txt(r, 'RFHA')),
    BUKRS: txt(r, 'BUKRS'),
    BUTXT: txt(r, 'BUTXT'),
    SFHAART: txt(r, 'SFHAART'),
    XTEXT: txt(r, 'XTEXT'),
    CPAIR: '',
    BS_1: txt(r, 'BS_1'),
    CURR1: txt(r, 'CURR1'),
    AMT1: num(r['AMT1']),
    BS_2: txt(r, 'BS_2'),
    CURR2: txt(r, 'CURR2'),
    AMT2: num(r['AMT2']),
    SPOT: num(r['OSPOT']),
    SWAP: num(r['OSWAP']),
    TOT_RATE: num(r['OTOT_RATE']),
    NDF_DATE: dmyFromIso(ndf.ndfDate),
    NDF_REF: ndf.ndfRef,
    ...(ndf.ndfRate !== null ? { NDF_RATE: ndf.ndfRate } : {}),
    ...(ndf.cashAmount !== null ? { ZCASH_AMT: ndf.cashAmount } : {}),
    CASH_CURR: ndf.cashCurrency,
    DBLFZ: dmyFromIso(txt(r, 'DBLFZ')),
    DELFZ: dmyFromIso(txt(r, 'DELFZ')),
    RDEALER: txt(r, 'RDEALER'),
    BP_NAME: txt(r, 'BP_NAME'),
    KONTRH: txt(r, 'KONTRH'),
    RBUSA: txt(r, 'RBUSA'),
    RPORTB: txt(r, 'RPORTB'),
    PRCTR: '',
    TXN_STATUS: app?.TxnStatus ?? '',
    MAT_UNMAT: '',
    ZTSF_DEAL_ID: app?.ZtsfDealID ?? '',
    ZMC_REF_NO: app?.ZtsfMcRefNo ?? '',
    NORDEXT: txt(r, 'NORDEXT'),
    ZOLAM_DEAL_NO: app?.ZolamDealNo ?? '',
    _checked: false,
  }
}

/** The grid's column filters offer the distinct values of the loaded list (the ALV filter). */
export function distinctOptions(rows: readonly Deal[], value: (d: Deal) => string, label: (d: Deal) => string = value): Option[] {
  const out = new Map<string, string>()
  for (const r of rows) {
    const v = value(r)
    if (v && !out.has(v)) out.set(v, label(r) || v)
  }
  return [...out].map(([v, l]) => ({ value: v, label: l })).sort((a, b) => byText(a.value, b.value))
}

/** UPD has no browser API: every step of it is a BAPI or a direct VTBFHA update. */
export function updateBlockedText(dealType: DealType): string {
  const bapi = dealType === 'FX' ? 'BAPI_FTR_FXT_CHANGE' : 'BAPI_FTR_CHANGE_FXOPTIONS'
  return (
    `${WAITING_ACTION} — Update Bank Reference (${bapi}, BAPI_TRANSACTION_COMMIT, UPDATE VTBFHA-ZOLAM_DEAL_NO) ` +
    'has no API yet. Nothing was posted to SAP.'
  )
}

/* ---------------- reads ---------------- */

const failure = <T,>(what: string, error: unknown): Avail<T> => {
  if (isAbort(error)) throw error
  console.warn(`[update-bank-reference] ${what} unavailable`, error)
  return { state: 'error', reason: `${what} could not be read from SAP.` }
}

export async function loadCompanies(signal?: AbortSignal): Promise<Avail<Company[]>> {
  try {
    const params = new URLSearchParams({ $select: 'CompanyCode,CompanyCodeName', $top: '5000', $format: 'json' })
    const v2 = await apiFetch<{ d?: { results?: { CompanyCode?: string; CompanyCodeName?: string }[] } }>(
      `${companyApi('A_CompanyCode')}?${params.toString()}`,
      signal ? { signal } : undefined,
    )
    return { state: 'ok', value: companiesFromT001(v2?.d?.results ?? []) }
  } catch (error) {
    return failure('Company codes (T001)', error)
  }
}

export type DealsResult = { state: 'ok'; value: Deal[]; note: string } | { state: 'waiting' | 'error'; reason: string }

/**
 * GET_DATA for the selection. The rows come from ZSGTSFV_FX, which serves every column the selection uses;
 * TrmFxApp adds the VTBFHA append columns. If the view lacks a selection column the list says WAITING FOR API
 * instead of a partial list. `note` names the columns that stay blank.
 */
export async function loadDeals(
  sel: { dealType: DealType; coFrom: string; coTo: string; keyDateIso: string; withRef: boolean },
  signal?: AbortSignal,
): Promise<DealsResult> {
  if (sel.dealType === 'OP') return { state: 'waiting', reason: OPTION_VIEW_WAITING }
  try {
    const missing = missingColumns(await fxColumns(FX_VIEW, signal), [...SELECTION_COLUMNS, ...DISPLAY_COLUMNS])
    if (missing.length)
      return { state: 'waiting', reason: `${WAITING} — ZSGTSFV_FX (middleware "${FX_VIEW}") does not serve ${missing.join(', ')}.` }
    const rows = eligible(await fxList(FX_VIEW, { ...companyFilter(sel.coFrom, sel.coTo), DELFZ: sel.keyDateIso }, { signal }), sel.withRef)
    const joined = await attachTrmFxApp(
      rows.map((r) => ({ CompanyCode: txt(r, 'BUKRS'), FinancialTransaction: txt(r, 'RFHA'), row: r })),
      signal,
    )
    // Display-only: rate / cash settlement stay blank when FxTransaction cannot be read or does not serve them.
    const fxByKey = new Map<string, FxTransaction>()
    try {
      for (const f of await loadFxFor(joined.map(({ fx }) => ({ CompanyCode: fx.CompanyCode, FinancialTransaction: fx.FinancialTransaction })), signal)) {
        fxByKey.set(`${f.CompanyCode}|${f.FinancialTransaction}`, f)
      }
    } catch (error) {
      if (isAbort(error)) throw error
      console.warn('[update-bank-reference] FxTransaction unavailable for the NDF columns', error)
    }
    return {
      state: 'ok',
      value: joined.map(({ fx, app }) => dealFromView(fx.row, app, fxByKey.get(`${fx.CompanyCode}|${fx.FinancialTransaction}`))),
      note: BLANK_COLUMNS_NOTE,
    }
  } catch (error) {
    const failed = failure<never>('ZSGTSFV_FX', error)
    return failed.state === 'ok' ? { state: 'error', reason: 'ZSGTSFV_FX could not be read.' } : failed
  }
}
