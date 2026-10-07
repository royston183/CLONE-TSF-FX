/*
 * SAP data for AE1: TSF FO Error Correction – NDF Fixing (ZSGTSF_RFX_NDF_FIX_FO), read as that
 * program reads it. Its own rules, not normal NDF Fixing's (ZSGTSF_RFX_NDF_FIX):
 *
 *   Company Code (S_BUKRS)  a range over VTBFHA-BUKRS; F4 = T001 (API_COMPANYCODE_SRV / A_CompanyCode).
 *                           This program runs no AUTHORITY-CHECK, so no company is withheld.
 *   Worklist                FORM get_data: TXN_STATUS = '11' ("MO: NDF Fixing Correction Req") AND
 *                           ndf_date = p_date; then DELETE WHERE sgsart+2(1) <> 'D'. Read from the TSF
 *                           append (TrmFxApp OData) joined to the FTR deal (FxTransaction OData) — see
 *                           shared/fx/ndf.ts. The NDF date is NDF_DATE, or the value date without one.
 *   9001 reference text     FTRT_FIX_DEF_T fix_id -> fix_id_text      (middleware "ftrtFixDefT")
 *   9001 old rate           GV_O_RATE = the row's NDF_RATE. The fixing rate is written by
 *                           BAPI_FTR_FXT_NDF_FIXING, which no service exposes, so none is shown (0).
 *   9001 settlement         FORM cash_settelment; the following currency is FxTransaction.FollowCurrency.
 *   9001 Update             correctNdfFixing: reverse the old fixing (BAPI_FTR_FXT_REVERSE), NdfFixing with the new
 *                           rate, then TXN_STATUS 12. Enabled only once ZFS_SD_TRMFX
 *                           declares NdfFixing (fixNdfAvailable in shared/fx/ndf.ts).
 */
import { apiFetch, service } from '@slc/api-client'
import { txt } from '../../shared/fx/masters.ts'
import { fxList, isAbort } from '../../shared/fx/mw.ts'
import { TXN, loadNdfQueue, loadTxnStatusTexts, type NdfRecord } from '../../shared/fx/ndf.ts'
import { dmyFromIso } from '../../shared/fx/sap.ts'
import type { NdfRow } from './types.ts'

const companyApi = service('companycode')

/** GET_DATA's input status, and the status a correction moves the transaction to. */
export const TXN_STATUS_TO_CORRECT = TXN.CORRECTION_REQUIRED
export const TXN_STATUS_CORRECTED = TXN.CORRECTED

export type Option = { value: string; label: string; title?: string }
export type Avail<T> = { state: 'ok'; value: T } | { state: 'error'; reason: string }

/* ---------------- pure mappings (tested) ---------------- */

/**
 * One queued deal as a grid row. CURR1 is SAP's lead currency and CURR2 the following one, so the
 * settlement currency is CURR2 and the formula divides the CURR2 leg (ZSGTRMFM_LEAD_CURR_S).
 */
export function rowFromRecord(
  r: NdfRecord,
  refTexts: Readonly<Record<string, string>>,
  statusTexts: Readonly<Record<string, string>>,
  traderNames: Readonly<Record<string, string>> = {},
): NdfRow {
  return {
    rfha: r.rfha,
    bukrs: r.bukrs,
    company: r.companyName,
    product: r.productType,
    pair: `${r.c1}/${r.c2}`,
    side: r.side,
    amt1: r.amt1,
    curr1: r.c1,
    amt2: r.amt2,
    curr2: r.c2,
    fixDate: dmyFromIso(r.fixingDate),
    fixRef: r.ndfRef,
    fixRefName: refTexts[r.ndfRef] ?? '',
    // GV_O_RATE = NDF_RATE: FxTransaction.NdfFixingRate once the service serves it.
    oldRate: r.fixingRate ?? 0,
    trader: traderNames[r.traderCode] ?? r.traderCode,
    partner: r.partnerName,
    status: r.txnStatus,
    statusText: statusTexts[r.txnStatus] ?? '',
    foreignFirst: false,
    settleCurr: r.c2,
    moRemark: r.moRemark,
    foRemark: r.foRemark,
    etag: r.etag,
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

/** ZSGTRMTR_TRD_GRP code -> trader name, for the Trader column (TRD_NAME). */
async function loadTraderNames(signal?: AbortSignal): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  try {
    for (const r of await fxList('trdGrp', {}, { signal })) {
      const code = txt(r, 'ZTCODE')
      if (code && !(code in out)) out[code] = txt(r, 'ZTRADER')
    }
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[ndf-fix-ec] ZSGTRMTR_TRD_GRP unavailable', error)
  }
  return out
}

/** GET_DATA: every NDF deal MO sent back for correction (TXN_STATUS 11). The NDF date filters on screen. */
export async function loadWorklist(refTexts: Readonly<Record<string, string>>, signal?: AbortSignal): Promise<Avail<NdfRow[]>> {
  try {
    const [records, statusTexts, traders] = await Promise.all([
      loadNdfQueue([TXN_STATUS_TO_CORRECT], signal),
      loadTxnStatusTexts(signal),
      loadTraderNames(signal),
    ])
    return { state: 'ok', value: records.map((r) => rowFromRecord(r, refTexts, statusTexts, traders)) }
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[ndf-fix-ec] NDF queue unavailable', error)
    return { state: 'error', reason: 'The NDF transactions (TrmFxApp / FxTransaction) could not be read from SAP.' }
  }
}
