/**
 * FO: Change Deal ID (ZSGTSFP013 / ZSGTSF_PDEAL_ID_FO) against the SLC middleware.
 *
 * Reads, as the program does:
 *   Deal IDs      tsfDealId       ZSGTSFTR_DEALID   header, status, MC ref, trader, linked transactions 1-8
 *   Master Contr. masterContract  ZSGTSFTR_MAS_CON  the deal's MC (description, dates, model, strings) and
 *                                                   the MC picker (status 03 / 04)
 *   Legs          tsfvFx          ZSGTSFV_FX        each linked transaction (ZBUKRSn + ZRFHAn)
 *   Invoice plan  invRef          ZSGTSFTR_INV_REF  planned T1 / T2 / T3 lines of the deal
 *   Trader        trmTrader       ZSGTRMTR_TRADER   trader name of ZTRD_CODE
 *   Status text   tsfDealStatus   ZSGTSFTR_DEAL_ST
 *
 * Legs are read live from the FxTransaction service (ZFS_SB_TRMFX_O4_API) first: ZSGTSFV_FX is a stale copy that
 * lacks the newer transactions. A leg the service does not return falls back to the view row. The service has no
 * TXN_STATUS, so a live leg is shown Confirmed (03) once SAP has settled it (ActivityCategory 30 - what Match & Release
 * on the MO screen does) and Open (01) otherwise; this is that screen's meaning of "matched", not the program's field.
 *
 * Writes, both to ZSGTSFTR_DEALID only:
 *   Change MC Ref No   ZMC_REF
 *   Cancel Deal ID     ZDEAL_STAT = 30
 *
 * What stays out, because it needs SAP: the program also stamps ZTSF_MC_REF_NO / clears the
 * TSF fields on the Treasury transactions (BAPI_FTR_FXT_CHANGE through ZSGTRMFM_VTBFHA_EXPORT).
 * Edit Deal Pair is that same write plus the replacement-transaction checks, so it is not saved
 * at all. The leg grid has no TXN_STATUS yet, no premium (ZSGTSFCDS_OPTION) and no strike.
 * There is no seed fallback: when the Deal IDs cannot be read the screen is empty.
 */
import { list, odataString, service } from '@slc/api-client'
import { txt } from '../../shared/fx/masters.ts'
import { companiesOf, loadNames, txnTypeKey, type Names } from '../fo-fx-error-correction/api.ts'
import type { FxTransaction } from '../mo-fx-deal-confirmation/api.ts'
import { listMasterContracts, messageOf, type DealRow, type McRow } from '../../shared/fx/master-contract.ts'
import { FORWARD_SUB_TYPE, dealKey, listDealIds, setDealStatus } from '../../shared/fx/deal-id.ts'
import { fxList, fxUpdate, isAbort, type FxRow } from '../../shared/fx/mw.ts'
import { changedStamp, dmyFromIso, num } from '../../shared/fx/sap.ts'
import { CANCELLED_STATUS, STATUS_MAP } from './data.ts'
import type { Deal, DealStore, InvoiceLine, MasterContract, TopRow } from './types.ts'

/** ZRFHA1 … ZRFHA8 are the Deal ID's slots; the legacy page names them D1 D2 D3 D4 DS1 DS2 DSS1 DSS2. */
export const SLOT_NAMES = ['D1', 'D2', 'D3', 'D4', 'DS1', 'DS2', 'DSS1', 'DSS2'] as const

/** The MC picker's ABAP selection: Master Contracts that are Confirmed (03) or In Use (04). */
export const PICKABLE_MC_STATUSES = ['03', '04']

export type Loaded = {
  store: DealStore
  contracts: MasterContract[]
  /** The DEALID rows behind the store, by Deal ID — their key is needed to write. */
  rows: ReadonlyMap<string, DealRow>
  source: 'sap' | 'unavailable'
}

export const EMPTY: Loaded = { store: {}, contracts: [], rows: new Map(), source: 'unavailable' }

/** `col[in]` reads, 50 values at a time to keep the URLs short. */
async function inChunks(resource: string, column: string, values: readonly string[], signal?: AbortSignal): Promise<FxRow[]> {
  const out: FxRow[] = []
  for (let i = 0; i < values.length; i += 50) {
    const chunk = values.slice(i, i + 50)
    if (chunk.length) out.push(...(await fxList(resource, { [`${column}[in]`]: chunk.join(',') }, { signal })))
  }
  return out
}

const FX = service('fx')('FxTransaction')

/** The live FxTransaction of every linked leg, with the names to show for them. A failure leaves the view rows to stand in. */
async function liveLegs(
  dealRows: readonly DealRow[],
  signal?: AbortSignal,
): Promise<{ live: Map<string, FxTransaction>; names: Names; entities: Map<string, string> } | null> {
  const wanted = new Set<string>()
  const companies = new Set<string>()
  for (const d of dealRows)
    SLOT_NAMES.forEach((_, i) => {
      const bukrs = txt(d, `ZBUKRS${i + 1}`)
      const rfha = txt(d, `ZRFHA${i + 1}`)
      if (bukrs && rfha) {
        wanted.add(fxKey(bukrs, rfha))
        companies.add(bukrs)
      }
    })
  if (!wanted.size) return null
  try {
    const opts = signal ? { signal } : undefined
    const filter = [...companies].map((c) => `CompanyCode eq ${odataString(c)}`).join(' or ')
    const [rows, comp] = await Promise.all([list<FxTransaction>(FX, { filter, top: 1000 }, opts), fxList('comp', {}, { signal })])
    const mine = rows.filter((r) => wanted.has(fxKey(r.CompanyCode, r.FinancialTransaction)))
    const companyMap = companiesOf(comp)
    const names = await loadNames(mine, companyMap, signal)
    return {
      live: new Map(mine.map((r) => [fxKey(r.CompanyCode, r.FinancialTransaction), r])),
      names,
      entities: new Map([...companyMap].map(([code, c]) => [code, c.entity])),
    }
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[fx] Change Deal ID: FxTransaction unavailable, using ZSGTSFV_FX', error)
    return null
  }
}

export async function loadScreen(signal?: AbortSignal): Promise<Loaded> {
  try {
    const [dealRows, mcs, traders, statuses] = await Promise.all([
      listDealIds({}, signal),
      listMasterContracts({}, signal),
      fxList('trmTrader', {}, { signal }).catch(() => [] as FxRow[]),
      fxList('tsfDealStatus', {}, { signal }).catch(() => [] as FxRow[]),
    ])
    applyStatuses(statuses)
    const ids = dealRows.map((d) => txt(d, 'ZDEAL_ID'))
    const txns = [...new Set(dealRows.flatMap((d) => SLOT_NAMES.map((_, i) => txt(d, `ZRFHA${i + 1}`))).filter(Boolean))]
    const [fx, plans, liveSet] = await Promise.all([
      inChunks('tsfvFx', 'RFHA', txns, signal).catch(() => [] as FxRow[]),
      inChunks('invRef', 'ZDEAL_ID', ids, signal).catch(() => [] as FxRow[]),
      liveLegs(dealRows, signal),
    ])
    const rel: Related = {
      mcByRef: new Map(mcs.map((m) => [txt(m, 'ZMC_REF_NO'), m])),
      fxByKey: new Map(fx.map((r) => [fxKey(txt(r, 'BUKRS'), txt(r, 'RFHA')), r])),
      traderName: new Map(traders.map((t) => [txt(t, 'ZTCODE'), txt(t, 'ZTRADER') || txt(t, 'ZNAME')])),
      plans,
      ...(liveSet ? { live: liveSet.live, names: liveSet.names, entities: liveSet.entities } : {}),
    }
    const store: DealStore = {}
    const rows = new Map<string, DealRow>()
    for (const d of dealRows) {
      const id = txt(d, 'ZDEAL_ID')
      rows.set(id, d)
      store[id] = toDeal(d, rel)
    }
    return { store, contracts: mcs.filter(pickable).map(toMasterContract), rows, source: 'sap' }
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[fx] Change Deal ID: ZSGTSFTR_DEALID unavailable', error)
    return EMPTY
  }
}

/** The status pills use the FX1 texts of ZSGTSFTR_DEAL_ST; a code the legacy map names keeps its colour. */
function applyStatuses(statuses: readonly FxRow[]): void {
  for (const s of statuses) {
    if (txt(s, 'ZSUB_TYPE') !== FORWARD_SUB_TYPE) continue
    const code = txt(s, 'ZDEAL_STAT')
    STATUS_MAP[code] = { label: `${code} – ${txt(s, 'ZDEAL_SDESC')}`, css: STATUS_MAP[code]?.css ?? 'pill-gray' }
  }
}

export const fxKey = (bukrs: string, rfha: string): string => `${bukrs}|${rfha}`

const pickable = (m: McRow): boolean => PICKABLE_MC_STATUSES.includes(txt(m, 'ZMC_STAT'))

export function toMasterContract(m: McRow): MasterContract {
  return {
    ref: txt(m, 'ZMC_REF_NO'),
    desc: txt(m, 'ZMC_DESC'),
    origin: txt(m, 'ZORIGIN'),
    date: dmyFromIso(m['ZMC_DATE']),
    amt: num(m['ZAMT']),
    curr: txt(m, 'ZCURR'),
    entstr: txt(m, 'ZENT_DESC'),
    model: txt(m, 'ZMOD_ID'),
    currStr: txt(m, 'ZCURR_DESC'),
  }
}

export type Related = {
  mcByRef: ReadonlyMap<string, McRow>
  fxByKey: ReadonlyMap<string, FxRow>
  traderName: ReadonlyMap<string, string>
  plans: readonly FxRow[]
  /** The live FxTransaction of each leg (keyed like fxByKey), with the names and entity short codes to show. */
  live?: ReadonlyMap<string, FxTransaction>
  names?: Names
  entities?: ReadonlyMap<string, string>
}

export function toDeal(d: DealRow, rel: Related): Deal {
  const id = txt(d, 'ZDEAL_ID')
  const mc = rel.mcByRef.get(txt(d, 'ZMC_REF'))
  const code = txt(d, 'ZTRD_CODE')
  return {
    dealId: id,
    dealRef: txt(d, 'ZDEAL_REF') || txt(d, 'ZDEAL_DESC'),
    status: txt(d, 'ZDEAL_STAT'),
    sDate: dmyFromIso(d['ZS_DATE']),
    eDate: dmyFromIso(d['ZE_DATE']),
    trdCode: code,
    trdDesc: rel.traderName.get(code) ?? '',
    mcRef: txt(d, 'ZMC_REF'),
    mcDesc: mc ? txt(mc, 'ZMC_DESC') : '',
    mcDate: mc ? dmyFromIso(mc['ZMC_DATE']) : '',
    shipStart: mc ? dmyFromIso(mc['ZSHIP_START']) : '',
    shipEnd: mc ? dmyFromIso(mc['ZSHIP_END']) : '',
    modId: txt(d, 'ZTSF_MODEL') || (mc ? txt(mc, 'ZMOD_ID') : ''),
    modDesc: mc ? txt(mc, 'ZMOD_DESC') : '',
    entStr: mc ? txt(mc, 'ZENT_DESC') : '',
    currStr: mc ? txt(mc, 'ZCURR_DESC') : '',
    top: legs(d, rel),
    inv: invoiceLines(id, rel.plans),
  }
}

/** The linked transactions, one leg per filled slot. A leg missing from the view shows only what the Deal ID knows. */
export function legs(d: DealRow, rel: Pick<Related, 'fxByKey' | 'live' | 'names' | 'entities'>): TopRow[] {
  const out: TopRow[] = []
  SLOT_NAMES.forEach((slot, i) => {
    const rfha = txt(d, `ZRFHA${i + 1}`)
    if (!rfha) return
    const bukrs = txt(d, `ZBUKRS${i + 1}`)
    const liveLeg = rel.live?.get(fxKey(bukrs, rfha))
    if (liveLeg) {
      out.push(liveLeg_(slot, liveLeg, txt(d, 'ZMC_REF'), rel))
      return
    }
    const v = rel.fxByKey.get(fxKey(bukrs, rfha))
    out.push({
      color: '',
      premCurr: '',
      bukrs,
      dealType: slot,
      bpName: v ? txt(v, 'BP_NAME') : '',
      kontrh: v ? txt(v, 'KONTRH') : '',
      rfha,
      sfhaart: v ? txt(v, 'XTEXT') : '',
      dblfz: v ? dmyFromIso(v['DBLFZ']) : '',
      delfz: v ? dmyFromIso(v['DELFZ']) : '',
      xtext: v ? txt(v, 'XTEXT') : '',
      entity: v ? txt(v, 'ZCOM_ID') : '',
      bs1: v ? txt(v, 'BS_1') : '',
      curr1: v ? txt(v, 'CURR1') : '',
      amt1: v ? num(v['AMT1']) : 0,
      bs2: v ? txt(v, 'BS_2') : '',
      curr2: v ? txt(v, 'CURR2') : '',
      amt2: v ? num(v['AMT2']) : 0,
      ospot: v ? num(v['OSPOT']) : 0,
      oswap: v ? num(v['OSWAP']) : 0,
      otot_rate: v && txt(v, 'OTOT_RATE') ? num(v['OTOT_RATE']) : '',
      // ZSGTSFCDS_OPTION is not in MySQL: no strike.
      strike: '',
      mcRefNo: txt(d, 'ZMC_REF'),
      // ZSGTSFV_FX has no TXN_STATUS yet; a view that gains the column fills this in.
      txnStatus: v ? txt(v, 'TXN_STATUS') : '',
    })
  })
  return out
}

const day = (v: string | null | undefined): string => (v ? dmyFromIso(v) : '')

/** TXN_STATUS stand-in: Confirmed once SAP settled the leg (the MO screen's Match & Release), Open before. */
export const liveTxnStatus = (t: FxTransaction): string => (t.ActivityCategory === '30' ? '03' : '01')

/** A leg from the live FxTransaction; amounts are signed (a sold currency is negative) like the view's. */
function liveLeg_(slot: string, t: FxTransaction, mcRef: string, rel: Pick<Related, 'names' | 'entities'>): TopRow {
  const lead = t.LeadCurrency || t.BuyCurrency || ''
  const follow = t.FollowCurrency || t.SellCurrency || ''
  const buysLead = t.BuyCurrency === lead
  const leadAmt = Number(buysLead ? t.BuyAmount : t.SellAmount) || 0
  const followAmt = Number(buysLead ? t.SellAmount : t.BuyAmount) || 0
  const partner = rel.names?.partners.get(t.Partner)
  const type = rel.names?.transactionTypes.get(txnTypeKey(t.ProductType ?? '', t.TransactionType))
  const xtext = type ? `${t.TransactionType} - ${type}` : t.TransactionType
  return {
    color: '',
    premCurr: '',
    bukrs: t.CompanyCode,
    dealType: slot,
    bpName: partner ? `${t.Partner} - ${partner}` : t.Partner,
    kontrh: t.Partner,
    rfha: t.FinancialTransaction,
    sfhaart: xtext,
    dblfz: day(t.ContractDate),
    delfz: day(t.ValueDate),
    xtext,
    entity: rel.entities?.get(t.CompanyCode) ?? '',
    bs1: buysLead ? 'Buy' : 'Sell',
    curr1: lead,
    amt1: buysLead ? leadAmt : -leadAmt,
    bs2: buysLead ? 'Sell' : 'Buy',
    curr2: follow,
    amt2: buysLead ? -followAmt : followAmt,
    ospot: Number(t.SpotRate) || 0,
    oswap: Number(t.SwapRate) || 0,
    otot_rate: t.ForwardRate !== undefined && t.ForwardRate !== null && t.ForwardRate !== '' ? Number(t.ForwardRate) : '',
    strike: '',
    mcRefNo: mcRef,
    txnStatus: liveTxnStatus(t),
  }
}

function invoiceLines(dealId: string, plans: readonly FxRow[]): InvoiceLine[] {
  return plans
    .filter((p) => txt(p, 'ZDEAL_ID') === dealId)
    .map((p) => ({
      zttype: txt(p, 'ZTTYPE'),
      sell: txt(p, 'ZTRD_SELL'),
      buy: txt(p, 'ZTRD_BUY'),
      curr: txt(p, 'ZTRD_CURR'),
      trmNo: txt(p, 'ZINV_TRM_NO'),
      amt: num(p['ZAMT']),
      exRate: num(p['ZEX_RATE']),
      invAmt: num(p['ZINV_AMT']),
    }))
}

/** Change MC Ref No: ZSGTSFTR_DEALID-ZMC_REF, with the changed-by stamp. Throws the middleware's reason. */
export async function changeMc(deal: DealRow, mcRef: string): Promise<void> {
  try {
    await fxUpdate('tsfDealId', dealKey(deal), { ZMC_REF: mcRef, ...(await changedStamp()) })
  } catch (error) {
    throw new Error(messageOf(error))
  }
}

/** Cancel Deal ID: ZDEAL_STAT = 30. */
export async function cancelDealRow(deal: DealRow): Promise<void> {
  await setDealStatus([deal], CANCELLED_STATUS)
}
