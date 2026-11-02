/**
 * The "Accounting Entry" grid of the Trade Invoice Settlement pop-up (ZSGTSF_RDEAL_TRD_POST screen 9002): the Dr / Cr lines the pop-up works out
 * when it opens, before anything is posted. MO only shows them; BO: Post Accounting Entries for Settlement (ZSGTSFR081) posts. The lines are
 * BO's own determination (bo-post-accounting-settlement/determination.ts) run on the leg and the banks currently chosen in the pop-up, so a
 * value that cannot be found is listed as an issue, never filled in.
 */
import { determinePosting, livePorts, CATEGORY, type DeterminationPorts, type PostLine } from '../bo-post-accounting-settlement/determination.ts'
import { loadPostingTypes } from './api.ts'
import { formatAmount } from './format.ts'
import type { InvPostForm, TradeInvoice } from './types.ts'

export type PreviewLine = {
  dc: 'Dr' | 'Cr'
  postingDate: string
  documentDate: string
  glAccount: string
  vendor: string
  profitCenter: string
  businessArea: string
  houseBank: string
  accountId: string
  invoiceAmount: string
  invoiceCurrency: string
  paymentAmount: string
  payCurrency: string
  /** ZDR_ACC / ZCR_ACC and its text. */
  account: string
  accountType: string
}

export type AccountingPreview = { lines: PreviewLine[]; issues: string[] }

let postingTypes: Promise<Record<string, unknown>[]> | undefined
const cachedPostingTypes = (): Promise<Record<string, unknown>[]> => {
  postingTypes ??= loadPostingTypes().catch((error: unknown) => { postingTypes = undefined; throw error })
  return postingTypes
}

export async function previewInvoiceAccounting(
  row: TradeInvoice,
  form: InvPostForm,
  dealId: string,
  ports: DeterminationPorts = livePorts,
  loadTypes: () => Promise<Record<string, unknown>[]> = cachedPostingTypes,
): Promise<AccountingPreview> {
  const fiType = row.fiType ?? ''
  const acc = (await loadTypes()).find((a) => String(a['ZFI_TYPE'] ?? '').trim() === fiType) ?? {}
  // The leg as TRD_POS would hold it: the banks are whatever the pop-up shows now, not yet saved.
  const position = {
    ZT_TYPE: row.leg, ZSEQ: row.seq ?? '', ZFI_TYPE: fiType, ZBUKRS: row.bukrs ?? '', ZBUY: row.buy ?? '', ZSELL: row.sell ?? '',
    ZSET_CURR: row.setCurr || row.curr,
    ZHBKID: form.senderHouseBank, ZHKTID: form.senderAccountId, ZREC_HBKID: form.receiverHouseBank, ZREC_HKTID: form.receiverAccountId,
  }
  const determined = await determinePosting(position, acc, { dealId }, ports)
  const date = row.postDate || row.dueDate
  const payCurrency = row.setCurr || row.curr
  const line = (dc: 'Dr' | 'Cr', l: PostLine, houseBank: string, accountId: string): PreviewLine => {
    const bank = l.category === CATEGORY.bank
    const sign = dc === 'Cr' ? -1 : 1
    return {
      dc,
      postingDate: date,
      documentDate: date,
      glAccount: l.glAccount,
      vendor: l.partner,
      profitCenter: l.profitCenter,
      businessArea: l.businessArea,
      houseBank: bank ? houseBank : '',
      accountId: bank ? accountId : '',
      invoiceAmount: formatAmount(sign * row.invAmt),
      invoiceCurrency: row.curr,
      paymentAmount: formatAmount(sign * row.payAmt),
      payCurrency,
      account: l.category,
      accountType: l.label,
    }
  }
  // Debit is the Receiver / Payee's side, credit the Sender / Payer's (determination.ts).
  const lines = Object.keys(acc).length
    ? [line('Dr', determined.debit, form.receiverHouseBank, form.receiverAccountId), line('Cr', determined.credit, form.senderHouseBank, form.senderAccountId)]
    : []
  return { lines, issues: determined.issues }
}
