/*
 * The workbench's multi-step actions, ported from the original's run… and action… functions:
 * they read the latest data, apply a mutation, report it and hand over to the next popup.
 */
import { buildNdoSpot, createSpotTransaction, fetchTransactions, inScope, isAuthorized, updateTxnStatus, type SpotRequest, type TxnScope } from './logic.ts'
import type { PopupSpec } from './modal.tsx'
import type { StatusOptions } from '../../shared/popup/Popup.tsx'
import type { ActionCtx, ActionItem, AppData, Deal, ToastKind, Txn } from './types.ts'

/**
 * The SAP postings each workbench action makes (ZSGTSFR_SET_WSPACE). NDF fixing is live: the NDF
 * Details popup calls FxTransaction/NdfFixing (BAPI_FTR_FXT_NDF_FIXING) and sets TXN_STATUS 10 on
 * TrmFxApp (shared/fx/ndf.ts fixNdf), as UA1 does. No service exposes the others, so they are
 * WAITING FOR API and nothing is posted.
 */
export const WRITE_ACTIONS = {
  exercise: 'Option exercise — BAPI_FTR_EXERCISE_FXOPTIONS (TI86 for cash settlement, BAPI_FTR_SETTLE_FXOPTIONS)',
  expire: 'Option expiry — BAPI_FTR_EXPIRE_FXOPTIONS (+ BAPI_FTR_SETTLE_FXOPTIONS)',
  ndfFixing: 'NDF fixing — BAPI_FTR_FXT_NDF_FIXING (+ TX02)',
  spotOrder: 'Spot creation — BAPI_FTR_FXT_ORDERCREATE + BAPI_FTR_FXT_ORDEREXECUTE with ZSGTRMFM_VTBFHA_EXPORT and the ZSGTSFTR_IN_SPOT update',
  spotNdf: 'NDF/DNDF spot — BAPI_FTR_FXT_GETDETAIL + BAPI_FTR_FXT_CREATE with ZSGTRMFM_VTBFHA_EXPORT',
  settlementSpot: 'Settlement spot — SUBMIT ZSGTSFR_SPOT_CREATE (FORM create_sett_spot)',
} as const
export type WriteAction = keyof typeof WRITE_ACTIONS

/** What the flows and popups need from the screen. */
export type Wb = {
  /** Posts an action to SAP; false (with the reason shown) while no API exposes it. */
  post: (action: WriteAction) => boolean
  get: () => AppData
  set: (next: AppData) => void
  toast: (msg: string, kind?: ToastKind) => void
  /** The outcome popup (standard StatusPopup) that reports a finished SAP write; Close only closes. */
  outcome: (opts: StatusOptions) => void
  open: (spec: PopupSpec) => void
  confirm: (opts: { title: string; message: string }, onYes: () => void) => void
  /** Reads the workbench from SAP again, after something was booked there. */
  reload: () => void
  /** Today, ISO — the trade/value date of a spot booked here. */
  today: () => string
}

export const findDeal = (data: AppData, id: string): Deal | undefined => data.deals.find((d) => d.id === id)
/** `scope` (the deal and / or company code) is what tells apart the same transaction number in two company codes. */
export const findTxn = (data: AppData, rfha: string, scope?: TxnScope): Txn | undefined => data.txns.find((t) => t.rfha === rfha && inScope(t, scope))

/** Books a spot and returns its number. */
export function bookSpot(wb: Wb, p: SpotRequest): string {
  const { data, rfha } = createSpotTransaction(wb.get(), p, wb.today())
  wb.set(data)
  return rfha
}

/** Double-click on a deal: AUTHORITY-CHECK F_BKPF_BUK (ACTVT 03) for every company code first. */
export function openDeal(wb: Wb, dealId: string): boolean {
  if (!isAuthorized(fetchTransactions(wb.get(), dealId))) {
    wb.toast('You do not have an authorization for the given company code', 'error')
    return false
  }
  wb.open({ kind: 'deal', dealId, selectedRfha: null })
  return true
}

/* ---------------- toolbar actions (EX / NDF / DIFF) ---------------- */

export function actionOptionExercise(wb: Wb, t: Txn) {
  if (t.sgsart.substring(0, 2) !== '14') {
    wb.toast('Please select the Option/NDO deal', 'error') /* TEXT-017 */
    return
  }
  wb.open({ kind: 'rate', ctx: { dealId: t.dealId, rfha: t.rfha, fromAction: false } })
}

export function actionNdfFixing(wb: Wb, t: Txn) {
  if (t.sgsart.substring(0, 2) !== '12') {
    wb.toast('Please select the NDF/DNDF deal', 'error') /* TEXT-018 */
    return
  }
  wb.open({ kind: 'ndf', ctx: { dealId: t.dealId, rfha: t.rfha, fromAction: false } })
}

export function actionDiffSpot(wb: Wb, t: Txn) {
  wb.open({ kind: 'settlementSpot', ctx: { dealId: t.dealId, rfha: t.rfha, fromAction: false } })
}

/* ---------------- Action Items: the Create button (handle_button_click) ---------------- */

export function actionItemCreate(wb: Wb, it: ActionItem) {
  const data = wb.get()
  const t = findTxn(data, it.rfha, { dealId: it.dealId, bukrs: it.bukrs })
  const deal = t ? findDeal(data, t.dealId) : undefined
  if (!t || !deal) return
  const ctx: ActionCtx = { dealId: t.dealId, rfha: t.rfha, fromAction: true }
  switch (it.sfhaart) {
    case '619':
      if (deal.ss !== 'X') wb.open({ kind: 'settlementSpot', ctx })
      else if (t.dealType === '00' || t.dealType === '') wb.open({ kind: 'fwdSsSpot', ctx })
      else wb.open({ kind: 'settlementSpot', ctx })
      break
    case '604':
      wb.open({ kind: 'settlementSpot', ctx })
      break
    case '631':
    case '632':
      if (t.sgsart.substring(0, 2) === '12') wb.open({ kind: 'ndf', ctx })
      else wb.toast('Please select the NDF/DNDF deal', 'error')
      break
    default:
      if (t.status > '07') wb.open({ kind: 'settlementSpot', ctx })
      else if (t.sgsart.substring(0, 2) === '14') wb.open({ kind: 'rate', ctx })
      else wb.toast('Please select the Option/NDO deal', 'error')
  }
}

/* ---------------- exercise / expire (screen 9001 follow-ups) ---------------- */

/** EXERCISE: status 24, "Exercise Updated Successfully", then the spot logic. */
export function runExercise(wb: Wb, ctx: ActionCtx, txn: Txn, rate: number, cs: number) {
  const cash = cs ? { cashAmt: Math.abs(cs), cashCurr: txn.curr1 === 'USD' || txn.curr2 === 'USD' ? 'USD' : txn.curr2 } : null
  wb.set(updateTxnStatus(wb.get(), txn.rfha, '24', cash, { dealId: txn.dealId, bukrs: txn.bukrs }))
  wb.toast('Exercise Updated Sucessfully', 'success') /* TEXT-008 */
  const data = wb.get()
  const deal = findDeal(data, ctx.dealId)
  const fresh = findTxn(data, txn.rfha, { dealId: txn.dealId, bukrs: txn.bukrs })
  if (!deal || !fresh) return
  if (fresh.settlfl === '1') {
    /* physical delivery -> spot */
    if (deal.ss === 'X') {
      if (ctx.fromAction && fresh.dealType) createAutoSpot(wb, ctx, fresh, '604')
      else wb.open({ kind: 'ssSpot', ctx: { dealId: ctx.dealId, rfha: fresh.rfha, fromAction: false }, sfhaart: '604', rate })
    } else createAutoSpot(wb, ctx, fresh, '604')
  } else if (fresh.settlfl === '2') {
    /* cash settlement */
    if (ctx.fromAction && fresh.dealType) {
      wb.confirm({ title: 'Create Spot', message: 'Do you want to create the Spot?' } /* TEXT-005 */, () =>
        wb.open({ kind: 'spot', ctx: { ...ctx, rfha: fresh.rfha }, variant: 'ndo', sfhaart: '604', rate }),
      )
    }
  }
}

/** EXPIRY: status 34, "Expire Updated Successfully", then the spot logic. */
export function runExpire(wb: Wb, ctx: ActionCtx, txn: Txn, rate: number) {
  const scope = { dealId: txn.dealId, bukrs: txn.bukrs }
  wb.set(updateTxnStatus(wb.get(), txn.rfha, '34', null, scope))
  wb.toast('Expire Updated Successfully', 'success') /* TEXT-007 */
  const fresh = findTxn(wb.get(), txn.rfha, scope)
  if (fresh && (fresh.settlfl === '1' || fresh.settlfl === '2') && fresh.dealType) {
    wb.confirm({ title: 'Create Spot', message: 'Do you want to create the Spot?' }, () =>
      wb.open({ kind: 'spot', ctx: { ...ctx, rfha: fresh.rfha }, variant: 'ndo', sfhaart: '605', rate }),
    )
  }
}

/** Physical exercise: a spot at the strike without a popup (CREATE_SPOT_NEW_MAIN). */
function createAutoSpot(wb: Wb, ctx: ActionCtx, txn: Txn, sfhaart: string) {
  if (!wb.post('spotOrder')) return
  const sp = buildNdoSpot(txn, { invoice: null, rate: txn.strike })
  const rfha = bookSpot(wb, {
    dealId: ctx.dealId,
    dealType: txn.dealType,
    sourceRfha: txn.rfha,
    bukrs: sp.bukrs,
    sfhaart,
    bs1: sp.bs1,
    curr1: sp.curr1,
    amt1: sp.amt1,
    bs2: sp.bs2,
    curr2: sp.curr2,
    amt2: sp.amt2,
    rate: sp.rate,
    bp: txn.cpty,
    text: 'Spot – option exercise',
  })
  wb.outcome({ tone: 'success', title: 'Spot Created', message: `Spot Transaction created Successfully: ${rfha}` }) /* TEXT-015 */
}
