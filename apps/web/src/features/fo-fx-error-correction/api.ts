import { apiFetch, entityPath, list, odataString, service } from '@slc/api-client'
import { txt } from '../../shared/fx/masters.ts'
import { fxList, isAbort, type FxRow } from '../../shared/fx/mw.ts'
import { FX_TXN_STATUS, blotterStageOf } from '../../shared/fx/txn-status.ts'
import { appKey, listTrmFxApp, type TrmFxApp } from '../../shared/fx/app-str.ts'
import { createAppStrRecord, getAppStrRecord, updateAppStrRecord } from '../fx-blotter/appStr.ts'
import { dealKey, dealIdsByTransaction, sapMessage, type FxTransaction } from '../mo-fx-deal-confirmation/api.ts'
import { STATUS } from './data.ts'
import { parseAmountShorthand, parseRate, safeParseDate } from './format.ts'
import type { CorrectionForm, Txn } from './types.ts'

/**
 * The FX half of EC2, from the FxTransaction OData service (ZFS_SB_TRMFX_O4_API) and the masters around it.
 *
 * What SAP can do here, and what it cannot:
 *
 *   Reverse   DELETE FxTransaction = BAPI_FTR_FXT_REVERSE (reason 04).
 *   Correct   PATCH FxTransaction = BAPI_FTR_FXT_DEALCHANGE: rates, bought amount, value date and trade date (ContractDate).
 *             SAP calculates the opposite amount; it is never sent.
 *
 * What the service has no field for, and the screen therefore shows blank and read-only instead of inventing:
 * the MO remark,
 * mode of trade, account category, business area and profit center of the transaction.
 * Blotter date, trader and audit data come from APP_STR; blotter date edits are saved there.
 * The Deal ID and Master Contract come from ZSGTSFTR_DEALID; the names from the TRM and
 * business-partner masters. Options are not part of this service and stay out.
 */
export { sapMessage }

const fxApi = service('fx')
const FX = fxApi('FxTransaction')
const masterApi = service('trmmaster')
const partnerApi = service('businesspartner')

const ACTIVE_REVERSED = '3'

type V2<T> = { d?: { results?: T[] } }
type V4<T> = { value?: T[] }

const n = (v: unknown): number => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

const parseDay = (v: string | null | undefined): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v ?? '')
  return m ? safeParseDate(`${m[3]}-${m[2]}-${m[1]}`) : null
}

/** A date as the service takes it: YYYY-MM-DD from the pickers' DD-MM-YYYY. */
const isoDay = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** A field SAP may not serve yet: null (shown blank) when absent, never 0. */
const servedNumber = (v: number | string | null | undefined): number | null => (v === undefined || v === null || v === '' ? null : n(v))

/** The names the queue shows, each looked up once. Any map may be empty: the code then stands in for its name. */
export type Names = {
  /** Company code -> its row in ZSGTSFTR_COMP. */
  companies: ReadonlyMap<string, { name: string; entity: string }>
  productTypes: ReadonlyMap<string, string>
  /** Keyed product type + transaction type, as a transaction type is only unique within its product type. */
  transactionTypes: ReadonlyMap<string, string>
  partners: ReadonlyMap<string, string>
}

export const EMPTY_NAMES: Names = { companies: new Map(), productTypes: new Map(), transactionTypes: new Map(), partners: new Map() }

export const txnTypeKey = (productType: string, transactionType: string) => `${productType}/${transactionType}`

/** The company codes of the TSF entities, with the name and entity short code the queue shows. */
export function companiesOf(rows: readonly FxRow[]): Map<string, { name: string; entity: string }> {
  const out = new Map<string, { name: string; entity: string }>()
  for (const r of rows) {
    const code = txt(r, 'ZBUKRS')
    if (code && !out.has(code)) out.set(code, { name: txt(r, 'ZBUTXT'), entity: txt(r, 'ZCOM_ID') })
  }
  return out
}

/** The Deal ID row of each transaction (Deal ID, its description, its Master Contract), keyed like dealKey. */
export function dealInfoByTransaction(dealRows: readonly FxRow[]): Map<string, { dealId: string; desc: string; mc: string }> {
  const ids = dealIdsByTransaction(dealRows)
  const rowOf = new Map(dealRows.map((r) => [txt(r, 'ZDEAL_ID'), r]))
  const out = new Map<string, { dealId: string; desc: string; mc: string }>()
  for (const [key, dealId] of ids) {
    const r = rowOf.get(dealId)
    out.set(key, { dealId, desc: r ? txt(r, 'ZDEAL_DESC') : '', mc: r ? txt(r, 'ZMC_REF') : '' })
  }
  return out
}

/**
 * The status a row shows, from TXN_STATUS in ZSGTSFTR_APP_STR. 04 (MO sent it back, as the MO deal confirmation
 * screen writes it) is Correction Required, the one this screen exists for; 02 / 05 are Reversed; 06 and the
 * statuses past the FO desk are Released to MO. A blank, 00, 01 or 08 status, or no record at all (rows from
 * before the table was filled), stays Open. SAP reporting the transaction reversed always wins.
 */
export function statusOf(activeStatus: string | undefined, txnStatus: string | null | undefined) {
  if (activeStatus === ACTIVE_REVERSED) return STATUS.REVERSED
  const code = (txnStatus ?? '').trim()
  if (code === FX_TXN_STATUS.MO_TO_FO_CORRECTION) return STATUS.ERRCORR
  if (code === FX_TXN_STATUS.CORRECTED) return STATUS.RESUB
  const stage = blotterStageOf(code)
  if (stage === 'REVERSED') return STATUS.REVERSED
  if (stage === 'RELEASED') return STATUS.RESUB
  return STATUS.OPEN
}

/**
 * An FxTransaction as a queue row. A reversed one stays (read-only, "Reversed"); anything without dates is dropped.
 * Leg 1 is the lead currency; Amount 1 and 2 are shown unsigned.
 */
export function toTxn(
  d: FxTransaction,
  deals: ReadonlyMap<string, { dealId: string; desc: string; mc: string }>,
  names: Names,
  txnStatuses: ReadonlyMap<string, string> = new Map(),
  appRows: ReadonlyMap<string, TrmFxApp> = new Map(),
): Txn | null {
  const tradeDate = parseDay(d.ContractDate)
  const valueDate = parseDay(d.ValueDate)
  if (!tradeDate || !valueDate) return null

  const lead = d.LeadCurrency || d.BuyCurrency || ''
  const follow = d.FollowCurrency || d.SellCurrency || ''
  const buysLead = d.BuyCurrency === lead
  const leadAmt = n(buysLead ? d.BuyAmount : d.SellAmount)
  const followAmt = n(buysLead ? d.SellAmount : d.BuyAmount)
  const company = names.companies.get(d.CompanyCode)
  const deal = deals.get(dealKey(d.CompanyCode, d.FinancialTransaction))
  const productType = d.ProductType ?? ''
  const app = appRows.get(appKey(d.CompanyCode, d.FinancialTransaction))
  return {
    rfha: d.FinancialTransaction,
    dealId: deal?.dealId ?? '',
    dealIdDesc: deal?.desc ?? '',
    mc: deal?.mc ?? '',
    coCode: d.CompanyCode,
    companyName: company?.name ?? '',
    tsfEntity: company?.entity ?? '',
    prodType: productType,
    prodTypeDesc: names.productTypes.get(productType) ?? '',
    txnType: d.TransactionType,
    txnTypeDesc: names.transactionTypes.get(txnTypeKey(productType, d.TransactionType)) ?? '',
    partnerCode: d.Partner,
    partnerName: names.partners.get(d.Partner) ?? '',
    buySell1: buysLead ? 'Buy' : 'Sell',
    ccy1: lead,
    amt1: leadAmt,
    buySell2: buysLead ? 'Sell' : 'Buy',
    ccy2: follow,
    amt2: followAmt,
    spotRate: n(d.SpotRate),
    swapRate: n(d.SwapRate),
    allInRate: n(d.ForwardRate),
    tradeDate,
    valueDate,
    blotterDate: parseDay(app?.BlotterDate),
    busArea: '',
    busAreaDesc: '',
    profitCenter: '',
    profitCenterDesc: '',
    traderCode: app?.Ztrcode?.trim() ?? '',
    traderName: '',
    modeOfTrade: '',
    acctCat: '',
    status: statusOf(d.ActiveStatus, app?.TxnStatus ?? txnStatuses.get(appKey(d.CompanyCode, d.FinancialTransaction))),
    moRemark: app?.Remark?.trim() || app?.NdfMoRem?.trim() || app?.OptMoRem?.trim() || '',
    ndfRate: servedNumber(d.NdfFixingRate),
    cashAmount: servedNumber(d.CashSettlementAmount),
    cashCurrency: d.CashSettlementCurrency?.trim() ?? '',
    changedBy: app?.LocalLastChangedBy?.trim() ?? '',
    changedOn: parseDay(app?.LocalLastChangedAt),
    live: true,
    buysLead,
  }
}

/** The names, read from the masters. A master that cannot be read leaves its codes unnamed; it never stops the queue. */
export async function loadNames(rows: readonly FxTransaction[], companies: Map<string, { name: string; entity: string }>, signal?: AbortSignal): Promise<Names> {
  const opts = signal ? { signal } : undefined
  const productTypes = new Map<string, string>()
  const transactionTypes = new Map<string, string>()
  const partners = new Map<string, string>()
  const types = [...new Set(rows.map((r) => r.ProductType ?? '').filter(Boolean))]
  const bps = [...new Set(rows.map((r) => r.Partner).filter(Boolean))]
  const typeFilter = types.map((t) => `ProductType eq ${odataString(t)}`).join(' or ')
  const soft = async (what: string, run: () => Promise<void>) => {
    try {
      await run()
    } catch (error) {
      if (isAbort(error)) throw error
      console.warn(`[ec2] ${what} unavailable`, error)
    }
  }
  await Promise.all([
    soft('product type names', async () => {
      if (!types.length) return
      const v4 = await apiFetch<V4<{ ProductType?: string; ProductTypeName?: string }>>(
        `${masterApi('ProductType')}?${new URLSearchParams({ $filter: typeFilter })}`,
        opts,
      )
      for (const p of v4?.value ?? []) if (p.ProductType) productTypes.set(p.ProductType, (p.ProductTypeName ?? '').trim())
    }),
    soft('transaction type names', async () => {
      if (!types.length) return
      const v4 = await apiFetch<V4<{ ProductType?: string; TransactionType?: string; TransactionTypeName?: string }>>(
        `${masterApi('TransactionType')}?${new URLSearchParams({ $filter: typeFilter })}`,
        opts,
      )
      for (const t of v4?.value ?? [])
        if (t.TransactionType) transactionTypes.set(txnTypeKey(t.ProductType ?? '', t.TransactionType), (t.TransactionTypeName ?? '').trim())
    }),
    soft('partner names', async () => {
      if (!bps.length) return
      const filter = bps.map((b) => `BusinessPartner eq ${odataString(b)}`).join(' or ')
      const v2 = await apiFetch<V2<{ BusinessPartner?: string; BusinessPartnerFullName?: string }>>(
        `${partnerApi('A_BusinessPartner')}?${new URLSearchParams({ $filter: filter, $select: 'BusinessPartner,BusinessPartnerFullName', $format: 'json' })}`,
        opts,
      )
      for (const p of v2?.d?.results ?? []) if (p.BusinessPartner) partners.set(p.BusinessPartner, (p.BusinessPartnerFullName ?? '').trim())
    }),
  ])
  return { companies, productTypes, transactionTypes, partners }
}

/** TXN_STATUS of each transaction that has an APP_STR record. Never stops the queue: without it every row is Open. */
export async function loadTxnStatuses(companyCodes: readonly string[], signal?: AbortSignal): Promise<Map<string, string>> {
  const rows = await loadApplicationData(companyCodes, signal)
  return new Map([...rows].flatMap(([key, r]) => r.TxnStatus?.trim() ? [[key, r.TxnStatus.trim()]] : []))
}

/** Keep the whole APP_STR record, so dates and remarks are not discarded when reading status. */
async function loadApplicationData(companyCodes: readonly string[], signal?: AbortSignal): Promise<Map<string, TrmFxApp>> {
  const out = new Map<string, TrmFxApp>()
  try {
    const filter = companyCodes.map((c) => `CompanyCode eq ${odataString(c)}`).join(' or ')
    for (const r of await listTrmFxApp(filter, signal)) out.set(appKey(r.CompanyCode, r.FinancialTransaction), r)
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[ec2] transaction application data unavailable', error)
  }
  return out
}

/** Every FX transaction of the TSF entities, reversed ones included, with its Deal ID, Master Contract and names. */
export async function loadQueue(signal?: AbortSignal): Promise<Txn[]> {
  const opts = signal ? { signal } : undefined
  const [compRows, dealRows] = await Promise.all([fxList('comp', {}, { signal }), fxList('tsfDealId', {}, { sort: '-ZDEAL_ID', signal })])
  const companies = companiesOf(compRows)
  if (!companies.size) throw new Error('No TSF company code (ZSGTSFTR_COMP) was returned, so there is nothing to list.')
  const filter = [...companies.keys()].map((c) => `CompanyCode eq ${odataString(c)}`).join(' or ')
  const rows = await list<FxTransaction>(FX, { filter, top: 1000 }, opts)
  const [names, appRows] = await Promise.all([loadNames(rows, companies, signal), loadApplicationData([...companies.keys()], signal)])
  const deals = dealInfoByTransaction(dealRows)
  return rows.map((d) => toTxn(d, deals, names, undefined, appRows)).filter((t): t is Txn => t !== null)
}

/**
 * The PATCH body for a correction: only changed fields, in the service's own names. Nothing for the
 * amount sold (SAP derives it) or fields without a save path. BuyAmount maps to the
 * appropriate lead/follow field. BlotterDate is routed separately to APP_STR by correctTxn.
 */
export function toCorrectionPatch(old: Txn, form: CorrectionForm): Record<string, string | number> {
  const patch: Record<string, string | number> = {}
  const rate = (text: string, was: number, key: string) => {
    const v = parseRate(text)
    if (Number.isFinite(v) && v > 0 && v !== Number(was.toFixed(4))) patch[key] = v
  }
  rate(form.allInRate, old.allInRate, 'ForwardRate')
  rate(form.spotRate, old.spotRate, 'SpotRate')
  // A swap rate may be 0, so it is not held to > 0.
  const swap = parseRate(form.swapRate)
  if (Number.isFinite(swap) && swap !== Number(old.swapRate.toFixed(4))) patch.SwapRate = swap
  const amount = parseAmountShorthand(old.buysLead ? form.amount1 : form.amount2)
  if (amount > 0 && amount !== (old.buysLead ? old.amt1 : old.amt2)) patch.BuyAmount = amount
  const value = safeParseDate(form.valueDate)
  if (value && isoDay(value) !== isoDay(old.valueDate)) patch.ValueDate = isoDay(value)
  const trade = safeParseDate(form.tradeDate)
  if (trade && isoDay(trade) !== isoDay(old.tradeDate)) patch.ContractDate = isoDay(trade)
  const blotter = safeParseDate(form.blotterDate)
  if (blotter && (!old.blotterDate || isoDay(blotter) !== isoDay(old.blotterDate))) patch.BlotterDate = isoDay(blotter)
  return patch
}

/** A human line for what a patch changes, for the confirmation toast. */
export const patchLabels: Record<string, string> = {
  ForwardRate: 'All in Rate',
  SpotRate: 'Spot Rate',
  SwapRate: 'Swap Rate',
  BuyAmount: 'Amount 1',
  ValueDate: 'Value Date',
  ContractDate: 'Trade Date',
  BlotterDate: 'Blotter Date',
}

const keyOf = (t: Pick<Txn, 'coCode' | 'rfha'>) => fxApi(entityPath('FxTransaction', { CompanyCode: t.coCode, FinancialTransaction: t.rfha }))

/** Changes one transaction in SAP (BAPI_FTR_FXT_DEALCHANGE through PATCH). */
export async function correctTxn(t: Txn, patch: Record<string, string | number>): Promise<void> {
  const { BlotterDate, ...fxPatch } = patch
  const hasFxChanges = Object.keys(fxPatch).length > 0
  if (hasFxChanges) await apiFetch(keyOf(t), { method: 'PATCH', body: fxPatch })
  if (typeof BlotterDate === 'string') {
    try {
      const existing = await getAppStrRecord(t.coCode, t.rfha)
      const fields = { BlotterDate }
      if (existing) await updateAppStrRecord(t.coCode, t.rfha, fields)
      else await createAppStrRecord(t.coCode, t.rfha, fields)
    } catch (error) {
      throw new Error(`${hasFxChanges ? 'Transaction changes were saved, but Blotter Date was not saved.' : 'Blotter Date was not saved.'} ${sapMessage(error)} Retry Update to save the date.`)
    }
  }
}

/** Reverses one transaction in SAP (BAPI_FTR_FXT_REVERSE through DELETE). */
export async function reverseTxn(t: Txn): Promise<void> {
  await apiFetch(keyOf(t), { method: 'DELETE' })
}

export type ReverseOutcome = { reversed: string[]; failed?: { rfha: string; reason: string } }

/** Reverses in order and stops at the first SAP refusal: each reversal is its own SAP commit, so the earlier ones stay done. */
export async function reverseTxns(ts: readonly Txn[]): Promise<ReverseOutcome> {
  const reversed: string[] = []
  for (const t of ts) {
    try {
      await reverseTxn(t)
      reversed.push(t.rfha)
    } catch (e) {
      return { reversed, failed: { rfha: t.rfha, reason: sapMessage(e) } }
    }
  }
  return { reversed }
}
