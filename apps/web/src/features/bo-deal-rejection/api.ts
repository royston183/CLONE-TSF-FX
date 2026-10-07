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
 *                           txn_status IN (status1, status2, status3) AND rfhazul >= gv_actvt.
 *                           The view ("tsfvFx") lacks BLOTTER_DATE, TXN_STATUS and the VTBFHA append
 *                           fields, so the worklist is read from ZSGTSFTR_APP_STR (TrmFxApp:
 *                           TxnStatus IN (...) AND BlotterDate <= p_date AND CompanyCode) joined by
 *                           CompanyCode + FinancialTransaction to SAP's FxTransaction, whose
 *                           ActivityCategory is RFHAZUL (rfhazul >= gv_actvt is applied to it in
 *                           fetchDeals). Columns that exist in neither service stay blank, never
 *                           invented: profit centre, business area, trader name, group, blotter code,
 *                           references (ZUONR, ZUOND, REFER, REFNR), the FO / MO remark of the deal
 *                           (only the NDF and option remarks exist), valuation / fixing dates and
 *                           rates, P&L, cash settlement, e-mail code, audit stamps.
 *   Options worklist (P_RB2) ZSGTSFV_OP WHERE bukrs IN s_bukrs AND blotter_date <= p_date AND
 *                           txn_status IN ('07','13') AND rfhazul >= '03' -> no middleware
 *                           resource -> WAITING FOR API
 *   RFHA hotspot (&IC1)     VTBFHAZU / VTBFHA + TB_TRANSACTION_TO_DISPLAY (SAP GUI navigation);
 *                           the page shows the row's own fields in the details popup instead
 *   Reject (REVERSE)        ZSGTRMFM_VTBFHA_EXPORT + BAPI_FTR_FXT_CHANGE / BAPI_FTR_CHANGE_FXOPTIONS
 *                           + BAPI_FTR_FXT_REVERSE / BAPI_FTR_REVERSE_FXOPTIONS + COMMIT/ROLLBACK
 *                           -> WAITING FOR ACTION API (see logic.ts rejectWaitingText)
 */
import { apiFetch, odataString, service } from '@slc/api-client'
import { allOf, loadFxWithApp, statusFilter, type FxWithApp } from '../../shared/fx/app-str.ts'
import { txt } from '../../shared/fx/masters.ts'
import { fxList, isAbort, type FxRow } from '../../shared/fx/mw.ts'
import { dmyFromIso, isoFromDmy, num } from '../../shared/fx/sap.ts'
import { fxTxnStatusLabel } from '../../shared/fx/txn-status.ts'
import { loadNames, NO_NAMES, type Names } from '../mo-confirm-ndf-fixing/api.ts'
import { FX_FIELD_DEFS } from './data.ts'
import { fetchDeals, minActivity, selectedStatuses, type StatusSelection } from './logic.ts'
import type { Deal, FieldDefs, TxnType } from './types.ts'

const companyApi = service('companycode')

export const WAITING = 'WAITING FOR API'

export const PARAM_RESOURCE = 'catrParam'
export const PARAM_PROGRAM = 'ZSGTSF_RDEAL_TRD_INV'
export const PARAM_MAPID = 'A'

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

/** TrmFxApp's BlotterDate is an Edm.Date: an unquoted yyyy-mm-dd literal. */
const BLOTTER_LITERAL = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET_DATA's FX SELECT as a TrmFxApp filter: TxnStatus IN (...) AND BlotterDate <= p_date AND the company
 * codes. All T001 codes = no CompanyCode filter (the joined rows are re-checked by fetchDeals).
 * rfhazul >= gv_actvt is not a TrmFxApp field; it is applied to the transaction's ActivityCategory.
 */
export function appFilter(companyCodes: readonly string[], allCodes: boolean, uptoIso: string, sel: StatusSelection): string {
  const codes = allCodes ? '' : companyCodes.map((c) => `CompanyCode eq ${odataString(c)}`).join(' or ')
  return allOf(
    statusFilter(selectedStatuses('FX', sel)),
    BLOTTER_LITERAL.test(uptoIso) ? `BlotterDate le ${uptoIso}` : '',
    codes,
  )
}

/** The ABAP boolean: X when set. */
const flag = (v: boolean | null | undefined) => (v ? 'X' : '')

/**
 * One TrmFxApp row joined to its FxTransaction as a worklist deal (keyed by the ABAP field name of
 * ZSGTSFV_FX). Leg 1 is the lead currency, as on the other FX screens; a sell leg carries a negative
 * amount. A field neither service carries is left out (blank in the list), never invented.
 */
export function dealFromFxApp({ fx, app }: FxWithApp, names: Names = NO_NAMES, defs: FieldDefs = FX_FIELD_DEFS): Deal {
  const lead = fx.LeadCurrency || fx.BuyCurrency || ''
  const follow = fx.FollowCurrency || fx.SellCurrency || ''
  const buysLead = fx.BuyCurrency === lead
  const amt = (v: number | string | undefined, negative: boolean) => (negative ? -Math.abs(num(v)) : Math.abs(num(v)))
  const status = (app.TxnStatus ?? '').trim()
  const label = fxTxnStatusLabel(status)
  const typeName = names.txnTypes.get(`${fx.ProductType ?? ''}/${fx.TransactionType}`)
  const row: Record<string, string | number | null | undefined> = {
    BUKRS: fx.CompanyCode,
    RFHA: fx.FinancialTransaction,
    SGSART: fx.ProductType,
    SFHAART: fx.TransactionType,
    XTEXT: typeName,
    KONTRH: fx.Partner,
    BP_NAME: names.partners.get(fx.Partner),
    RPORTB: (fx as { Portfolio?: string }).Portfolio,
    SAKTIV: fx.ActiveStatus,
    RFHAZUL: fx.ActivityCategory ? String(fx.ActivityCategory).padStart(5, '0') : '',
    DBLFZ: fx.ContractDate,
    DELFZ: fx.ValueDate,
    BS_1: buysLead ? 'Buy' : 'Sell',
    CURR1: lead,
    AMT1: amt(buysLead ? fx.BuyAmount : fx.SellAmount, !buysLead),
    CURR2: follow,
    AMT2: amt(buysLead ? fx.SellAmount : fx.BuyAmount, buysLead),
    SPOT: fx.SpotRate,
    SWAP: fx.SwapRate,
    T_RATE: fx.ForwardRate,
    TXN_STATUS: status,
    EXT_STAT_DESC: label === status ? '' : label,
    BLOTTER_DATE: app.BlotterDate,
    ZTRCODE: app.Ztrcode,
    ZTSF_DEAL_ID: app.ZtsfDealID,
    ZTSF_DEAL_DESC: app.ZtsfDealDesc,
    ZTSF_MC_REF_NO: app.ZtsfMcRefNo,
    ZTSF_DEAL_TYPE: app.ZtsfDealType,
    ZOLAM_DEAL_NO: app.ZolamDealNo,
    ZTSF_TRFTYPE: app.ZtsfTrftype,
    ZTSF_TRFTYPE2: app.ZtsfTrftype2,
    ZTSF_EXE_CO: flag(app.ZtsfExeCo),
    NDF_FO_REM: app.NdfFoRem,
    NDF_MO_REM: app.NdfMoRem,
  }
  return dealFromRow(row as FxRow, defs)
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
 * GET_DATA for one selection. FX: the status selection from ZGTCATR_PARAM, then the TrmFxApp rows with
 * those statuses up to the blotter date, each joined to its FxTransaction. Options: no resource at all.
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
    const joined = await loadFxWithApp(appFilter(companyCodes, allCodes, iso, sel), signal)
    const names = await loadNames(joined.map((j) => j.fx), signal)
    const deals = fetchDeals(joined.map((j) => dealFromFxApp(j, names)), 'FX', { companyCodes, uptoDate: uptoDmy, sel })
    return { state: 'ok', value: { deals, sel } }
  } catch (error) {
    return failure('ZSGTSFTR_APP_STR / FxTransaction', error)
  }
}
