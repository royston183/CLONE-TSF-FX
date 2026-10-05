import { ApiError, apiFetch, entityPath, list, odataString, service } from '@slc/api-client'
import { txt } from '../../shared/fx/masters.ts'
import { fxList, type FxRow } from '../../shared/fx/mw.ts'
import { COMPANY_CODES, COMPANY_INFO, SAP_TXN_DESC, STATUS } from './data.ts'
import type { Deal } from './types.ts'

/**
 * The FX half of the MO confirmation queue, from the FxTransaction OData service
 * (ZFS_SB_TRMFX_O4_API). Match & Release runs its bound `Settle` action, which calls
 * BAPI_FTR_FXT_SETTLE; nothing else the original program does is exposed by that service:
 *
 *   - BAPI_FTR_FXT_CHANGE (the external reference / post-custom-update) has no action, and the
 *     entity has no field for an external reference, internal reference or remark;
 *   - "Correction Required" is a status this screen keeps itself — SAP has no field for it.
 *
 * The Options half stays on its own dummy rows: the options BAPIs are not part of this service.
 */
const fxApi = service('fx')
const FX = fxApi('FxTransaction')
const SETTLE = 'com.sap.gateway.srvd_a2x.zfs_sd_trmfx.v0001.Settle'

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

const ACTIVE_REVERSED = '3'
const CATEGORY_SETTLED = '30'

const n = (v: unknown): number => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

const parseDay = (v: string | null | undefined): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v ?? '')
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}

/** A deal's id on this screen. The transaction number alone repeats across company codes. */
export const dealKey = (companyCode: string, transaction: string): string => `${companyCode}-${transaction}`

/**
 * An FxTransaction as a queue row, or null for a reversed deal or one without dates. Leg 1 is
 * the lead currency, as in the blotter; a sell leg carries a negative amount, as the screen's
 * rows always have. Fields the service does not carry are left blank rather than invented: the
 * trader, accounting, assignment, fixing reference and the two remarks. The fixing date is the
 * value date (the service has no fixing date).
 */
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

export function toDeal(d: FxTransaction, dealIds: ReadonlyMap<string, string> = new Map()): Deal | null {
  if (d.ActiveStatus === ACTIVE_REVERSED) return null
  const tradeDate = parseDay(d.ContractDate)
  const valueDate = parseDay(d.ValueDate)
  if (!tradeDate || !valueDate) return null

  const lead = d.LeadCurrency || d.BuyCurrency || ''
  const follow = d.FollowCurrency || d.SellCurrency || ''
  const buysLead = d.BuyCurrency === lead
  const leadAmt = n(buysLead ? d.BuyAmount : d.SellAmount)
  const followAmt = n(buysLead ? d.SellAmount : d.BuyAmount)
  const info = COMPANY_INFO[d.CompanyCode]
  const desc = SAP_TXN_DESC[d.TransactionType]
  return {
    id: dealKey(d.CompanyCode, d.FinancialTransaction),
    dealId: dealIds.get(dealKey(d.CompanyCode, d.FinancialTransaction)) ?? '',
    dealType: 'FX',
    coCode: d.CompanyCode,
    transaction: d.FinancialTransaction,
    partnerCode: d.Partner,
    partnerName: d.Partner,
    txnTypeCode: d.TransactionType,
    txnTypeDesc: desc ? `${d.TransactionType} - ${desc}` : d.TransactionType,
    tradeDate,
    buySell1: buysLead ? 'Buy' : 'Sell',
    currency1: lead,
    amount1: buysLead ? leadAmt : -leadAmt,
    buySell2: buysLead ? 'Sell' : 'Buy',
    currency2: follow,
    amount2: buysLead ? -followAmt : followAmt,
    fixingDate: valueDate,
    valueDate,
    allInRate: n(d.ForwardRate),
    status: d.ActivityCategory === CATEGORY_SETTLED ? STATUS.MATCHED : STATUS.UNMATCHED,
    traderCode: '',
    traderName: '',
    traderShort: '',
    groupDesc: info?.group ?? '',
    companyName: info?.companyName ?? '',
    profitCenterDesc: info?.profitCenter ?? '',
    businessAreaDesc: info?.businessArea ?? '',
    accounting: '',
    assignment: '',
    fixRefId: '',
    foRemark: '',
    moRemark: '',
    live: true,
  }
}

/** The FX deals of the screen's company codes. The service cannot filter on dates, so the screen does. */
export async function loadFxDeals(signal?: AbortSignal): Promise<Deal[]> {
  const filter = COMPANY_CODES.map((c) => `CompanyCode eq ${odataString(c)}`).join(' or ')
  const [rows, dealRows] = await Promise.all([
    list<FxTransaction>(FX, { filter, top: 1000 }, signal ? { signal } : undefined),
    fxList('tsfDealId', {}, { sort: '-ZDEAL_ID', signal }),
  ])
  const dealIds = dealIdsByTransaction(dealRows)
  return rows.map((d) => toDeal(d, dealIds)).filter((d): d is Deal => d !== null)
}

/** Settles one deal in SAP (BAPI_FTR_FXT_SETTLE through the bound Settle action). */
export async function settleFxDeal(companyCode: string, transaction: string): Promise<void> {
  const key = entityPath('FxTransaction', { CompanyCode: companyCode, FinancialTransaction: transaction })
  await apiFetch(`${fxApi(key)}/${SETTLE}`, { method: 'POST', body: {} })
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

export type SettleOutcome = { settled: string[]; failed?: { id: string; reason: string } }

/**
 * Settles the deals in order and stops at the first SAP refusal: each settlement is its own SAP
 * commit, so the ones already done stay done and the rest are not attempted.
 */
export async function settleFxDeals(deals: readonly Deal[]): Promise<SettleOutcome> {
  const settled: string[] = []
  for (const d of deals) {
    try {
      await settleFxDeal(d.coCode, d.transaction)
      settled.push(d.id)
    } catch (e) {
      return { settled, failed: { id: d.id, reason: sapMessage(e) } }
    }
  }
  return { settled }
}
