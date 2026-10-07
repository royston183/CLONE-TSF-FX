/*
 * SAP data for AE1: TSF FO Error Correction – NDF Fixing (ZSGTSF_RFX_NDF_FIX_FO), read as that
 * program reads it. Its own rules, not normal NDF Fixing's (ZSGTSF_RFX_NDF_FIX):
 *
 *   Company Code (S_BUKRS)  a range over VTBFHA-BUKRS; F4 = T001 (API_COMPANYCODE_SRV / A_CompanyCode).
 *                           This program runs no AUTHORITY-CHECK, so no company is withheld.
 *   Worklist                FORM get_data: ZSGTSFV_FX WHERE bukrs IN s_bukrs AND txn_status = '11'
 *                           AND ndf_date = p_date; then DELETE WHERE sgsart+2(1) <> 'D'.
 *                           No SAKTIV condition here. The legacy view has no TXN_STATUS, so:
 *                             txn_status = '11'   TrmFxApp.TxnStatus eq '11' (service "trmfxapp")
 *                             sgsart+2(1) = 'D'   FxTransaction.ProductType 3rd character (service "fx")
 *                             ndf_date = p_date   NDF_DATE of the middleware view "tsfvFx", which does
 *                                                 serve NDF_DATE / NDF_REF / BUTXT / BP_NAME
 *                           Trader name: ZSGTRMTR_TRD_GRP via TrmFxApp.Ztrcode. Status text: TXN_STATUS
 *                           description. STILL WAITING FOR API: NDF_RATE (the Old Fixing Rate) — in
 *                           neither TrmFxApp, FxTransaction nor the view; it shows WAITING FOR API.
 *   9001 reference text     FTRT_FIX_DEF_T fix_id -> fix_id_text      (middleware "ftrtFixDefT")
 *   9001 old rate           GV_O_RATE = the row's NDF_RATE; GV_N_RATE starts blank.
 *   9001 settlement         FORM cash_settelment with CHECK_RATE — but this program never selects
 *                           TCURF, so the rate is never scaled.
 */
import { apiFetch, service } from '@slc/api-client'
import { txt } from '../../shared/fx/masters.ts'
import { fxList, isAbort, type FxRow } from '../../shared/fx/mw.ts'
import { dmyFromIso, num } from '../../shared/fx/sap.ts'
import { appKey, joinFxWithApp, listTrmFxApp, loadFxFor, statusFilter, type FxWithApp } from '../../shared/fx/app-str.ts'
import { fxTxnStatusLabel } from '../../shared/fx/txn-status.ts'
import type { NdfRow } from './types.ts'

const companyApi = service('companycode')

export const WAITING = 'WAITING FOR API'
/** The middleware resource behind ZSGTSFV_FX: still the source of NDF_DATE / NDF_REF / BUTXT / BP_NAME. */
export const FX_VIEW = 'tsfvFx'

/** GET_DATA's input status, and the status a correction moves the transaction to. */
export const TXN_STATUS_TO_CORRECT = '11'
export const TXN_STATUS_CORRECTED = '12'

export type Option = { value: string; label: string; title?: string }
export type Avail<T> = { state: 'ok'; value: T } | { state: 'waiting' | 'error'; reason: string }

const isoOf = (dmy: string) => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dmy.trim())
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}

/* ---------------- pure mappings (tested) ---------------- */

/** GET_DATA's NDF-only delete on the joined rows: sgsart+2(1) = 'D'. TXN_STATUS 11 is already in the TrmFxApp filter. */
export function eligible(rows: readonly FxWithApp[]): FxWithApp[] {
  return rows.filter(({ fx, app }) => app.TxnStatus === TXN_STATUS_TO_CORRECT && (fx.ProductType ?? '').charAt(2) === 'D')
}

const n = (v: unknown): number => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

/**
 * One queue row from SAP's transaction, its TrmFxApp row and its ZSGTSFV_FX row (NDF_DATE, NDF_REF, names).
 * Leg 1 is SAP's lead currency; amounts are signed like the old view (bought leg +, sold leg -). The settlement
 * currency is the following currency (SAP's FollowCurrency), so the formula divides the lead leg's amount.
 * oldRate is null: NDF_RATE is served by no API.
 */
export function rowFromApp(
  { fx, app }: FxWithApp,
  view: FxRow,
  refTexts: Readonly<Record<string, string>>,
  traderNames: Readonly<Record<string, string>> = {},
): NdfRow {
  const curr1 = fx.LeadCurrency || fx.BuyCurrency || ''
  const curr2 = fx.FollowCurrency || fx.SellCurrency || ''
  const buysLead = fx.BuyCurrency === curr1
  const fixRef = txt(view, 'NDF_REF')
  const code = app.Ztrcode ?? ''
  const status = app.TxnStatus ?? ''
  return {
    rfha: fx.FinancialTransaction,
    bukrs: fx.CompanyCode,
    company: txt(view, 'BUTXT'),
    product: fx.ProductType ?? '',
    pair: `${curr1}/${curr2}`,
    side: buysLead ? 'Buy' : 'Sell',
    amt1: buysLead ? n(fx.BuyAmount) : -n(fx.SellAmount),
    curr1,
    amt2: buysLead ? -n(fx.SellAmount) : n(fx.BuyAmount),
    curr2,
    fixDate: dmyFromIso(txt(view, 'NDF_DATE')),
    fixRef,
    fixRefName: refTexts[fixRef] ?? '',
    oldRate: null,
    trader: traderNames[code] ?? '',
    partner: txt(view, 'BP_NAME'),
    status,
    statusText: fxTxnStatusLabel(status),
    foreignFirst: curr1 === curr2,
    settleCurr: curr2,
  }
}

export function companyOptions(rows: readonly { CompanyCode?: string; CompanyCodeName?: string }[]): Option[] {
  return rows
    .filter((r) => r.CompanyCode)
    .map((r) => {
      const code = String(r.CompanyCode)
      const name = String(r.CompanyCodeName ?? '').trim()
      return { value: code, label: name ? `${code} - ${name}` : code, title: name }
    })
    .sort((a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : 0))
}

/* ---------------- reads ---------------- */

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
    console.warn('[ndf-fix-ec] T001 unavailable', error)
    return { state: 'error', reason: 'Company codes could not be read from SAP.' }
  }
}

/** FTRT_FIX_DEF_T: SELECT SINGLE by fix_id with no language condition, so the first text wins. */
export async function loadFixingReferences(signal?: AbortSignal): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  try {
    for (const r of await fxList('ftrtFixDefT', {}, { signal })) {
      const id = txt(r, 'FIX_ID')
      if (id && !(id in out)) out[id] = txt(r, 'FIX_ID_TEXT')
    }
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[ndf-fix-ec] FTRT_FIX_DEF_T unavailable', error)
  }
  return out
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
    console.warn('[ndf-fix-ec] trader names unavailable', error)
  }
  return out
}

/**
 * GET_DATA for one NDF Fixing Date: TrmFxApp rows in TXN_STATUS 11 joined with FxTransaction, kept when the
 * middleware view has the deal with NDF_DATE = the date. Old Fixing Rate (NDF_RATE) stays WAITING FOR API.
 */
export async function loadWorklist(ndfDateDmy: string, refTexts: Readonly<Record<string, string>>, signal?: AbortSignal): Promise<Avail<NdfRow[]>> {
  try {
    const iso = isoOf(ndfDateDmy)
    if (!iso) return { state: 'ok', value: [] }
    const apps = await listTrmFxApp(statusFilter([TXN_STATUS_TO_CORRECT]), signal)
    if (!apps.length) return { state: 'ok', value: [] }
    const [fxRows, viewRows, names] = await Promise.all([
      loadFxFor(apps, signal),
      fxList(FX_VIEW, { NDF_DATE: iso }, { signal }),
      loadTraderNames(signal),
    ])
    const viewByKey = new Map<string, FxRow>()
    for (const v of viewRows) {
      const key = appKey(txt(v, 'BUKRS'), txt(v, 'RFHA'))
      if (!viewByKey.has(key)) viewByKey.set(key, v)
    }
    const rows: NdfRow[] = []
    for (const joined of eligible(joinFxWithApp(apps, fxRows))) {
      const view = viewByKey.get(appKey(joined.fx.CompanyCode, joined.fx.FinancialTransaction))
      if (view) rows.push(rowFromApp(joined, view, refTexts, names))
    }
    return { state: 'ok', value: rows }
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[ndf-fix-ec] TrmFxApp / FxTransaction unavailable', error)
    return { state: 'error', reason: 'The NDF transactions could not be read from SAP.' }
  }
}
