/*
 * SAP data for MO: Bank Settlement: FX Non-Flow Deals (ZSGTSFR104 / ZSGTSF_RNFX_DEALFLOW).
 *
 * Only a dependency note exists for this program (scratchpad/bo/tracker/.../"nfx deal flow.txt"):
 * it names the tables, fields and BAPIs but NOT the WHERE clauses, status ranges or in-program
 * filters. So nothing that depends on a selection is guessed. Nothing falls back to sample data.
 *
 *   Company Code (chips / names)  T001 (API_COMPANYCODE_SRV / A_CompanyCode), "<code> - <name>".
 *                                 source: dependency note "nfx deal flow.txt" (T001-BUKRS); WHERE not
 *                                 exported. AUTHORITY-CHECK per company code -> WAITING FOR AUTH.
 *   Worklist                      ZSGTSFV_FX (middleware "tsfvFx") + ZSGTSFTR_RULE_BT ZNO_INV /
 *                                 ZSGTSFTR_MAS_CON / ZSGTSFTR_DEALID (No-Invoice models) + TVARVC
 *                                 (allowed transaction types) + BKPF (settlement documents)
 *                                 -> WAITING FOR API (source not exported; view also lacks columns)
 *                                 TrmFxApp (shared/fx/app-str.ts) now supplies the view's missing VTBFHA append columns (Deal ID, MC ref,
 *                                 TXN_STATUS, ...), but the selection itself is still not exported, so the list stays WAITING.
 *   House bank / account (9002)   T012 / T012K / T012T, ZSGTSFTR_COMP ZCOM_ID -> ZBUKRS
 *                                 -> WAITING FOR API: no middleware resource for T012 / T012K / T012T
 *   Transfer type                 VTBFHA-ZTSF_TRFTYPE / ZTSF_TRFTYPE2 -> not served (no VTBFHA resource)
 *   Settlement document           BKPF -> no middleware resource
 *
 * Writes: none directly. Bank assignment, test run and post all go through BAPIs / reports
 * (see ACTION_WAITING), so they validate, then say WAITING FOR ACTION API and change nothing.
 */
import { apiFetch, service } from '@slc/api-client'
import { fxColumns, isAbort } from '../../shared/fx/mw.ts'

const companyApi = service('companycode')

export const WAITING = 'WAITING FOR API'
export const PROGRAM = 'ZSGTSF_RNFX_DEALFLOW'

/** The middleware resource behind ZSGTSFV_FX. */
export const FX_VIEW = 'tsfvFx'

/** ZSGTSFV_FX fields the dependency note lists for this program. */
// prettier-ignore
export const VIEW_REQUIRED_COLUMNS = [
  'RFHA', 'BUKRS', 'BUTXT', 'SGSART', 'LTX', 'RFHAZUL', 'KONTRH', 'SAKTIV', 'ZCOM_ID', 'BP_NAME', 'SFHAART', 'XTEXT',
  'PRCTR', 'PC_NAME', 'RBUSA', 'BA_NAME', 'DBLFZ', 'ZWAERS', 'BLOTTER_DATE', 'TXN_STATUS', 'ZTRCODE', 'TRD_NAME', 'ZGRP',
  'GRP_DESC', 'TSF_CODE', 'BLO_DESC', 'RPORTB', 'XPORTB', 'REFER', 'INT_REF_DESC', 'ZUOND', 'ASSIGN_DESC', 'MERKM',
  'ZTSF_DEAL_ID', 'ZTSF_DEAL_DESC', 'ZTSF_MC_REF_NO', 'ZTSF_DEAL_TYPE', 'ZTSF_EXE_CO', 'FO_REMARK', 'MO_REMARK', 'DELFZ',
  'CURR1', 'CURR2', 'OTOT_RATE', 'RDEALER', 'GSPPART', 'NORDEXT', 'BS_1', 'BS_2', 'AMT1', 'AMT2', 'CPAIR', 'F_CURR1',
  'T_CURR1', 'EMAIL_CODE', 'MAT_UNMAT', 'EXT_STAT_DESC', 'NDF_DATE', 'NDF_REF', 'ZCASH_AMT', 'NDF_RATE', 'CASH_CURR',
] as const

export const missingColumns = (have: readonly string[], need: readonly string[]): string[] => {
  const present = new Set(have.map((c) => c.toUpperCase()))
  return need.filter((c) => !present.has(c))
}

/**
 * ZSGTSFV_FX columns that are not in the view but ARE served by TrmFxApp (ZSGTSFTR_APP_STR, shared/fx/app-str.ts):
 * Deal ID / description / type, MC reference, execution flag, TXN_STATUS, trader code, blotter date, NDF remarks and
 * transfer types. They no longer count as missing.
 */
// prettier-ignore
export const APP_SERVED_COLUMNS = [
  'ZTSF_DEAL_ID', 'ZTSF_DEAL_DESC', 'ZTSF_MC_REF_NO', 'ZTSF_DEAL_TYPE', 'ZTSF_EXE_CO', 'TXN_STATUS', 'ZTRCODE', 'BLOTTER_DATE',
  'NDF_FO_REM', 'NDF_MO_REM', 'ZTSF_TRFTYPE', 'ZTSF_TRFTYPE2',
] as const

/** View columns missing from the view and from TrmFxApp: the ones that genuinely have no source. */
export const unservedColumns = (have: readonly string[], need: readonly string[]): string[] => {
  const app = new Set<string>(APP_SERVED_COLUMNS)
  return missingColumns(have, need).filter((c) => !app.has(c))
}

/**
 * Why the worklist cannot be listed. Always waiting: even a complete view would need the
 * program's selection (status / no-invoice / TVARVC conditions), which is not exported.
 */
export function worklistWaitingReason(viewColumns: readonly string[] | null): string {
  const base = `${WAITING} — ${PROGRAM} source not exported (only dependency notes); the selection on ZSGTSFV_FX, ZSGTSFTR_RULE_BT, ZSGTSFTR_MAS_CON, ZSGTSFTR_DEALID, TVARVC and BKPF cannot be reproduced.`
  if (viewColumns === null) return `${base} ZSGTSFV_FX (middleware "${FX_VIEW}") could not be read.`
  const missing = unservedColumns(viewColumns, VIEW_REQUIRED_COLUMNS)
  return missing.length ? `${base} ZSGTSFV_FX (middleware "${FX_VIEW}") also does not serve ${missing.join(', ')}, and TrmFxApp does not have them either.` : base
}

export const HOUSE_BANK_WAITING = `${WAITING} — T012 / T012K / T012T (house banks and accounts) have no middleware resource; the account help cannot be listed.`

export const TRANSFER_TYPE_WAITING = `${WAITING} — VTBFHA-ZTSF_TRFTYPE has no middleware resource.`

export const AUTH_NOTE = 'WAITING FOR AUTH — the per-company-code authorization processing (T001) has no browser source; nothing is refused.'

/** WAITING FOR ACTION API, in the brief's words. */
export const waitingAction = (what: string, apis: string): string =>
  `WAITING FOR ACTION API — ${what} (${apis}) has no API yet. Nothing was posted to SAP.`

/** The BAPIs / reports the dependency note lists, by screen action. */
export const ACTION_WAITING = {
  bank: waitingAction(
    'Assign House Bank & Acc ID',
    'BAPI_FTR_PAYDET_GETLIST, BAPI_FTR_PAYDET_CREATE, ZSGTRMFM_VTBFHA_EXPORT + BAPI_FTR_FXT_CHANGE, BAPI_TRANSACTION_COMMIT / _ROLLBACK',
  ),
  test: waitingAction('TBB1 Test Run', 'RFTBBB00 / TBB1 in test mode'),
  post: waitingAction('TBB1 Post', 'RFTBBB00 / TBB1, BAPI_TRANSACTION_COMMIT'),
} as const

export type Option = { value: string; label: string; title: string }
export type Avail<T> = { state: 'ok'; value: T } | { state: 'waiting' | 'error'; reason: string }

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
    console.warn('[nfx-dealflow] T001 unavailable', error)
    return { state: 'error', reason: 'Company codes (T001) could not be read from SAP.' }
  }
}

/** The worklist: always a reason, never rows (see the header). */
export async function loadWorklistReason(signal?: AbortSignal): Promise<string> {
  try {
    return worklistWaitingReason(await fxColumns(FX_VIEW, signal))
  } catch (error) {
    if (isAbort(error)) throw error
    return worklistWaitingReason(null)
  }
}
