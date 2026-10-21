/*
 * SAP data for the Trader Workbench (ZSGTSFR_SET_WSPACE), read through the SLC middleware
 * exactly as the ABAP reads it. Nothing falls back to sample data.
 *
 *   Deal list        FORM fetch_deal_details: ZSGTSFTR_DEALID ⋈ ZSGTSFTR_DEAL_ST (sub type FX1),
 *                    then ZSGTSFTR_MAS_CON ⋈ ZSGTSFTR_COMP for each deal's MC
 *   Model filter     ZSGTSFSH_MODEL      -> ZSGTSFTR_RULE_BT
 *   Deal ID filter   ZSGTSFSH_DEAL_ID    -> ZSGTSFTR_DEALID
 *   Status filter    ZSGTSFSH_DEAL_STAT  -> ZSGTSFTR_DEAL_ST (sub type FX1, the join the list uses)
 *   Co. Code         FORM co_code*: ZSGTSFTR_COMP WHERE zbukrs <> space, key zbukrs, text zbutxt
 *   BP               FORM bp: ZSGTRMTR_BP_GRP ⋈ ZSGTRMTR_BPEXT WHERE zgrp = the transaction's zgrp
 *   Action texts     ZSGTSFTR_TRDWAI WHERE ztext_code <> space;  sub type: ZSGTSFTR_RULE_BT
 *   Straddle spot    ZSGTSFTR_SS_SPOT;   settlement data: ZSGTSFTR_IN_SPOT
 *   Rates            TCURR kurst M / RBI (GDATU inverted), TCURF kurst MTM
 *
 *   Transactions     ZSGTSFCDS_FX WHERE ztsf_deal_id = …: TrmFxApp (ZSGTSFTR_APP_STR, ZtsfDealID) joined with SAP's
 *                    FxTransaction on CompanyCode + FinancialTransaction (shared/fx/app-str.ts).
 *                    ZSGTSFCDS_OPTION: no service -> WAITING FOR API (option transactions are not listed).
 */
import { odataString } from '@slc/api-client'
import { loadExchangeRate, loadExchangeRateFactors } from '../../shared/fx/exchange-rate-api.ts'
import { FX_TXN_STATUS_LABEL } from '../../shared/fx/txn-status.ts'
import { loadFxFor, joinFxWithApp, listTrmFxApp, type FxWithApp } from '../../shared/fx/app-str.ts'
import { txt } from '../../shared/fx/masters.ts'
import { fxList, isAbort, type FxRow } from '../../shared/fx/mw.ts'
import { num } from '../../shared/fx/sap.ts'
import { emptyLookups, mkTxn } from './data.ts'
import { leadCurr } from './logic.ts'
import type { AppData, Deal, InSpot, Lookups, Txn } from './types.ts'

export const WAITING = 'WAITING FOR API'

/**
 * Shown in a deal's Transactions and Action Items when it lists nothing. FETCH_TXN_DATA reads ZSGTSFCDS_FX
 * (served here by TrmFxApp + FxTransaction) and ZSGTSFCDS_OPTION, which no service exposes, so a deal's
 * option transactions can never be listed yet.
 */
export const TXN_WAITING =
  'No FX transactions are linked to this deal in TrmFxApp. WAITING FOR API for its option transactions — ZSGTSFCDS_OPTION is not exposed by any service.'

/** The FX transactions could not be read at all (not the same as "none linked"). */
export const TXN_FAILED = 'The deal’s FX transactions could not be read from TrmFxApp / FxTransaction.'

/** The deal list's sub type for the status texts (… AND d~zsub_type = 'FX1'). */
const FX1 = 'FX1'

/* ---------------- pure mappings (tested) ---------------- */

const sortBy = <T,>(key: (x: T) => string) => (a: T, b: T) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)

/** One gt_deal row: the DEALID columns, the MC's origin/model/amount, the region via COMP. */
export function dealFromRows(d: FxRow, mc: FxRow | undefined): Deal {
  // IF gs_deal-zmod_id IS INITIAL. gs_deal-zmod_id = ztsf_model.
  const model = (mc ? txt(mc, 'ZMOD_ID') : '') || txt(d, 'ZTSF_MODEL')
  return {
    id: txt(d, 'ZDEAL_ID'),
    type: txt(d, 'ZDEAL_TYPE'),
    subType: txt(d, 'ZSUB_TYPE'),
    desc: txt(d, 'ZDEAL_DESC'),
    model,
    status: txt(d, 'ZDEAL_STAT'),
    ss: txt(d, 'ZSS') === 'X' ? 'X' : '',
    origin: mc ? txt(mc, 'ZORIGIN') : '',
    mcRef: txt(d, 'ZMC_REF'),
    mcDate: mc ? txt(mc, 'ZMC_DATE') : '',
    mcAmt: mc ? num(mc['ZAMT']) : 0,
    mcAmtCurr: mc ? txt(mc, 'ZCURR') : '',
    start: txt(d, 'ZS_DATE'),
    end: txt(d, 'ZE_DATE'),
    trader: txt(d, 'ZTRD_CODE'),
    region: txt(d, 'ZREGION_ID'),
    dealRef: txt(d, 'ZDEAL_REF'),
    fxInvModel: txt(d, 'ZFX_INV_MODEL'),
    pl: num(d['ZPL']),
    plCurr: txt(d, 'ZPL_CURR'),
    plRate: num(d['ZPL_RATE']),
    plLocal: num(d['ZPL_LAMT']),
    plLCurr: txt(d, 'ZPL_LCURR'),
    mcCurr: txt(d, 'ZMC_CURR_DESC'),
    dealCurr: txt(d, 'ZDEAL_CURR_DESC'),
  }
}

export function inSpotFromRow(r: FxRow): InSpot {
  return {
    dealId: txt(r, 'ZDEAL_ID'),
    dealType: txt(r, 'ZDEAL_TYPE'),
    rfha: txt(r, 'ZRFHA'),
    dssType: txt(r, 'ZDSS_TYPE'),
    fAmt: num(r['ZF_AMT']),
    fxAmt: num(r['ZFX_AMT']),
    curr: txt(r, 'ZCURR'),
    dAmt: num(r['ZD_AMT']),
    bs: txt(r, 'ZBS'),
    spotTxn: txt(r, 'ZSPOT_TXN'),
    spotCreate: txt(r, 'ZSPOT_CREATE') === 'X' ? 'X' : '',
    expiry: txt(r, 'ZEXPIRY'),
    bukrs: txt(r, 'ZBUKRS'),
    entity: txt(r, 'ZSBUKRS'),
  }
}

/** TCURR-GDATU is stored inverted (99999999 − yyyymmdd). */
export const invertedDate = (iso: string) => String(99999999 - Number(iso.replace(/-/g, '')))
export function isoFromInverted(gdatu: string): string {
  const d = String(99999999 - Number(gdatu))
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
}

export type Masters = {
  comp: FxRow[]
  models: FxRow[]
  statuses: FxRow[]
  bpGrp: FxRow[]
  bpext: FxRow[]
  trdwai: FxRow[]
  ssSpot: FxRow[]
  tcurf: FxRow[]
}

/** The lookups as the ABAP builds its lists. */
export function lookupsFrom(m: Masters): Lookups {
  const l = emptyLookups()
  l.companies = m.comp
    .filter((r) => txt(r, 'ZBUKRS') !== '')
    .map((r) => ({ code: txt(r, 'ZBUKRS'), name: txt(r, 'ZBUTXT'), entity: txt(r, 'ZCOM_ID') }))
    .sort(sortBy((c) => c.code))

  const seenModel = new Set<string>()
  for (const r of m.models) {
    const id = txt(r, 'ZMOD_ID')
    if (!id) continue
    if (!(id in l.ruleBt)) l.ruleBt[id] = txt(r, 'ZSUB_TYPE') // ASSIGN lt_zsgtsftr_rule_bt[ 1 ]
    if (!seenModel.has(id)) {
      seenModel.add(id)
      l.models.push({ id, desc: txt(r, 'ZMOD_DESC') })
    }
  }
  l.models.sort(sortBy((x) => x.id))

  l.dealStatus = m.statuses
    .filter((r) => txt(r, 'ZSUB_TYPE') === FX1 && txt(r, 'ZDEAL_STAT') !== '')
    .map((r) => {
      const desc = txt(r, 'ZDEAL_SDESC')
      return { code: txt(r, 'ZDEAL_STAT'), desc, cls: 'status-text-draft', closed: /^settlement completed/i.test(desc) }
    })
    .sort(sortBy((s) => s.code))

  const shortName = new Map(m.bpext.map((r) => [txt(r, 'BP'), txt(r, 'SHORT_NAME')]))
  l.bps = m.bpGrp
    .filter((r) => shortName.has(txt(r, 'BP'))) // INNER JOIN zsgtrmtr_bpext
    .map((r) => ({ bp: txt(r, 'BP'), name: shortName.get(txt(r, 'BP')) ?? '', grp: txt(r, 'ZGRP') }))
    .sort(sortBy((b) => b.bp)) // ORDER BY key

  l.actionTexts = m.trdwai
    .filter((r) => txt(r, 'ZTEXT_CODE') !== '')
    .map((r) => ({ sf: txt(r, 'ZSFHAART'), code: txt(r, 'ZTEXT_CODE'), text: txt(r, 'ZACT_TEXT') }))

  // IF <fs_ss>-zbs1 = '01'. bs1 = 'Buy'. ELSE. bs1 = 'Sell'.
  const bs = (code: string) => (code === '01' ? 'Buy' : 'Sell')
  l.ssSpot = m.ssSpot.map((r) => ({
    model: txt(r, 'ZMOD_ID'),
    opBs: txt(r, 'ZOP_BS'),
    pc: txt(r, 'ZPC'),
    bs1: bs(txt(r, 'ZBS1')),
    curr1: txt(r, 'ZCURR1'),
    bs2: bs(txt(r, 'ZBS2')),
    curr2: txt(r, 'ZCURR2'),
  }))

  for (const r of m.tcurf) {
    const key = `${txt(r, 'FCURR')}>${txt(r, 'TCURR')}`
    if (!(key in l.tcurf)) l.tcurf[key] = { ffact: num(r['FFACT']), tfact: num(r['TFACT']) }
  }
  return l
}

/**
 * The NDF fixing date and reference of an NDF / DNDF (transaction type 631 / 632): NDF_DATE and NDF_REF of the ZSGTSFV_FX row
 * (middleware 'tsfvFx'), the fixing date falling back to the value date when the view has none or lacks the transaction,
 * as the NDF screens do (shared/fx/ndf.ts ndfRecord). Any other transaction has neither.
 */
export function ndfFields(fx: { TransactionType?: string; ValueDate?: string | null }, view?: FxRow): { ndfDate: string; ndfRef: string } {
  if (fx.TransactionType !== '631' && fx.TransactionType !== '632') return { ndfDate: '', ndfRef: '' }
  const date = (view ? txt(view, 'NDF_DATE') : '').slice(0, 10) || String(fx.ValueDate ?? '').slice(0, 10)
  return { ndfDate: date, ndfRef: view ? txt(view, 'NDF_REF') : '' }
}

/**
 * The fixing rate and cash settlement of an NDF / DNDF. FxTransaction serves them as NdfFixingRate / CashSettlementAmount /
 * CashSettlementCurrency once the service declares them (docs/abap/ZFS_SD_TRMFX-NdfSettlement.md); until then the same values are read
 * from the ZSGTSFV_FX row (NDF_RATE, ZCASH_AMT, CASH_CURR). Nothing served leaves them 0 / ''.
 */
export function ndfSettlement(
  fx: { TransactionType?: string },
  view?: FxRow,
): { ndfRate: number; cashAmt: number; cashCurr: string } {
  if (fx.TransactionType !== '631' && fx.TransactionType !== '632') return { ndfRate: 0, cashAmt: 0, cashCurr: '' }
  const f = fx as { NdfFixingRate?: number | string; CashSettlementAmount?: number | string; CashSettlementCurrency?: string }
  return {
    ndfRate: num(f.NdfFixingRate ?? 0) || (view ? num(view['NDF_RATE']) : 0),
    cashAmt: num(f.CashSettlementAmount ?? 0) || (view ? num(view['ZCASH_AMT']) : 0),
    cashCurr: (f.CashSettlementCurrency ?? '').trim() || (view ? txt(view, 'CASH_CURR') : ''),
  }
}

/** One FxTransaction + its TrmFxApp row as a transaction of the workbench (a ZSGTSFCDS_FX row). */
export function txnFromFx({ fx, app }: FxWithApp, lookups: Lookups = emptyLookups(), view?: FxRow): Txn {
  const lead = fx.LeadCurrency || fx.BuyCurrency || ''
  const follow = fx.FollowCurrency || fx.SellCurrency || ''
  const buysLead = fx.BuyCurrency === lead
  const buyAmt = Math.abs(num(fx.BuyAmount))
  // ZSGTSFCDS_FX signs the sell side negative.
  const sellAmt = -Math.abs(num(fx.SellAmount))
  const partner = fx.Partner ?? ''
  const status = app.TxnStatus ?? ''
  return mkTxn(app.ZtsfDealID ?? '', fx.FinancialTransaction, {
    bukrs: fx.CompanyCode,
    sfhaart: fx.TransactionType,
    sgsart: fx.ProductType ?? '',
    dealType: app.ZtsfDealType ?? '',
    cpty: partner,
    // BP short name from ZSGTRMTR_BPEXT where the partner is one of the listed banks; else the number.
    cptyName: lookups.bps.find((b) => b.bp === partner)?.name || partner,
    entity: lookups.companies.find((c) => c.code === fx.CompanyCode)?.entity ?? '',
    tradeDate: (fx.ContractDate ?? '').slice(0, 10),
    valueDate: (fx.ValueDate ?? '').slice(0, 10),
    xtext: lookups.txnTypes[fx.TransactionType] ?? '',
    bs1: buysLead ? 'Buy' : 'Sell',
    curr1: lead,
    amt1: buysLead ? buyAmt : sellAmt,
    bs2: buysLead ? 'Sell' : 'Buy',
    curr2: follow,
    amt2: buysLead ? sellAmt : buyAmt,
    ospot: num(fx.SpotRate),
    oswap: num(fx.SwapRate),
    rate: num(fx.ForwardRate),
    status,
    mcRef: app.ZtsfMcRefNo ?? '',
    cpair: lead && follow ? `${lead}/${follow}` : '',
    portfolio: (fx as { Portfolio?: string }).Portfolio ?? '',
    seq: Number(app.ZtsfDealSq) || 1,
    ...ndfFields(fx, view),
    ...ndfSettlement(fx, view),
    etag: (app as { '@odata.etag'?: string })['@odata.etag'] ?? '',
  })
}

/** Deal IDs per request: `ZtsfDealID eq 'a' or ZtsfDealID eq 'b' …`. */
const DEAL_CHUNK = 25

/**
 * FETCH_TXN_DATA for every listed deal: TrmFxApp rows whose ZtsfDealID is one of them, with their
 * FxTransaction. Reversed deals (saktiv 3) are left out, as the CDS view's selection does.
 */
export async function loadDealTxns(dealIds: readonly string[], lookups: Lookups, signal?: AbortSignal): Promise<Txn[]> {
  const ids = [...new Set(dealIds.filter(Boolean))]
  const pages = await Promise.all(
    Array.from({ length: Math.ceil(ids.length / DEAL_CHUNK) }, (_, i) =>
      listTrmFxApp(ids.slice(i * DEAL_CHUNK, (i + 1) * DEAL_CHUNK).map((d) => `ZtsfDealID eq ${odataString(d)}`).join(' or '), signal),
    ),
  )
  const apps = pages.flat()
  if (!apps.length) return []
  const joined = joinFxWithApp(apps, await loadFxFor(apps, signal)).filter(({ fx }) => fx.ActiveStatus !== '3')
  const views = await loadNdfViews(joined, signal)
  return joined.map((r) => txnFromFx(r, lookups, views.get(`${r.fx.CompanyCode}|${r.fx.FinancialTransaction}`)))
}

/** ZSGTSFV_FX rows of the listed NDF / DNDF transactions, by BUKRS|RFHA. Display data only: when it cannot be read the dates fall back. */
async function loadNdfViews(rows: readonly FxWithApp[], signal?: AbortSignal): Promise<Map<string, FxRow>> {
  const ndf = rows.filter(({ fx }) => fx.TransactionType === '631' || fx.TransactionType === '632')
  const out = new Map<string, FxRow>()
  if (!ndf.length) return out
  try {
    const companies = [...new Set(ndf.map(({ fx }) => fx.CompanyCode))]
    for (const r of await fxList('tsfvFx', { 'BUKRS[in]': companies.join(',') }, { signal })) out.set(`${txt(r, 'BUKRS')}|${txt(r, 'RFHA')}`, r)
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[trader-workbench] ZSGTSFV_FX unavailable: the NDF fixing date falls back to the value date', error)
  }
  return out
}

/* ---------------- reads ---------------- */

/** TCURR kurst M for a pair: the latest row dated on or before `iso` (one row). */
async function marketRateRow(lead: string, follow: string, iso: string, signal?: AbortSignal): Promise<{ d: string; r: number } | null> {
  const row = await loadExchangeRate(lead, follow, iso, 'M', signal)
  return row ? { d: row.ExchangeRateEffectiveDate, r: num(row.ExchangeRate) } : null
}

export type Loaded = { data: AppData; lookups: Lookups; txnWaiting: string }

export async function loadWorkbench(today: string, signal?: AbortSignal): Promise<Loaded> {
  const o = { signal }
  const [deals, mcs, comp, statuses, models, bpGrp, bpext, trdwai, ssSpot, tcurf] = await Promise.all([
    fxList('tsfDealId', {}, o),
    fxList('masterContract', {}, o),
    fxList('comp', {}, o),
    fxList('tsfDealStatus', { ZSUB_TYPE: FX1 }, o),
    fxList('fxModel', {}, o),
    fxList('bpGrp', {}, o),
    fxList('trmBpext', {}, o),
    fxList('trdwai', {}, o),
    fxList('ssSpot', {}, o),
    loadExchangeRateFactors('MTM', signal),
  ])
  const lookups = lookupsFrom({ comp, models, statuses, bpGrp, bpext, trdwai, ssSpot, tcurf })
  // txn_status texts: ZSGTSFTR_TXNSTAT (ZTYPE 01), as the shared status table names them.
  for (const [code, desc] of Object.entries(FX_TXN_STATUS_LABEL)) lookups.txnStatus[code] = { desc, cls: 'status-text-draft' }

  const mcByRef = new Map(mcs.map((r) => [txt(r, 'ZMC_REF_NO'), r]))
  const list = deals.map((d) => dealFromRows(d, mcByRef.get(txt(d, 'ZMC_REF'))))

  const ids = list.map((d) => d.id).filter(Boolean)
  const inSpot = ids.length ? (await fxList('inSpot', { 'ZDEAL_ID[in]': ids.join(',') }, o)).map(inSpotFromRow) : []

  // Today's market rate for every currency the KPIs convert to USD.
  const currs = new Set(list.flatMap((d) => [d.mcAmtCurr, d.plCurr]).filter((c) => c && c !== 'USD'))
  await Promise.all(
    [...currs].map(async (c) => {
      const lc = leadCurr(c, 'USD')
      try {
        const row = await marketRateRow(lc.lead, lc.follow, today, signal)
        if (row) lookups.marketRates[`${lc.lead}-${lc.follow}`] = [row]
      } catch (error) {
        if (isAbort(error)) throw error
        console.warn(`[trader-workbench] TCURR M ${lc.lead}/${lc.follow} unavailable`, error)
      }
    }),
  )

  // A failed read must not look like "no transactions linked": it says so, and the deal list still loads.
  let txns: Txn[] = []
  let txnWaiting = TXN_WAITING
  try {
    txns = await loadDealTxns(ids, lookups, signal)
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[trader-workbench] TrmFxApp / FxTransaction unavailable', error)
    txnWaiting = TXN_FAILED
  }

  return { data: { deals: list, txns, inSpot, nextRfha: 0 }, lookups, txnWaiting }
}
