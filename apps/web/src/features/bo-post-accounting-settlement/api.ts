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
 *                 -> WAITING FOR API: "tsfvFx" lacks the columns; ZSGTSFCDS_OPTION has no resource
 *   Trade Invoice Settlement   ZSGTSFTR_TRD_POS WHERE zdeal_id = <deal> (+ ZSGTSFTR_SET_TYP / _SET_FX /
 *                 _TRD_ACC, BKPF)  -> WAITING FOR API: ZSGTSFTR_TRD_POS has no middleware resource
 *                 (middleware "tradePosition" is the SLC table ZSGSLCTR_TRD_POS, not this one)
 *   FI documents  BKPF -> no middleware resource
 *
 * Writes: every button posts through BAPIs / reports or updates ZSGTSFTR_DEALID / _TRD_POS with
 * statements that are not exported, so each validates as before and then says WAITING FOR ACTION
 * API. Nothing is written to the middleware and no local state changes.
 */
import { dealStatusText } from '../../shared/fx/deal-id.ts'
import { messageOf } from '../../shared/fx/master-contract.ts'
import { txt } from '../../shared/fx/masters.ts'
import { fxColumns, fxList, isAbort, type FxRow } from '../../shared/fx/mw.ts'
import { dmyFromIso } from '../../shared/fx/sap.ts'
import type { Deal, Outcome, ToastMessage } from './types.ts'

export const WAITING = 'WAITING FOR API'
export const PROGRAM = 'ZSGTSF_RDEAL_TRD_POST'
export const FX_VIEW = 'tsfvFx'

/** ZSGTSFCDS_FX fields the dependency note lists, ZTSF_DEAL_ID (the key the legs are read by) included. */
// prettier-ignore
export const LEG_VIEW_COLUMNS = [
  'BUKRS', 'RFHA', 'RFHAZUL', 'DBLFZ', 'DELFZ', 'XTEXT', 'SGSART', 'PRCTR', 'RBUSA', 'KONTRH', 'BP_NAME', 'ZCOM_ID',
  'ZTSF_EXE_CO', 'BS_1', 'BS_2', 'CURR1', 'CURR2', 'AMT1', 'AMT2', 'OSPOT', 'OSWAP', 'OTOT_RATE', 'ZTSF_MC_REF_NO',
  'TXN_STATUS', 'ZTSF_DEAL_TYPE', 'EXT_STAT_DESC', 'ZTSF_DEAL_ID', 'SAKTIV',
] as const

export const missingColumns = (have: readonly string[], need: readonly string[]): string[] => {
  const present = new Set(have.map((c) => c.toUpperCase()))
  return need.filter((c) => !present.has(c))
}

/** The FX Deal Settlement gate: ZSGTSFCDS_OPTION has no resource, so the legs are never complete. */
export function legsWaitingReason(viewColumns: readonly string[] | null): string {
  const fx =
    viewColumns === null
      ? `ZSGTSFCDS_FX (middleware "${FX_VIEW}") could not be read`
      : (() => {
          const missing = missingColumns(viewColumns, LEG_VIEW_COLUMNS)
          return missing.length ? `ZSGTSFCDS_FX (middleware "${FX_VIEW}") does not serve ${missing.join(', ')}` : ''
        })()
  return `${WAITING} — ${fx ? `${fx}; ` : ''}ZSGTSFCDS_OPTION (option legs) has no middleware resource.`
}

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
  accounting: waitingAction('Accounting Completed', 'UPDATE ZSGTSFTR_DEALID ZDEAL_STAT + ZCHANGED_BY / _DATE / _TIME — statement not exported'),
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
}): Deal {
  const { deal, mc, trader, statuses, legsReason } = input
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
    top: [],
    inv: [],
    fxWaiting: legsReason,
    invWaiting: INVOICE_WAITING,
  }
}

export const normalizeDealId = (raw: string) => raw.trim().toUpperCase()

export type LoadResult = { ok: true; deal: Deal } | { ok: false; message: string }

async function columnsOrNull(resource: string, signal?: AbortSignal): Promise<string[] | null> {
  try {
    return await fxColumns(resource, signal)
  } catch (error) {
    if (isAbort(error)) throw error
    return null
  }
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
    const [mcs, traders, statuses, viewColumns] = await Promise.all([
      mcRef ? fxList('masterContract', { ZMC_REF_NO: mcRef }, { signal }) : Promise.resolve([] as FxRow[]),
      trdCode ? fxList('trmTrader', { ZTCODE: trdCode }, { signal }) : Promise.resolve([] as FxRow[]),
      fxList('tsfDealStatus', { ZDEAL_STAT: txt(deal, 'ZDEAL_STAT') }, { signal }),
      columnsOrNull(FX_VIEW, signal),
    ])
    return {
      ok: true,
      deal: toDeal({ deal, mc: first(mcs), trader: first(traders), statuses, legsReason: legsWaitingReason(viewColumns) }),
    }
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[deal-trd-post] ZSGTSFTR_DEALID unavailable', error)
    return { ok: false, message: `WAITING FOR DEAL ID API — ZSGTSFTR_DEALID (middleware "tsfDealId") could not be read: ${messageOf(error)}` }
  }
}
