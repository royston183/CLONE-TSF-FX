/*
 * SAP data for TSF MO - Confirm NDF Fixing (ZSGTSFR026). Nothing falls back to sample data.
 *
 * ZSGTSFR026's ABAP source was not exported. Its queue and actions are taken from SAP's status master
 * ZSGTSFTR_TXNSTAT (type 01), which names exactly this step — no status is invented here:
 *   10 FO: NDF Fixing - pending MO confirmation   } the MO queue
 *   12 FO: NDF Fixing Corrected                   }
 *   13 MO: Confirm NDF Fixing      SAP action "Fixing Settlement" -> Match & Release
 *   11 MO: NDF Fixing Correction Req  SAP action "Change Fixing"  -> Correction Required
 *
 *   Company Code (from / to)  T001 (API_COMPANYCODE_SRV / A_CompanyCode). Any AUTHORITY-CHECK the program does is
 *                             unknown (WAITING FOR AUTH).
 *   Trader Name               ZSGTRMTR_TRADER (middleware "trmTrader"), "<ZTCODE> - <ZNAME>".
 *   NDF deal queue            TSF append (TrmFxApp OData) in 10 / 12, joined to the FTR deal (FxTransaction OData);
 *                             names, NDF date / ref and references from ZSGTSFV_FX; Accounting from VTBFHAPO.
 *                             See shared/fx/ndf.ts.
 *   Match & Release           FxTransaction Settle (BAPI_FTR_FXT_SETTLE), then TrmFxApp TXN_STATUS 13 + NDF_MO_REM.
 *   Correction Required       TrmFxApp TXN_STATUS 11 + NDF_MO_REM.
 *   NDF Value                 ZCASH_AMT is written by BAPI_FTR_FXT_NDF_FIXING, which has no API (see UA1), so no
 *                             service carries it and it shows 0.
 */
import { apiFetch, service } from '@slc/api-client'
import { txt } from '../../shared/fx/masters.ts'
import { fxList, isAbort, type FxRow } from '../../shared/fx/mw.ts'
import {
  dealKey,
  loadNdfQueue,
  loadPostedDeals,
  loadTxnStatusTexts,
  sapMessage,
  settleTransaction,
  statusLabel,
  updateTsfAppend,
  type NdfRecord,
} from '../../shared/fx/ndf.ts'
import { dmyFromIso } from '../../shared/fx/sap.ts'
import { MO_QUEUE, MO_REMARK_MAX, STATUS_CONFIRMED, STATUS_CORRECTION } from './data.ts'
import type { DropdownItem, NdfDeal } from './types.ts'

const companyApi = service('companycode')

export const TCODE = 'ZSGTSFR026'

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

/** One queued deal as a grid row. */
export function dealFromRecord(
  r: NdfRecord,
  traderNames: Readonly<Record<string, string>>,
  statusTexts: Readonly<Record<string, string>>,
  posted: ReadonlySet<string>,
): NdfDeal {
  return {
    id: dealKey(r),
    transaction: r.rfha,
    coCode: r.bukrs,
    busArea: r.businessArea,
    tradeDate: dmyFromIso(r.contractDate),
    tsfEntity: r.tsfEntity,
    txnTypeDesc: r.txnTypeDesc,
    partnerName: r.partnerName,
    partnerCode: r.partner,
    buySell2: r.side === 'Buy' ? 'Sell' : 'Buy',
    currency2: r.c2,
    amount2: r.amt2,
    currency1: r.c1,
    amount1: r.amt1,
    allInRate: r.fwd,
    txnStatus: statusLabel(r.txnStatus, statusTexts),
    statusCode: r.txnStatus,
    fixingDate: dmyFromIso(r.fixingDate),
    // ZCASH_AMT: FxTransaction.CashSettlementAmount once the service serves it (docs/abap/ZFS_SD_TRMFX-NdfSettlement.md).
    ndfValue: r.cashAmount ?? 0,
    valueDate: dmyFromIso(r.valueDate),
    dealId: r.dealId,
    mcReference: r.mcReference,
    businessArea: r.businessArea,
    trader: traderNames[r.traderCode] ?? r.traderCode,
    traderCode: r.traderCode,
    accounting: posted.has(dealKey(r)) ? 'Posted' : 'Not Posted',
    externalRef: r.externalRef,
    internalRef: r.internalRef,
    foRemark: r.foRemark,
    moRemark: r.moRemark,
    record: r,
  }
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

/** The MO queue (TXN_STATUS 10 / 12), as grid rows. */
export async function loadQueue(traders: readonly DropdownItem[], signal?: AbortSignal): Promise<Avail<NdfDeal[]>> {
  try {
    const [records, statusTexts] = await Promise.all([loadNdfQueue(MO_QUEUE, signal), loadTxnStatusTexts(signal)])
    const posted = await loadPostedDeals(records, signal)
    const names = Object.fromEntries(traders.map((t) => [t.code ?? '', t.primary.replace(/^[^-]*-s*/, '')]))
    return { state: 'ok', value: records.map((r) => dealFromRecord(r, names, statusTexts, posted)) }
  } catch (error) {
    return failure('NDF deals (TrmFxApp / FxTransaction)', error)
  }
}

/* ---------------- actions ---------------- */

export type ActionResult = { ok: true; message: string } | { ok: false; message: string }

const remark = (text: string) => text.trim().slice(0, MO_REMARK_MAX)

/**
 * Match & Release: settle the deal in FTR first, then record the TSF status. A settlement SAP refuses
 * changes nothing; a status write that fails after a successful settlement is reported as such, so the
 * user knows FTR and the TSF status disagree.
 */
export async function matchAndRelease(deal: NdfDeal, remarks: string): Promise<ActionResult> {
  try {
    await settleTransaction(deal.record)
  } catch (error) {
    return { ok: false, message: `SAP did not settle transaction ${deal.transaction}: ${sapMessage(error)}` }
  }
  try {
    await updateTsfAppend(deal.record, { TxnStatus: STATUS_CONFIRMED, NdfMoRem: remark(remarks) })
  } catch (error) {
    return {
      ok: false,
      message: `Transaction ${deal.transaction} was settled in SAP, but its TSF status could not be set to ${STATUS_CONFIRMED}: ${sapMessage(error)}`,
    }
  }
  return { ok: true, message: `NDF fixing of transaction ${deal.transaction} confirmed and settled (status ${STATUS_CONFIRMED}).` }
}

/** Correction Required: back to FO (TXN_STATUS 11) with the MO remark. */
export async function sendForCorrection(deal: NdfDeal, remarks: string): Promise<ActionResult> {
  try {
    await updateTsfAppend(deal.record, { TxnStatus: STATUS_CORRECTION, NdfMoRem: remark(remarks) })
    return { ok: true, message: `Transaction ${deal.transaction} sent back to FO for correction (status ${STATUS_CORRECTION}).` }
  } catch (error) {
    return { ok: false, message: `Transaction ${deal.transaction} was not sent back: ${sapMessage(error)}` }
  }
}
