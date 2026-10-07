/**
 * FO: MC Error Correction against the SLC middleware.
 *
 * Mirrors ZSGTSF_MC_ERROR_CORR (ZSGTSFR093): the queue is every ZSGTSFTR_MAS_CON row at status
 * 11 (Error Correction) or 21 (Reversed by MO); Update & Resubmit writes the permitted fields
 * and moves 11 -> 13 or 21 -> 22; Reverse moves the MC to 12. One update per MC.
 *
 * What MySQL cannot answer keeps the screen's dummy values:
 *  - ZSGTSFV_MC, the view the program reads an MC's original state from (for the amended-date
 *    handling and the correction email / audit comparison), is not in MySQL. The MAS_CON row
 *    as it was read, before the user edits it, stands in as that original state.
 *  - ZSGTSFV_FX, which turns linked Treasury deals into an MC's utilization, is not in MySQL,
 *    so utilization is 0 and the MC balance is the full MC amount. No number is invented. The
 *    screen shows no linked Deal ID, so ZSGTSFTR_DEALID is not read either.
 *  - Masters registered but empty (PAYMENT, PORTGRP, RULE_BT) keep the dummies; REGION_CATALOG
 *    has no migrated master at all. The seed queue appears only when the middleware is down.
 */
import { distinctBy, loadMaster, replaceInPlace, txt, type MasterSource } from '../../shared/fx/masters.ts'
import { listMasterContracts, loadTransactions, setMcStatus, updateMasterContract, type McRow } from '../../shared/fx/master-contract.ts'
import { isAbort, type FxRow } from '../../shared/fx/mw.ts'
import { loadRegions } from '../../shared/fx/regions.ts'
import { clip, dec, dmyFromIso, isoFromDmy, num } from '../../shared/fx/sap.ts'
import {
  CURRENCY_CODE_BY_STRING,
  ENTITY_ID_BY_STRING,
  FX_MODELS,
  ORIGIN_ENTITIES,
  PAYMENT_TERMS,
  PORT_REGION_GROUPS,
  REGION_CATALOG,
  buildFreshDataset,
  findPaymentTerm,
  findRegion,
} from './data.ts'
import { portDescription } from './logic.ts'
import type { CodeLabel, ErrorRow, FxModel } from './types.ts'

/** The statuses the program lists for correction. */
export const QUEUE_STATUSES = ['11', '21'] as const
/** Reverse, from either queue status. */
export const REVERSED_BY_FO = '12'

/** Update & Resubmit: an 11 goes to 13, a correction of a 21 to 22. */
export const correctionStatus = (abapStatus: string | undefined): string => (abapStatus === '21' ? '22' : '13')

/** ZSGTSFTR_COMP.ZREG_ID by entity code (ZCOM_ID), once comp has loaded. */
let compRegions: ReadonlyMap<string, string> = new Map()

// ---------------------------------------------------------------- masters

export type MasterSources = Record<'entities' | 'fxModels' | 'paymentTerms' | 'portGroups', MasterSource>

/** Loads every value help and swaps it into data.ts in place. */
export async function loadMasters(signal?: AbortSignal): Promise<MasterSources> {
  const [entities, models, terms, ports] = await Promise.all([
    loadMaster(
      'comp',
      (rows) => {
        // Every company's region, so a row's Region follows its origin entity.
        compRegions = new Map(rows.map((r) => [txt(r, 'ZCOM_ID'), txt(r, 'ZREG_ID')]))
        // ZORIGIN = 'X' marks the origin entities an MC can be raised for.
        return rows
          .filter((r) => txt(r, 'ZORIGIN') === 'X')
          .map((r) => ({ code: txt(r, 'ZCOM_ID'), companyCode: txt(r, 'ZBUKRS'), name: txt(r, 'ZBUTXT'), currency: txt(r, 'ZWAERS') }))
      },
      ORIGIN_ENTITIES,
      { signal },
    ),
    loadMaster('fxModel', toFxModels, FX_MODELS, { signal }),
    loadMaster(
      'paymentTerm',
      // This screen's dropdown prefixes the code itself, so the label is ZTEXT1 alone.
      (rows) => rows.map((r) => ({ code: txt(r, 'ZTERM'), label: txt(r, 'ZTEXT1') })),
      PAYMENT_TERMS,
      { signal },
    ),
    loadMaster('portGroup', toPortGroups, PORT_REGION_GROUPS, { signal }),
  ])

  replaceInPlace(ORIGIN_ENTITIES, entities.rows)
  replaceInPlace(FX_MODELS, models.rows)
  replaceInPlace(PAYMENT_TERMS, terms.rows)
  replaceInPlace(PORT_REGION_GROUPS, ports.rows)
  // ZSGTSFSH_REGION: the SAP region codes (shared/fx/regions.ts). The seed stays only if SAP cannot be read.
  const regions = await loadRegions(signal).catch((error: unknown) => {
    if (isAbort(error)) throw error
    return null
  })
  if (regions?.length) replaceInPlace(REGION_CATALOG, regions.map((r) => ({ code: r.id, label: r.name })))

  return { entities: entities.source, fxModels: models.source, paymentTerms: terms.source, portGroups: ports.source }
}

/**
 * ZSGTSFTR_RULE_BT repeats a model once per controlling area / link model. One entry per
 * model and currency string, and a model with more than one string gets an id per string,
 * as the dummy's M034a / M034b did.
 */
export function toFxModels(rows: FxRow[]): FxModel[] {
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

/** ZSGTSFTR_PORTGRP: code ZPORT_GRP, label ZPORT_GRP_SDESC, final description ZPORT_GRP_DESC. */
export function toPortGroups(rows: FxRow[]): CodeLabel[] {
  return rows
    .map((r) => {
      const desc = txt(r, 'ZPORT_GRP_DESC')
      const group: CodeLabel = { code: txt(r, 'ZPORT_GRP'), label: txt(r, 'ZPORT_GRP_SDESC') || desc }
      if (desc) group.desc = desc
      return group
    })
    .filter((g) => g.code)
}

// ---------------------------------------------------------------- queue

export type LoadedQueue = { rows: ErrorRow[]; source: MasterSource }

/**
 * The MCs awaiting FO correction (status 11 or 21). An empty answer is a real one — nothing
 * is waiting — and the seed rows only appear when the middleware cannot be reached.
 */
export function loadQueue(signal?: AbortSignal): Promise<LoadedQueue> {
  return loadTransactions(
    async () => (await listMasterContracts({ 'ZMC_STAT[in]': QUEUE_STATUSES.join(',') }, signal)).map((r) => toErrorRow(r)),
    buildFreshDataset,
    'MC Error Correction',
  )
}

const same = (a: string, b: string | undefined) => !!b && a.toLowerCase() === b.trim().toLowerCase()

/**
 * The port group a stored ZPOS / ZPOD came from. The program stores the group's final
 * description, not its code, so the code is found again by matching ZPORT_GRP_DESC, the short
 * description or the dummy label (and the legacy wording a dummy group writes).
 */
export function matchPortGroup(stored: string, groups: readonly CodeLabel[] = PORT_REGION_GROUPS): CodeLabel | undefined {
  const text = stored.trim()
  if (!text) return undefined
  return groups.find((g) => same(text, g.desc) || same(text, g.label) || same(text, portDescription(g)))
}

/** A port as the row keeps it: the group's code, or the stored text when no group matched. */
function portFields(stored: string): { code: string; text: string | undefined } {
  const group = matchPortGroup(stored)
  return group ? { code: group.code, text: undefined } : { code: '', text: stored || undefined }
}

/**
 * One MAS_CON row as the correction queue shows it. The row read here is also the MC's
 * "original state" — ZSGTSFV_MC is not in MySQL (see the header).
 */
export function toErrorRow(r: McRow, regions: ReadonlyMap<string, string> = compRegions): ErrorRow {
  const abapStatus = txt(r, 'ZMC_STAT')
  const fxCode = txt(r, 'ZMOD_ID')
  const currencyS = txt(r, 'ZCURR_DESC')
  // The stored model code and currency string point back at the model's id (M034a / M034b).
  const model = FX_MODELS.find((m) => m.code === fxCode && m.currency === currencyS) ?? FX_MODELS.find((m) => m.code === fxCode)
  const entityString = txt(r, 'ZENT_DESC') || model?.entity || ''
  const mcAmt = num(r['ZAMT'])
  const shipEnd = dmyFromIso(r['ZSHIP_END'])
  const paymentTermsCode = txt(r, 'ZPAY_TERMS')
  const commodityText = txt(r, 'ZCOM_DESC_LONG') || txt(r, 'ZCOM_DESC')
  const origin = txt(r, 'ZORIGIN')
  const ship = portFields(txt(r, 'ZPOS'))
  const dest = portFields(txt(r, 'ZPOD'))

  const row: ErrorRow = {
    mcRef: Number(txt(r, 'ZMC_REF_NO')),
    fxId: model?.id ?? fxCode,
    fxCode,
    modelDesc: txt(r, 'ZMOD_DESC') || model?.desc || '',
    // The stored IDs first; the screen's string -> ID tables only for a row without one.
    entityId: txt(r, 'ZENT_ID') || ENTITY_ID_BY_STRING[entityString] || '',
    entityString,
    currencyI: txt(r, 'ZCURR_ID') || CURRENCY_CODE_BY_STRING[currencyS] || '',
    currencyS,
    // ZSGTSFV_FX is not in MySQL: nothing is known to be utilized, so the balance is the MC amount.
    mcBalAmt: mcAmt,
    mcAmt,
    mcAmountOrigin: num(r['ZORG_AMT']),
    curr1: txt(r, 'ZCURR') || 'USD',
    exRate: num(r['ZEX_RATE']),
    mcDate: dmyFromIso(r['ZMC_DATE']),
    origin,
    mcDescription: txt(r, 'ZMC_DESC'),
    gtCommodity: txt(r, 'ZCOMMODITY'),
    // The Comm Desc column shows the stored commodity text whenever there is one.
    specificCommodity: commodityText || null,
    commodityText,
    shipStart: dmyFromIso(r['ZSHIP_START']),
    shipEnd,
    paymentTermsCode,
    // MAS_CON has no payment-date column; the seed's derivation (shipment end) stands in.
    paymentDate: shipEnd,
    ownExplanation: txt(r, 'ZPAY_TERMS_TEXT') || findPaymentTerm(paymentTermsCode)?.label || '',
    shipRegionCode: ship.code,
    destRegionCode: dest.code,
    // No region master is migrated; the region is the origin entity's ZSGTSFTR_COMP.ZREG_ID.
    regionId: regions.get(origin) ?? '',
    // ZSGTSFV_FX is not in MySQL, so utilization is unavailable and shown as 0.
    utilization: 0,
    moRemarks: txt(r, 'ZMO_REMARKS'),
    foRemarks: txt(r, 'ZFO_REMARKS'),
    mcAmendedDate: dmyFromIso(r['ZAMENDMC_DATE']),
    status: 'correction',
    abapStatus,
  }
  if (ship.text !== undefined) row.shipPortText = ship.text
  if (dest.text !== undefined) row.destPortText = dest.text
  return row
}

/** A port column: the picked group's final description, or the stored text kept as it was. */
function portColumn(code: string, stored: string | undefined): string {
  const group = findRegion(code)
  return clip(group ? portDescription(group) : stored, 255)
}

/**
 * The MAS_CON columns Update & Resubmit writes: the fields the program lets FO correct, and
 * the next status. `row` is the corrected row (logic.ts's applyCorrection).
 */
export function correctionColumns(row: ErrorRow): Record<string, unknown> {
  return {
    ZAMENDMC_DATE: isoFromDmy(row.mcAmendedDate),
    ZAMT: dec(row.mcAmt, 2),
    ZEX_RATE: dec(row.exRate, 7),
    // Recalculated from USD × rate, as the program does.
    ZORG_AMT: dec(row.mcAmountOrigin, 2),
    ZSHIP_START: isoFromDmy(row.shipStart),
    ZSHIP_END: isoFromDmy(row.shipEnd),
    ZPAY_TERMS: clip(row.paymentTermsCode, 4),
    ZPAY_TERMS_TEXT: clip(findPaymentTerm(row.paymentTermsCode)?.label ?? row.ownExplanation, 50),
    ZPOS: portColumn(row.shipRegionCode, row.shipPortText),
    ZPOD: portColumn(row.destRegionCode, row.destPortText),
    ZFO_REMARKS: clip(row.foRemarks, 80),
    ZMC_STAT: correctionStatus(row.abapStatus),
  }
}

/** Update & Resubmit to MO: one update of the corrected MC. Returns the status written. */
export async function submitCorrection(row: ErrorRow): Promise<string> {
  const columns = correctionColumns(row)
  await updateMasterContract(String(row.mcRef), columns)
  return String(columns['ZMC_STAT'])
}

/** Reverse: the MC moves to 12. */
export async function reverseMc(row: ErrorRow): Promise<void> {
  await setMcStatus([String(row.mcRef)], REVERSED_BY_FO)
}
