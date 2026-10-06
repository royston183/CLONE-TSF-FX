/*
 * SAP data for View Spot-Forward Deals Settlement (ZSGTSFR062 / ZSGTSF_RBANKSETTLE_FX).
 *
 * Only a dependency note exists (scratchpad/bo/tracker/.../"fx bank settlement.txt"): it names
 * ZSGTSFV_FX, BKPF and ZSGTSFTR_BS_PDF with their fields, but NOT the WHERE clauses, the status
 * derivation or the in-program filters. Nothing is guessed and nothing falls back to sample data.
 *
 *   Company Code (dropdown + names)  T001 (API_COMPANYCODE_SRV / A_CompanyCode), "<code> - <name>".
 *                                    source: dependency note "fx bank settlement.txt" (ZSGTSFV_FX-BUKRS);
 *                                    WHERE not exported.
 *   Worklist                         ZSGTSFV_FX (middleware "tsfvFx") + BKPF (the two settlement
 *                                    documents by deal / currency) -> WAITING FOR API
 *   Business Partner name            BUT000 via A_BusinessPartner — only per listed row: not reached
 *   FI document (FB03)               BKPF -> no middleware resource: not reached
 *   Letters / India Settlement Docs  ZSGTSFTR_BS_PDF L006 -> Adobe Form via FP_* -> WAITING FOR ACTION API
 *   Test Run / Post (TBB1)           RFTBBB00 / TBB1 — the note says the supplied source has its posting
 *                                    blocks commented out -> WAITING FOR ACTION API
 */
import { apiFetch, service } from '@slc/api-client'
import { fxColumns, isAbort } from '../../shared/fx/mw.ts'

const companyApi = service('companycode')

export const WAITING = 'WAITING FOR API'
export const PROGRAM = 'ZSGTSF_RBANKSETTLE_FX'
export const FX_VIEW = 'tsfvFx'

/** ZSGTSFV_FX fields the dependency note lists for this program. */
// prettier-ignore
export const VIEW_REQUIRED_COLUMNS = [
  'BUKRS', 'RFHA', 'SAKTIV', 'SGSART', 'BUTXT', 'LTX', 'SFHAART', 'XTEXT', 'BP_NAME', 'RFHAZUL', 'KONTRH', 'BLOTTER_DATE',
  'PRCTR', 'PC_NAME', 'RBUSA', 'BA_NAME', 'RPORTB', 'XPORTB', 'ZUONR', 'ZUOND', 'ASSIGN_DESC', 'REFER', 'INT_REF_DESC',
  'OBJNR', 'REFNR', 'DBLFZ', 'DELFZ', 'SFGTYP', 'SANLF', 'ZWAERS', 'ZCOM_ID', 'RDEALER', 'GSPPART', 'NORDEXT', 'TXN_STATUS',
  'ZTRCODE', 'TRD_NAME', 'ZGRP', 'GRP_DESC', 'TSF_CODE', 'BLO_DESC', 'MERKM', 'V_DATE', 'NDF_DATE', 'NDF_REF',
  'EXT_STAT_DESC', 'ZSUBJECT', 'MAT_UNMAT', 'FO_REMARK', 'MO_REMARK', 'ZTSF_DEAL_DESC', 'ZTSF_DEAL_ID', 'ZTSF_MC_REF_NO',
  'ZTSF_DEAL_TYPE', 'ZTSF_EXE_CO', 'NDF_FO_REM', 'NDF_MO_REM', 'BS', 'BS_O', 'BS_1', 'BS_2', 'CURR1', 'CURR2', 'AMT1', 'AMT2',
  'CURR_ST1', 'ZAMT_ST1', 'CURR_ST2', 'ZAMT_ST2', 'OSPOT', 'OSWAP', 'OTOT_RATE', 'T_RATE', 'SPOT', 'SWAP', 'TOT_RATE',
  'NDF_RATE', 'CPAIR', 'F_CURR1', 'T_CURR1', 'ZTSF_TRFTYPE', 'ZTSF_TRFTYPE2', 'CASH_CURR', 'ZCASH_AMT', 'EMAIL_CODE',
  'DCRDAT', 'CRUSER', 'TCRTIM', 'DUPDAT', 'UPUSER', 'TUPTIM',
] as const

export const missingColumns = (have: readonly string[], need: readonly string[]): string[] => {
  const present = new Set(have.map((c) => c.toUpperCase()))
  return need.filter((c) => !present.has(c))
}

/** Always waiting: even a complete view would need the program's selection, which is not exported. */
export function worklistWaitingReason(viewColumns: readonly string[] | null): string {
  const base = `${WAITING} — ${PROGRAM} source not exported (only dependency notes); the selection on ZSGTSFV_FX and BKPF cannot be reproduced.`
  if (viewColumns === null) return `${base} ZSGTSFV_FX (middleware "${FX_VIEW}") could not be read.`
  const missing = missingColumns(viewColumns, VIEW_REQUIRED_COLUMNS)
  return missing.length ? `${base} ZSGTSFV_FX (middleware "${FX_VIEW}") also does not serve ${missing.join(', ')}.` : base
}

/** WAITING FOR ACTION API, in the brief's words. */
export const waitingAction = (what: string, apis: string): string =>
  `WAITING FOR ACTION API — ${what} (${apis}) has no API yet. Nothing was posted to SAP.`

const FORMS = 'ZSGTSFTR_BS_PDF L006 form, FP_FUNCTION_MODULE_NAME / FP_JOB_OPEN / FP_JOB_CLOSE, ZSGTSFCL_GET_BANK_SETTLE'

export const ACTION_WAITING = {
  letterPdf: waitingAction('Bank Settlement Letter PDF', FORMS),
  isdPrint: waitingAction('India Settlement Documents: Print', FORMS),
  isdPdf: waitingAction('India Settlement Documents: PDF', FORMS),
  test: waitingAction('TBB1 Test Run', 'RFTBBB00 / TBB1 in test mode — inactive in the supplied ZSGTSF_RBANKSETTLE_FX'),
  post: waitingAction('TBB1 Post', 'RFTBBB00 / TBB1 — inactive in the supplied ZSGTSF_RBANKSETTLE_FX'),
} as const

export type Option = { value: string; label: string; title: string }
export type Avail<T> = { state: 'ok'; value: T } | { state: 'error'; reason: string }

/** T001 by code, "<code> - <name>", leading zeros kept. */
export function companyOptions(rows: readonly { CompanyCode?: string; CompanyCodeName?: string }[]): Option[] {
  const seen = new Set<string>()
  return rows
    .filter((r) => r.CompanyCode && !seen.has(String(r.CompanyCode)) && !!seen.add(String(r.CompanyCode)))
    .map((r) => {
      const code = String(r.CompanyCode)
      const name = String(r.CompanyCodeName ?? '').trim()
      return { value: code, label: name ? `${code} - ${name}` : code, title: name }
    })
    .sort((a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : 0))
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
    if (isAbort(error)) throw error
    console.warn('[bank-settle-fx] T001 unavailable', error)
    return { state: 'error', reason: 'Company codes (T001) could not be read from SAP.' }
  }
}

export async function loadWorklistReason(signal?: AbortSignal): Promise<string> {
  try {
    return worklistWaitingReason(await fxColumns(FX_VIEW, signal))
  } catch (error) {
    if (isAbort(error)) throw error
    return worklistWaitingReason(null)
  }
}
