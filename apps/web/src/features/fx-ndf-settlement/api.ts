/*
 * SAP data for ZSGTSFR028 "FX NDF Settlement" (ZSGTSF_RBANKSETTLE_NDF), read as the ABAP reads it.
 * Nothing falls back to sample data.
 *
 *   Company Code (S_BUKRS)  F4 of VTBFHA-BUKRS = T001 (API_COMPANYCODE_SRV / A_CompanyCode), "code - name"
 *   Value Date (S_DATE)     typed / calendar, no value help
 *   Transaction No (S_RFHA) the RFHAs of the deals GET_DATA lists for the current company / dates
 *   Worklist                FORM get_data: ZSGTSFV_FX WHERE bukrs IN s_bukrs AND sgsart = '12D'
 *                           AND rfha IN s_rfha AND delfz IN s_date AND saktiv <> 3; then
 *                           DELETE txn_status < '07', = '08', and (sgsart+2(1) = 'D' AND
 *                           txn_status <> '13')  -> middleware "tsfvFx", column-gated (WAITING FOR API)
 *   FI_DOC                  BKPF blart 'TR', xref2_hd 'TSF', budat IN s_date, waers = cash_curr,
 *                           xblnr = rfha, not reversed  -> no API serves BKPF (WAITING FOR API)
 *   PDF form name           ZSGTSFTR_BS_PDF WHERE zlet_code = 'L003' (middleware "bsPdf")
 *   Actions                 PRINT/PDF: ZSGTSFCL_GET_BANK_SETTLE + Adobe form (FP_*), TEST/TBB1/
 *                           Execute: SUBMIT RFTBBB00 (+ UPDATE vtbfha txn_status = '50')
 *                           -> WAITING FOR ACTION API (see logic.ts)
 */
import { apiFetch, service } from '@slc/api-client'
import { txt } from '../../shared/fx/masters.ts'
import { fxColumns, fxList, isAbort, type FxFilter, type FxRow } from '../../shared/fx/mw.ts'
import { num } from '../../shared/fx/sap.ts'
import { GET_DATA, LETTER_CODE, WAITING_API } from './data.ts'
import type { CompanyOption, Criteria, Deal, Loaded } from './types.ts'

const companyApi = service('companycode')

/** The middleware resource behind ZSGTSFV_FX (CDS ZSGTSFCDS_FX). */
export const FX_VIEW = 'tsfvFx'
/** The middleware resource behind ZSGTSFTR_BS_PDF. */
export const BS_PDF = 'bsPdf'

/** GET_DATA's select list, as far as the screen uses it (FI_DOC comes from BKPF). */
export const VIEW_REQUIRED_COLUMNS = [
  'BUKRS', 'RFHA', 'SAKTIV', 'SGSART', 'BUTXT', 'LTX', 'SFHAART', 'XTEXT', 'BP_NAME', 'RFHAZUL',
  'KONTRH', 'BLOTTER_DATE', 'PRCTR', 'PC_NAME', 'RBUSA', 'BA_NAME', 'RPORTB', 'XPORTB', 'REFER',
  'REFNR', 'DBLFZ', 'DELFZ', 'ZCOM_ID', 'RDEALER', 'GSPPART', 'NORDEXT', 'TXN_STATUS', 'NDF_DATE',
  'NDF_REF', 'FO_REMARK', 'MO_REMARK', 'ZTSF_DEAL_ID', 'ZTSF_MC_REF_NO', 'NDF_FO_REM', 'NDF_MO_REM',
  'BS', 'BS_1', 'BS_2', 'CURR1', 'CURR2', 'AMT1', 'AMT2', 'OSPOT', 'OSWAP', 'OTOT_RATE', 'T_RATE',
  'SPOT', 'SWAP', 'TOT_RATE', 'NDF_RATE', 'CPAIR', 'ZWAERS', 'CASH_CURR', 'ZCASH_AMT', 'DCRDAT',
  'CRUSER', 'DUPDAT', 'UPUSER',
] as const

/** Why FI_DOC stays empty: GET_DATA's BKPF read has no API. */
export const BKPF_WAITING = `${WAITING_API} — BKPF (FI document header) is not served by any API; FI Document stays empty.`

const sortBy = <T,>(key: (x: T) => string) => (a: T, b: T) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)

/* ---------------- pure mappings (tested) ---------------- */

/** T001 by code (leading zeros kept). */
export function companyOptions(rows: readonly { CompanyCode?: string; CompanyCodeName?: string }[]): CompanyOption[] {
  return rows
    .filter((r) => r.CompanyCode)
    .map((r) => ({ code: String(r.CompanyCode), name: String(r.CompanyCodeName ?? '').trim() }))
    .sort(sortBy((o) => o.code))
}

export const missingColumns = (have: readonly string[], need: readonly string[]) => {
  const present = new Set(have.map((c) => c.toUpperCase()))
  return need.filter((c) => !present.has(c))
}

/** The part of GET_DATA's WHERE the middleware applies (S_RFHA and the deletes run in logic.getData). */
export function viewFilter(c: Pick<Criteria, 'bukrs' | 'dateFrom' | 'dateTo'>): FxFilter {
  const filter: FxFilter = {
    'BUKRS[in]': c.bukrs.join(','),
    SGSART: GET_DATA.sgsart,
    'SAKTIV[ne]': GET_DATA.saktivExcluded,
  }
  if (c.dateTo) {
    filter['DELFZ[gte]'] = c.dateFrom
    filter['DELFZ[lte]'] = c.dateTo
  } else filter['DELFZ'] = c.dateFrom // S_DATE without HIGH is EQ
  return filter
}

/** One ZSGTSFV_FX row as a deal. */
export function dealFromView(r: FxRow): Deal {
  return {
    bukrs: txt(r, 'BUKRS'),
    rfha: txt(r, 'RFHA'),
    refnr: txt(r, 'REFNR'),
    saktiv: txt(r, 'SAKTIV'),
    sgsart: txt(r, 'SGSART'),
    rfhazul: txt(r, 'RFHAZUL'),
    butxt: txt(r, 'BUTXT'),
    ltx: txt(r, 'LTX'),
    sfhaart: txt(r, 'SFHAART'),
    xtext: txt(r, 'XTEXT'),
    kontrh: txt(r, 'KONTRH'),
    bp_name: txt(r, 'BP_NAME'),
    gsppart: txt(r, 'GSPPART'),
    blotter_date: txt(r, 'BLOTTER_DATE'),
    prctr: txt(r, 'PRCTR'),
    pc_name: txt(r, 'PC_NAME'),
    rbusa: txt(r, 'RBUSA'),
    ba_name: txt(r, 'BA_NAME'),
    rportb: txt(r, 'RPORTB'),
    xportb: txt(r, 'XPORTB'),
    refer: txt(r, 'REFER'),
    nordext: txt(r, 'NORDEXT'),
    dblfz: txt(r, 'DBLFZ'),
    delfz: txt(r, 'DELFZ'),
    zcom_id: txt(r, 'ZCOM_ID'),
    rdealer: txt(r, 'RDEALER'),
    txn_status: txt(r, 'TXN_STATUS'),
    ztsf_deal_id: txt(r, 'ZTSF_DEAL_ID'),
    ztsf_mc_ref_no: txt(r, 'ZTSF_MC_REF_NO'),
    ndf_date: txt(r, 'NDF_DATE'),
    ndf_ref: txt(r, 'NDF_REF'),
    ndf_rate: num(r['NDF_RATE']),
    fo_remark: txt(r, 'FO_REMARK'),
    mo_remark: txt(r, 'MO_REMARK'),
    ndf_fo_rem: txt(r, 'NDF_FO_REM'),
    ndf_mo_rem: txt(r, 'NDF_MO_REM'),
    bs: txt(r, 'BS'),
    bs_1: txt(r, 'BS_1'),
    bs_2: txt(r, 'BS_2'),
    curr1: txt(r, 'CURR1'),
    amt1: num(r['AMT1']),
    curr2: txt(r, 'CURR2'),
    amt2: num(r['AMT2']),
    ospot: num(r['OSPOT']),
    oswap: num(r['OSWAP']),
    otot_rate: num(r['OTOT_RATE']),
    spot: num(r['SPOT']),
    swap: num(r['SWAP']),
    tot_rate: num(r['TOT_RATE']),
    t_rate: num(r['T_RATE']),
    cpair: txt(r, 'CPAIR'),
    zwaers: txt(r, 'ZWAERS'),
    cash_curr: txt(r, 'CASH_CURR'),
    zcash_amt: num(r['ZCASH_AMT']),
    cruser: txt(r, 'CRUSER'),
    dcrdat: txt(r, 'DCRDAT'),
    upuser: txt(r, 'UPUSER'),
    dupdat: txt(r, 'DUPDAT'),
    fi_doc: '',
    fi_gjahr: '',
  }
}

/** SELECT SINGLE zform_name FROM zsgtsftr_bs_pdf WHERE zlet_code = 'L003' (first row wins). */
export function letterFormName(rows: readonly FxRow[]): string {
  return txt(rows.find((r) => txt(r, 'ZLET_CODE') === LETTER_CODE) ?? {}, 'ZFORM_NAME')
}

/* ---------------- reads ---------------- */

const failure = <T,>(what: string, error: unknown): Loaded<T> => {
  if (isAbort(error)) throw error
  console.warn(`[ndf-settlement] ${what} unavailable`, error)
  return { state: 'error', reason: `${what} could not be read from SAP.` }
}

export async function loadCompanies(signal?: AbortSignal): Promise<Loaded<CompanyOption[]>> {
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

/**
 * GET_DATA's database part for the company codes and value dates. The view's columns are checked
 * first: without TXN_STATUS the report's deletes cannot be reproduced, so the list says WAITING FOR
 * API instead of showing deals the report would not list. FI_DOC stays empty (BKPF_WAITING).
 */
export async function loadDeals(
  c: Pick<Criteria, 'bukrs' | 'dateFrom' | 'dateTo'>,
  signal?: AbortSignal,
): Promise<Loaded<Deal[]>> {
  try {
    const missing = missingColumns(await fxColumns(FX_VIEW, signal), VIEW_REQUIRED_COLUMNS)
    if (missing.length)
      return { state: 'waiting', reason: `${WAITING_API} — ZSGTSFV_FX (middleware "${FX_VIEW}") does not serve ${missing.join(', ')}.` }
    if (!c.bukrs.length || !c.dateFrom) return { state: 'ok', value: [] }
    const rows = await fxList(FX_VIEW, viewFilter(c), { signal })
    return { state: 'ok', value: rows.map(dealFromView) }
  } catch (error) {
    return failure('ZSGTSFV_FX', error)
  }
}

/** The Adobe form name FORM PDF would call ('' when none or unreadable). */
export async function loadLetterFormName(signal?: AbortSignal): Promise<string> {
  try {
    return letterFormName(await fxList(BS_PDF, { ZLET_CODE: LETTER_CODE }, { signal }))
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[ndf-settlement] ZSGTSFTR_BS_PDF unavailable', error)
    return ''
  }
}
