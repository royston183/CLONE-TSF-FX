/**
 * MO: Confirm Master Contract (ZSGTSFR011) against the SLC middleware.
 *
 * Mirrors the program: the queue is ZSGTSFTR_MAS_CON at ZMC_STAT 02 (Release to MO) or 11
 * (Error Correction); Confirm moves a contract to 03, Reject to 13 with the MO remark in
 * ZMO_REMARKS, one update per contract; Edit (ZSGTSF_RMC_DETAIL_EDIT) writes the amount,
 * payment terms and FX Model with the entity / currency strings the model carries.
 *
 * What MySQL cannot answer keeps the screen's dummy values: masters that are registered but
 * empty (RULE_BT, PAYMENT), the regions and port pairs (no master is migrated), utilization
 * (ZSGTSFV_FX reads SAP TRM tables and is not in MySQL), and the whole queue when the
 * middleware cannot be reached at all.
 */
import { distinctBy, loadMaster, replaceInPlace, txt, type MasterSource } from '../../shared/fx/masters.ts'
import {
  listDeals,
  listMasterContracts,
  liveDealsByMc,
  loadTransactions,
  setMcStatus,
  updateMasterContract,
  type McRow,
} from '../../shared/fx/master-contract.ts'
import type { FxRow } from '../../shared/fx/mw.ts'
import { clip, dateFromIso, dec, num, sapUser } from '../../shared/fx/sap.ts'
import { COMMODITIES, ENTITIES, FX_MODELS, PAYMENT_TERMS, STATUS, commodityOf, seedContracts } from './data.ts'
import { addDays } from './format.ts'
import type { Commodity, Entity, FxModel, MasterContract, McAction, PaymentTerm, StatusValue } from './types.ts'

/** The ZMC_STAT codes this queue holds (the program's WHERE zmc_stat IN ('02','11')). */
export const QUEUE_FILTER = { 'ZMC_STAT[in]': '02,11' }

/** What Confirm and Reject write to ZMC_STAT. */
export const ACTION_STATUS: Record<McAction, string> = { confirm: '03', reject: '13' }

// ---------------------------------------------------------------- status

/** The screen's status texts are code first ("02-Release to MO"), so the code is the prefix. */
export const statusCodeOf = (status: StatusValue): string => status.slice(0, 2)

/** ZMC_STAT -> the screen's status text; undefined for a code this screen has no text for. */
export function statusFromCode(code: string): StatusValue | undefined {
  return Object.values(STATUS).find((s) => statusCodeOf(s) === code)
}

// ---------------------------------------------------------------- masters

export type MasterSources = Record<'entities' | 'fxModels' | 'commodities' | 'paymentTerms', MasterSource>

/**
 * Loads every value help and swaps it into data.ts in place. REGIONS and PORT_PAIRS stay the
 * dummy lists: no region or port-pair master is migrated.
 */
export async function loadMasters(signal?: AbortSignal): Promise<MasterSources> {
  const [entities, models, commodities, terms] = await Promise.all([
    loadMaster('comp', toEntities, ENTITIES, { signal }),
    loadMaster('fxModel', toFxModels, FX_MODELS, { signal }),
    loadMaster('commodity', toCommodities, COMMODITIES, { signal }),
    loadMaster('paymentTerm', toPaymentTerms, PAYMENT_TERMS, { signal }),
  ])
  replaceInPlace(ENTITIES, entities.rows)
  replaceInPlace(FX_MODELS, models.rows)
  replaceInPlace(COMMODITIES, commodities.rows)
  replaceInPlace(PAYMENT_TERMS, terms.rows)
  return { entities: entities.source, fxModels: models.source, commodities: commodities.source, paymentTerms: terms.source }
}

/**
 * ZSGTSFTR_COMP: every entity, as the region filter looks up any origin. ZREG_ID is taken as
 * is; the region names beside it are still the dummy REGIONS list.
 */
export function toEntities(rows: readonly FxRow[]): Entity[] {
  return rows.map((r) => ({
    code: txt(r, 'ZCOM_ID'),
    cocode: txt(r, 'ZBUKRS'),
    name: txt(r, 'ZBUTXT'),
    region: txt(r, 'ZREG_ID'),
    origin: txt(r, 'ZORIGIN') === 'X',
  }))
}

const split = (chain: string) => chain.split('-').map((s) => s.trim()).filter(Boolean)

/**
 * ZSGTSFTR_RULE_BT repeats a model once per controlling area / link model; one entry per
 * model and currency string is what the screen offers.
 */
export function toFxModels(rows: readonly FxRow[]): FxModel[] {
  return distinctBy(rows, (r) => `${txt(r, 'ZMOD_ID')}|${txt(r, 'ZCURR_DESC')}`).map((r) => ({
    code: txt(r, 'ZMOD_ID'),
    desc: txt(r, 'ZMOD_DESC'),
    entities: split(txt(r, 'ZENT_DESC')),
    curr: split(txt(r, 'ZCURR_DESC')),
    entityId: txt(r, 'ZENT_ID'),
    currId: txt(r, 'ZCURR_ID'),
  }))
}

/** ZSGTSFTR_COMODIT: the short text first, as the dummy's 'WHEAT' / 'Multi-Commodity' read. */
export function toCommodities(rows: readonly FxRow[]): Commodity[] {
  return rows.map((r) => ({ code: txt(r, 'ZCOM_ID'), desc: txt(r, 'ZCOM_SDESC') || txt(r, 'ZCOM_DESC') }))
}

export function toPaymentTerms(rows: readonly FxRow[]): PaymentTerm[] {
  return rows.map((r) => ({ code: txt(r, 'ZTERM'), desc: txt(r, 'ZTEXT1') }))
}

// ---------------------------------------------------------------- contracts

export type Loaded = { contracts: MasterContract[]; source: MasterSource }

/**
 * The MO queue with each contract's first live Deal ID. An empty answer is a real one (the
 * grid stays empty until Create MC releases a contract); the seed contracts only appear when
 * the middleware cannot be reached.
 */
export async function loadContracts(signal?: AbortSignal): Promise<Loaded> {
  const { rows, source } = await loadTransactions(
    async () => {
      const mcs = await listMasterContracts(QUEUE_FILTER, signal)
      const deals = liveDealsByMc(await listDeals(mcs.map((r) => txt(r, 'ZMC_REF_NO')), signal))
      return mcs
        .map((r) => toContract(r, txt(deals.get(txt(r, 'ZMC_REF_NO'))?.[0] ?? {}, 'ZDEAL_ID')))
        .filter((c): c is MasterContract => c !== null)
    },
    seedContracts,
    'MO Confirm Master Contract',
  )
  return { contracts: rows, source }
}

/**
 * A MAS_CON row in the screen's shape; null for a status this screen has no text for (the
 * read is filtered to 02 / 11, so that would be a row that moved on mid-read).
 */
export function toContract(r: McRow, dealId: string): MasterContract | null {
  const status = statusFromCode(txt(r, 'ZMC_STAT'))
  if (!status) return null
  const mcNumber = Number(txt(r, 'ZMC_REF_NO'))
  const origin = txt(r, 'ZORIGIN')
  const commodityCode = txt(r, 'ZCOMMODITY')
  const currChain = split(txt(r, 'ZCURR_DESC'))
  const enteredOn = dateFromIso(r['ZCREATED_DATE'])
  // ZMC_DATE is mandatory on Create MC; the entry date only stands in for a row without one.
  const mcDate = dateFromIso(r['ZMC_DATE']) ?? enteredOn ?? new Date()
  const shipStart = dateFromIso(r['ZSHIP_START']) ?? mcDate
  const shipEnd = dateFromIso(r['ZSHIP_END']) ?? shipStart
  const amtUSD = num(r['ZAMT'])

  return {
    mcNumber,
    // Not a column: the seed derived it for display, and so does this (MC date's year).
    mcReference: `MC/${origin}/${mcDate.getFullYear()}/${String(mcNumber).slice(-3)}`,
    dealId,
    fxModel: txt(r, 'ZMOD_ID'),
    modelDesc: txt(r, 'ZMOD_DESC'),
    entities: split(txt(r, 'ZENT_DESC')),
    entityId: txt(r, 'ZENT_ID'),
    currChain,
    currId: txt(r, 'ZCURR_ID'),
    status,
    mcDescription: txt(r, 'ZMC_DESC'),
    mcDate,
    originEntity: origin,
    commodityCode,
    commodityDesc: txt(r, 'ZCOM_DESC') || commodityOf(commodityCode)?.desc || commodityCode,
    amtUSD,
    amtOrigin: num(r['ZORG_AMT']),
    currOrigin: txt(r, 'ZOCURR') || (currChain[currChain.length - 1] ?? ''),
    exRate: num(r['ZEX_RATE']),
    shipStart,
    shipEnd,
    // Utilization comes from ZSGTSFV_FX (linked Treasury deals in SAP TRM), which is not in
    // MySQL: nothing is utilized as far as this screen can tell, so the balance is the full
    // amount. MAS_CON's own ZUTI_AMT is not what the program shows here and is not read.
    utilizedAmt: 0,
    balUSD: amtUSD,
    paymentTerms: txt(r, 'ZPAY_TERMS'),
    // MAS_CON has no payment-date column; derived as the seed did (shipment end + 30 days).
    paymentDate: addDays(shipEnd, 30),
    portOfShipment: txt(r, 'ZPOS'),
    portOfDestination: txt(r, 'ZPOD'),
    moRemarks: txt(r, 'ZMO_REMARKS'),
    foRemarks: txt(r, 'ZFO_REMARKS'),
    enteredBy: txt(r, 'ZCREATED_BY'),
    enteredOn: enteredOn ?? mcDate,
    entryTime: txt(r, 'ZCREATED_TIME'),
    changedBy: txt(r, 'ZCHANGED_BY'),
    changedOn: dateFromIso(r['ZCHANGED_DATE']),
  }
}

/** The remark as ZMO_REMARKS (CHAR 80) stores it — and so as the screen shows it afterwards. */
export const moRemark = (remark: string): string => clip(remark.trim(), 80)

/** The ZMC_STAT change Confirm / Reject write, plus the MO remark for a rejection. */
export function actionColumns(action: McAction, remark: string): Record<string, string> {
  return action === 'reject' ? { ZMO_REMARKS: moRemark(remark) } : {}
}

/**
 * Confirms (03) or rejects (13) each contract, one update per MC as the program loops.
 * Returns who ZCHANGED_BY was stamped as, for the table to show.
 */
export async function actionMcs(mcNumbers: readonly number[], action: McAction, remark: string): Promise<string> {
  await setMcStatus(
    mcNumbers.map((n) => String(n)),
    ACTION_STATUS[action],
    actionColumns(action, remark),
  )
  return sapUser()
}

/**
 * The MAS_CON columns ZSGTSF_RMC_DETAIL_EDIT writes, from the contract as applyEdit left it:
 * amount (and the origin amount at the contract's own rate), payment terms, and the FX Model
 * with the entity and currency strings it carries.
 */
export function toEditColumns(mc: MasterContract): Record<string, string> {
  const term = PAYMENT_TERMS.find((p) => p.code === mc.paymentTerms)
  return {
    ZAMT: dec(mc.amtUSD, 2),
    ZORG_AMT: dec(mc.amtUSD * mc.exRate, 2),
    ZPAY_TERMS: clip(mc.paymentTerms, 4),
    ZPAY_TERMS_TEXT: clip(term?.desc, 50),
    ZMOD_ID: clip(mc.fxModel, 10),
    ZMOD_DESC: clip(mc.modelDesc, 40),
    ZENT_ID: clip(mc.entityId, 20),
    ZENT_DESC: clip(mc.entities.join('-'), 80),
    ZCURR_ID: clip(mc.currId, 20),
    ZCURR_DESC: clip(mc.currChain.join('-'), 80),
    ZOCURR: clip(mc.currChain[mc.currChain.length - 1] ?? mc.currOrigin, 5),
  }
}

/** Writes an edited contract; returns who ZCHANGED_BY was stamped as. */
export async function saveEdit(mc: MasterContract): Promise<string> {
  await updateMasterContract(String(mc.mcNumber), toEditColumns(mc))
  return sapUser()
}
