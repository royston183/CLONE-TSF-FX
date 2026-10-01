import { list, odataString, service } from '@slc/api-client'
import { txt } from '../../shared/fx/masters.ts'
import { createDeal as bookDealRow, listMasterContracts, setMcStatus } from '../../shared/fx/master-contract.ts'
import { fxList, type FxRow as MwRow } from '../../shared/fx/mw.ts'
import { clip, dec, dmyFromIso, isoFromDmy, num } from '../../shared/fx/sap.ts'
import type { Deal, DealStatus, FxRow, MasterContract, PoolTxn } from './types.ts'

/**
 * FO: Create Deal ID Manually (ZSGTSFR079), on live data.
 *
 *   Master Contracts     masterContract   ZSGTSFTR_MAS_CON   origin, MC, model, dates, amount, strings
 *   Deal IDs             tsfDealId        ZSGTSFTR_DEALID    the deal, its MC and up to eight linked transactions
 *   Treasury deals       FxTransaction    ZFS_SB_TRMFX_O4    the transactions Deal 1 / Deal 2 are chosen from
 *   Company / trader     comp, trmTrader  entity of a company code, trader name of a trader code
 *
 * Creating a Deal ID draws the number from range ZSGTSFNR01/01, writes the row and moves the MC
 * to 04 (In Use). What it cannot do is the third step of the original program: stamp the Deal ID
 * and MC reference onto the two Treasury transactions (BAPI_FTR_FXT_CHANGE through
 * ZSGTRMFM_VTBFHA_EXPORT). The FxTransaction service has no field or action for that, so SAP's
 * own records of those transactions do not carry the Deal ID. The Deal ID row does list them, and
 * this screen keeps a transaction already on a Deal ID out of the Deal 1 / Deal 2 lists.
 *
 * Not available from any API yet, so left empty rather than invented: the planned invoices, the
 * FX Deal P&L row and the planned P&L (ZSGTSFTR_INV_REF holds no rows, ZSGTSFV_FX has no resource).
 */
const fxApi = service('fx')
const FX = fxApi('FxTransaction')

/** The statuses a Master Contract can take a new Deal ID in: 03 Confirmed by MO, 04 In Use. */
export const USABLE_MC_STATUSES = ['03', '04'] as const

/** A Deal ID row links at most this many Treasury transactions (ZBUKRS1..8 / ZRFHA1..8). */
const MAX_LINKED = 8

/** What FxTransaction returns; only the fields this screen shows. */
export type FxTxn = {
  CompanyCode: string
  FinancialTransaction: string
  TransactionType?: string
  ContractDate?: string | null
  BuyCurrency?: string
  SellCurrency?: string
  LeadCurrency?: string
  FollowCurrency?: string
  BuyAmount?: number | string
  SellAmount?: number | string
  ValueDate?: string | null
  SpotRate?: number | string
  SwapRate?: number | string
  ForwardRate?: number | string
  /** '3' once reversed. */
  ActiveStatus?: string
  /** 20 created and unmatched, 30 settled / matched and released. */
  ActivityCategory?: string
}

const ACTIVE_REVERSED = '3'

const n = (v: unknown): number => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

/** `${company code}-${transaction number}`: a transaction number alone repeats across companies. */
export const txnKey = (bukrs: string, rfha: string): string => `${bukrs}-${rfha}`

// ---------------------------------------------------------------- Master Contracts

/**
 * A contract as the Create dialog lists it. The balance is what is left of the amount after the
 * utilised amount (ZUTI_AMT); it is not reduced here when a Deal ID is created, since the
 * utilisation is worked out in SAP from the linked transactions. A contract without a number,
 * origin or both dates cannot be offered.
 */
export function toMasterContract(r: MwRow): MasterContract | null {
  const ref = txt(r, 'ZMC_REF_NO')
  const origin = txt(r, 'ZORIGIN')
  const mcDate = dmyFromIso(r['ZMC_DATE'])
  const shipEnd = dmyFromIso(r['ZSHIP_END'])
  if (!ref || !origin || !mcDate || !shipEnd) return null
  const amount = num(r['ZAMT'])
  return {
    ref,
    origin,
    model: txt(r, 'ZMOD_ID'),
    mcDate,
    shipEnd,
    amount,
    balance: Math.max(0, amount - num(r['ZUTI_AMT'])),
    desc: txt(r, 'ZMC_DESC'),
    entity: txt(r, 'ZENT_DESC'),
    currency: txt(r, 'ZCURR_DESC'),
    currencyId: txt(r, 'ZCURR_ID'),
  }
}

export const isUsableStatus = (r: MwRow): boolean => (USABLE_MC_STATUSES as readonly string[]).includes(txt(r, 'ZMC_STAT'))

// ---------------------------------------------------------------- Treasury transactions

/** Leg 1 is the lead currency; a Buy leg is the one bought. Amounts are shown unsigned, as the pool always did. */
function legs(t: FxTxn) {
  const lead = t.LeadCurrency || t.BuyCurrency || ''
  const follow = t.FollowCurrency || t.SellCurrency || ''
  const buysLead = t.BuyCurrency === lead
  return {
    side1: buysLead ? 'Buy' : 'Sell',
    curr1: lead,
    amt1: n(buysLead ? t.BuyAmount : t.SellAmount),
    side2: buysLead ? 'Sell' : 'Buy',
    curr2: follow,
    amt2: n(buysLead ? t.SellAmount : t.BuyAmount),
  }
}

/** TXN_STATUS the original filters on (03 unmatched, 07 matched and released), from the activity category. */
const txnStatusOf = (t: FxTxn): string => (t.ActivityCategory === '30' ? '07' : '03')

/** A transaction as the Deal 1 / Deal 2 lists hold it; null for a reversed one or one without dates. */
export function toPoolTxn(t: FxTxn, entityOf: (bukrs: string) => string): PoolTxn | null {
  if (t.ActiveStatus === ACTIVE_REVERSED) return null
  const start = dmyFromIso(t.ContractDate)
  const end = dmyFromIso(t.ValueDate)
  if (!start || !end) return null
  return {
    rfha: t.FinancialTransaction,
    bukrs: t.CompanyCode,
    sfhaart: t.TransactionType ?? '',
    entity: entityOf(t.CompanyCode),
    start,
    end,
    ...legs(t),
    // The service has no trader for a transaction.
    trader: '',
  }
}

/** A linked transaction as a row of the FX Deals table. */
export function toFxRow(dealType: string, bukrs: string, rfha: string, t: FxTxn | undefined, entity: string, mcRef: string): FxRow {
  if (!t) {
    return { dealType, bukrs, rfha, sfhaart: '', start: '', end: '', text: '', entity, side1: '', curr1: '', amt1: 0, side2: '', curr2: '', amt2: '', spot: '', swap: '', allIn: '', mcRef, txnStatus: '' }
  }
  const l = legs(t)
  return {
    dealType,
    bukrs,
    rfha,
    sfhaart: t.TransactionType ?? '',
    start: dmyFromIso(t.ContractDate),
    end: dmyFromIso(t.ValueDate),
    text: `${l.side1} ${l.curr1} / ${l.side2} ${l.curr2}`,
    entity,
    ...l,
    spot: n(t.SpotRate),
    swap: n(t.SwapRate),
    allIn: n(t.ForwardRate),
    mcRef,
    txnStatus: txnStatusOf(t),
  }
}

// ---------------------------------------------------------------- Deal IDs

/** The transactions already on a Deal ID, which the Deal 1 / Deal 2 lists must not offer again. */
export function assignedKeys(dealRows: readonly MwRow[]): Set<string> {
  const keys = new Set<string>()
  for (const r of dealRows) {
    for (let i = 1; i <= MAX_LINKED; i++) {
      const bukrs = txt(r, `ZBUKRS${i}`)
      const rfha = txt(r, `ZRFHA${i}`)
      if (bukrs && rfha) keys.add(txnKey(bukrs, rfha))
    }
  }
  return keys
}

const dealStatusOf = (code: string): DealStatus => (code === '01' || code === '02' ? code : 'X')

export type DealLookups = {
  txns: ReadonlyMap<string, FxTxn>
  contracts: ReadonlyMap<string, MasterContract>
  traders: ReadonlyMap<string, string>
  entityOf: (bukrs: string) => string
}

/** A Deal ID row as the workbench shows it. The invoices and the premium sheet have no source, so they are empty. */
export function toDeal(r: MwRow, lookups: DealLookups): Deal {
  const mcRef = txt(r, 'ZMC_REF')
  const mc = lookups.contracts.get(mcRef)
  const fxRows: FxRow[] = []
  for (let i = 1; i <= MAX_LINKED; i++) {
    const bukrs = txt(r, `ZBUKRS${i}`)
    const rfha = txt(r, `ZRFHA${i}`)
    if (!bukrs || !rfha) continue
    fxRows.push(toFxRow(`D${i}`, bukrs, rfha, lookups.txns.get(txnKey(bukrs, rfha)), lookups.entityOf(bukrs), mcRef))
  }
  const traderCode = txt(r, 'ZTRD_CODE')
  return {
    id: txt(r, 'ZDEAL_ID'),
    ref: txt(r, 'ZDEAL_REF') || txt(r, 'ZDEAL_ID'),
    description: txt(r, 'ZDEAL_DESC'),
    startDate: dmyFromIso(r['ZS_DATE']),
    endDate: dmyFromIso(r['ZE_DATE']),
    status: dealStatusOf(txt(r, 'ZDEAL_STAT')),
    mcRef,
    mcDesc: mc?.desc ?? '',
    mcDate: mc?.mcDate ?? '',
    shipEnd: mc?.shipEnd ?? '',
    fxModel: txt(r, 'ZTSF_MODEL') || mc?.model || '',
    entityString: mc?.entity ?? '',
    currencyString: txt(r, 'ZDEAL_CURR_DESC') || mc?.currency || '',
    trader: lookups.traders.get(traderCode) ?? '',
    traderCode,
    origin: mc?.origin ?? '',
    fxOp: txt(r, 'ZSUB_TYPE'),
    fxRows,
    invoices: [],
    premium: {
      dealValue: num(r['ZDEAL_AMT']),
      dealCurr: 'USD',
      localNet: 0,
      localCurr: 'INR',
      rbi: 0,
      rbiDate: '',
      foreignNet: 0,
      foreignCurr: 'USD',
      perUsd: 0,
      strike: 0,
      invoiceRate: 0,
    },
  }
}

// ---------------------------------------------------------------- loading

export type Workbench = {
  deals: Record<string, Deal>
  masterContracts: MasterContract[]
  pool: PoolTxn[]
}

/**
 * The reason a call failed. An ApiError's message is already the backend's reason (the gateway
 * words its errors two ways, a string or { value }, and ApiError reads both); the shared
 * messageOf reads only the first and would print "[object Object]" for the second.
 */
const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/** Names the resource that failed, so the error on screen says which source is missing. */
export class WorkbenchLoadError extends Error {
  readonly resource: string
  constructor(resource: string, cause: unknown) {
    super(`Could not load ${resource}: ${reasonOf(cause)}`)
    this.name = 'WorkbenchLoadError'
    this.resource = resource
  }
}

async function read<T>(resource: string, load: () => Promise<T>): Promise<T> {
  try {
    return await load()
  } catch (error) {
    if ((error as { name?: string } | null)?.name === 'AbortError') throw error
    throw new WorkbenchLoadError(resource, error)
  }
}

/** The transactions of the company codes in the company master. The service cannot filter on dates or assignment. */
async function listTransactions(codes: readonly string[], signal?: AbortSignal): Promise<FxTxn[]> {
  if (!codes.length) return []
  const filter = codes.map((c) => `CompanyCode eq ${odataString(c)}`).join(' or ')
  return list<FxTxn>(FX, { filter, top: 1000 }, signal ? { signal } : undefined)
}

/** Reads every source in parallel. A failed read is an error naming the source; nothing is substituted. */
export async function loadWorkbench(signal?: AbortSignal): Promise<Workbench> {
  const [mcRows, dealRows, traderRows, compRows] = await Promise.all([
    read('masterContract', () => listMasterContracts({}, signal)),
    read('tsfDealId', () => fxList('tsfDealId', {}, { sort: '-ZDEAL_ID', signal })),
    read('trmTrader', () => fxList('trmTrader', {}, { signal })),
    read('comp', () => fxList('comp', {}, { signal })),
  ])
  const entityByCode = new Map(compRows.map((r) => [txt(r, 'ZBUKRS'), txt(r, 'ZCOM_ID')]))
  const txnRows = await read('FxTransaction', () => listTransactions([...entityByCode.keys()].filter(Boolean), signal))
  const entityOf = (bukrs: string) => entityByCode.get(bukrs) ?? ''

  const allContracts = mcRows.map(toMasterContract).filter((m): m is MasterContract => m !== null)
  const contracts = new Map(allContracts.map((m) => [m.ref, m]))
  const txns = new Map(txnRows.map((t) => [txnKey(t.CompanyCode, t.FinancialTransaction), t]))
  const traders = new Map(traderRows.map((r) => [txt(r, 'ZTCODE'), txt(r, 'ZTRADER') || txt(r, 'ZNAME')]))
  const assigned = assignedKeys(dealRows)

  const deals: Record<string, Deal> = {}
  for (const r of dealRows) {
    const deal = toDeal(r, { txns, contracts, traders, entityOf })
    if (deal.id) deals[deal.id] = deal
  }
  return {
    deals,
    masterContracts: mcRows.filter(isUsableStatus).map(toMasterContract).filter((m): m is MasterContract => m !== null),
    pool: txnRows
      .filter((t) => !assigned.has(txnKey(t.CompanyCode, t.FinancialTransaction)))
      .map((t) => toPoolTxn(t, entityOf))
      .filter((t): t is PoolTxn => t !== null),
  }
}

// ---------------------------------------------------------------- creating

/** The ZSGTSFTR_DEALID columns of a new Deal ID. ZDEAL_ID is left to the number range. */
export function dealColumns(mc: MasterContract, a: PoolTxn, b: PoolTxn, dealType: string, subType: string, year: number): Record<string, unknown> {
  // ZDEAL_TYPE / ZSUB_TYPE are key columns: a blank one is rejected (MISSING_PRIMARY_KEY).
  if (!dealType || !subType) {
    throw new Error(`FX Model ${mc.model} has no deal type / sub type (ZTYPE / ZSUB_TYPE) in ZSGTSFTR_RULE_BT, so no Deal ID can be booked under it.`)
  }
  const starts = [a.start, b.start].map((d) => isoFromDmy(d) ?? '').filter(Boolean).sort()
  const ends = [a.end, b.end].map((d) => isoFromDmy(d) ?? '').filter(Boolean).sort()
  return {
    ZDEAL_TYPE: clip(dealType, 10),
    ZSUB_TYPE: clip(subType, 10),
    ZDEAL_DESC: clip(`${mc.origin}_FX_${year} / ${mc.entity}`, 80),
    ZTSF_MODEL: clip(mc.model, 10),
    ZMC_REF: clip(mc.ref, 10),
    ZS_DATE: starts[0] ?? null,
    ZE_DATE: ends[ends.length - 1] ?? null,
    ZDEAL_AMT: dec(Math.max(a.amt1, b.amt1), 2),
    ZBUKRS1: clip(a.bukrs, 4),
    ZRFHA1: clip(a.rfha, 13),
    ZBUKRS2: clip(b.bukrs, 4),
    ZRFHA2: clip(b.rfha, 13),
    // 01: FO: FX Deals Created (ZSGTSFTR_DEAL_ST). Confirming it is MO's step.
    ZDEAL_STAT: '01',
    ZMC_CURR_ID: clip(mc.currencyId ?? '', 20),
    ZMC_CURR_DESC: clip(mc.currency, 80),
    ZDEAL_CURR_ID: clip(mc.currencyId ?? '', 20),
    ZDEAL_CURR_DESC: clip(mc.currency, 80),
  }
}

export type CreatedDeal = { dealId: string }

/**
 * Creates the Deal ID: draws the number, writes the row, moves the MC to 04. If the MC cannot be
 * moved the Deal ID already exists, so the error says which one — it is not rolled back.
 */
export async function createDealId(mc: MasterContract, a: PoolTxn, b: PoolTxn, now: Date = new Date()): Promise<CreatedDeal> {
  const model = (await fxList('fxModel', { ZMOD_ID: mc.model }))[0]
  const dealId = await bookDealRow(dealColumns(mc, a, b, model ? txt(model, 'ZTYPE') : '', model ? txt(model, 'ZSUB_TYPE') : '', now.getFullYear()))
  try {
    await setMcStatus([mc.ref], '04')
  } catch (error) {
    throw new Error(`Deal ID ${dealId} was created, but Master Contract ${mc.ref} could not be moved to In Use: ${reasonOf(error)}`)
  }
  return { dealId }
}

