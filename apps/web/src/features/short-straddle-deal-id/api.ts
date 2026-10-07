/**
 * RMC List – Deal ID Creation (Short Straddle, ZSGTSF_RMC_DEAL / ZSGTSFR102) against the SLC
 * middleware.
 *
 * Mirrors the report: the Short Straddle models from ZSGTSFTR_RULE_BT (ZSS = 'X'), the Master
 * Contracts booked under them from ZSGTSFTR_MAS_CON, their Deal IDs from ZSGTSFTR_DEALID and
 * their documents from ZSGTSFTR_MC_DMS / ZSGTSFTR_TSF_DMS. Create Deal ID inserts into
 * ZSGTSFTR_DEALID with the number drawn from the middleware's range (ZSGTSFNR01/01) and moves
 * the MC to 04; Reverse MC writes 21 with the MO remark; Edit MC writes the amount, payment
 * terms and model back to MAS_CON.
 *
 * What MySQL cannot answer keeps the screen's dummy values: masters that are registered but
 * empty (RULE_BT, PAYMENT, MC_STAT, TRADER, the two DMS tables), the trader's name (SAP
 * standard AT100, not in MySQL), the FX legs of each deal (view ZSGTSFV_FX over the SAP TRM
 * tables, not in MySQL), REGIONS and PORT_PAIRS, and the whole contract list when the
 * middleware cannot be reached at all.
 */
import { distinctBy, loadMaster, replaceInPlace, txt, type MasterSource } from '../../shared/fx/masters.ts'
import {
  createDeal,
  listDeals,
  listMasterContracts,
  setMcStatus,
  updateMasterContract,
  type DealRow,
  type McRow,
} from '../../shared/fx/master-contract.ts'
import { fxList, isAbort, type FxRow } from '../../shared/fx/mw.ts'
import { loadRegions } from '../../shared/fx/regions.ts'
import { clip, dateFromIso, dec, isoFromDate, num, sapUser } from '../../shared/fx/sap.ts'
import { loadMcStatuses } from '../../shared/fx/status.ts'
import {
  COMMODITIES,
  DOC_SOURCE,
  ENTITIES,
  FX_MODELS,
  INITIAL_DEAL_SEQ,
  MC_SEED,
  PAYMENT_TERMS,
  REGIONS,
  STATUS_CODES,
  STATUS_MASTER,
} from './data.ts'
import { addDays } from './format.ts'
import { buildSeed, payTermOf } from './logic.ts'
import type { Deal, DealStatus, FxModel, MasterContract, McStatus } from './types.ts'

/** ZSGTRMTR_TRADER, for the trade code a new Deal ID is stamped with. Empty in MySQL today. */
let traders: readonly FxRow[] = []

// ---------------------------------------------------------------- masters

export type MasterSources = Record<'entities' | 'fxModels' | 'commodities' | 'paymentTerms' | 'statuses' | 'traders', MasterSource>

/** Loads every master the report reads and swaps it into data.ts in place. */
export async function loadMasters(signal?: AbortSignal): Promise<MasterSources> {
  const [entities, models, commodities, terms, statuses, traderRows] = await Promise.all([
    loadMaster(
      'comp',
      (rows) =>
        distinctBy(
          rows.map((r) => ({ code: txt(r, 'ZCOM_ID'), name: txt(r, 'ZBUTXT'), region: txt(r, 'ZREG_ID') })).filter((e) => e.code),
          (e) => e.code,
        ),
      ENTITIES,
      { signal },
    ),
    // SELECT ... FROM zsgtsftr_rule_bt WHERE zss EQ abap_true.
    loadMaster('fxModel', toFxModels, FX_MODELS, { filter: { ZSS: 'X' }, signal }),
    loadMaster(
      'commodity',
      (rows) => rows.map((r) => ({ code: txt(r, 'ZCOM_ID'), desc: txt(r, 'ZCOM_SDESC') || txt(r, 'ZCOM_DESC') })),
      COMMODITIES,
      { signal },
    ),
    loadMaster('paymentTerm', (rows) => rows.map((r) => ({ code: txt(r, 'ZTERM'), desc: txt(r, 'ZTEXT1') })), PAYMENT_TERMS, {
      signal,
    }),
    loadMcStatuses(signal),
    loadMaster('trmTrader', (rows) => rows, [], { signal }),
  ])

  replaceInPlace(ENTITIES, entities.rows)
  replaceInPlace(FX_MODELS, models.rows)
  replaceInPlace(COMMODITIES, commodities.rows)
  replaceInPlace(PAYMENT_TERMS, terms.rows)

  // ZSGTSFSH_REGION: the SAP region codes (shared/fx/regions.ts). The seed list stays only if SAP cannot be read.
  const regions = await loadRegions(signal).catch((error: unknown) => {
    if (isAbort(error)) throw error
    return null
  })
  if (regions?.length) replaceInPlace(REGIONS, regions.map((r) => ({ id: r.id, name: r.name })))
  // MC_STAT's texts where MySQL has them. Its dummy is shared by every FX screen and words
  // some codes differently (04 In Use), so this screen's own texts stay until MC_STAT is migrated.
  if (statuses.source === 'mysql') {
    for (const code of STATUS_CODES) {
      const text = statuses.rows.find((s) => s.code === code)?.text
      if (text) STATUS_MASTER[code] = text
    }
  }
  traders = traderRows.rows

  return {
    entities: entities.source,
    fxModels: models.source,
    commodities: commodities.source,
    paymentTerms: terms.source,
    statuses: statuses.source,
    traders: traderRows.source,
  }
}

/**
 * RULE_BT repeats a model once per controlling area / link model; the screen keys its models
 * by ZMOD_ID alone, so the first row of each model is the one used (its ZTYPE / ZSUB_TYPE
 * become the Deal ID's type and sub type).
 */
export function toFxModels(rows: readonly FxRow[]): FxModel[] {
  return distinctBy(
    rows.filter((r) => txt(r, 'ZSS') === 'X' && txt(r, 'ZMOD_ID')),
    (r) => txt(r, 'ZMOD_ID'),
  ).map((r) => ({
    code: txt(r, 'ZMOD_ID'),
    desc: txt(r, 'ZMOD_DESC'),
    entities: splitString(txt(r, 'ZENT_DESC')),
    curr: splitString(txt(r, 'ZCURR_DESC')),
    entityId: txt(r, 'ZENT_ID'),
    currId: txt(r, 'ZCURR_ID'),
    origin: txt(r, 'ZORIGIN'),
    dealType: txt(r, 'ZTYPE'),
    subType: txt(r, 'ZSUB_TYPE'),
  }))
}

const splitString = (s: string): string[] => (s ? s.split('-').map((part) => part.trim()) : [])

// ---------------------------------------------------------------- contracts and deals

export type Loaded = { contracts: MasterContract[]; deals: Deal[]; lastSeq: number; source: MasterSource }

/**
 * The Master Contracts booked under a Short Straddle model, with their Deal IDs and documents.
 * An empty table is a real answer; the seed rows only appear when the middleware cannot be
 * reached. The status and "shipment window still open" rules stay the screen's own filters.
 */
export async function loadContracts(signal?: AbortSignal): Promise<Loaded> {
  try {
    const codes = FX_MODELS.map((m) => m.code).filter(Boolean)
    const rows = codes.length ? await listMasterContracts({ 'ZMOD_ID[in]': codes.join(',') }, signal) : []
    const refs = rows.map((r) => txt(r, 'ZMC_REF_NO'))
    const [dealRows, documents] = await Promise.all([listDeals(refs, signal), loadDocuments(refs, signal)])
    const contracts = rows.map((r) => toContract(r, documents.get(txt(r, 'ZMC_REF_NO'))))
    const byRef = new Map(contracts.map((c) => [c.mcRef, c]))
    const deals = dealRows.map((d) => toDeal(d, byRef.get(Number(txt(d, 'ZMC_REF')))))
    // lastSeq is the dummy counter, and only dummy mode ever draws from it.
    return { contracts, deals, lastSeq: INITIAL_DEAL_SEQ, source: 'mysql' }
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[fx] Short Straddle MCs: middleware unavailable — showing the dummy contracts', error)
    return { ...buildSeed(MC_SEED, INITIAL_DEAL_SEQ), source: 'dummy' }
  }
}

/** A DATS column as the screen's Date. A blank one reads as the epoch, which the ship-end filter drops as SAP's initial date would be. */
const day = (value: string | null | undefined): Date => dateFromIso(value) ?? new Date(0)

export type McDocument = { docDate: Date | null; sourcePath: string }

export function toContract(r: McRow, doc?: McDocument): MasterContract {
  const ref = txt(r, 'ZMC_REF_NO')
  const mcDate = day(r['ZMC_DATE'])
  const changedOn = dateFromIso(r['ZCHANGED_DATE'])
  const commodityCode = txt(r, 'ZCOMMODITY')
  return {
    mcRef: Number(ref),
    mcDesc: txt(r, 'ZMC_DESC'),
    mcDate,
    // UNSURE: MAS_CON has no Sell/Buy flag, only ZSELL / ZBUY (8 characters each). The most
    // literal reading: a contract with a ZBUY and no ZSELL is a Buy, anything else a Sell.
    sellBuy: !txt(r, 'ZSELL') && txt(r, 'ZBUY') ? 'B' : 'S',
    origin: txt(r, 'ZORIGIN'),
    amtUSD: num(r['ZAMT']),
    curr: txt(r, 'ZCURR') || 'USD',
    shipStart: day(r['ZSHIP_START']),
    shipEnd: day(r['ZSHIP_END']),
    commodityCode,
    commodityDesc: txt(r, 'ZCOM_DESC') || COMMODITIES.find((c) => c.code === commodityCode)?.desc || '',
    entityId: txt(r, 'ZENT_ID'),
    entityDesc: txt(r, 'ZENT_DESC'),
    currId: txt(r, 'ZCURR_ID'),
    currDesc: txt(r, 'ZCURR_DESC'),
    payTerms: txt(r, 'ZPAY_TERMS'),
    fxModel: txt(r, 'ZMOD_ID'),
    modelDesc: txt(r, 'ZMOD_DESC'),
    amtOrigin: num(r['ZORG_AMT']),
    origCurr: txt(r, 'ZOCURR'),
    exRate: num(r['ZEX_RATE']),
    mcStat: txt(r, 'ZMC_STAT') as McStatus,
    pos: txt(r, 'ZPOS'),
    pod: txt(r, 'ZPOD'),
    moRemarks: txt(r, 'ZMO_REMARKS'),
    foRemarks: txt(r, 'ZFO_REMARKS'),
    createdBy: txt(r, 'ZCREATED_BY'),
    createdOn: day(r['ZCREATED_DATE']),
    createdTime: txt(r, 'ZCREATED_TIME'),
    changedBy: txt(r, 'ZCHANGED_BY'),
    changedOn,
    // MC_DMS / TSF_DMS are empty in MySQL: without a document the screen's own derivation
    // stands in (three days after the MC date, a file named after the MC under DOC_SOURCE).
    docDate: doc?.docDate ?? addDays(mcDate, 3),
    sourcePath: doc?.sourcePath || `${DOC_SOURCE}${ref}_MC.pdf`,
  }
}

/**
 * A ZSGTSFTR_DEALID row as the screen's Deal. `mc` is the contract it was booked against,
 * for the FX legs.
 */
export function toDeal(r: DealRow, mc?: MasterContract): Deal {
  const amtUSD = num(r['ZDEAL_AMT'])
  const currDesc = txt(r, 'ZDEAL_CURR_DESC')
  return {
    dealId: txt(r, 'ZDEAL_ID'),
    mcRef: Number(txt(r, 'ZMC_REF')),
    dealDesc: txt(r, 'ZDEAL_DESC'),
    dealType: txt(r, 'ZDEAL_TYPE'),
    subType: txt(r, 'ZSUB_TYPE'),
    model: txt(r, 'ZTSF_MODEL'),
    sDate: day(r['ZS_DATE']),
    eDate: day(r['ZE_DATE']),
    amtUSD,
    tradeCode: txt(r, 'ZTRD_CODE'),
    dealStat: txt(r, 'ZDEAL_STAT') as DealStatus,
    currId: txt(r, 'ZDEAL_CURR_ID'),
    currDesc,
    // SAP reads the FX legs from view ZSGTSFV_FX (the linked Treasury deals), which is over
    // SAP TRM tables and not in MySQL. They are derived as the seed derived them: a USD leg
    // of the deal amount and an origin-currency leg of the amount at the MC's exchange rate.
    // The Utilized amount (sum of Amt1) is therefore the sum of ZDEAL_AMT, not of real legs.
    curr1: 'USD',
    curr2: mc?.origCurr || (splitString(currDesc).at(-1) ?? ''),
    amt1: amtUSD,
    amt2: amtUSD * (mc?.exRate ?? 0),
    createdBy: txt(r, 'ZCREATED_BY'),
    createdOn: day(r['ZCREATED_DATE']),
    createdTime: txt(r, 'ZCREATED_TIME'),
  }
}

// ---------------------------------------------------------------- documents

/** MC_DMS rows for the MCs, joined to TSF_DMS for the file path. Both are empty in MySQL today. */
async function loadDocuments(refs: readonly string[], signal?: AbortSignal): Promise<Map<string, McDocument>> {
  try {
    const mcDocs = await listIn('mcDocument', 'ZMC_REF_NO', refs, signal)
    const codes = [...new Set(mcDocs.map((d) => txt(d, 'ZDMS_CODE')).filter(Boolean))]
    const tsfDocs = await listIn('tsfDocument', 'ZTSF_DMS_CODE', codes, signal)
    return documentsByMc(mcDocs, tsfDocs)
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[fx] MC documents unavailable — showing the derived document date and path', error)
    return new Map()
  }
}

async function listIn(resource: string, column: string, values: readonly string[], signal?: AbortSignal): Promise<FxRow[]> {
  const out: FxRow[] = []
  for (let i = 0; i < values.length; i += 50) {
    out.push(...(await fxList(resource, { [`${column}[in]`]: values.slice(i, i + 50).join(',') }, { signal })))
  }
  return out
}

/**
 * One document per MC: its first MC_DMS row (UNSURE which DMS category/type the report shows
 * when an MC has several; the first is the literal choice), with ZSOURCE_PATH from the TSF_DMS
 * row whose ZTSF_DMS_CODE / ZSTND_DMS match its ZDMS_CODE / ZSTND_DMS.
 */
export function documentsByMc(mcDocs: readonly FxRow[], tsfDocs: readonly FxRow[]): Map<string, McDocument> {
  const out = new Map<string, McDocument>()
  for (const d of mcDocs) {
    const ref = txt(d, 'ZMC_REF_NO')
    if (!ref || out.has(ref)) continue
    const code = txt(d, 'ZDMS_CODE')
    const tsf =
      tsfDocs.find((t) => txt(t, 'ZTSF_DMS_CODE') === code && txt(t, 'ZSTND_DMS') === txt(d, 'ZSTND_DMS')) ??
      tsfDocs.find((t) => txt(t, 'ZTSF_DMS_CODE') === code)
    out.set(ref, { docDate: dateFromIso(d['ZDDATE']), sourcePath: tsf ? txt(tsf, 'ZSOURCE_PATH') : '' })
  }
  return out
}

// ---------------------------------------------------------------- Create Deal ID

/**
 * ZTRD_CODE is the trader's ZSGTRMTR_TRADER code (VARCHAR(3)) for the signed-in SAP user.
 * TRADER is empty in MySQL and the trader's name comes from SAP standard AT100 (BNAME ->
 * RDEALER), which is not in MySQL either, so with no row the column is written blank — the
 * dummy TRD-014 does not fit it — and the screen keeps showing the dummy trader.
 */
export function tradeCodeFor(rows: readonly FxRow[], user: string): string {
  if (!user) return ''
  const row = rows.find((r) => txt(r, 'ZTRADER').toUpperCase() === user)
  return row ? clip(txt(row, 'ZTCODE'), 3) : ''
}

/** The ZSGTSFTR_DEALID columns of a new deal. ZDEAL_ID is left to the middleware's range. */
export function dealColumns(deal: Deal, mc: MasterContract, tradeCode: string): Record<string, unknown> {
  // ZDEAL_TYPE / ZSUB_TYPE are key columns: a blank one is rejected (MISSING_PRIMARY_KEY).
  if (!deal.dealType || !deal.subType) {
    throw new Error(`FX Model ${mc.fxModel} has no deal type / sub type (ZTYPE / ZSUB_TYPE) in ZSGTSFTR_RULE_BT, so no Deal ID can be booked under it.`)
  }
  return {
    ZDEAL_TYPE: clip(deal.dealType, 10),
    ZSUB_TYPE: clip(deal.subType, 10),
    ZDEAL_DESC: clip(deal.dealDesc, 80),
    ZTSF_MODEL: clip(deal.model, 10),
    ZMC_REF: clip(String(deal.mcRef), 10),
    ZS_DATE: isoFromDate(deal.sDate),
    ZE_DATE: isoFromDate(deal.eDate),
    ZDEAL_AMT: dec(deal.amtUSD, 2),
    ZTRD_CODE: clip(tradeCode, 3),
    ZDEAL_STAT: deal.dealStat,
    ZMC_CURR_ID: clip(mc.currId, 20),
    ZMC_CURR_DESC: clip(mc.currDesc, 80),
    ZDEAL_CURR_ID: clip(deal.currId, 20),
    ZDEAL_CURR_DESC: clip(deal.currDesc, 80),
    ZSS: 'X',
  }
}

/** Inserts the deal; returns the Deal ID the range issued and the trade code written. */
export async function bookDeal(deal: Deal, mc: MasterContract): Promise<{ dealId: string; tradeCode: string }> {
  const tradeCode = tradeCodeFor(traders, await sapUser())
  const dealId = await createDeal(dealColumns(deal, mc, tradeCode))
  return { dealId, tradeCode }
}

/** UPDATE_DEAL_ID: the MC moves to 04 — Deal ID Created (In-Use). */
export async function markInUse(mc: MasterContract): Promise<void> {
  await setMcStatus([String(mc.mcRef)], '04')
}

// ---------------------------------------------------------------- Edit / Reverse MC

/** The MAS_CON columns Edit MC (dynpro 9001) changes, from the contract after applyEdit. */
export function editColumns(mc: MasterContract): Record<string, unknown> {
  return {
    ZAMT: dec(mc.amtUSD, 2),
    ZORG_AMT: dec(mc.amtOrigin, 2),
    ZPAY_TERMS: clip(mc.payTerms, 4),
    ZPAY_TERMS_TEXT: clip(payTermOf(mc.payTerms)?.desc, 50),
    ZMOD_ID: clip(mc.fxModel, 10),
    ZMOD_DESC: clip(mc.modelDesc, 40),
    ZENT_ID: clip(mc.entityId, 20),
    ZENT_DESC: clip(mc.entityDesc, 80),
    ZCURR_ID: clip(mc.currId, 20),
    ZCURR_DESC: clip(mc.currDesc, 80),
    // applyEdit also takes the origin currency from the new model; stored so a reload agrees.
    ZOCURR: clip(mc.origCurr, 5),
  }
}

export async function saveEdit(mc: MasterContract): Promise<void> {
  await updateMasterContract(String(mc.mcRef), editColumns(mc))
}

/** USER_COMMAND_9000: status 21 — Reversed by MO, the remark stored as the MO remark. */
export async function reverseContract(mc: MasterContract, remark: string): Promise<void> {
  await setMcStatus([String(mc.mcRef)], '21', { ZMO_REMARKS: clip(remark.trim(), 80) })
}
