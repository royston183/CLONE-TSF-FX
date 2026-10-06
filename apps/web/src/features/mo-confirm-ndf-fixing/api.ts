import { apiFetch, entityPath, list, odataString, service } from '@slc/api-client'
import { txt } from '../../shared/fx/masters.ts'
import { fxList, type FxRow } from '../../shared/fx/mw.ts'
import { sapMessage, type FxTransaction } from '../mo-fx-deal-confirmation/api.ts'
import { STATUS } from './data.ts'
import type { NdfDeal, Trader } from './types.ts'

/**
 * SAP data for MO: Confirm NDF Fixing (ZSGTSFR026 / ZSGTSF_RFX_NDF_FIX_MO). Nothing falls back to
 * sample data. The old program read ZSGTSFV_FX, ZSGTRMTR_TRADER, VTBFHA and VTBFHAZU; here:
 *
 *   Worklist     FxTransaction (ZFS_SB_TRMFX_O4_API), filtered server-side on company code. The rest of
 *                the old selection is done on what comes back, because the service has no property for it:
 *                  product type sgsart+2(1) = 'D'  ->  ProductType third character (NDF)
 *                  saktiv <> 3                     ->  ActiveStatus <> '3'
 *                  v_date = Fixing Date            ->  ValueDate (see filterByCriteria in logic.ts)
 *   Trader       ZSGTRMTR_TRADER through the middleware ("trmTrader"): ZTCODE and its name
 *   Partner      A_BusinessPartner (the transaction carries only the partner number)
 *   Txn type     trmmaster TransactionType name
 *   Company      A_CompanyCode, for the value help
 *   Match & Release   the bound Settle action = BAPI_FTR_FXT_SETTLE
 *
 * NOT in the FxTransaction service, so shown blank and never invented: TXN_STATUS (10/12/13/11),
 * the trader of a transaction, NDF_DATE / NDF_REF / NDF_RATE, CASH_CURR / ZCASH_AMT, the MO and FO
 * remarks, the TSF Deal ID / Master Contract reference / TSF deal type, TSF entity, business area
 * and accounting. The Txn Status column therefore shows the activity category (20 unmatched,
 * 30 matched & released), the one status the service does carry.
 */
const fxApi = service('fx')
const FX = fxApi('FxTransaction')
const masterApi = service('trmmaster')
const partnerApi = service('businesspartner')
const companyApi = service('companycode')

export { sapMessage }

type V2<T> = { d?: { results?: T[] } }
type V4<T> = { value?: T[] }

const ACTIVE_REVERSED = '3'
const CATEGORY_SETTLED = '30'

/** DD-MM-YYYY from the service's YYYY-MM-DD; '' for a blank or initial date. */
export function dmyOf(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  return m && m[1] !== '0000' ? `${m[3]}-${m[2]}-${m[1]}` : ''
}

const n = (v: unknown): number => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

/** sgsart+2(1) = 'D': an NDF product type (12D). */
export const isNdfProduct = (productType: string | undefined): boolean => (productType ?? '').charAt(2) === 'D'

export const dealKey = (companyCode: string, transaction: string): string => `${companyCode}-${transaction}`
const typeKey = (productType: string, transactionType: string) => `${productType}/${transactionType}`

export type Names = { partners: ReadonlyMap<string, string>; txnTypes: ReadonlyMap<string, string> }
export const NO_NAMES: Names = { partners: new Map(), txnTypes: new Map() }

/** A live NDF transaction as a row, or null for a reversed deal, a non-NDF one, or one without dates. */
export function toNdfDeal(d: FxTransaction, names: Names = NO_NAMES): NdfDeal | null {
  if (d.ActiveStatus === ACTIVE_REVERSED || !isNdfProduct(d.ProductType)) return null
  const tradeDate = dmyOf(d.ContractDate)
  const valueDate = dmyOf(d.ValueDate)
  if (!tradeDate || !valueDate) return null

  const lead = d.LeadCurrency || d.BuyCurrency || ''
  const follow = d.FollowCurrency || d.SellCurrency || ''
  const buysLead = d.BuyCurrency === lead
  const typeName = names.txnTypes.get(typeKey(d.ProductType ?? '', d.TransactionType))
  return {
    id: dealKey(d.CompanyCode, d.FinancialTransaction),
    transaction: d.FinancialTransaction,
    coCode: d.CompanyCode,
    busArea: '',
    tradeDate,
    tsfEntity: '',
    txnTypeDesc: typeName ? `${d.TransactionType} - ${typeName}` : d.TransactionType,
    partnerName: names.partners.get(d.Partner) || d.Partner,
    partnerCode: d.Partner,
    buySell2: buysLead ? 'Sell' : 'Buy',
    currency2: follow,
    amount2: n(buysLead ? d.SellAmount : d.BuyAmount),
    currency1: lead,
    amount1: n(buysLead ? d.BuyAmount : d.SellAmount),
    allInRate: n(d.ForwardRate),
    txnStatus: d.ActivityCategory === CATEGORY_SETTLED ? STATUS.RELEASED : STATUS.UNMATCHED,
    fixingDate: '',
    ndfValue: null,
    valueDate,
    dealId: '',
    mcReference: '',
    businessArea: '',
    trader: '',
    traderCode: '',
    accounting: '',
    externalRef: '',
    internalRef: '',
    foRemark: '',
    moRemark: '',
  }
}

/** Partner and transaction-type names. A lookup that fails leaves its codes unnamed; it never stops the list. */
export async function loadNames(rows: readonly FxTransaction[], signal?: AbortSignal): Promise<Names> {
  const opts = signal ? { signal } : undefined
  const partners = new Map<string, string>()
  const txnTypes = new Map<string, string>()
  const types = [...new Set(rows.map((r) => r.ProductType ?? '').filter(Boolean))]
  const bps = [...new Set(rows.map((r) => r.Partner).filter(Boolean))]
  const soft = async (what: string, run: () => Promise<void>) => {
    try {
      await run()
    } catch (error) {
      if ((error as { name?: string } | null)?.name === 'AbortError') throw error
      console.warn(`[ndf-fixing-mo] ${what} unavailable`, error)
    }
  }
  await Promise.all([
    soft('transaction type names', async () => {
      if (!types.length) return
      const filter = types.map((t) => `ProductType eq ${odataString(t)}`).join(' or ')
      const v4 = await apiFetch<V4<{ ProductType?: string; TransactionType?: string; TransactionTypeName?: string }>>(
        `${masterApi('TransactionType')}?${new URLSearchParams({ $filter: filter })}`,
        opts,
      )
      for (const t of v4?.value ?? [])
        if (t.TransactionType) txnTypes.set(typeKey(t.ProductType ?? '', t.TransactionType), (t.TransactionTypeName ?? '').trim())
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
  return { partners, txnTypes }
}

/** The OData filter for View Deals: one company code, or a From / To range compared as text. */
export function companyFilter(from: string, to: string): string {
  const f = from.trim().toUpperCase()
  const t = to.trim().toUpperCase()
  return t ? `CompanyCode ge ${odataString(f)} and CompanyCode le ${odataString(t)}` : `CompanyCode eq ${odataString(f)}`
}

/** The NDF transactions of the company code (range). The Fixing Date, trader and value are applied by the screen. */
export async function loadNdfDeals(range: { from: string; to: string }, signal?: AbortSignal): Promise<NdfDeal[]> {
  const rows = await list<FxTransaction>(FX, { filter: companyFilter(range.from, range.to), top: 1000 }, signal ? { signal } : undefined)
  const ndf = rows.filter((r) => r.ActiveStatus !== ACTIVE_REVERSED && isNdfProduct(r.ProductType))
  const names = await loadNames(ndf, signal)
  return ndf.map((r) => toNdfDeal(r, names)).filter((d): d is NdfDeal => d !== null)
}

/** One transaction read back from SAP (after Settle); null when it is no longer on the list. */
export async function fetchNdfDeal(companyCode: string, transaction: string, signal?: AbortSignal): Promise<NdfDeal | null> {
  const filter = `CompanyCode eq ${odataString(companyCode)} and FinancialTransaction eq ${odataString(transaction)}`
  const [row] = await list<FxTransaction>(FX, { filter, top: 1 }, signal ? { signal } : undefined)
  if (!row) return null
  return toNdfDeal(row, await loadNames([row], signal))
}

/** ZSGTRMTR_TRADER (middleware): one row per trader code, "<ZTCODE> - <name>", sorted by code. */
export function tradersOf(rows: readonly FxRow[]): Trader[] {
  const out = new Map<string, Trader>()
  for (const r of rows) {
    const code = txt(r, 'ZTCODE')
    if (code && !out.has(code)) out.set(code, { code, name: txt(r, 'ZNAME') || txt(r, 'ZTRADER') })
  }
  return [...out.values()].sort((a, b) => a.code.localeCompare(b.code))
}

export async function loadTraders(signal?: AbortSignal): Promise<Trader[]> {
  return tradersOf(await fxList('trmTrader', {}, { signal }))
}

/** A_CompanyCode: the company-code value help. */
export async function loadCompanyCodes(signal?: AbortSignal): Promise<string[]> {
  const v2 = await apiFetch<V2<{ CompanyCode?: string }>>(
    `${companyApi('A_CompanyCode')}?${new URLSearchParams({ $select: 'CompanyCode', $format: 'json' })}`,
    signal ? { signal } : undefined,
  )
  return [...new Set((v2?.d?.results ?? []).map((c) => (c.CompanyCode ?? '').trim()).filter(Boolean))].sort()
}

const SETTLE = 'com.sap.gateway.srvd_a2x.zfs_sd_trmfx.v0001.Settle'

/** Match & Release: BAPI_FTR_FXT_SETTLE through the bound Settle action. Each call is its own SAP commit. */
export async function settleNdfDeal(companyCode: string, transaction: string): Promise<void> {
  const key = entityPath('FxTransaction', { CompanyCode: companyCode, FinancialTransaction: transaction })
  await apiFetch(`${fxApi(key)}/${SETTLE}`, { method: 'POST', body: {} })
}
