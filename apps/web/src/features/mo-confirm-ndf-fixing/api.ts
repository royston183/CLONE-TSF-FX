/*
 * SAP data for TSF MO - Confirm NDF Fixing (ZSGTSFR026). Nothing falls back to sample data.
 *
 * The ABAP source for ZSGTSFR026 was not exported (no program, no dependency note), so only the standard
 * masters whose meaning the screen's labels make unambiguous are read. Nothing else is guessed.
 *
 *   Company Code (from / to)  T001 (API_COMPANYCODE_SRV / A_CompanyCode): code as the value, name as the
 *                             second line, "<code> - <name>" when searching. Any AUTHORITY-CHECK is unknown
 *                             (WAITING FOR AUTH).
 *   Trader Name               ZSGTRMTR_TRADER (middleware "trmTrader"): the trader-code master, one row per
 *                             ZTCODE, "<ZTCODE> - <ZNAME>". Unrestricted: the program's search help is not exported.
 *   NDF deal list             WAITING FOR API. For context only: UA1 NDF Fixing (ZSGTSFR050, ZSGTSF_RFX_NDF_FIX)
 *                             fixes deals with TXN_STATUS '07' and, after BAPI_FTR_FXT_NDF_FIXING, sets the
 *                             VTBFHA custom field TXN_STATUS to '10' via ZSGTRMFM_VTBFHA_EXPORT
 *                             (INCLUDE ZSGTSF_RFX_NDF_FIX_STATUS_9O01, FORM around line 151). That program does not
 *                             say which statuses ZSGTSFR026 selects or sets, so no selection is built from it.
 *   Match & Release,          WAITING FOR ACTION API: the program's BAPIs / FMs / table updates are unknown.
 *   Correction Required
 *
 * Fixing reference text (FTRT_FIX_DEF_T) and partner names (A_BusinessPartner) would name fields of the deal
 * rows; with no rows to name they are not read.
 */
import { apiFetch, service } from '@slc/api-client'
import { txt } from '../../shared/fx/masters.ts'
import { fxList, isAbort, type FxRow } from '../../shared/fx/mw.ts'
import type { DropdownItem } from './types.ts'

const companyApi = service('companycode')

export const TCODE = 'ZSGTSFR026'
export const WAITING = 'WAITING FOR API'
export const WAITING_ACTION = 'WAITING FOR ACTION API'

/** Why the deal list is empty: shown in the table's empty state and by Refresh. */
export const LIST_UNAVAILABLE =
  `${WAITING} — ABAP source for ${TCODE} not exported; the NDF fixing confirmation list ` +
  '(which deals, statuses and tables it selects) cannot be reproduced.'

/** What an action says instead of posting. */
export const actionUnavailable = (what: string) =>
  `${WAITING_ACTION} — ${what} (ABAP source for ${TCODE} not exported; its BAPIs / FMs / table updates are unknown) ` +
  'has no API yet. Nothing was posted to SAP.'

export type Avail<T> = { state: 'ok'; value: T } | { state: 'error'; reason: string }

const sortBy = <T,>(key: (x: T) => string) => (a: T, b: T) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)

/* ---------------- pure mappings (tested) ---------------- */

/**
 * T001 by code. The screen stores the picked item's primary text as the company code, so the code stays
 * the primary line (leading zeros kept) and the name is the second line; both are searched.
 */
export function companyItems(rows: readonly { CompanyCode?: string; CompanyCodeName?: string }[]): DropdownItem[] {
  return rows
    .filter((r) => r.CompanyCode)
    .map((r) => {
      const code = String(r.CompanyCode)
      const name = String(r.CompanyCodeName ?? '').trim()
      return name ? { primary: code, secondary: name, code } : { primary: code, code }
    })
    .sort(sortBy((o) => o.primary))
}

/** ZSGTRMTR_TRADER: blank codes dropped, sorted, one item per ZTCODE (first kept), "<code> - <full name>". */
export function traderItems(rows: readonly FxRow[]): DropdownItem[] {
  const seen = new Set<string>()
  const out: DropdownItem[] = []
  for (const r of rows) {
    const code = txt(r, 'ZTCODE')
    if (!code || seen.has(code)) continue
    seen.add(code)
    const name = txt(r, 'ZNAME') || txt(r, 'ZTRADER')
    out.push({ primary: name ? `${code} - ${name}` : code, code })
  }
  return out.sort(sortBy((o) => o.code ?? ''))
}

/* ---------------- reads ---------------- */

const failure = <T,>(what: string, error: unknown): Avail<T> => {
  if (isAbort(error)) throw error
  console.warn(`[mo-confirm-ndf-fixing] ${what} unavailable`, error)
  return { state: 'error', reason: `${what} could not be read from SAP.` }
}

export async function loadCompanies(signal?: AbortSignal): Promise<Avail<DropdownItem[]>> {
  try {
    const params = new URLSearchParams({ $select: 'CompanyCode,CompanyCodeName', $top: '5000', $format: 'json' })
    const v2 = await apiFetch<{ d?: { results?: { CompanyCode?: string; CompanyCodeName?: string }[] } }>(
      `${companyApi('A_CompanyCode')}?${params.toString()}`,
      signal ? { signal } : undefined,
    )
    return { state: 'ok', value: companyItems(v2?.d?.results ?? []) }
  } catch (error) {
    return failure('Company codes (T001)', error)
  }
}

export async function loadTraders(signal?: AbortSignal): Promise<Avail<DropdownItem[]>> {
  try {
    return { state: 'ok', value: traderItems(await fxList('trmTrader', {}, { sort: 'ZTCODE', signal })) }
  } catch (error) {
    return failure('Traders (ZSGTRMTR_TRADER)', error)
  }
}
