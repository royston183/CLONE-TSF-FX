/*
 * SAP data for ZSGTSFR092 "BO deal Rejection and return to FO" (ZSGTSF_RFXOP_BO), read as the
 * ABAP reads it. Nothing falls back to sample data (the old demo set is fixtures.ts, tests only).
 *
 *   Company Code (S_BUKRS)  CHECK_AUTHORIZATION: T001 WHERE bukrs IN s_bukrs (API_COMPANYCODE_SRV /
 *                           A_CompanyCode, "<code> - <name>"); the AUTHORITY-CHECK F_BKPF_BUK
 *                           ACTVT 02 that then drops codes has no browser source -> WAITING FOR AUTH
 *                           (every T001 code is offered and selected, nothing is refused)
 *   Upto Blotter Date       P_DATE -> blotter_date <= p_date
 *   FX / Options (P_RB1/2)  the Transaction Type switch
 *   Layout (P_LAYOUT)       ALV variant F4 (REUSE_ALV_VARIANT_F4) -> no web equivalent, not shown
 *   Status selection        GET_DATA: ZGTCATR_PARAM WHERE bukrs IN s_bukrs AND prognam =
 *                           'ZSGTSF_RDEAL_TRD_INV', row MAPID 'A' -> gv_txn_status1/2/3, gv_actvt
 *                           (middleware "catrParam")
 *   FX worklist (P_RB1)     ZSGTSFV_FX WHERE bukrs IN s_bukrs AND blotter_date <= p_date AND
 *                           txn_status IN (status1, status2, status3) AND rfhazul >= gv_actvt
 *                           (middleware "tsfvFx" -> column gate, WAITING FOR API while it lacks
 *                           BLOTTER_DATE, TXN_STATUS, ...)
 *   Options worklist (P_RB2) ZSGTSFV_OP WHERE bukrs IN s_bukrs AND blotter_date <= p_date AND
 *                           txn_status IN ('07','13') AND rfhazul >= '03' -> no middleware
 *                           resource -> WAITING FOR API
 *   RFHA hotspot (&IC1)     VTBFHAZU / VTBFHA + TB_TRANSACTION_TO_DISPLAY (SAP GUI navigation);
 *                           the page shows the row's own fields in the details popup instead
 *   Reject (REVERSE)        ZSGTRMFM_VTBFHA_EXPORT + BAPI_FTR_FXT_CHANGE / BAPI_FTR_CHANGE_FXOPTIONS
 *                           + BAPI_FTR_FXT_REVERSE / BAPI_FTR_REVERSE_FXOPTIONS + COMMIT/ROLLBACK
 *                           -> WAITING FOR ACTION API (see logic.ts rejectWaitingText)
 */
import { apiFetch, service } from '@slc/api-client'
import { txt } from '../../shared/fx/masters.ts'
import { fxColumns, fxList, isAbort, type FxRow } from '../../shared/fx/mw.ts'
import { dmyFromIso, isoFromDmy, num } from '../../shared/fx/sap.ts'
import { FX_FIELD_DEFS } from './data.ts'
import { fetchDeals, minActivity, selectedStatuses, type StatusSelection } from './logic.ts'
import type { Deal, FieldDefs, TxnType } from './types.ts'

const companyApi = service('companycode')

export const WAITING = 'WAITING FOR API'

/** The middleware resource behind ZSGTSFV_FX; ZSGTSFV_OP has none. */
export const FX_VIEW = 'tsfvFx'
export const PARAM_RESOURCE = 'catrParam'
export const PARAM_PROGRAM = 'ZSGTSF_RDEAL_TRD_INV'
export const PARAM_MAPID = 'A'

/** The ZSGTSFV_FX fields GET_DATA selects (the ALV shows all of them). */
// prettier-ignore
export const FX_SELECT_COLUMNS = [
  'BUKRS','RFHA','SAKTIV','SGSART','BUTXT','LTX','SFHAART','XTEXT','BP_NAME','RFHAZUL','KONTRH','BLOTTER_DATE','PRCTR','PC_NAME',
  'RBUSA','BA_NAME','RPORTB','XPORTB','ZUONR','ZUOND','ASSIGN_DESC','REFER','INT_REF_DESC','OBJNR','REFNR','DBLFZ','DELFZ','SFGTYP',
  'SANLF','ZWAERS','ZCOM_ID','RDEALER','GSPPART','NORDEXT','TXN_STATUS','ZTRCODE','TRD_NAME','ZGRP','GRP_DESC','TSF_CODE','BLO_DESC',
  'MERKM','V_DATE','NDF_DATE','NDF_REF','EXT_STAT_DESC','ZSUBJECT','MAT_UNMAT','FO_REMARK','MO_REMARK','ZTSF_DEAL_DESC','ZTSF_DEAL_ID',
  'ZTSF_MC_REF_NO','ZTSF_DEAL_TYPE','ZOLAM_DEAL_NO','ZTSF_TRFTYPE','ZTSF_TRFTYPE2','ZPL','ZPL_CURR','ZPL_RATE','ZPL_LAMT','ZPL_LCURR',
  'ZTSF_EXE_CO','NDF_FO_REM','NDF_MO_REM','BS','BS_O','BS_1','BS_2','CURR1','CURR2','AMT1','AMT2','CURR_ST1','ZAMT_ST1','CURR_ST2',
  'ZAMT_ST2','OSPOT','OSWAP','OTOT_RATE','T_RATE','SPOT','SWAP','TOT_RATE','NDF_RATE','CPAIR','ZSETT_PAIR','F_CURR1','T_CURR1',
  'CASH_CURR','ZCASH_AMT','EMAIL_CODE','DCRDAT','CRUSER','TCRTIM','DUPDAT','UPUSER','TUPTIM',
] as const

export const OP_WAITING = `${WAITING} — ZSGTSFV_OP (option deal view) has no middleware resource; the Options selection (bukrs IN s_bukrs, blotter_date <= p_date, txn_status IN ('07','13'), rfhazul >= '03') cannot be read.`

export type Option = { value: string; label: string; title?: string }
export type Avail<T> = { state: 'ok'; value: T } | { state: 'waiting' | 'error'; reason: string }

const sortBy = <T,>(key: (x: T) => string) => (a: T, b: T) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)

/* ---------------- pure mappings (tested) ---------------- */

/** T001 by code, shown as "<code> - <name>" (leading zeros kept). */
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

/** ABAP offset/length on a CHAR field (blank-padded). */
const sub = (s: string, off: number, len: number) => s.padEnd(off + len, ' ').substring(off, off + len)

/** A CHAR operand in an ABAP arithmetic expression: blank is 0, digits convert, anything else dumps. */
function charNum(s: string): number | null {
  const t = s.trim()
  if (t === '') return 0
  return /^\d+$/.test(t) ? Number(t) : null
}

/**
 * A computed status into ZSGTRMDT_TXN. Assumed NUMC(2) like every TXN_STATUS value ('07', '13'):
 * the absolute value, zero-padded, last two digits.
 */
const toTxn = (n: number) => String(Math.abs(Math.trunc(n))).padStart(2, '0').slice(-2)

/**
 * GET_DATA (CR GSDK931026): the first ZGTCATR_PARAM row with MAPID 'A' among the rows of
 * prognam 'ZSGTSF_RDEAL_TRD_INV' and bukrs IN s_bukrs gives
 *   gv_txn_status1 = param1+2(2) + param3+2(2) + param3+2(1)
 *   gv_txn_status2 = param3+5(2)
 *   gv_txn_status3 = param3+0(1) + param3+6(1) - param3+4(1)
 *   gv_actvt       = param3+2(1) + param3+2(1)
 * The SELECT has no ORDER BY; rows are taken in key order (BUKRS, WERKS, SNO) to be deterministic.
 * Returns null when an operand is not numeric (the ABAP would dump with CONVT_NO_NUMBER).
 */
export function statusSelection(rows: readonly FxRow[], companyCodes: readonly string[]): StatusSelection | null {
  const codes = new Set(companyCodes)
  const row = rows
    .filter((r) => txt(r, 'PROGNAM') === PARAM_PROGRAM && codes.has(txt(r, 'BUKRS')))
    .sort(sortBy((r) => `${txt(r, 'BUKRS')}|${txt(r, 'WERKS')}|${txt(r, 'SNO')}`))
    .find((r) => txt(r, 'MAPID') === PARAM_MAPID)
  if (!row) return { fx: ['', '', ''], actvt: 0, found: false }
  const p1 = String(row['PARAM1'] ?? '')
  const p3 = String(row['PARAM3'] ?? '')
  const ops = [sub(p1, 2, 2), sub(p3, 2, 2), sub(p3, 2, 1), sub(p3, 0, 1), sub(p3, 6, 1), sub(p3, 4, 1)].map(charNum)
  if (ops.some((n) => n === null)) return null
  const [a, b, c, d, e, f] = ops as number[]
  return {
    fx: [toTxn(a! + b! + c!), sub(p3, 5, 2).trim(), toTxn(d! + e! - f!)],
    actvt: c! + c!,
    found: true,
  }
}

/** One view row as a deal, keyed by the lower-case ABAP field name, typed by the field catalogue. */
export function dealFromRow(r: FxRow, defs: FieldDefs): Deal {
  const d: Deal = {}
  for (const def of defs.list) {
    const raw = r[def.key.toUpperCase()]
    if (def.type === 'date') d[def.key] = dmyFromIso(raw ?? '')
    else if (def.type === 'amt' || def.type === 'rate') d[def.key] = num(raw)
    else d[def.key] = String(raw ?? '').trim()
  }
  return d
}

/** The middleware filter for GET_DATA's FX SELECT. All T001 codes = no BUKRS filter (the rows are re-checked). */
export function fxFilter(companyCodes: readonly string[], allCodes: boolean, uptoIso: string, sel: StatusSelection): Record<string, string> {
  const f: Record<string, string> = {
    'BLOTTER_DATE[lte]': uptoIso,
    'TXN_STATUS[in]': selectedStatuses('FX', sel).join(','),
    'RFHAZUL[gte]': String(minActivity('FX', sel)).padStart(5, '0'),
  }
  if (!allCodes) f['BUKRS[in]'] = companyCodes.join(',')
  return f
}

/* ---------------- reads ---------------- */

const failure = <T,>(what: string, error: unknown): Avail<T> => {
  if (isAbort(error)) throw error
  console.warn(`[bo-deal-rejection] ${what} unavailable`, error)
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

export type Worklist = { deals: Deal[]; sel: StatusSelection }

/**
 * GET_DATA for one selection. FX: the view's columns are checked first; without BLOTTER_DATE,
 * TXN_STATUS and the other selected fields the selection cannot be reproduced, so the list says
 * WAITING FOR API instead of listing unrelated FX transactions. Options: no resource at all.
 */
export async function loadWorklist(
  type: TxnType,
  companyCodes: string[],
  allCodes: boolean,
  uptoDmy: string,
  signal?: AbortSignal,
): Promise<Avail<Worklist>> {
  const empty: StatusSelection = { fx: ['', '', ''], actvt: 0, found: false }
  if (type === 'OP') return { state: 'waiting', reason: OP_WAITING }
  try {
    const missing = missingColumns(await fxColumns(FX_VIEW, signal), FX_SELECT_COLUMNS)
    if (missing.length)
      return { state: 'waiting', reason: `${WAITING} — ZSGTSFV_FX (middleware "${FX_VIEW}") does not serve ${missing.join(', ')}.` }
  } catch (error) {
    return failure('ZSGTSFV_FX', error)
  }
  let sel: StatusSelection | null
  try {
    sel = statusSelection(await fxList(PARAM_RESOURCE, { PROGNAM: PARAM_PROGRAM }, { signal }), companyCodes)
  } catch (error) {
    return failure('ZGTCATR_PARAM', error)
  }
  if (!sel) return { state: 'error', reason: `ZGTCATR_PARAM (${PARAM_PROGRAM}, MAPID ${PARAM_MAPID}) holds non-numeric PARAM1/PARAM3 offsets; SAP would dump.` }
  if (!sel.found) return { state: 'ok', value: { deals: [], sel: empty } }
  const iso = isoFromDmy(uptoDmy)
  if (!iso) return { state: 'ok', value: { deals: [], sel } }
  try {
    const rows = await fxList(FX_VIEW, fxFilter(companyCodes, allCodes, iso, sel), { signal })
    const deals = fetchDeals(rows.map((r) => dealFromRow(r, FX_FIELD_DEFS)), 'FX', { companyCodes, uptoDate: uptoDmy, sel })
    return { state: 'ok', value: { deals, sel } }
  } catch (error) {
    return failure('ZSGTSFV_FX', error)
  }
}

