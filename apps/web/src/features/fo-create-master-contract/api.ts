/**
 * FO: Create Master Contract against the SLC middleware.
 *
 * Mirrors ZSGTSFP001: masters from the ZSGTSFTR_* value-help tables, the contract into
 * ZSGTSFTR_MAS_CON at status 01 with its number drawn from the middleware's range, the six
 * T1/T2/T3 child combinations into ZSGTSFTR_MCCHILD, and Release to MO as 01 -> 02.
 *
 * What MySQL cannot answer keeps the screen's dummy values: masters that are registered but
 * empty (PAYMENT, PORTGRP, RULE_BT, TOLR), the currency-string IDs (no master is migrated),
 * T001/ADRC's Operating Unit filter (standard tables, not in MySQL), and the whole contract
 * list when the middleware cannot be reached at all.
 */
import { distinctBy, entityIdFor, loadMaster, replaceInPlace, txt, type MasterSource } from '../../shared/fx/masters.ts'
import {
  createChildren,
  createMasterContract,
  listChildren,
  listDeals,
  listMasterContracts,
  liveDealsByMc,
  setMcStatus,
  updateMasterContract,
  type ChildRow,
  type McRow,
} from '../../shared/fx/master-contract.ts'
import { fxList, isAbort, type FxRow } from '../../shared/fx/mw.ts'
import { clip, dec, dmyFromIso, isoFromDmy, num } from '../../shared/fx/sap.ts'
import { loadMcStatuses, statusText, type McStatusRow } from '../../shared/fx/status.ts'
import {
  COMMODITIES,
  CURRENCY_ID_BY_STRING,
  DEFAULT_TOLERANCE,
  FIRST_CHILD_REFS,
  FX_MODELS,
  ORIGIN_ENTITIES,
  PAYMENT_TERMS,
  PORTS,
  findCommodity,
  findEntity,
  findPaymentTerm,
  isMultiCommodity,
  seedContracts,
} from './data.ts'
import { commodityNames, seedChildStore } from './logic.ts'
import type { ChildContract, ChildStore, FxModel, MasterContract, TradeType } from './types.ts'

/** This screen's own words for the statuses it styles; any other code shows MC_STAT's text. */
const STATUS_LABEL: Record<string, string> = {
  '01': 'Created',
  '02': 'Released to M.O.',
  '03': 'Confirmed',
  '04': 'In Use',
}

let statuses: readonly McStatusRow[] = []

// ---------------------------------------------------------------- masters

export type MasterSources = Record<'entities' | 'commodities' | 'paymentTerms' | 'ports' | 'fxModels' | 'tolerance', MasterSource>

/**
 * Company codes offered as an origin although the company master (ZSGTSFTR_COMP) does not flag
 * them ZORIGIN = 'X'. SG03 (OGA) is the one company code of the test systems that exists in SAP, so
 * a Master Contract raised for it can be used there. The original program lists only the flagged
 * entities: when the master data flags SG03 itself this entry changes nothing, and it can be removed.
 */
export const EXTRA_ORIGIN_COMPANY_CODES: readonly string[] = ['SG03']

/** The origin entities an MC can be raised for: those flagged ZORIGIN = 'X', plus the extra company codes above. */
export function toOriginEntities(rows: readonly FxRow[]) {
  return rows
    .filter((r) => txt(r, 'ZORIGIN') === 'X' || EXTRA_ORIGIN_COMPANY_CODES.includes(txt(r, 'ZBUKRS')))
    .map((r) => ({ code: txt(r, 'ZCOM_ID'), companyCode: txt(r, 'ZBUKRS'), name: txt(r, 'ZBUTXT'), currency: txt(r, 'ZWAERS') }))
}

/** Loads every value help and swaps it into data.ts in place. */
export async function loadMasters(signal?: AbortSignal): Promise<MasterSources> {
  const [entities, commodities, terms, ports, models, tolerance, mcStatuses] = await Promise.all([
    loadMaster(
      'comp',
      // ZORIGIN = 'X' marks the origin entities an MC can be raised for (plus EXTRA_ORIGIN_COMPANY_CODES).
      toOriginEntities,
      ORIGIN_ENTITIES,
      { signal },
    ),
    loadMaster(
      'commodity',
      (rows) => rows.map((r) => ({ code: txt(r, 'ZCOM_ID'), name: txt(r, 'ZCOM_SDESC') || txt(r, 'ZCOM_DESC'), desc: txt(r, 'ZCOM_DESC') })),
      COMMODITIES,
      { signal },
    ),
    loadMaster(
      'paymentTerm',
      (rows) => rows.map((r) => ({ code: txt(r, 'ZTERM'), label: `${txt(r, 'ZTERM')} - ${txt(r, 'ZTEXT1')}` })),
      PAYMENT_TERMS,
      { signal },
    ),
    loadMaster(
      'portGroup',
      (rows) => rows.map((r) => txt(r, 'ZPORT_GRP_DESC') || txt(r, 'ZPORT_GRP_SDESC')).filter(Boolean),
      PORTS,
      { signal },
    ),
    loadMaster('fxModel', toFxModels, FX_MODELS, { signal }),
    // The program reads tolerance ID T01 as the Master Contract tolerance.
    loadMaster('tolerance', (rows) => rows.filter((r) => txt(r, 'ZTOL_ID') === 'T01').map((r) => num(r['ZTOL_PER'])), [DEFAULT_TOLERANCE.T01]),
    loadMcStatuses(signal),
  ])

  replaceInPlace(ORIGIN_ENTITIES, entities.rows)
  replaceInPlace(COMMODITIES, commodities.rows)
  replaceInPlace(PAYMENT_TERMS, terms.rows)
  replaceInPlace(PORTS, ports.rows)
  replaceInPlace(FX_MODELS, models.rows)
  DEFAULT_TOLERANCE.T01 = tolerance.rows[0] ?? DEFAULT_TOLERANCE.T01
  statuses = mcStatuses.rows

  // A dummy model has no ZENT_ID / ZCURR_ID. ENT_STR is migrated, so the entity ID is
  // looked up there; the currency-string ID has no master in MySQL and stays a dummy.
  if (models.source === 'dummy') {
    const entityStrings = await fxList('entityString', {}, { signal }).catch(() => [] as FxRow[])
    for (const m of FX_MODELS) {
      m.entityId ||= entityIdFor(entityStrings, m.entity)
      m.currId ||= CURRENCY_ID_BY_STRING[m.currency] ?? ''
    }
  }

  return {
    entities: entities.source,
    commodities: commodities.source,
    paymentTerms: terms.source,
    ports: ports.source,
    fxModels: models.source,
    tolerance: tolerance.source,
  }
}

/**
 * ZSGTSFTR_RULE_BT repeats a model once per controlling area / link model. One entry per
 * model and currency string is what the dropdown offers; a model with more than one string
 * gets an id per string, as the dummy's M034a / M034b did.
 */
function toFxModels(rows: FxRow[]): FxModel[] {
  const distinct = distinctBy(rows, (r) => `${txt(r, 'ZMOD_ID')}|${txt(r, 'ZCURR_DESC')}`)
  const perCode = new Map<string, number>()
  for (const r of distinct) perCode.set(txt(r, 'ZMOD_ID'), (perCode.get(txt(r, 'ZMOD_ID')) ?? 0) + 1)
  return distinct.map((r) => {
    const code = txt(r, 'ZMOD_ID')
    return {
      id: (perCode.get(code) ?? 0) > 1 ? `${code}-${txt(r, 'ZCURR_ID')}` : code,
      code,
      desc: txt(r, 'ZMOD_DESC'),
      entity: txt(r, 'ZENT_DESC'),
      currency: txt(r, 'ZCURR_DESC'),
      entityId: txt(r, 'ZENT_ID'),
      currId: txt(r, 'ZCURR_ID'),
    }
  })
}

// ---------------------------------------------------------------- contracts

export type Loaded = { contracts: MasterContract[]; children: ChildStore; source: MasterSource }

export { loadLinkedDeals } from '../../shared/fx/master-contract.ts'

/**
 * Every Master Contract with its children and linked Deal IDs. An empty table is a real
 * answer; the seed contracts only appear when the middleware cannot be reached.
 */
export async function loadContracts(signal?: AbortSignal): Promise<Loaded> {
  try {
    const rows = await listMasterContracts({}, signal)
    const refs = rows.map((r) => txt(r, 'ZMC_REF_NO'))
    const [deals, children] = await Promise.all([listDeals(refs, signal), listChildren(refs, signal)])
    const linked = liveDealsByMc(deals)
    return {
      contracts: rows.map((r) => toContract(r, linked.get(txt(r, 'ZMC_REF_NO'))?.[0]?.['ZDEAL_ID'] ?? null)),
      children: toChildStore(children),
      source: 'mysql',
    }
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[fx] Master Contracts: middleware unavailable — showing the dummy contracts', error)
    const contracts = seedContracts()
    return { contracts, children: seedChildStore(contracts, FIRST_CHILD_REFS), source: 'dummy' }
  }
}

export function toContract(r: McRow, linkedDealId: string | null): MasterContract {
  const code = txt(r, 'ZMC_STAT')
  const commodityCode = txt(r, 'ZCOMMODITY')
  const modelCode = txt(r, 'ZMOD_ID')
  const currencyString = txt(r, 'ZCURR_DESC')
  const model =
    FX_MODELS.find((m) => m.code === modelCode && m.currency === currencyString) ?? FX_MODELS.find((m) => m.code === modelCode)
  const shipEnd = dmyFromIso(r['ZSHIP_END'])
  const multi = isMultiCommodity(commodityCode)

  return {
    mcNumber: Number(txt(r, 'ZMC_REF_NO')),
    status: STATUS_LABEL[code] ?? statusText(statuses, code),
    statusCode: code,
    originEntity: txt(r, 'ZORIGIN'),
    originEntityName: findEntity(txt(r, 'ZORIGIN'))?.name ?? '',
    originCurrency: txt(r, 'ZOCURR'),
    fxModelId: model?.id ?? modelCode,
    fxModelCode: modelCode,
    fxModelDesc: txt(r, 'ZMOD_DESC'),
    entityString: txt(r, 'ZENT_DESC'),
    currencyString,
    commodityCode,
    commodityName: txt(r, 'ZCOM_DESC') || findCommodity(commodityCode)?.name || commodityCode,
    // The picked child commodities are only kept as ZCOM_DESC_LONG's names.
    selectedCommodities: multi
      ? txt(r, 'ZCOM_DESC_LONG')
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean)
          .map((name) => COMMODITIES.find((c) => c.name === name || c.desc === name)?.code ?? name)
      : null,
    mcDate: dmyFromIso(r['ZMC_DATE']),
    mcAmountUsd: num(r['ZAMT']),
    mcAmountOrigin: num(r['ZORG_AMT']),
    exchangeRate: num(r['ZEX_RATE']),
    // MAS_CON has no tolerance column: the program reads T01 from ZSGTSFTR_TOLR each time.
    tolerance: DEFAULT_TOLERANCE.T01,
    reference: txt(r, 'ZMC_DESC'),
    paymentTerms: txt(r, 'ZPAY_TERMS'),
    // Nor a payment date; the form's own default (shipment end) stands in.
    paymentDate: shipEnd,
    portShipment: txt(r, 'ZPOS'),
    portDestination: txt(r, 'ZPOD'),
    shipStart: dmyFromIso(r['ZSHIP_START']),
    shipEnd,
    linkedDealId,
  }
}

/** The MAS_CON columns a contract writes. Status is left to the caller. */
export function toMasCon(c: MasterContract): Record<string, unknown> {
  const model = FX_MODELS.find((m) => m.id === c.fxModelId)
  const term = findPaymentTerm(c.paymentTerms)
  const commodityLong =
    c.selectedCommodities && c.selectedCommodities.length ? commodityNames(c.selectedCommodities).join(', ') : findCommodity(c.commodityCode)?.desc ?? c.commodityName

  return {
    ZMC_DESC: clip(c.reference, 80),
    ZMC_DATE: isoFromDmy(c.mcDate),
    ZORIGIN: clip(c.originEntity, 8),
    ZAMT: dec(c.mcAmountUsd, 2),
    ZCURR: 'USD',
    ZORG_AMT: dec(c.mcAmountOrigin, 2),
    ZOCURR: clip(c.originCurrency, 5),
    ZEX_RATE: dec(c.exchangeRate, 7),
    ZSHIP_START: isoFromDmy(c.shipStart),
    ZSHIP_END: isoFromDmy(c.shipEnd),
    ZCOMMODITY: clip(c.commodityCode, 4),
    ZCOM_DESC: clip(c.commodityName, 80),
    ZCOM_DESC_LONG: clip(commodityLong, 255),
    ZENT_ID: clip(model?.entityId, 20),
    ZENT_DESC: clip(c.entityString, 80),
    ZCURR_ID: clip(model?.currId, 20),
    ZCURR_DESC: clip(c.currencyString, 80),
    ZMOD_ID: clip(c.fxModelCode, 10),
    ZMOD_DESC: clip(c.fxModelDesc, 40),
    ZPAY_TERMS: clip(c.paymentTerms, 4),
    // PAYMENT's ZTEXT1 without the code the dropdown label prefixes it with.
    ZPAY_TERMS_TEXT: clip((term?.label ?? '').replace(new RegExp(`^${c.paymentTerms}\\s*-\\s*`), ''), 50),
    ZPOS: clip(c.portShipment, 255),
    ZPOD: clip(c.portDestination, 255),
  }
}

/** Inserts a new contract at status 01 and returns the MC number the range issued. */
export async function createContract(c: MasterContract): Promise<number> {
  return Number(await createMasterContract({ ...toMasCon(c), ZMC_STAT: '01' }))
}

export async function updateContract(c: MasterContract): Promise<void> {
  await updateMasterContract(String(c.mcNumber), toMasCon(c))
}

/** ABAP RELEASE_TO_MO: only status 01 moves, to 02. */
export async function releaseContracts(list: readonly MasterContract[]): Promise<void> {
  await setMcStatus(
    list.filter((c) => (c.statusCode ?? '') === '01').map((c) => String(c.mcNumber)),
    '02',
  )
}

// ---------------------------------------------------------------- ZSGTSFTR_MCCHILD

/**
 * The child row as stored. The mapping is inferred (user-approved 2026-09-25) and still
 * needs SE11 on ZSGTSFTR_MCCHILD to confirm:
 *
 *   ZMC_CHILD   the child reference (T1 110001…, shared by the Sell and Purchase side)
 *   ZCHILD_TYPE the side code, 02 Sell / 01 Purchase — so the pair stays unique
 *   ZTRADE      T1 / T2 / T3,  ZPS  S / P,  ZMC_NO  "2026 / <MC> / T1S"
 */
export function toChildRow(ch: ChildContract, mc: MasterContract): Record<string, unknown> {
  return {
    ZMC_REF: String(ch.parentMcNumber),
    ZMC_CHILD: String(ch.childReference),
    ZCHILD_TYPE: ch.sideCode,
    ZCHILD_AMT: dec(mc.mcAmountUsd, 2),
    ZCHILD_CURR: 'USD',
    ZMC_NO: clip(ch.childContractNo, 50),
    ZMC_DESC: clip(ch.description, 80),
    ZSELL: clip(ch.sellEntity, 8),
    ZBUY: clip(ch.buyEntity, 8),
    ZPS: ch.side === 'Sell' ? 'S' : 'P',
    ZTRADE: ch.tradeType,
  }
}

export function fromChildRow(r: ChildRow): ChildContract {
  const side = txt(r, 'ZPS') === 'S' ? 'Sell' : 'Purchase'
  const trade = txt(r, 'ZTRADE')
  return {
    parentMcNumber: Number(txt(r, 'ZMC_REF')),
    childType: `${trade}${side === 'Sell' ? 'S' : 'P'}`,
    childContractNo: txt(r, 'ZMC_NO'),
    childReference: Number(txt(r, 'ZMC_CHILD')),
    description: txt(r, 'ZMC_DESC'),
    sellEntity: txt(r, 'ZSELL'),
    buyEntity: txt(r, 'ZBUY'),
    side,
    sideCode: txt(r, 'ZCHILD_TYPE'),
    tradeType: trade,
  }
}

const CHILD_ORDER = ['T1S', 'T1P', 'T2S', 'T2P', 'T3S', 'T3P']

/**
 * The stored children by MC, and where the T1/T2/T3 counters stand.
 *
 * STOPGAP: SAP takes the child references from its TVARVC trade-type configuration, which
 * is a standard table and not in MySQL. Until it is, the next reference is the dummy
 * starting value or one past the highest stored — read client-side, so two people creating
 * at the same moment could draw the same child reference. The row key stays unique because
 * it includes the MC number, which the middleware issues.
 */
export function toChildStore(rows: readonly ChildRow[]): ChildStore {
  const byMc: Record<string, ChildContract[]> = {}
  const nextRef: Record<TradeType, number> = { ...FIRST_CHILD_REFS }
  for (const r of rows) {
    const ch = fromChildRow(r)
    ;(byMc[String(ch.parentMcNumber)] ??= []).push(ch)
    const trade = ch.tradeType as TradeType
    if (trade in nextRef && ch.childReference >= nextRef[trade]) nextRef[trade] = ch.childReference + 1
  }
  for (const list of Object.values(byMc)) list.sort((a, b) => CHILD_ORDER.indexOf(a.childType) - CHILD_ORDER.indexOf(b.childType))
  return { byMc, nextRef }
}

export async function saveChildren(children: readonly ChildContract[], mc: MasterContract): Promise<void> {
  await createChildren(children.map((ch) => toChildRow(ch, mc)))
}
