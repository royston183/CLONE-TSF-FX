/*
 * SAP data for ZSGTSFP_PRE_MATURE, read from the services exactly as far as they reach. Every read
 * either returns real rows or says WAITING FOR API with what is missing — nothing here invents a
 * deal, a partner or a transaction type.
 *
 *   Deal legs      FORM deal_details   ZSGTSFCDS_FX WHERE ztsf_deal_id = deal, sfhaart IN (...), saktiv <> 3.
 *                  ZSGTSFV_FX (middleware tsfvFx) has none of the VTBFHA append fields, so the legs come from
 *                  TrmFxApp (ZSGTSFTR_APP_STR, ZtsfDealID eq deal) joined with SAP's FxTransaction on
 *                  CompanyCode + FinancialTransaction. Partner / transaction-type names: A_BusinessPartner and
 *                  trmmaster; company name: ZSGTSFTR_COMP. Sell amounts are negative, as ZSGTSFCDS_FX signs them.
 *                  Not served by either: ZGRP (trader group, so the Bank BP help waits) and ZUONR (defaults to RFHA).
 *   Txn Type       FORM txn_type       TVARVC NAME = 'ZSGTSFP_PRE_MATURE_EARLY_DDOWN'
 *   Bank BP        FORM bp / drop_down_9002
 *                                      ZSGTRMTR_BP_GRP ⋈ ZSGTRMTR_BPEXT WHERE ZGRP = leg's ZGRP
 */
import { txt } from '../../shared/fx/masters.ts'
import { fxList, isAbort, type FxRow } from '../../shared/fx/mw.ts'
import { listDealIds } from '../../shared/fx/deal-id.ts'
import { inrInvoiceAmount, invoiceAmountRows } from './calc.ts'
import { odataString } from '@slc/api-client'
import { loadFxFor, joinFxWithApp, listTrmFxApp, type FxWithApp } from '../../shared/fx/app-str.ts'
import { fxTxnStatusLabel } from '../../shared/fx/txn-status.ts'
import { loadNames, NO_NAMES, type Names } from '../../shared/fx/names.ts'
import type { Avail, DdOption, Leg } from './types.ts'

export const WAITING = 'WAITING FOR API'

/** deal_details: AND a~sfhaart IN ( 605, 619, 631, 607, 608 ) AND a~saktiv <> 3. */
export const DEAL_TXN_TYPES = ['605', '619', '631', '607', '608'] as const

/** The one thing the legs still cannot carry: the trader group the Bank BP help is keyed on. */
export const NO_GROUP_REASON = 'Neither TrmFxApp nor FxTransaction serves the transaction’s trader group (VTBFHA-ZGRP).'

export const TXN_TYPE_TVARVC = 'ZSGTSFP_PRE_MATURE_EARLY_DDOWN'

/* ---------------- Pure mappings ---------------- */

const ACTIVE_REVERSED = '3'

const amount = (v: unknown): number => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

/** A field SAP may not serve yet: null when absent or blank, never 0. */
const served = (v: number | string | null | undefined): number | null => (v === undefined || v === null || v === '' ? null : amount(v))

/**
 * One FxTransaction + its TrmFxApp row as a leg, field for field as deal_details fills gs_top. Leg 1 is the
 * lead-currency side; as in ZSGTSFCDS_FX the sell side's amount is negative.
 */
export function legFromFx({ fx, app }: FxWithApp, names: Names = NO_NAMES, companies: ReadonlyMap<string, string> = new Map()): Leg {
  const lead = fx.LeadCurrency || fx.BuyCurrency || ''
  const follow = fx.FollowCurrency || fx.SellCurrency || ''
  const buysLead = fx.BuyCurrency === lead
  const buyAmt = Math.abs(amount(fx.BuyAmount))
  const sellAmt = -Math.abs(amount(fx.SellAmount))
  const partner = fx.Partner ?? ''
  const productType = fx.ProductType ?? ''
  const typeName = names.txnTypes.get(`${productType}/${fx.TransactionType}`)
  const status = app.TxnStatus ?? ''
  const ndf = fx as { NdfFixingRate?: number | string | null; CashSettlementAmount?: number | string | null; CashSettlementCurrency?: string }
  return {
    rfha: fx.FinancialTransaction,
    bukrs: fx.CompanyCode,
    butxt: companies.get(fx.CompanyCode) ?? '',
    sfhaart: fx.TransactionType,
    xtext: typeName ?? '',
    dblfz: (fx.ContractDate ?? '').slice(0, 10),
    delfz: (fx.ValueDate ?? '').slice(0, 10),
    cpair: lead && follow ? `${lead}/${follow}` : '',
    bs1: buysLead ? 'Buy' : 'Sell',
    curr1: lead,
    amt1: buysLead ? buyAmt : sellAmt,
    bs2: buysLead ? 'Sell' : 'Buy',
    curr2: follow,
    amt2: buysLead ? sellAmt : buyAmt,
    otot_rate: amount(fx.ForwardRate),
    kontrh: partner,
    bpName: names.partners.get(partner) || partner,
    txnStatus: status,
    txnDesc: status ? fxTxnStatusLabel(status) : '',
    dealType: app.ZtsfDealType ?? '',
    zgrp: '',
    // IF gs_top-zuonr IS INITIAL. gs_top-zuonr = gs_top-rfha.  (ZUONR itself is not served.)
    zuonr: fx.FinancialTransaction,
    zroll: '',
    ztsf_pre_mature: app.ZtsfPreMature === true,
    ztsf_unwind: app.ZtsfUnwind === true,
    // Served once ZFS_SD_TRMFX declares them (docs/abap/ZFS_SD_TRMFX-NdfSettlement.md); blank until then, never 0.
    ndf_rate: served(ndf.NdfFixingRate),
    zcash_amt: served(ndf.CashSettlementAmount),
    cash_curr: ndf.CashSettlementCurrency ?? '',
  }
}

/** The leg fields the roll numbering reads, so other Deal ID screens can reuse it. */
export type RollLeg = Pick<Leg, 'rfha' | 'dealType' | 'txnStatus' | 'bs1' | 'curr1' | 'bs2' | 'curr2' | 'zroll'>

/** deal_details' selection on the joined rows: the five transaction types, reversed deals (saktiv 3) out. */
export const isDealLeg = ({ fx }: FxWithApp): boolean =>
  (DEAL_TXN_TYPES as readonly string[]).includes(fx.TransactionType) && fx.ActiveStatus !== ACTIVE_REVERSED

/**
 * The Roll Deal Type column (ZROLL_DEAL_TYPE), ported statement for statement from
 * deal_details (scope 4000029736). Against the first D1 leg: status-61 legs are the rolled
 * originals (R<n>-D1 when they sit on the D1 side, else R<n>-D2); status >= 03 deal-type-00
 * legs that are not 61 are the cancellations (C<n>-D2 on the D2 side, else C<n>-D1). Each
 * range is sorted by RFHA and numbered from 1; C<n> is only assigned while R<n> exists.
 */
export function assignRollTypes<L extends RollLeg>(legs: readonly L[]): L[] {
  const out = legs.map((l) => ({ ...l }))
  const n1 = out.find((l) => l.dealType === 'D1')
  if (!n1) return out

  const side1 = (l: RollLeg) => `${l.bs1}-${l.curr1}`
  const side2 = (l: RollLeg) => `${l.bs2}-${l.curr2}`
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
  return { state: 'error', reason: `${what} could not be read.` }
}

/** ZSGTSFTR_COMP: company code -> name (BUTXT). A failed lookup leaves the names blank; it never stops the legs. */
async function companyNames(signal?: AbortSignal): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  try {
    for (const r of await fxList('comp', {}, { signal })) if (txt(r, 'ZBUKRS')) out.set(txt(r, 'ZBUKRS'), txt(r, 'ZBUTXT'))
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[pre-mature] company names unavailable', error)
  }
  return out
}

/**
 * deal_details for one Deal ID: the TrmFxApp rows of the Deal ID with their FxTransaction. A Deal ID with
 * no application rows reads as no transactions (the legacy join would be empty as well).
 */
export async function loadDealLegs(dealId: string, signal?: AbortSignal): Promise<Avail<Leg[]>> {
  try {
    const apps = await listTrmFxApp(`ZtsfDealID eq ${odataString(dealId)}`, signal)
    const rows = joinFxWithApp(apps, apps.length ? await loadFxFor(apps, signal) : []).filter(isDealLeg)
    const [names, companies] = await Promise.all([
      loadNames(rows.map((r) => r.fx), signal),
      companyNames(signal),
    ])
    const legs = rows
      .map((r) => legFromFx(r, names, companies))
      .sort((a, b) => (a.rfha < b.rfha ? -1 : a.rfha > b.rfha ? 1 : 0))
    return { state: 'ok', value: assignRollTypes(legs) }
  } catch (error) {
    return failure('TrmFxApp / FxTransaction', error)
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
  if (!zgrp) return { state: 'waiting', reason: NO_GROUP_REASON }
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

/**
 * FORM fetch_data1: the INR amount the New Booking is prefilled with, from the Deal ID's invoice plan
 * (ZSGTSFTR_BIL_ADJ in INR) and its model's invoice links (ZSGTSFTR_RULE_BT). 0 when there is none; a failed
 * read is never an error here — the user simply types the amount.
 */
export async function loadInrInvoiceAmount(dealId: string, dealType: string, signal?: AbortSignal): Promise<number> {
  try {
    const [deal] = await listDealIds({ ZDEAL_ID: dealId })
    const model = deal ? txt(deal, 'ZTSF_MODEL') : ''
    if (!model) return 0
    const [bills, rules] = await Promise.all([
      fxList('billAdjustment', { ZDEAL_ID: dealId, ZCURR: 'INR' }, { signal }),
      fxList('fxModel', { ZMOD_ID: model }, { signal }),
    ])
    return inrInvoiceAmount(invoiceAmountRows(bills, rules), dealType)
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[pre-mature] invoice amount unavailable', error)
    return 0
  }
}
