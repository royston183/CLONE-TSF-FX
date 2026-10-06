/*
 * SAP data for TSF MO Deal Confirmation - FX & Options (ZSGTSFR024). Nothing falls back to sample data.
 *
 * The ABAP source for ZSGTSFR024 was not exported (no program, no dependency note), so only the standard
 * masters whose meaning the screen's labels make unambiguous are read. Nothing else is guessed.
 *
 *   Company Code (from / to)  T001 (API_COMPANYCODE_SRV / A_CompanyCode), "<code> - <name>", leading zeros kept.
 *                             Any AUTHORITY-CHECK the program does is unknown (WAITING FOR AUTH).
 *   Trader Name               ZSGTRMTR_TRADER (middleware "trmTrader"): the trader-code master, one row per ZTCODE,
 *                             "<ZTCODE> - <ZNAME>". Unrestricted: the program's search help / WHERE is not exported.
 *   Deal queue                WAITING FOR API: which deals are in the MO queue (status values, tables, the FX vs
 *                             Options split, the blotter-date condition) is decided by the unexported program.
 *   Match & Release,          WAITING FOR ACTION API: the program's BAPIs / FMs / table updates are unknown.
 *   Correction Required
 *
 * Audit of the previous version (a teammate's): FX rows came from the FxTransaction OData service (trmfx /
 * ZFS_SB_TRMFX_O4_API) and Match & Release ran its bound `Settle` action (BAPI_FTR_FXT_SETTLE). That was a
 * substitute, not ZSGTSFR024's read: FxTransaction has no Deal ID, TXN_STATUS, trader, group, NDF, option or
 * remark fields, so it listed every FX transaction of three hard-coded company codes, guessed the MO status from
 * ActivityCategory (20/30), and posted a settlement in SAP where the program's own posting is unknown. Both are
 * removed from this screen. The FxTransaction type, dealKey, dealIdsByTransaction and sapMessage stay exported
 * (bottom of this file) only because other screens import them.
 */
import { ApiError, apiFetch, service } from '@slc/api-client'
import { txt } from '../../shared/fx/masters.ts'
import { fxList, isAbort, type FxRow } from '../../shared/fx/mw.ts'
import type { ComboOption } from './types.ts'

const companyApi = service('companycode')

export const TCODE = 'ZSGTSFR024'
export const WAITING = 'WAITING FOR API'
export const WAITING_ACTION = 'WAITING FOR ACTION API'

/** Why the deal table is empty: shown in its empty row and by Refresh. */
export const QUEUE_UNAVAILABLE =
  `${WAITING} — ABAP source for ${TCODE} not exported; the MO confirmation queue ` +
  '(which deals, statuses and tables it selects) cannot be reproduced.'

/** What an action says instead of posting. */
export const actionUnavailable = (what: string) =>
  `${WAITING_ACTION} — ${what} (ABAP source for ${TCODE} not exported; its BAPIs / FMs / table updates are unknown) ` +
  'has no API yet. Nothing was posted to SAP.'

export type Avail<T> = { state: 'ok'; value: T } | { state: 'error'; reason: string }

const byCode = (a: ComboOption, b: ComboOption) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)

/* ---------------- pure mappings (tested) ---------------- */

/** T001 by code; the option reads "<code> - <name>" with the name under the code in the list. */
export function companyOptions(rows: readonly { CompanyCode?: string; CompanyCodeName?: string }[]): ComboOption[] {
  return rows
    .filter((r) => r.CompanyCode)
    .map((r) => {
      const code = String(r.CompanyCode)
      const name = String(r.CompanyCodeName ?? '').trim()
      return { code, display: name ? `${code} - ${name}` : code, searchText: `${code} ${name}`, sub: name }
    })
    .sort(byCode)
}

/** ZSGTRMTR_TRADER: blank codes dropped, sorted, one option per ZTCODE (first kept), "<code> - <full name>". */
export function traderOptions(rows: readonly FxRow[]): ComboOption[] {
  const seen = new Set<string>()
  const out: ComboOption[] = []
  for (const r of rows) {
    const code = txt(r, 'ZTCODE')
    if (!code || seen.has(code)) continue
    seen.add(code)
    const name = txt(r, 'ZNAME') || txt(r, 'ZTRADER')
    out.push({ code, display: name ? `${code} - ${name}` : code, searchText: `${code} ${name}`, sub: '' })
  }
  return out.sort(byCode)
}

/* ---------------- reads ---------------- */

const failure = <T,>(what: string, error: unknown): Avail<T> => {
  if (isAbort(error)) throw error
  console.warn(`[mo-fx-deal-confirmation] ${what} unavailable`, error)
  return { state: 'error', reason: `${what} could not be read from SAP.` }
}

export async function loadCompanies(signal?: AbortSignal): Promise<Avail<ComboOption[]>> {
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

export async function loadTraders(signal?: AbortSignal): Promise<Avail<ComboOption[]>> {
  try {
    return { state: 'ok', value: traderOptions(await fxList('trmTrader', {}, { sort: 'ZTCODE', signal })) }
  } catch (error) {
    return failure('Traders (ZSGTRMTR_TRADER)', error)
  }
}

/* ---------------- shared with other screens (not used by ZSGTSFR024 itself) ----------------
 * fo-fx-error-correction and fo-change-deal-id import these from here; they are kept unchanged so those
 * screens keep compiling. This screen no longer reads FxTransaction (see the audit note at the top).
 */

/** What the service returns for a deal; only the fields this screen shows. */
export type FxTransaction = {
  CompanyCode: string
  FinancialTransaction: string
  ProductType?: string
  TransactionType: string
  Partner: string
  ContractDate?: string | null
  BuyCurrency?: string
  SellCurrency?: string
  LeadCurrency?: string
  FollowCurrency?: string
  BuyAmount?: number | string
  SellAmount?: number | string
  ValueDate?: string | null
  ForwardRate?: number | string
  SpotRate?: number | string
  SwapRate?: number | string
  /** '0' for a live deal; a reversed one comes back as '3' and stays in the list. */
  ActiveStatus?: string
  /** 20 once created and not yet settled; 30 after Settle (seen on a test deal). */
  ActivityCategory?: string
}

/** A deal's id on this screen. The transaction number alone repeats across company codes. */
export const dealKey = (companyCode: string, transaction: string): string => `${companyCode}-${transaction}`

/**
 * The Deal ID each SAP transaction is on, from ZSGTSFTR_DEALID: a row lists up to eight transactions
 * (ZBUKRS1/ZRFHA1 .. ZBUKRS8/ZRFHA8). Keyed like Deal.id. A cancelled Deal ID (status 30) holds nothing. A transaction
 * on more than one Deal ID shows the first one it was given (the lowest number), whatever order the rows come in.
 */
export function dealIdsByTransaction(dealRows: readonly FxRow[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const r of [...dealRows].sort((a, b) => txt(a, 'ZDEAL_ID').localeCompare(txt(b, 'ZDEAL_ID')))) {
    if (txt(r, 'ZDEAL_STAT') === '30') continue
    for (let i = 1; i <= 8; i++) {
      const bukrs = txt(r, `ZBUKRS${i}`)
      const rfha = txt(r, `ZRFHA${i}`)
      const key = dealKey(bukrs, rfha)
      if (bukrs && rfha && !out.has(key)) out.set(key, txt(r, 'ZDEAL_ID'))
    }
  }
  return out
}

/** FTR0/161 "BAPI processing was terminated" and FTR0/030 "No payment details entered" say nothing about the cause. */
const NOISE_CODES = new Set(['FTR0/161', 'FTR0/030'])

/**
 * SAP's reason for a refusal. The top-level message is usually the generic "BAPI processing was
 * terminated"; the cause is in `details`, and is not always at error severity, so codes are
 * filtered rather than severities.
 */
export function sapMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const details = (e.body as { error?: { details?: Array<{ code?: string; message?: string }> } } | null)?.error?.details
    const causes = (details ?? []).filter((x) => x.message && !NOISE_CODES.has(x.code ?? '')).map((x) => x.message as string)
    if (causes.length) return [...new Set(causes)].join(' ')
  }
  return e instanceof Error ? e.message : String(e)
}
