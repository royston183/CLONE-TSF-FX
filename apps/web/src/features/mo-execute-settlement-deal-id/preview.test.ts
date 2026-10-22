import { deepStrictEqual, match, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { DeterminationPorts } from '../bo-post-accounting-settlement/determination.ts'
import { seedTradeInvoices } from './fixtures.ts'
import { invPostDefaults } from './logic.ts'
import { previewInvoiceAccounting } from './preview.ts'
import type { TradeInvoice } from './types.ts'

const comps = [
  { ZCOM_ID: 'DMCC', ZBUKRS: 'AE13', ZVENDOR: 'V-DMCC', ZCUSTOMER: 'C-DMCC', ZRBUSA_B: '0223', ZPRCTR_B: 'AE1340' },
  { ZCOM_ID: 'OSIPL', ZBUKRS: 'IN11', ZVENDOR: 'V-OSIPL', ZCUSTOMER: 'C-OSIPL', ZRBUSA_B: '3812', ZPRCTR_B: 'IN1114' },
]
const ports: DeterminationPorts = {
  companies: async () => comps,
  origin: async () => '',
  houseBankGl: async (company, bank, account) => (company === 'IN11' && bank === 'CHAUS' && account === 'CHA00' ? '0000113100' : ''),
  reconciliation: async () => '0000160000',
  clearingGl: async () => '',
  bankPartners: async () => [],
  vendorOf: async () => '',
}
// ZSGTSFTR_TRD_ACC type 01: Dr 40 bank (seller), Cr 15 BP-customer (buyer).
const types = async () => [{ ZFI_TYPE: '01', ZDEBIT: '40', ZDR_ACC: '01', ZCREDIT: '15', ZCR_ACC: '03' }]
const leg = (over: Partial<TradeInvoice>): TradeInvoice => ({ ...(seedTradeInvoices()[0] as TradeInvoice), leg: 'T2-S', seq: '4', fiType: '01', bukrs: 'IN11', buy: 'DMCC', sell: 'OSIPL', curr: 'USD', setCurr: 'USD', invAmt: 100, payAmt: 100, dueDate: '23.11.2026', postDate: '', ...over })

describe('invoice accounting preview', () => {
  it('shows the bank G/L of the chosen account as the debit and the partner as the credit', async () => {
    const row = leg({})
    const form = { ...invPostDefaults(row, 'D1'), receiverHouseBank: 'CHAUS', receiverAccountId: 'CHA00' }
    const { lines, issues } = await previewInvoiceAccounting(row, form, 'D1', ports, types)
    deepStrictEqual(issues, [])
    strictEqual(lines[0]?.dc, 'Dr')
    deepStrictEqual([lines[0]?.glAccount, lines[0]?.houseBank, lines[0]?.accountId, lines[0]?.invoiceAmount], ['0000113100', 'CHAUS', 'CHA00', '100.00'])
    deepStrictEqual([lines[1]?.dc, lines[1]?.vendor, lines[1]?.invoiceAmount, lines[1]?.accountType], ['Cr', 'C-DMCC', '-100.00', 'BP-Customer'])
  })

  it('lists what is missing while no bank is chosen', async () => {
    const row = leg({})
    const { lines, issues } = await previewInvoiceAccounting(row, { ...invPostDefaults(row, 'D1'), receiverHouseBank: '', receiverAccountId: '' }, 'D1', ports, types)
    strictEqual(lines[0]?.glAccount, '')
    match(issues.join(' '), /needs a house bank and account ID/)
  })

  it('shows no lines for a leg without a posting type', async () => {
    const row = leg({ fiType: '' })
    const { lines, issues } = await previewInvoiceAccounting(row, invPostDefaults(row, 'D1'), 'D1', ports, types)
    deepStrictEqual(lines, [])
    match(issues.join(' '), /no posting type/)
  })
})
