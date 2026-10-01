/*
 * SAP data for ZSGTSFP_PRE_MATURE, read through the SLC middleware exactly as the ABAP reads
 * it. Every read either returns real rows or says WAITING FOR API with what is missing —
 * nothing here invents a deal, a partner or a transaction type.
 *
 *   Deal legs      FORM deal_details   ZSGTSFCDS_FX (middleware tsfvFx = SQL view ZSGTSFV_FX)
 *   Txn Type       FORM txn_type       TVARVC NAME = 'ZSGTSFP_PRE_MATURE_EARLY_DDOWN'
 *   Bank BP        FORM bp / drop_down_9002
 *                                      ZSGTRMTR_BP_GRP ⋈ ZSGTRMTR_BPEXT WHERE ZGRP = leg's ZGRP
 */
import { txt } from '../../shared/fx/masters.ts'
import { fxColumns, fxList, isAbort, type FxRow } from '../../shared/fx/mw.ts'
import { num } from '../../shared/fx/sap.ts'
import type { Avail, DdOption, Leg } from './types.ts'

export const WAITING = 'WAITING FOR API'

/** The middleware resource behind ZSGTSFCDS_FX. */
export const CDS_FX = 'tsfvFx'

/** deal_details: AND a~sfhaart IN ( 605, 619, 631, 607, 608 ) AND a~saktiv <> 3. */
export const DEAL_TXN_TYPES = ['605', '619', '631', '607', '608'] as const

/**
 * ZSGTSFCDS_FX fields the screen cannot work without. ZSGTSFV_FX (the SQL view the
 * middleware serves) projects only the FTR columns, not these VTBFHA extension fields.
 */
export const CDS_REQUIRED_COLUMNS = [
  'ZTSF_DEAL_ID', // the selection itself: WHERE a~ztsf_deal_id = @gv_deal
  'BUKRS',
  'RFHA',
  'SAKTIV',
  'SFHAART',
  'XTEXT',
  'DBLFZ',
  'DELFZ',
  'KONTRH',
  'BP_NAME',
  'BUTXT',
  'ZUONR',
  'BS_1',
  'BS_2',
  'CURR1',
  'CURR2',
  'AMT1',
  'AMT2',
  'OTOT_RATE',
  'CPAIR',
  'TXN_STATUS',
  'EXT_STAT_DESC',
  'ZTSF_DEAL_TYPE',
  'ZGRP',
  'ZTSF_PRE_MATURE',
  'ZTSF_UNWIND',
] as const

export const TXN_TYPE_TVARVC = 'ZSGTSFP_PRE_MATURE_EARLY_DDOWN'

/* ---------------- Pure mappings ---------------- */

export const missingColumns = (have: readonly string[], need: readonly string[]) => {
  const present = new Set(have.map((c) => c.toUpperCase()))
  return need.filter((c) => !present.has(c))
}

const flag = (row: FxRow, column: string) => txt(row, column).toUpperCase() === 'X'

/** One ZSGTSFCDS_FX row as a leg, field for field as deal_details fills gs_top. */
export function legFromCds(row: FxRow): Leg {
  const rfha = txt(row, 'RFHA')
  return {
    rfha,
    bukrs: txt(row, 'BUKRS'),
    butxt: txt(row, 'BUTXT'),
    sfhaart: txt(row, 'SFHAART'),
    xtext: txt(row, 'XTEXT'),
    dblfz: txt(row, 'DBLFZ'),
    delfz: txt(row, 'DELFZ'),
    cpair: txt(row, 'CPAIR'),
    bs1: txt(row, 'BS_1'),
    curr1: txt(row, 'CURR1'),
    amt1: num(row['AMT1']),
    bs2: txt(row, 'BS_2'),
    curr2: txt(row, 'CURR2'),
    amt2: num(row['AMT2']),
    otot_rate: num(row['OTOT_RATE']),
    kontrh: txt(row, 'KONTRH'),
    bpName: txt(row, 'BP_NAME'),
    txnStatus: txt(row, 'TXN_STATUS'),
    txnDesc: txt(row, 'EXT_STAT_DESC'),
    dealType: txt(row, 'ZTSF_DEAL_TYPE'),
    zgrp: txt(row, 'ZGRP'),
    // IF gs_top-zuonr IS INITIAL. gs_top-zuonr = gs_top-rfha.
    zuonr: txt(row, 'ZUONR') || rfha,
    zroll: '',
    ztsf_pre_mature: flag(row, 'ZTSF_PRE_MATURE'),
    ztsf_unwind: flag(row, 'ZTSF_UNWIND'),
  }
}

/**
 * The Roll Deal Type column (ZROLL_DEAL_TYPE), ported statement for statement from
 * deal_details (scope 4000029736). Against the first D1 leg: status-61 legs are the rolled
 * originals (R<n>-D1 when they sit on the D1 side, else R<n>-D2); status >= 03 deal-type-00
 * legs that are not 61 are the cancellations (C<n>-D2 on the D2 side, else C<n>-D1). Each
 * range is sorted by RFHA and numbered from 1; C<n> is only assigned while R<n> exists.
 */
export function assignRollTypes(legs: readonly Leg[]): Leg[] {
  const out = legs.map((l) => ({ ...l }))
  const n1 = out.find((l) => l.dealType === 'D1')
  if (!n1) return out

  const side1 = (l: Leg) => `${l.bs1}-${l.curr1}`
  const side2 = (l: Leg) => `${l.bs2}-${l.curr2}`
  const txnD1: string[] = []
  const txnD2: string[] = []
  const rollD1: string[] = []
  const rollD2: string[] = []

  for (const l of out) {
    if (l.txnStatus !== '61') continue
    if (side1(l) === side1(n1) || side2(l) === side1(n1)) txnD1.push(l.rfha)
    else txnD2.push(l.rfha)
  }
  for (const l of out) {
    if (!(l.txnStatus >= '03' && l.dealType === '00') || l.txnStatus === '61') continue
    if (side1(l) === side2(n1) || side2(l) === side2(n1)) rollD2.push(l.rfha)
    else rollD1.push(l.rfha)
  }
  const asc = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
  for (const r of [txnD1, txnD2, rollD1, rollD2]) r.sort(asc)

  // READ TABLE gt_top WITH KEY rfha = …: the first row with that number.
  const tag = (rfha: string | undefined, text: string) => {
    const row = rfha === undefined ? undefined : out.find((l) => l.rfha === rfha)
    if (row) row.zroll = text
  }
  txnD1.forEach((rfha, i) => {
    tag(rfha, `R${i + 1}-D1`)
    tag(rollD1[i], `C${i + 1}-D1`)
  })
  txnD2.forEach((rfha, i) => {
    tag(rfha, `R${i + 1}-D2`)
    tag(rollD2[i], `C${i + 1}-D2`)
  })
  return out
}

/** TVARVC LOW is "<3-char txn type> <text>": key = low+0(3), text = low+4. Sorted by key. */
export function txnTypeOptions(rows: readonly FxRow[]): DdOption[] {
  return rows
    .map((r) => txt(r, 'LOW'))
    .filter((low) => low.length >= 3)
    .map((low) => ({ value: low.slice(0, 3), primary: low.slice(0, 3), secondary: low.slice(4).trim() || undefined }))
    .sort((a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : 0))
}

/** The inner join BP_GRP ⋈ BPEXT for one trader group: key BP, text SHORT_NAME, sorted by key. */
export function bankPartnerOptions(groupRows: readonly FxRow[], bpextRows: readonly FxRow[], zgrp: string): DdOption[] {
  const inGroup = new Set(groupRows.filter((r) => txt(r, 'ZGRP') === zgrp).map((r) => txt(r, 'BP')))
  const seen = new Set<string>()
  const options: DdOption[] = []
  for (const r of bpextRows) {
    const bp = txt(r, 'BP')
    if (!inGroup.has(bp) || seen.has(bp)) continue
    seen.add(bp)
    options.push({ value: bp, primary: bp, secondary: txt(r, 'SHORT_NAME') || undefined })
  }
  return options.sort((a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : 0))
}

/* ---------------- Reads ---------------- */

const failure = <T,>(what: string, error: unknown): Avail<T> => {
  if (isAbort(error)) throw error
  console.warn(`[pre-mature] ${what} unavailable`, error)
  return { state: 'error', reason: `${what} could not be read from the SLC middleware.` }
}

/**
 * deal_details for one Deal ID. Checks the view's columns first, so a view without the
 * VTBFHA extension fields reads as WAITING FOR API rather than as an empty deal.
 */
export async function loadDealLegs(dealId: string, signal?: AbortSignal): Promise<Avail<Leg[]>> {
  try {
    const missing = missingColumns(await fxColumns(CDS_FX, signal), CDS_REQUIRED_COLUMNS)
    if (missing.length)
      return {
        state: 'waiting',
        reason: `ZSGTSFCDS_FX (middleware "${CDS_FX}" = ZSGTSFV_FX) does not serve ${missing.join(', ')}.`,
      }
    const rows = await fxList(
      CDS_FX,
      { ZTSF_DEAL_ID: dealId, 'SFHAART[in]': DEAL_TXN_TYPES.join(','), 'SAKTIV[ne]': '3' },
      { sort: 'RFHA', signal },
    )
    return { state: 'ok', value: assignRollTypes(rows.map(legFromCds)) }
  } catch (error) {
    return failure('ZSGTSFCDS_FX', error)
  }
}

/** FORM txn_type: the Txn Type drop-downs of 9001 (both sides) and 9003 (New Booking). */
export async function loadTxnTypes(signal?: AbortSignal): Promise<Avail<DdOption[]>> {
  try {
    const options = txnTypeOptions(await fxList('tvarvc', { NAME: TXN_TYPE_TVARVC }, { signal }))
    if (options.length) return { state: 'ok', value: options }
    return { state: 'waiting', reason: `TVARVC holds no rows for ${TXN_TYPE_TVARVC} in MySQL.` }
  } catch (error) {
    return failure('TVARVC', error)
  }
}

/** FORM bp / drop_down_9002: the Bank BP drop-downs for the selected leg's trader group. */
export async function loadBankPartners(zgrp: string, signal?: AbortSignal): Promise<Avail<DdOption[]>> {
  if (!zgrp) return { state: 'waiting', reason: 'The transaction carries no trader group (VTBFHA-ZGRP).' }
  try {
    const [groups, banks] = await Promise.all([
      fxList('bpGrp', { ZGRP: zgrp }, { signal }),
      fxList('trmBpext', {}, { signal }),
    ])
    const options = bankPartnerOptions(groups, banks, zgrp)
    if (options.length) return { state: 'ok', value: options }
    return { state: 'waiting', reason: `ZSGTRMTR_BP_GRP ⋈ ZSGTRMTR_BPEXT has no bank for trader group ${zgrp}.` }
  } catch (error) {
    return failure('ZSGTRMTR_BP_GRP / ZSGTRMTR_BPEXT', error)
  }
}
