/**
 * The Additional Spot Booking list (ZSGTSFR094 / ZSGTSFR_SPOT_CREATE) from the SLC middleware.
 *
 * Rows are ZSGTSFTR_IN_SPOT — one per Deal ID leg, keyed ZMOD_ID + ZDEAL_ID + ZDEAL_TYPE +
 * ZDSS_TYPE. ZF_AMT is the final (invoiced) amount, ZFX_AMT what the FX deal covers and ZD_AMT
 * the difference a spot has to cover; ZSPOT_TXN / ZSPOT_CREATE say whether that spot exists.
 *
 * Joined to:
 *  - ZSGTSFTR_COMP for the company name;
 *  - ZSGTSFV_FX, on company code + original transaction, for what IN_SPOT does not carry:
 *    trade date (DBLFZ), value date (DELFZ), partner (KONTRH / BP_NAME) and the other currency
 *    of the pair. A leg whose transaction is not in the view keeps those blank.
 *
 * There is deliberately no seed fallback: a row here can be sent to SAP and book a real FTR
 * deal, so a screen that cannot read IN_SPOT shows nothing rather than invented rows.
 */
import { txt } from '../../shared/fx/masters.ts'
import { fxList, type FxRow } from '../../shared/fx/mw.ts'
import { dmyFromIso, num } from '../../shared/fx/sap.ts'
import { DEFAULT_TXN_TYPE } from './data.ts'
import type { Side, SpotRow } from './types.ts'

/** The business-partner column of ZSGTSFV_FX reads "0400000002 - FMC Corporation". */
export function splitPartner(value: string): { code: string; name: string } {
  const m = /^(\d+)\s*-\s*(.*)$/.exec(value.trim())
  return m ? { code: m[1]!, name: m[2]!.trim() } : { code: '', name: value.trim() }
}

export type SpotContext = {
  /** Company names, by ZBUKRS. */
  companies: ReadonlyMap<string, string>
  /** ZSGTSFV_FX rows, by "BUKRS|RFHA". */
  fx: ReadonlyMap<string, FxRow>
}

export const fxKey = (bukrs: string, rfha: string): string => `${bukrs}|${rfha}`

/** The row id doubles as the IN_SPOT key, so a write-back needs nothing else. */
export const spotId = (r: FxRow): string => [txt(r, 'ZMOD_ID'), txt(r, 'ZDEAL_ID'), txt(r, 'ZDEAL_TYPE'), txt(r, 'ZDSS_TYPE')].join('|')

export function spotKey(row: Pick<SpotRow, 'modelId' | 'dealId' | 'dealType' | 'dssType'>): Record<string, string> {
  return { ZMOD_ID: row.modelId, ZDEAL_ID: row.dealId, ZDEAL_TYPE: row.dealType, ZDSS_TYPE: row.dssType }
}

/** A DECIMAL column of the view that may be missing or blank: null (shown blank), never 0. */
const servedNum = (v: string | number | null | undefined): number | null => {
  const x = num(v)
  return x === 0 ? null : x
}

export function toSpotRow(r: FxRow, ctx: SpotContext): SpotRow {
  const bukrs = txt(r, 'ZBUKRS')
  const rfha = txt(r, 'ZRFHA')
  const currency = txt(r, 'ZCURR')
  const fx = bukrs && rfha ? ctx.fx.get(fxKey(bukrs, rfha)) : undefined
  const partner = fx ? splitPartner(txt(fx, 'BP_NAME')) : { code: '', name: '' }
  const curr1 = fx ? txt(fx, 'CURR1') : ''
  const curr2 = fx ? txt(fx, 'CURR2') : ''
  const side = txt(r, 'ZBS')
  return {
    id: spotId(r),
    modelId: txt(r, 'ZMOD_ID'),
    dealId: txt(r, 'ZDEAL_ID'),
    dealType: txt(r, 'ZDEAL_TYPE'),
    dssType: txt(r, 'ZDSS_TYPE'),
    companyCode: bukrs,
    companyName: ctx.companies.get(bukrs) ?? '',
    originalTxn: rfha,
    tradeType: txt(r, 'ZT_TYPE'),
    finalAmt: num(r['ZF_AMT']),
    fxDealAmt: num(r['ZFX_AMT']),
    currency,
    // The pair's other leg: whichever currency of the original deal is not the row's.
    otherCurrency: curr1 && curr1 !== currency ? curr1 : curr2 && curr2 !== currency ? curr2 : '',
    diffAmt: num(r['ZD_AMT']),
    spotTxn: txt(r, 'ZSPOT_TXN'),
    tradeDate: fx ? dmyFromIso(fx['DBLFZ']) : '',
    valueDate: fx ? dmyFromIso(fx['DELFZ']) : '',
    ndfDate: fx ? dmyFromIso(fx['NDF_DATE']) : '',
    ndfRef: fx ? txt(fx, 'NDF_REF') : '',
    ndfRate: fx ? servedNum(fx['NDF_RATE']) : null,
    cashAmt: fx ? servedNum(fx['ZCASH_AMT']) : null,
    cashCurr: fx ? txt(fx, 'CASH_CURR') : '',
    partner: (fx && txt(fx, 'KONTRH')) || partner.code,
    partnerName: partner.name,
    // ZSGTSFV_FX carries no group yet (ZGRP is a TSF append not migrated).
    group: '',
    side: (side === 'Sell' ? 'Sell' : 'Buy') as Side,
    tsfEntity: txt(r, 'ZSBUKRS'),
    createdBy: txt(r, 'ZCREATED_BY'),
    createdDate: dmyFromIso(r['ZCREATED_DATE']),
    defaultTxnType: DEFAULT_TXN_TYPE,
  }
}

/** `col[in]` reads, 50 values at a time to keep the URLs short. */
async function inChunks(resource: string, column: string, values: readonly string[], signal?: AbortSignal): Promise<FxRow[]> {
  const out: FxRow[] = []
  for (let i = 0; i < values.length; i += 50) {
    const chunk = values.slice(i, i + 50)
    if (chunk.length) out.push(...(await fxList(resource, { [`${column}[in]`]: chunk.join(',') }, { signal })))
  }
  return out
}

/**
 * The legacy load condition: a row needs a DSS deal type and a non-zero difference amount. Everything
 * else in IN_SPOT is not a Spot candidate and is dropped. (The Upto Trade Date is not a database filter
 * in the legacy SUB_GET_DATA either, so none is applied here.)
 */
export const isWorklistRow = (r: FxRow): boolean => !!txt(r, 'ZDSS_TYPE') && num(r['ZD_AMT']) !== 0

export type LoadedSpots = { rows: SpotRow[] }

/** Every IN_SPOT row. The joins are best-effort: a miss leaves their columns blank. */
export async function loadSpotRows(signal?: AbortSignal): Promise<LoadedSpots> {
  const [inSpot, comp] = await Promise.all([fxList('inSpot', {}, { signal }), fxList('comp', {}, { signal }).catch(() => [] as FxRow[])])
  const txns = [...new Set(inSpot.map((r) => txt(r, 'ZRFHA')).filter(Boolean))]
  const fxRows = await inChunks('tsfvFx', 'RFHA', txns, signal).catch(() => [] as FxRow[])
  const ctx: SpotContext = {
    companies: new Map(comp.map((r) => [txt(r, 'ZBUKRS'), txt(r, 'ZBUTXT')])),
    fx: new Map(fxRows.map((r) => [fxKey(txt(r, 'BUKRS'), txt(r, 'RFHA')), r])),
  }
  return { rows: inSpot.filter(isWorklistRow).map((r) => toSpotRow(r, ctx)) }
}
