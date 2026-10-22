import { txt } from '../../shared/fx/masters.ts'
import { DEAL_TYPE, FORWARD_SUB_TYPE, listDealIds } from '../../shared/fx/deal-id.ts'
import { listMasterContracts, type DealRow } from '../../shared/fx/master-contract.ts'
import { fxList, type FxRow } from '../../shared/fx/mw.ts'
import { num } from '../../shared/fx/sap.ts'
import { SLOT_NAMES, inChunks, liveLegs, toDeal as toChangeDeal, type Related } from '../fo-change-deal-id/api.ts'
import type { Deal as ChangeDeal, TopRow } from '../fo-change-deal-id/types.ts'
import { loadNdfExtras, ndfKey } from '../../shared/fx/ndf-columns.ts'
import { loadAppStrRecords, type AppStrRecord } from '../fx-blotter/appStr.ts'
import { cancelDealId } from './analysis.ts'
import { STATUS_META } from './data.ts'
import type { Deal, Invoice, Leg, StoredPl } from './types.ts'

/**
 * SAP data for MO: Confirm FX Deal ID (ZSGTSFP002 / ZSGTSF_PDEAL_ID_ANALYS). Nothing falls back to
 * sample data.
 *
 * Read, through services that are registered and already used by the neighbouring Deal ID screens:
 *   Deal ID header   middleware tsfDealId   ZSGTSFTR_DEALID (the program's own table; the `dealid`
 *                    OData service is the SLC trade-finance Deal ID, a different table without
 *                    ZRFHA1-8, ZMC_REF or ZTSF_MODEL)
 *   Master Contract  middleware masterContract   ZSGTSFTR_MAS_CON, by ZMC_REF
 *   Model rules      middleware fxModel     ZSGTSFTR_RULE_BT: ZNO_INV (no invoice plan), ZSS (short straddle), ZSUB_TYPE
 *   Trader           middleware trmTrader   ZSGTRMTR_TRADER
 *   Status texts     middleware tsfDealStatus   ZSGTSFTR_DEAL_ST
 *   Saved invoices   middleware invRef      ZSGTSFTR_INV_REF
 *   Transactions     FxTransaction (ZFS_SB_TRMFX_O4_API), found through the Deal ID's ZRFHA1-8 slots because the
 *                    service has no ZTSF_DEAL_ID property; ZSGTSFV_FX (tsfvFx) fills in a leg the service does not return
 *
 * Written, because the middleware's PATCH on ZSGTSFTR_DEALID is proven (shared/fx/deal-id.ts):
 *   Cancel Deal ID   ZDEAL_STAT = 30 with the changed-by stamp (the program's DEASSIGN_DATA)
 *
 * Confirmation, replacement and reversal use analysis.ts / analysisConfirm.ts. Category 11 documents
 * use shared/fx/dms.ts (local document types and Deal ID links, middleware metadata and SAP originals).
 * Premium Adjustment and SS confirmation remain disabled (data.ts GAPS).
 */

/** The Deal ID slots ZRFHA1..8 and their names (D1 D2 D3 D4 DS1 DS2 DSS1 DSS2). */
export const SLOTS = SLOT_NAMES

/** A Deal ID the quick picks and the typeahead offer. */
export type DealIndexEntry = { dealId: string; status: string; fxModel: string; entityString: string }

/** The FX Deal IDs, newest first. Only the id and status are kept; a deal is read in full when it is loaded. */
export async function loadDealIndex(signal?: AbortSignal): Promise<DealIndexEntry[]> {
  const [rows, mcs] = await Promise.all([
    listDealIds({ ZDEAL_TYPE: DEAL_TYPE }, signal),
    fxList('masterContract', {}, { signal }).catch(() => [] as FxRow[]),
  ])
  return rows
    .map((r) => {
      const mc = mcs.find((m) => txt(m, 'ZMC_REF_NO') === txt(r, 'ZMC_REF'))
      return {
        dealId: txt(r, 'ZDEAL_ID'),
        status: txt(r, 'ZDEAL_STAT'),
        fxModel: mc ? [txt(mc, 'ZMOD_ID'), txt(mc, 'ZMOD_DESC')].filter(Boolean).join(' - ') : '',
        entityString: mc ? txt(mc, 'ZENT_DESC') : '',
      }
    })
    .filter((r) => r.dealId)
}

export type LoadedDeal = { deal: Deal; row: DealRow }

/** ZSGTSFTR_DEAL_ST's texts for a sub type replace the status badge descriptions. */
export function applyStatusTexts(statuses: readonly FxRow[], subType: string): void {
  for (const s of statuses) {
    if (txt(s, 'ZSUB_TYPE') !== subType) continue
    const code = txt(s, 'ZDEAL_STAT')
    STATUS_META[code] = { desc: txt(s, 'ZDEAL_SDESC'), cls: STATUS_META[code]?.cls ?? 'status-01' }
  }
}

/** The first RULE_BT row of a model; the table repeats a model once per link model. */
function modelRow(models: readonly FxRow[], modelId: string): FxRow | undefined {
  return models.find((m) => txt(m, 'ZMOD_ID') === modelId)
}

/** A transaction leg of the change screen's loader, as this screen's FX Deals row. */
export function toLeg(t: TopRow): Leg {
  return {
    rfha: t.rfha,
    bukrs: t.bukrs,
    dealType: t.dealType,
    bpName: t.bpName,
    bpCode: t.kontrh,
    dealDate: t.dblfz,
    valueDate: t.delfz,
    desc: t.xtext,
    bs1: t.bs1,
    curr1: t.curr1,
    amt1: t.amt1,
    bs2: t.bs2,
    curr2: t.curr2,
    amt2: t.amt2,
    rateVal: t.otot_rate === '' ? null : t.otot_rate,
    rateLabel: 'All-in Rate',
    txnStatus: t.txnStatus,
    fxPl: null,
  }
}

/** The saved invoice-plan lines of a deal. */
function toInvoices(deal: ChangeDeal): Invoice[] {
  return deal.inv.map((i) => ({
    tradeRef: i.trmNo,
    invType: i.zttype,
    exRate: i.exRate,
    amt: i.amt,
    invAmt: i.invAmt,
    curr: i.curr,
  }))
}

/**
 * The P&L the deal was confirmed with. A confirmed deal (ZCONFIRM X, or a stored P&L rate) whose legs net to nothing
 * stores 0 / 0, which is a real result and still shows; null only when nothing was ever stored.
 */
export function storedPl(row: FxRow): StoredPl | null {
  const amount = num(row['ZPL'])
  const localAmount = num(row['ZPL_LAMT'])
  const confirmed = txt(row, 'ZCONFIRM') === 'X' || num(row['ZPL_RATE']) !== 0
  if (amount === 0 && localAmount === 0 && !confirmed) return null
  return {
    amount,
    currency: txt(row, 'ZPL_CURR'),
    localAmount,
    localCurrency: txt(row, 'ZPL_LCURR'),
    rate: num(row['ZPL_RATE']),
  }
}

/** The screen's deal from the Deal ID row, its Master Contract, its model's RULE_BT row and the joined reads. */
export function toScreenDeal(row: DealRow, joined: ChangeDeal, model: FxRow | undefined): Deal {
  const legs = joined.top.map(toLeg)
  const mcFirst = joined.top[0]
  return {
    dealId: joined.dealId,
    dealDesc: txt(row, 'ZDEAL_DESC') || joined.dealRef,
    trader: joined.trdCode,
    traderName: joined.trdDesc,
    startDate: joined.sDate,
    endDate: joined.eDate,
    fxModel: joined.modId,
    modelDesc: joined.modDesc || (model ? txt(model, 'ZMOD_DESC') : ''),
    entityString: joined.entStr,
    currString: joined.currStr,
    mcRef: joined.mcRef,
    mcDesc: joined.mcDesc,
    mcDate: joined.mcDate,
    shipStart: joined.shipStart,
    shipEnd: joined.shipEnd,
    bukrs: mcFirst?.bukrs ?? '',
    status: joined.status,
    subType: (model ? txt(model, 'ZSUB_TYPE') : '') || FORWARD_SUB_TYPE,
    noInv: !!model && txt(model, 'ZNO_INV') === 'X',
    ssDeal: !!model && txt(model, 'ZSS') === 'X',
    confirmed: txt(row, 'ZCONFIRM') === 'X',
    storedPl: storedPl(row),
    legs,
    invoices: toInvoices(joined),
  }
}

/**
 * One Deal ID with everything the screen shows. Null when no FX Deal ID has that number; a failed
 * read throws, so a missing invoice plan is never mistaken for "no invoices".
 */
export async function loadDeal(dealId: string, signal?: AbortSignal): Promise<LoadedDeal | null> {
  const [row] = await listDealIds({ ZDEAL_ID: dealId, ZDEAL_TYPE: DEAL_TYPE }, signal)
  if (!row) return null

  const mcRef = txt(row, 'ZMC_REF')
  const [mcs, traders, statuses, plans, live] = await Promise.all([
    mcRef ? listMasterContracts({ ZMC_REF_NO: mcRef }, signal) : Promise.resolve([] as FxRow[]),
    txt(row, 'ZTRD_CODE') ? fxList('trmTrader', { ZTCODE: txt(row, 'ZTRD_CODE') }, { signal }).catch(() => [] as FxRow[]) : Promise.resolve([] as FxRow[]),
    fxList('tsfDealStatus', { ZDEAL_TYPE: DEAL_TYPE }, { signal }).catch(() => [] as FxRow[]),
    fxList('invRef', { ZDEAL_ID: dealId }, { signal }),
    liveLegs([row], signal),
  ])
  const modelId = txt(row, 'ZTSF_MODEL') || (mcs[0] ? txt(mcs[0], 'ZMOD_ID') : '')
  const [models, view] = await Promise.all([
    modelId ? fxList('fxModel', { ZMOD_ID: modelId }, { signal }).catch(() => [] as FxRow[]) : Promise.resolve([] as FxRow[]),
    inChunks('tsfvFx', 'RFHA', SLOTS.map((_, i) => txt(row, `ZRFHA${i + 1}`)).filter(Boolean), signal).catch(() => [] as FxRow[]),
  ])

  const model = modelRow(models, modelId)
  applyStatusTexts(statuses, (model ? txt(model, 'ZSUB_TYPE') : '') || FORWARD_SUB_TYPE)
  const rel: Related = {
    mcByRef: new Map(mcs.map((m) => [txt(m, 'ZMC_REF_NO'), m])),
    fxByKey: new Map(view.map((r) => [`${txt(r, 'BUKRS')}|${txt(r, 'RFHA')}`, r])),
    traderName: new Map(traders.map((t) => [txt(t, 'ZTCODE'), txt(t, 'ZTRADER') || txt(t, 'ZNAME')])),
    plans,
    ...(live ? { live: live.live, names: live.names, entities: live.entities } : {}),
  }
  const screenDeal = toScreenDeal(row, toChangeDeal(row, rel), model)
  const records = await loadAppStrRecords(screenDeal.legs.map((l) => ({ CompanyCode: l.bukrs, FinancialTransaction: l.rfha })), signal)
  const ndf = await loadNdfExtras(screenDeal.legs.map((l) => ({ CompanyCode: l.bukrs, FinancialTransaction: l.rfha })), { views: view, ...(signal ? { signal } : {}) })
  const withNdf: Deal = { ...screenDeal, legs: screenDeal.legs.map((l) => ({ ...l, ...(ndf.has(ndfKey(l.bukrs, l.rfha)) ? { ndf: ndf.get(ndfKey(l.bukrs, l.rfha))! } : {}) })) }
  return { deal: withPersistedStatus(withNdf, records), row }
}

/** Cancel Deal ID: ZDEAL_STAT = 30 and nothing else. Throws the reason it could not be saved. */
export async function cancelDeal(row: DealRow): Promise<void> {
  const result = await cancelDealId(row)
  if (!result.ok) throw new Error(result.error)
}

/**
 * The legs with their persisted transaction status: ZSGTSFTR_APP_STR.TXN_STATUS, matched on BUKRS + RFHA.
 * A leg with no APP_STR status shows none (blank) rather than the FX service's stand-in, because the
 * confirmation check reads this status and must not be told a transaction is further along than it is.
 */
export function withPersistedStatus(deal: Deal, records: readonly AppStrRecord[]): Deal {
  const byKey = new Map(records.map((r) => [`${r.CompanyCode}|${r.FinancialTransaction}`, r]))
  return { ...deal, legs: deal.legs.map((l) => ({ ...l, txnStatus: byKey.get(`${l.bukrs}|${l.rfha}`)?.TxnStatus ?? '' })) }
}
