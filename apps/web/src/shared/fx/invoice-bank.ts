/**
 * The bank assigned to a trade invoice on MO: Generate Invoices for Deal ID (Assign House Bank / Partner Bank), as
 * ZSGTSFTR_BIL_ADJ stores it: ZHBKID / ZHKTID (a house bank of the seller's company code) or ZPTNR_BKID (BUT0BK of the
 * business partner ZBP); the two are mutually exclusive. A settlement leg (ZT_TYPE 'T3-P') belongs to the invoices whose
 * ZINV_REF carries its trade type ('T3') at offset 11.
 */
export type InvoiceBank = { houseBank: string; accountId: string; partnerBank: string; businessPartner: string }

export const NO_INVOICE_BANK: InvoiceBank = { houseBank: '', accountId: '', partnerBank: '', businessPartner: '' }

const text = (r: Record<string, unknown>, k: string): string => String(r[k] ?? '').trim()

export function invoiceBankOf(billAdj: readonly Record<string, unknown>[], legType: string): InvoiceBank {
  const type = legType.slice(0, 2)
  const row = billAdj.find((b) => text(b, 'ZINV_REF').slice(11, 13) === type && (text(b, 'ZHBKID') !== '' || text(b, 'ZPTNR_BKID') !== ''))
  if (!row) return NO_INVOICE_BANK
  return { houseBank: text(row, 'ZHBKID'), accountId: text(row, 'ZHKTID'), partnerBank: text(row, 'ZPTNR_BKID'), businessPartner: text(row, 'ZBP') }
}
