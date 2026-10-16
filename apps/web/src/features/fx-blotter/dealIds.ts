import { txt } from '../../shared/fx/masters.ts'
import { createDeal as bookDealRow, setMcStatus } from '../../shared/fx/master-contract.ts'
import { fxList, fxUpdate, type FxRow } from '../../shared/fx/mw.ts'
import { changedStamp, clip, dateFromIso, dec } from '../../shared/fx/sap.ts'
import { toISO } from './format.ts'
import type { BlotterRow, DealRecord, MasterContract } from './types.ts'

/**
 * Deal IDs for the blotter, written the way the original program writes them (include
 * ZSGTSF_PFX_BLOTTER_RELASE_MO: FORM update_deal_id, FORM gen_no_deal, FORM update_spot_deal_id).
 *
 * A pair released under a Master Contract — or the two legs of an Auto Deal — becomes ONE row of
 * ZSGTSFTR_DEALID (middleware "tsfDealId"):
 *
 *   number         drawn from range ZSGTSFNR01/01 by the middleware (7000000001 upwards)
 *   ZDEAL_DESC     <trader>_<MC origin>_<year>/<MC entity string>, e.g. Nidhi S_OSIPL_2026/OGA-OSIPL-DMCC
 *   ZDEAL_TYPE/SUB FX / FX1
 *   ZRFHA1/ZBUKRS1 Deal 1 transaction and company code;  ZRFHA2/ZBUKRS2 Deal 2
 *   ZS_DATE/ZE_DATE earliest trade date / latest value date of the two
 *   ZDEAL_STAT     01, and the contract is moved to 04 (In Use)
 *
 * A single leg joining an existing Deal ID is written into that row's next free transaction slot
 * (the original writes slots 3 and 4, the spot-settlement transactions).
 *
 * Not written, because nothing here can supply it: the planned P&L fields (ZPL*, from the day's
 * exchange rate), the over-utilisation flag from limit management, and the stamp of the Deal ID onto
 * the Treasury transactions themselves (BAPI_FTR_FXT_CHANGE has no OData action).
 */

/** A row can name a transaction in SAP only if it was created there. */
export const isInSap = (r: BlotterRow): boolean => !!r.live && !!r.companyCode && !!r.transactionNumber

/** ZSGTSFTR_DEALID links up to eight transactions; the pair takes slots 1 and 2, a settlement leg 3 onwards. */
const FIRST_LEG_SLOT = 3
const LAST_SLOT = 8

const trimmed = (s: string): string => s.trim().toLowerCase()

/** The trader's code in ZSGTRMTR_TRADER (ZTCODE) by the name the blotter shows ("Nidhi S" is ZTRADER), or ''. */
export function traderCodeOf(traders: readonly FxRow[], name: string): string {
  if (!name.trim()) return ''
  const row = traders.find((r) => trimmed(txt(r, 'ZTRADER')) === trimmed(name))
  return row ? clip(txt(row, 'ZTCODE'), 3) : ''
}

/** The USD side of a leg, which is what a Deal ID's amount is. */
const usdAmount = (r: BlotterRow): number => {
  const a = r.curr1 === 'USD' ? r.amt1 : r.amt2
  return typeof a === 'number' ? Math.abs(a) : 0
}

export type PairArgs = {
  mc: MasterContract
  /** Deal 1 then Deal 2; both must exist in SAP. */
  legs: readonly [BlotterRow, BlotterRow]
  /** The trader name shown in the blotter (e.g. "Nidhi S"). */
  traderName: string
  /** The trader's code in SAP, or '' when the name is not in ZSGTRMTR_TRADER. */
  traderCode: string
  /** The blotter date's year, used in the description as the original uses gv_date+0(4). */
  year: number
}

/** The ZSGTSFTR_DEALID columns of a new pair Deal ID. ZDEAL_ID is left to the number range. */
export function dealIdColumns(a: PairArgs): Record<string, unknown> {
  const [d1, d2] = a.legs
  const starts = a.legs.map((r) => r.tradeDate).filter((d): d is Date => !!d).sort((x, y) => x.getTime() - y.getTime())
  const ends = a.legs.map((r) => r.valueDate).filter((d): d is Date => !!d).sort((x, y) => x.getTime() - y.getTime())
  return {
    ZDEAL_DESC: clip(`${a.traderName}_${a.mc.origin}_${a.year}/${a.mc.entities.join('-')}`, 80),
    ZDEAL_TYPE: 'FX',
    ZSUB_TYPE: 'FX1',
    ZTSF_MODEL: clip(a.mc.fxModel, 10),
    ZMC_REF: clip(a.mc.mcNumber, 10),
    ZS_DATE: starts[0] ? toISO(starts[0]) : null,
    ZE_DATE: ends[ends.length - 1] ? toISO(ends[ends.length - 1]!) : null,
    ZBUKRS1: clip(d1.companyCode ?? '', 4),
    ZRFHA1: clip(d1.transactionNumber, 13),
    ZBUKRS2: clip(d2.companyCode ?? '', 4),
    ZRFHA2: clip(d2.transactionNumber, 13),
    ZTRD_CODE: clip(a.traderCode, 3),
    ZDEAL_STAT: '01',
    ZMC_CURR_ID: clip(a.mc.currencyId ?? '', 20),
    ZMC_CURR_DESC: clip(a.mc.currencyDesc ?? '', 80),
    ZDEAL_CURR_ID: clip(a.mc.currencyId ?? '', 20),
    ZDEAL_CURR_DESC: clip(a.mc.currencyDesc ?? '', 80),
    ZDEAL_AMT: dec(Math.max(usdAmount(d1), usdAmount(d2)), 2),
  }
}

/** Why a pair cannot be given a real Deal ID, or ''. Nothing is written when this is not empty. */
export function pairProblem(mc: MasterContract | undefined, legs: readonly BlotterRow[]): string {
  if (!mc) return 'Select a Master Contract.'
  if (legs.length !== 2) return 'A Deal ID takes exactly two transactions.'
  const missing = legs.find((r) => !isInSap(r))
  if (missing) {
    return `${missing.transactionNumber || missing.draftLabel || 'A row'} is not a SAP transaction: only deals created in SAP can be given a real Deal ID.`
  }
  if (legs[0]!.transactionNumber === legs[1]!.transactionNumber && legs[0]!.companyCode === legs[1]!.companyCode) {
    return 'Deal 1 and Deal 2 must be different transactions.'
  }
  return ''
}

/**
 * Creates the Deal ID for a pair: draws the number, writes the row, moves the contract to 04.
 * If the contract cannot be moved the Deal ID already exists, so the error says which one — nothing
 * is rolled back, as in the original (two separate commits).
 */
export async function createPairDealId(args: Omit<PairArgs, 'traderCode'>): Promise<{ dealId: string; dealType: string; dealDesc: string }> {
  const problem = pairProblem(args.mc, args.legs)
  if (problem) throw new Error(problem)
  const [traders, existing] = await Promise.all([fxList('trmTrader', {}), fxList('tsfDealId', {})])
  for (const leg of args.legs) {
    const holder = dealIdListing(existing, leg.companyCode ?? '', leg.transactionNumber)
    if (holder) throw new Error(`Transaction ${leg.transactionNumber} is already on Deal ID ${holder}; it cannot be given another.`)
  }
  const columns = dealIdColumns({ ...args, traderCode: traderCodeOf(traders, args.traderName) })
  const dealId = await bookDealRow(columns)
  try {
    await setMcStatus([args.mc.mcNumber], '04')
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error)
    throw new Error(`Deal ID ${dealId} was created, but Master Contract ${args.mc.mcNumber} could not be moved to In Use: ${why}`)
  }
  return { dealId, dealType: String(columns['ZDEAL_TYPE']), dealDesc: String(columns['ZDEAL_DESC']) }
}

// ---------------------------------------------------------------- existing Deal IDs

/** Deal ID rows oldest first: the number only goes up, and the first Deal ID a transaction was given is the real one. */
const oldestFirst = (rows: readonly FxRow[]): FxRow[] => [...rows].sort((a, b) => txt(a, 'ZDEAL_ID').localeCompare(txt(b, 'ZDEAL_ID')))

/**
 * The Deal ID row that lists a transaction (any slot), or undefined. A cancelled Deal ID (30) holds nothing. A
 * transaction that was (wrongly) given a second Deal ID answers with the first.
 */
export function dealIdListing(rows: readonly FxRow[], companyCode: string, transaction: string): string | undefined {
  for (const r of oldestFirst(rows)) {
    if (txt(r, 'ZDEAL_STAT') === '30') continue
    if (listsTransaction(r, companyCode, transaction)) return txt(r, 'ZDEAL_ID')
  }
  return undefined
}

/** What a Deal ID says about a transaction on it. */
export type DealIdAssignment = { dealId: string; mcRef: string; model: string; slot: number }

/**
 * Every transaction on a Deal ID with the Deal ID, Master Contract and slot, keyed company code - transaction. A transaction
 * on more than one Deal ID (the second given before a second was refused) is shown on the first, the one it was really given.
 */
export function assignmentsFromDealIds(rows: readonly FxRow[]): Map<string, DealIdAssignment> {
  const out = new Map<string, DealIdAssignment>()
  for (const r of oldestFirst(rows)) {
    if (txt(r, 'ZDEAL_STAT') === '30') continue
    for (let i = 1; i <= LAST_SLOT; i++) {
      const bukrs = txt(r, `ZBUKRS${i}`)
      const rfha = txt(r, `ZRFHA${i}`)
      const key = `${bukrs}-${rfha}`
      if (bukrs && rfha && !out.has(key)) out.set(key, { dealId: txt(r, 'ZDEAL_ID'), mcRef: txt(r, 'ZMC_REF'), model: txt(r, 'ZTSF_MODEL'), slot: i })
    }
  }
  return out
}

/** Slots 1 and 2 are Deal 1 and Deal 2; the rest are the settlement legs added afterwards. */
export const dealTypeOfSlot = (slot: number): string => (slot === 1 ? 'Deal 1' : slot === 2 ? 'Deal 2' : 'Settlement')

/**
 * Deals read from SAP with the Deal ID they are on put back: Deal ID, Master Contract, model and which leg.
 * This is what SAP knows, so it wins over anything remembered on the screen. A deal on no Deal ID is left alone.
 */
export function applyDealIds<T extends Omit<BlotterRow, 'id' | 'seq'>>(incoming: readonly T[], assignments: ReadonlyMap<string, DealIdAssignment>): T[] {
  return incoming.map((r) => {
    const a = assignments.get(`${r.companyCode ?? ''}-${r.transactionNumber}`)
    return a ? { ...r, dealId: a.dealId, mcRef: a.mcRef, fxModel: a.model || r.fxModel, dealType: dealTypeOfSlot(a.slot) } : r
  })
}

/**
 * A Deal ID row as the assign dialog lists it. Its legs are the transactions in its slots (ZRFHA1..8: Deal 1, Deal 2, then
 * the settlement legs), as transaction numbers; a Deal ID made on this screen lists row ids until the next load reads it back.
 */
export function toDealRecord(r: FxRow): DealRecord | null {
  const dealId = txt(r, 'ZDEAL_ID')
  if (!dealId) return null
  const stat = txt(r, 'ZDEAL_STAT')
  return {
    dealId,
    mcNumber: txt(r, 'ZMC_REF'),
    model: txt(r, 'ZTSF_MODEL'),
    // 30 is "Deal ID Cancelled" in ZSGTSFTR_DEAL_ST.
    type: stat === '30' ? 'REVERSED' : txt(r, 'ZSS') === 'X' ? 'SS' : 'PAIR',
    legs: Array.from({ length: LAST_SLOT }, (_, i) => txt(r, `ZRFHA${i + 1}`)).filter(Boolean),
    createdOn: dateFromIso(r['ZCREATED_DATE']) ?? new Date(0),
  }
}

/** The Deal IDs in SAP. A failed read is the caller's to report: no stand-in list is ever offered. */
export async function loadDealRows(signal?: AbortSignal): Promise<FxRow[]> {
  return fxList('tsfDealId', {}, { sort: '-ZDEAL_ID', signal })
}

export async function loadDealRecords(signal?: AbortSignal): Promise<DealRecord[]> {
  return (await loadDealRows(signal)).map(toDealRecord).filter((d): d is DealRecord => d !== null)
}

/** The first free transaction slot (3 to 8) of a Deal ID row, or null when all are taken. */
export function freeLegSlot(row: FxRow): number | null {
  for (let i = FIRST_LEG_SLOT; i <= LAST_SLOT; i++) if (!txt(row, `ZRFHA${i}`)) return i
  return null
}

/** True when the Deal ID already lists the transaction, in any slot. */
export function listsTransaction(row: FxRow, companyCode: string, transaction: string): boolean {
  for (let i = 1; i <= LAST_SLOT; i++) if (txt(row, `ZBUKRS${i}`) === companyCode && txt(row, `ZRFHA${i}`) === transaction) return true
  return false
}

/**
 * Adds one SAP transaction to an existing Deal ID, in its next free slot, as FORM update_spot_deal_id does.
 * Refuses a transaction the Deal ID already lists or a Deal ID with no free slot.
 */
export async function attachLegToDealId(
  dealId: string,
  leg: BlotterRow,
): Promise<{ slot: number; dealType: string; dealDesc: string; mcRef: string }> {
  if (!isInSap(leg)) throw new Error(`${leg.transactionNumber || leg.draftLabel || 'This row'} is not a SAP transaction, so it cannot be added to a real Deal ID.`)
  const all = await fxList('tsfDealId', {})
  const row = all.find((r) => txt(r, 'ZDEAL_ID') === dealId)
  if (!row) throw new Error(`Deal ID ${dealId} was not found in SAP.`)
  const company = leg.companyCode ?? ''
  const holder = dealIdListing(all, company, leg.transactionNumber)
  if (holder === dealId) throw new Error(`Deal ID ${dealId} already lists transaction ${leg.transactionNumber}.`)
  if (holder) throw new Error(`Transaction ${leg.transactionNumber} is already on Deal ID ${holder}; it cannot be added to ${dealId}.`)
  const slot = freeLegSlot(row)
  if (!slot) throw new Error(`Deal ID ${dealId} has no free transaction slot left.`)
  const key = { ZDEAL_ID: dealId, ZDEAL_TYPE: txt(row, 'ZDEAL_TYPE'), ZSUB_TYPE: txt(row, 'ZSUB_TYPE') }
  await fxUpdate('tsfDealId', key, {
    [`ZBUKRS${slot}`]: clip(company, 4),
    [`ZRFHA${slot}`]: clip(leg.transactionNumber, 13),
    ...(await changedStamp()),
  })
  return { slot, dealType: txt(row, 'ZDEAL_TYPE'), dealDesc: txt(row, 'ZDEAL_DESC'), mcRef: txt(row, 'ZMC_REF') }
}
