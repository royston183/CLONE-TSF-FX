/*
 * SAP data for External Deals: Update Bank Reference (ZSGTSFR002 / ZSGTSF_RFX_EXTDEAL_ALV),
 * read as the ABAP reads it. Nothing falls back to sample data.
 *
 *   Company Code (S_BUKRS)   SELECT-OPTIONS FOR VTBFHA-BUKRS: T001 (API_COMPANYCODE_SRV / A_CompanyCode),
 *                            shown "<code> - <name>"
 *   Key Date (P_DATE)        DELFZ = p_date
 *   Report Type R_FX         FORM get_data: SELECT * FROM ZSGTSFV_FX WHERE bukrs IN s_bukrs AND delfz = p_date
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
import type { Company, Deal, DealType } from './types.ts'

const companyApi = service('companycode')

export const WAITING = 'WAITING FOR API'
export const WAITING_ACTION = 'WAITING FOR ACTION API'

/** The middleware resource behind ZSGTSFV_FX. ZSGTSFV_OP has none. */
export const FX_VIEW = 'tsfvFx'

/** GET_DATA's LC_SAKTIV: activity status 3 (reversed) is dropped. */
export const SAKTIV_REVERSED = '3'

/**
 * ZSGTSFV_FX fields GET_DATA filters/sorts on (BUKRS, DELFZ, SAKTIV, NORDEXT, RFHA), the row key
 * (REFNR) and every field the screen's Forex columns show. The screen's Spot / Swap / All-in
 * columns are the view's OSPOT / OSWAP / OTOT_RATE (the ALV's 'Spot Rate' / 'Swap Rate' /
 * 'Rate of Foreign Exchange Transaction').
 */
export const VIEW_REQUIRED_COLUMNS = [
  'BUKRS',
  'RFHA',
  'REFNR',
  'DELFZ',
  'SAKTIV',
  'NORDEXT',
  'BUTXT',
  'SFHAART',
  'XTEXT',
  'CPAIR',
  'BS_1',
  'CURR1',
  'AMT1',
  'BS_2',
  'CURR2',
  'AMT2',
  'DBLFZ',
  'OSPOT',
  'OSWAP',
  'OTOT_RATE',
  'RDEALER',
  'BP_NAME',
  'KONTRH',
  'RBUSA',
  'RPORTB',
  'PRCTR',
  'TXN_STATUS',
  'MAT_UNMAT',
  'ZTSF_DEAL_ID',
  'ZMC_REF_NO',
  'ZOLAM_DEAL_NO',
] as const

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

/** One ZSGTSFV_FX row as a grid row. BUKRS+RFHA+REFNR is the view's row key. */
export function dealFromView(r: FxRow): Deal {
  return {
    _id: `${txt(r, 'BUKRS')}-${txt(r, 'RFHA')}-${txt(r, 'REFNR')}`,
    RFHA: alphaOut(txt(r, 'RFHA')),
    BUKRS: txt(r, 'BUKRS'),
    BUTXT: txt(r, 'BUTXT'),
    SFHAART: txt(r, 'SFHAART'),
    XTEXT: txt(r, 'XTEXT'),
    CPAIR: txt(r, 'CPAIR'),
    BS_1: txt(r, 'BS_1'),
    CURR1: txt(r, 'CURR1'),
    AMT1: num(r['AMT1']),
    BS_2: txt(r, 'BS_2'),
    CURR2: txt(r, 'CURR2'),
    AMT2: num(r['AMT2']),
    SPOT: num(r['OSPOT']),
    SWAP: num(r['OSWAP']),
    TOT_RATE: num(r['OTOT_RATE']),
    DBLFZ: dmyFromIso(txt(r, 'DBLFZ')),
    DELFZ: dmyFromIso(txt(r, 'DELFZ')),
    RDEALER: txt(r, 'RDEALER'),
    BP_NAME: txt(r, 'BP_NAME'),
    KONTRH: txt(r, 'KONTRH'),
    RBUSA: txt(r, 'RBUSA'),
    RPORTB: txt(r, 'RPORTB'),
    PRCTR: txt(r, 'PRCTR'),
    TXN_STATUS: txt(r, 'TXN_STATUS'),
    MAT_UNMAT: txt(r, 'MAT_UNMAT'),
    ZTSF_DEAL_ID: txt(r, 'ZTSF_DEAL_ID'),
    ZMC_REF_NO: txt(r, 'ZMC_REF_NO'),
    NORDEXT: txt(r, 'NORDEXT'),
    ZOLAM_DEAL_NO: txt(r, 'ZOLAM_DEAL_NO'),
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

/**
 * GET_DATA for the selection. Forex checks the view's columns first: without them the list
 * cannot be shown as the ALV shows it, so it says WAITING FOR API instead of a partial list.
 */
export async function loadDeals(
  sel: { dealType: DealType; coFrom: string; coTo: string; keyDateIso: string; withRef: boolean },
  signal?: AbortSignal,
): Promise<Avail<Deal[]>> {
  if (sel.dealType === 'OP') return { state: 'waiting', reason: OPTION_VIEW_WAITING }
  try {
    const missing = missingColumns(await fxColumns(FX_VIEW, signal), VIEW_REQUIRED_COLUMNS)
    if (missing.length)
      return { state: 'waiting', reason: `${WAITING} — ZSGTSFV_FX (middleware "${FX_VIEW}") does not serve ${missing.join(', ')}.` }
    const rows = await fxList(FX_VIEW, { ...companyFilter(sel.coFrom, sel.coTo), DELFZ: sel.keyDateIso }, { signal })
    return { state: 'ok', value: eligible(rows, sel.withRef).map(dealFromView) }
  } catch (error) {
    return failure('ZSGTSFV_FX', error)
  }
}
