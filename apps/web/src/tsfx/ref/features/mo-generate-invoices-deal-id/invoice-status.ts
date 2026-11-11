/**
 * Deal ID invoice statuses (ZSGTSFTR_DEALID-ZDEAL_STAT) this program moves a Deal ID through.
 *
 * These are NOT transaction statuses (ZSGTSFTR_APP_STR-TXN_STATUS, shared/fx/txn-status.ts): the two
 * share digits and nothing else. Nothing in this feature writes TXN_STATUS, and no constant here may
 * be compared with one. Only meanings the ABAP proves are named; the master data
 * (ZSGTSFTR_DEAL_ST, shown through STATUS_TEXT) owns the display texts.
 */
export const DEAL_INVOICE_STATUS = {
  /** Reached when the last BL is de-assigned from the Deal ID (screen 9003 UPDATE). */
  PRE_INVOICE: '03',
  /** Where Reverse Confirm Invoice Generation returns the Deal ID; the status Confirm Invoice starts from. */
  INVOICE_REVERSED: '04',
  /** TEXT: "Invoice created in TRM" — full invoice. */
  INVOICE_CREATED: '05',
  /** TEXT: "Partial Invoice created in TRM". */
  PARTIAL_INVOICE_CREATED: '07',
} as const

export type InvoiceFinalStatus = typeof DEAL_INVOICE_STATUS.INVOICE_CREATED | typeof DEAL_INVOICE_STATUS.PARTIAL_INVOICE_CREATED

/** ZSGTSFTR_BIL_ADJ-ZPC: C = complete (full invoice), P = partial. */
export const INVOICE_PC = { COMPLETE: 'C', PARTIAL: 'P' } as const

/** FORM save_data / ammend_deal: 07 -> 'P', every other status -> 'C'. */
export const pcForStatus = (status: string): 'C' | 'P' => (status === DEAL_INVOICE_STATUS.PARTIAL_INVOICE_CREATED ? INVOICE_PC.PARTIAL : INVOICE_PC.COMPLETE)

export const isFinalInvoiceStatus = (status: string): status is InvoiceFinalStatus =>
  status === DEAL_INVOICE_STATUS.INVOICE_CREATED || status === DEAL_INVOICE_STATUS.PARTIAL_INVOICE_CREATED

/** FORM ammend_deal: only 05 and 07 toggle, to each other. */
export const toggledStatus = (status: string): InvoiceFinalStatus | null =>
  status === DEAL_INVOICE_STATUS.INVOICE_CREATED
    ? DEAL_INVOICE_STATUS.PARTIAL_INVOICE_CREATED
    : status === DEAL_INVOICE_STATUS.PARTIAL_INVOICE_CREATED
      ? DEAL_INVOICE_STATUS.INVOICE_CREATED
      : null

/** PAI 'CAN': Reverse Confirm Invoice Generation is allowed at 04, 05 or 07. */
export const canReverseInvoice = (status: string): boolean =>
  status === DEAL_INVOICE_STATUS.INVOICE_REVERSED || isFinalInvoiceStatus(status)

/** PAI 'IMPORT' / 'EXPORT': letters only above status 04. */
export const canPrintLetterAt = (status: string): boolean => status !== '' && status > DEAL_INVOICE_STATUS.INVOICE_REVERSED
