/**
 * Screen rules of ZSGTSF_PDEAL_MO_SS as pure functions. Reading and writing SAP lives in
 * api.ts; nothing here mutates a deal (status changes are written to ZSGTSFTR_DEALID and the
 * deal is read back).
 */
import type { Deal, DealDb, Invoice, Leg, ToolbarCode } from './types.ts'

/** Deal ID search: id, reference, MC ref, trader code/description and FX model. Empty term lists all. */
export function searchDeals(db: DealDb, term: string): Deal[] {
  const t = (term || '').trim().toLowerCase()
  return Object.values(db).filter((d) => {
    const hay = `${d.dealId} ${d.dealRef} ${d.mcRefNo} ${d.traderCode} ${d.traderDesc} ${d.fxModel}`.toLowerCase()
    return !t || hay.includes(t)
  })
}

/**
 * The toolbar's buttons, in order (FORM top_data: SET PF-STATUS '111' EXCLUDING gt_ucomm, for
 * ZSGTSFP017). Status 01 excludes only REV. Any other status excludes UPD, CAN and DEAL_EDIT
 * (FORM function_button), and REV unless the status is 02/03 and the user is in TVARVC
 * ZSGTSF_UNWIND. PRE, SS_DEALLOC, SS_DEAL, DMS and REF are never excluded. DEAL_EDIT also
 * needs a selected leg (the ABAP does nothing without get_selected_rows).
 *
 * The converted page showed SS_DEALLOC / SS_DEAL only for a Short Straddle deal in 01; the
 * ABAP never excludes them, so this follows the ABAP.
 */
export function toolbarButtons(deal: Deal, selectedLegRfha: string | null): ToolbarCode[] {
  const status01 = deal.status === '01'
  const status0203 = deal.status === '02' || deal.status === '03'
  const out: ToolbarCode[] = []
  if (status01) out.push('UPD')
  out.push('PRE')
  if (status01 && !!selectedLegRfha) out.push('DEAL_EDIT')
  if (status01) out.push('CAN')
  out.push('SS_DEALLOC', 'SS_DEAL')
  if (status0203 && deal.reversalAuthorized) out.push('REV')
  out.push('DMS', 'REF')
  return out
}

/**
 * STATUS_9000: the invoice and P&L containers (group HID) are hidden when the model is a
 * no-invoice model or the deal is cancelled (30). The converted page also hid them at 50;
 * the ABAP does not.
 */
export function invoicesVisible(deal: Deal): boolean {
  return !deal.noInvoiceModel && deal.status !== '30'
}

/** SET_ALV_2: ZEX_RATE is editable only while the deal is 01. */
export function invoicesEditable(deal: Deal): boolean {
  return deal.status === '01'
}

/** The leg an invoice line belongs to: the leg whose deal type is the line's ZDTYPE. */
export function legForInvoice(deal: Deal, inv: Invoice): Leg | undefined {
  return inv.dtype ? deal.legs.find((l) => l.dealType === inv.dtype) : undefined
}

/**
 * USER_COMMAND_9001 'CONF' guard: the first leg below status 07, skipping the rows the grid
 * colours C501 (TXN_STATUS 02), as LOOP AT gt_top WHERE color IS INITIAL does.
 */
export function firstUnreadyLeg(deal: Deal): Leg | undefined {
  return deal.legs.find((l) => l.txnStatus !== '02' && l.txnStatus < '07')
}

/** Clicking a leg selects it; clicking the selected leg again clears the selection. */
export function toggleLeg(current: string | null, rfha: string): string | null {
  return current === rfha ? null : rfha
}
