/**
 * gt_top rebuilt from the modern sources (FORM deal_detals).
 *
 * The report read ZSGTSFCDS_FX / ZSGTSFCDS_OPTION WHERE ztsf_deal_id = deal AND saktiv <> 3. Those
 * views carried ZTSF_DEAL_ID / ZTSF_DEAL_TYPE / ZTSF_MC_REF_NO / TXN_STATUS from VTBFHA append
 * fields; they now live in ZSGTSFTR_APP_STR (entity TrmFxApp of service "trmfxapp"). The standard
 * FxTransaction supplies the amounts and dates. The two are joined on CompanyCode + FinancialTransaction
 * (BUKRS + RFHA), never on RFHA alone.
 *
 * READ ONLY. APP_STR is a join source for this program: nothing here, or anywhere else in this
 * feature, writes TXN_STATUS, ZTSF_DEAL_ID, ZTSF_DEAL_TYPE or ZTSF_MC_REF_NO, and no Treasury
 * transaction is changed. TXN_STATUS is carried through only because the roll-over numbering
 * (rollDealTypes) and the grid read it.
 *
 * Options: no standard Option OData service is configured (config/services.json), so an option
 * model's legs cannot be read; loadDealTransactions says so instead of showing an incomplete grid.
 */
import { list, odataString, service } from '@tsfx/ref/api-client'
import { dmyFromIso, num } from '../../shared/fx/sap.ts'
import type { FxRow as ViewRow } from '../../shared/fx/mw.ts'
import { loadNdfViews, ndfExtras, ndfKey, viewsByKey } from '../../shared/fx/ndf-columns.ts'
import type { FxRow } from './types.ts'

const APP = service('trmfxapp')('TrmFxApp')
const FX = service('fx')('FxTransaction')

/** Keys per request: one `(CompanyCode eq .. and FinancialTransaction eq ..)` per transaction. */
const CHUNK = 25

export const OPTION_SERVICE_MISSING =
  'WAITING FOR API — the option deals of an FX2 model need a standard Option OData service (ZSGTSFCDS_OPTION replacement); none is configured.'

/** The TrmFxApp fields this program reads. */
export type AppStrEntity = {
  CompanyCode: string
  FinancialTransaction: string
  ZtsfDealID?: string | null
  ZtsfDealType?: string | null
  ZtsfMcRefNo?: string | null
  TxnStatus?: string | null
}

/** The FxTransaction fields this program reads. */
export type FxTxnEntity = {
  CompanyCode: string
  FinancialTransaction: string
  Partner?: string
  ContractDate?: string | null
  ValueDate?: string | null
  BuyCurrency?: string
  SellCurrency?: string
  LeadCurrency?: string
  FollowCurrency?: string
  BuyAmount?: number | string
  SellAmount?: number | string
  SpotRate?: number | string
  SwapRate?: number | string
  ForwardRate?: number | string
  /** '3' once reversed (SAKTIV = 3). */
  ActiveStatus?: string
  ProductType?: string
  /** Served once ZFS_SD_TRMFX declares them (docs/abap/ZFS_SD_TRMFX-NdfSettlement.md). */
  NdfFixingRate?: number | string
  CashSettlementAmount?: number | string
  CashSettlementCurrency?: string
}

/** BUKRS + RFHA as one key. */
export const txnKey = (companyCode: string, transaction: string): string => `${companyCode}::${transaction}`

const clean = (v: string | null | undefined): string => (v ?? '').trim()

/**
 * One merged gt_top row. Leg 1 is the lead currency and a sell leg carries a negative amount (the
 * convention of the MO confirmation screen, which keeps CURR1 / AMT1 / CURR2 / AMT2 comparable with
 * the CDS view). A reversed transaction (SAKTIV = 3) is not a row.
 */
export function mergedRow(app: AppStrEntity, t: FxTxnEntity, entityOf: (companyCode: string) => string = () => '', view?: ViewRow): FxRow | null {
  if (t.ActiveStatus === '3') return null
  const ndf = ndfExtras(t, undefined, view)
  const lead = t.LeadCurrency || t.BuyCurrency || ''
  const follow = t.FollowCurrency || t.SellCurrency || ''
  const buysLead = t.BuyCurrency === lead
  const leadAmt = num(buysLead ? t.BuyAmount : t.SellAmount)
  const followAmt = num(buysLead ? t.SellAmount : t.BuyAmount)
  const total = num(t.ForwardRate) || num(t.SpotRate) + num(t.SwapRate)
  return {
    dealType: clean(app.ZtsfDealType),
    roll: '',
    bukrs: t.CompanyCode,
    bp: t.Partner ?? '',
    partner: t.Partner ?? '',
    rfha: t.FinancialTransaction,
    start: dmyFromIso(t.ContractDate),
    end: dmyFromIso(t.ValueDate),
    entity: entityOf(t.CompanyCode),
    pc1: '',
    bs1: buysLead ? 'Buy' : 'Sell',
    curr1: lead,
    amt1: buysLead ? leadAmt : -leadAmt,
    bs2: buysLead ? 'Sell' : 'Buy',
    pc2: '',
    curr2: follow,
    amt2: buysLead ? -followAmt : followAmt,
    allIn: total,
    strike: 0,
    preAmt: 0,
    mc: clean(app.ZtsfMcRefNo),
    txn: clean(app.TxnStatus),
    ndfDate: dmyFromIso(ndf.ndfDate),
    ndfRef: ndf.ndfRef,
    ndfRate: ndf.ndfRate ?? '',
    cashAmt: ndf.cashAmount ?? '',
    cashCurr: ndf.cashCurrency,
  }
}

/**
 * APP_STR rows joined to FX transactions on BUKRS + RFHA. A row without a transaction (reversed, or
 * not served) adds nothing, and the same RFHA under another company code stays a distinct transaction.
 */
export function mergeDealTransactions(
  links: readonly AppStrEntity[],
  txns: readonly FxTxnEntity[],
  entityOf?: (companyCode: string) => string,
  views: readonly ViewRow[] = [],
): FxRow[] {
  const viewBy = viewsByKey(views)
  const byKey = new Map(txns.map((t) => [txnKey(t.CompanyCode, t.FinancialTransaction), t]))
  const rows: FxRow[] = []
  for (const link of links) {
    const t = byKey.get(txnKey(link.CompanyCode, link.FinancialTransaction))
    const row = t ? mergedRow(link, t, entityOf, viewBy.get(ndfKey(link.CompanyCode, link.FinancialTransaction))) : null
    if (row) rows.push(row)
  }
  return rows
}

const chunked = <T>(items: readonly T[]): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK))
  return out
}

export const loadAppStrForDeal = (dealId: string, signal?: AbortSignal): Promise<AppStrEntity[]> =>
  list<AppStrEntity>(APP, { filter: `ZtsfDealID eq ${odataString(dealId)}`, top: 1000 }, signal ? { signal } : undefined)

export async function loadFxTransactions(links: readonly AppStrEntity[], signal?: AbortSignal): Promise<FxTxnEntity[]> {
  const pages = await Promise.all(
    chunked(links).map((chunk) =>
      list<FxTxnEntity>(
        FX,
        { filter: chunk.map((t) => `(CompanyCode eq ${odataString(t.CompanyCode)} and FinancialTransaction eq ${odataString(t.FinancialTransaction)})`).join(' or '), top: 1000 },
        signal ? { signal } : undefined,
      ),
    ),
  )
  return pages.flat()
}

/** gt_top for a Deal ID: APP_STR (by ZTSF_DEAL_ID) + FxTransaction, joined on BUKRS + RFHA. */
export async function loadDealTransactions(dealId: string, entityOf?: (companyCode: string) => string, signal?: AbortSignal): Promise<FxRow[]> {
  const links = await loadAppStrForDeal(dealId, signal)
  if (!links.length) return []
  const txns = await loadFxTransactions(links, signal)
  return mergeDealTransactions(links, txns, entityOf, await loadNdfViews(txns, signal))
}
