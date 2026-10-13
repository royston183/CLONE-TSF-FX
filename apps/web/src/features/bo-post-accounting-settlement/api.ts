/*
 * SAP data for BO: Post Accounting Entries for Settlement — Single Deal ID
 * (ZSGTSFR081 / ZSGTSF_RDEAL_TRD_POST).
 *
 * Only a dependency note exists (scratchpad/bo/tracker/.../"deal trade post.txt"): tables, fields
 * and BAPIs, but NOT the WHERE clauses or status checks. The screen opens ONE Deal ID that the
 * user types, so its header is read by key — no selection is guessed. Nothing falls back to
 * sample data.
 *
 *   Header        ZSGTSFTR_DEALID WHERE zdeal_id = <typed>                  middleware "tsfDealId"
 *                 ZSGTSFTR_MAS_CON WHERE zmc_ref_no = DEALID-ZMC_REF          "masterContract"
 *                 ZSGTSFTR_DEAL_ST (ZSUB_TYPE, ZDEAL_STAT) -> ZDEAL_SDESC     "tsfDealStatus"
 *                 ZSGTRMTR_TRADER WHERE ztcode = DEALID-ZTRD_CODE             "trmTrader"
 *                 source: dependency note "deal trade post.txt"; WHERE not exported (key reads only).
 *                 Any status restriction the program puts on P_DEAL is not exported and not applied.
 *   FX Deal Settlement   ZSGTSFCDS_FX / ZSGTSFCDS_OPTION WHERE ztsf_deal_id = <deal>
 *                 FX legs: ZSGTSFTR_APP_STR (TrmFxApp) WHERE ZtsfDealID = <deal>, each joined by CompanyCode +
 *                 FinancialTransaction to FxTransaction (the "tsfvFx" view lacks the Deal ID column). The legs
 *                 are every row of the Deal ID, as the header comment states no further selection; reversed
 *                 ones are kept. Entity is the company code (TSF entity ZCOM_ID has no source).
 *                 STILL WAITING FOR API: ZSGTSFCDS_OPTION (option legs, no resource) and the legs' FI documents
 *                 FI Doc 1 / 2 (BKPF, no resource) - those cells say so instead of "not posted"; Status is
 *                 'Confirmed' because 'Posted' would need the documents; DSS Deal has no source.
 *   Trade Invoice Settlement   ZSGTSFTR_TRD_POS WHERE zdeal_id = <deal>: the rows MO: Execute Settlement for
 *                 Deal ID (ZSGTSFR060) stored (the gateway's local SQLite, positions.ts), with their Settlement
 *                 (ZSET_CHECK), FI Posting (ZPOST_CHECK) and FI document (ZBELNR) kept apart. The same table's FX
 *                 rows give each FX leg its MO settlement.
 *   FI documents  BKPF -> no middleware resource
 *
 * Writes: Accounting Completed moves ZDEAL_STAT 21 -> 22 (accounting.ts). Every other button posts through BAPIs / reports or updates ZSGTSFTR_DEALID / _TRD_POS with
 * statements that are not exported, so each validates as before and then says WAITING FOR ACTION
 * API. Nothing is written to the middleware and no local state changes.
 */
import { dealStatusText } from '../../shared/fx/deal-id.ts'
import { messageOf } from '../../shared/fx/master-contract.ts'
import { txt } from '../../shared/fx/masters.ts'
import { odataString } from '@slc/api-client'
import { loadFxWithApp, type FxWithApp } from '../../shared/fx/app-str.ts'
import { fxList, isAbort, type FxRow } from '../../shared/fx/mw.ts'
import { dmyFromIso, num } from '../../shared/fx/sap.ts'
import { loadPositions, toInvLegs, withSetFxSequence, type PositionRow } from './positions.ts'
import type { Deal, FxLeg, Outcome, ToastMessage } from './types.ts'

export const WAITING = 'WAITING FOR API'
export const PROGRAM = 'ZSGTSF_RDEAL_TRD_POST'

/** What the FX Deal Settlement grid still cannot show once the legs come from TrmFxApp + FxTransaction. */
export const LEGS_STILL_WAITING = `${WAITING} — ZSGTSFCDS_OPTION (option legs) and BKPF (the FI Doc 1 / 2 of each leg, so its Posted status) have no middleware resource.`

/** The grid's note: why no leg could be read, that none exists in APP_STR, or what the listed legs still lack. */
export function legsWaitingReason(failure = '', legCount = 1): string {
  if (failure) return `${WAITING} — ZSGTSFTR_APP_STR / FxTransaction could not be read: ${failure} ${LEGS_STILL_WAITING}`
  return legCount ? LEGS_STILL_WAITING : `No FX deal legs for this Deal ID in ZSGTSFTR_APP_STR. ${LEGS_STILL_WAITING}`
}

/** Under the Trade Invoice grid: why it is empty, or what its posting still waits for. */
export function invoiceNote(failure: string, legCount: number): string {
  if (failure) return `The settlement legs (local ZSGTSFTR_TRD_POS) could not be read: ${failure}`
  if (!legCount) return 'No settlement legs are stored for this Deal ID yet: run Initiate Settlement on MO: Execute Settlement for Deal ID (ZSGTSFR060) first.'
  return POSTING_WAITING
}

/** The accounting posting both Post buttons need, which SAP does not expose yet. */
export const POSTING_WAITING = `${WAITING} — the FI posting (BAPI_ACC_DOCUMENT_POST for trade invoice legs; RFTBBB00 / TBB1 for FX deals, service ZFS_SB_TRMPOSTING_O4_API not published) has no API, so no leg can be posted from here yet.`

export const INVOICE_WAITING = `${WAITING} — ZSGTSFTR_TRD_POS (trade invoice settlement rows) has no middleware resource; ${PROGRAM} source not exported (only dependency notes), so the rows built from ZSGTSFTR_SET_TYP / _SET_FX / _TRD_ACC cannot be reproduced.`

export const FI_DOC_WAITING = `${WAITING} — BKPF (FI document header) has no middleware resource.`

/** WAITING FOR ACTION API, in the brief's words. */
export const waitingAction = (what: string, apis: string): string =>
  `WAITING FOR ACTION API — ${what} (${apis}) has no API yet. Nothing was posted to SAP.`

const COMMIT = 'BAPI_TRANSACTION_COMMIT / _ROLLBACK'
const FTR_CHANGE = 'ZSGTRMFM_VTBFHA_EXPORT + BAPI_FTR_FXT_CHANGE / BAPI_FTR_CHANGE_FXOPTIONS'

/** From the dependency note's BAPI / FM list and its DIRECT DATABASE WRITES. */
export const ACTION_WAITING = {
  initiate: waitingAction('Initiate Settlement', 'UPDATE ZSGTSFTR_DEALID status + ZSGTSFTR_TRD_POS rows from ZSGTSFTR_SET_TYP / _SET_FX — statements not exported'),
  postFx: waitingAction('Post FX Deal', `RFTBBB00 / TBB1, ${FTR_CHANGE}, ${COMMIT}`),
  txnTest: waitingAction('Test Run', 'RFTBBB00 / TBB1 in test mode'),
  txnUpdate: waitingAction('Update bank / transfer details', `${FTR_CHANGE}, ${COMMIT}`),
  txnPost: waitingAction('Post Accounting Entry', `RFTBBB00 / TBB1, ${FTR_CHANGE}, ${COMMIT}`),
  invUpdate: waitingAction('Update settlement data', 'UPDATE ZSGTSFTR_TRD_POS — no middleware resource, statement not exported'),
  invSettle: waitingAction('Settlement Complete', 'UPDATE ZSGTSFTR_TRD_POS ZSET_CHECK + ZSGTSFTR_DEALID status — statements not exported'),
  invPost: waitingAction('Post Document', `BAPI_ACC_DOCUMENT_POST, ${COMMIT}, UPDATE ZSGTSFTR_TRD_POS`),
  postAll: waitingAction('Trade Invoice: Posting All', `BAPI_ACC_DOCUMENT_POST, ${COMMIT}, UPDATE ZSGTSFTR_TRD_POS`),
} as const

/**
 * The toast an action shows. The screen's own rule still runs first: when it refuses or has
 * nothing to do (the deal comes back unchanged) its message stands; when it would change the
 * deal, SAP has to do that, so the action waits and the deal is not touched.
 */
export function gateOutcome(before: Deal, outcome: Outcome, waiting: string): ToastMessage {
  return outcome.deal === before ? outcome.toast : { message: waiting, kind: 'error' }
}

/* ------------------------------------------------------------------ header */

const first = <T>(rows: readonly T[]): T | undefined => rows[0]

/** DEALID + MAS_CON + DEAL_ST + TRADER rows -> the screen's Deal (legs left empty, with their reasons). */
export function toDeal(input: {
  deal: FxRow
  mc: FxRow | undefined
  trader: FxRow | undefined
  statuses: readonly FxRow[]
  legsReason: string
  legs?: readonly FxLeg[]
}): Deal {
  const { deal, mc, trader, statuses, legsReason, legs = [] } = input
  const code = txt(deal, 'ZDEAL_STAT')
  const mcModel = mc ? txt(mc, 'ZMOD_ID') : ''
  return {
    dealId: txt(deal, 'ZDEAL_ID'),
    dealRef: txt(deal, 'ZDEAL_REF'),
    dealStartDate: dmyFromIso(deal['ZS_DATE'], '.'),
    dealEndDate: dmyFromIso(deal['ZE_DATE'], '.'),
    mcRefNo: txt(deal, 'ZMC_REF'),
    mcDesc: mc ? txt(mc, 'ZMC_DESC') : '',
    mcDate: dmyFromIso(mc?.['ZMC_DATE'], '.'),
    shipEndDate: dmyFromIso(mc?.['ZSHIP_END'], '.'),
    // The MC's model (MAS_CON ZMOD_ID / ZMOD_DESC); ZSGTSFTR_DEALID-ZTSF_MODEL when the MC has none.
    fxModelId: mcModel || txt(deal, 'ZTSF_MODEL'),
    modelDesc: mcModel && mc ? txt(mc, 'ZMOD_DESC') : '',
    entityString: mc ? txt(mc, 'ZENT_DESC') : '',
    currencyString: txt(deal, 'ZDEAL_CURR_DESC'),
    fxInvModel: txt(deal, 'ZFX_INV_MODEL'),
    traderCode: txt(deal, 'ZTRD_CODE'),
    traderDesc: trader ? txt(trader, 'ZTRADER') : '',
    status: Number(code) || 0,
    statusCode: code,
    statusText: dealStatusText({ statuses }, txt(deal, 'ZSUB_TYPE'), code),
    top: [...legs],
    inv: [],
    fxWaiting: legsReason,
    invWaiting: INVOICE_WAITING,
  }
}

export const normalizeDealId = (raw: string) => raw.trim().toUpperCase()

export type LoadResult = { ok: true; deal: Deal } | { ok: false; message: string }

/** One TrmFxApp row joined to its transaction as a grid leg; documents and DSS deal have no source (blank). */
export function toLeg({ fx, app }: FxWithApp): FxLeg {
  return {
    entity: fx.CompanyCode,
    dealType: (app.ZtsfDealType ?? '').trim(),
    rfha: fx.FinancialTransaction,
    buyCurr: fx.BuyCurrency ?? '',
    buyAmt: Math.abs(num(fx.BuyAmount)),
    sellCurr: fx.SellCurrency ?? '',
    sellAmt: Math.abs(num(fx.SellAmount)),
    rate: num(fx.ForwardRate),
    status: 'Confirmed',
    doc1: '',
    doc2: '',
    dssDeal: '',
    sgsart: fx.ProductType ?? '',
    settled: app.ZtsfExeCo === true,
    seq: '',
    txnStatus: (app.TxnStatus ?? '').trim(),
  }
}

/** The FX legs of a Deal ID: its TrmFxApp rows with their transactions, by deal type then transaction number. */
export async function loadLegs(dealId: string, signal?: AbortSignal): Promise<FxLeg[]> {
  const joined = await loadFxWithApp(`ZtsfDealID eq ${odataString(dealId)}`, signal)
  return joined
    .map(toLeg)
    .sort((a, b) => a.dealType.localeCompare(b.dealType) || a.rfha.localeCompare(b.rfha))
}

/** One Deal ID, read by key. Never seed data: an unknown or unreadable Deal ID says so. */
export async function loadDeal(raw: string, signal?: AbortSignal): Promise<LoadResult> {
  const key = normalizeDealId(raw)
  if (!key) return { ok: false, message: 'Enter a Deal ID to continue.' }
  try {
    const deal = first(await fxList('tsfDealId', { ZDEAL_ID: key }, { signal }))
    if (!deal) return { ok: false, message: `No Deal ID '${key}' in ZSGTSFTR_DEALID.` }
    const mcRef = txt(deal, 'ZMC_REF')
    const trdCode = txt(deal, 'ZTRD_CODE')
    const [mcs, traders, statuses, legsRead, positionsRead] = await Promise.all([
      mcRef ? fxList('masterContract', { ZMC_REF_NO: mcRef }, { signal }) : Promise.resolve([] as FxRow[]),
      trdCode ? fxList('trmTrader', { ZTCODE: trdCode }, { signal }) : Promise.resolve([] as FxRow[]),
      fxList('tsfDealStatus', { ZDEAL_STAT: txt(deal, 'ZDEAL_STAT') }, { signal }),
      loadLegs(txt(deal, 'ZDEAL_ID') || key, signal).then(
        (legs) => ({ legs, failure: '' }),
        (error: unknown) => {
          if (isAbort(error)) throw error
          console.warn('[deal-trd-post] FX legs unavailable', error)
          return { legs: [] as FxLeg[], failure: messageOf(error) }
        },
      ),
      // MO's settlement state (local ZSGTSFTR_TRD_POS); unreadable leaves the invoice grid empty with the reason.
      loadPositions(txt(deal, 'ZDEAL_ID') || key, signal).then(
        (rows) => ({ rows, failure: '' }),
        (error: unknown) => {
          if (isAbort(error)) throw error
          return { rows: [] as PositionRow[], failure: messageOf(error) }
        },
      ),
    ])
    const header = toDeal({
      deal,
      mc: first(mcs),
      trader: first(traders),
      statuses,
      legs: legsRead.legs,
      legsReason: legsWaitingReason(legsRead.failure, legsRead.legs.length),
    })
    const inv = toInvLegs(positionsRead.rows)
    // The FX legs' sequence (ZSGTSFTR_SET_FX) and the model's no-invoice flag (ZSGTSFTR_RULE_BT ZNO_INV).
    const model = header.fxModelId
    const [setFx, rules, setTyp] = model
      ? await Promise.all([
          fxList('setFx', { ZMOD_ID: model }, { signal }),
          fxList('fxModel', { ZMOD_ID: model }, { signal }),
          fxList('setTyp', { ZMOD_ID: model }, { signal }),
        ])
      : [[] as FxRow[], [] as FxRow[], [] as FxRow[]]
    const top = withSetFxSequence(header.top, setFx)
    // The leg's DSS deal is SET_TYP's (a~zdss_deal); TRD_POS has no column for it.
    const dss = new Map(setTyp.map((t) => [txt(t, 'ZT_TYPE'), txt(t, 'ZDSS_DEAL')]))
    for (const r of inv) r.dssDealType = dss.get(r.tType) ?? ''
    const noInvoice = rules[0] ? txt(rules[0], 'ZNO_INV') !== '' : false
    return { ok: true, deal: { ...header, top, inv, noInvoice, invWaiting: invoiceNote(positionsRead.failure, inv.length) } }
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[deal-trd-post] ZSGTSFTR_DEALID unavailable', error)
    return { ok: false, message: `WAITING FOR DEAL ID API — ZSGTSFTR_DEALID (middleware "tsfDealId") could not be read: ${messageOf(error)}` }
  }
}
