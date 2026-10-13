import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { determinePosting, partnerOf, positionFields, type DeterminationPorts } from './determination.ts'
import { prepareInvoiceLeg, type PrepareDeps } from './prepare.ts'
import type { FxLeg } from './types.ts'

// The posting types the application ships (ZSGTSFTR_TRD_ACC): 01 bank/customer .. 06 bank-BP/vendor.
const types = JSON.parse(readFileSync(new URL('../../../../../database/seed/zsgtsftr_trd_acc.json', import.meta.url), 'utf8')) as Record<string, string>[]
const acc = (fi: string): Record<string, string> => types.find((t) => t['ZFI_TYPE'] === fi)!

// ZSGTSFTR_COMP as DS4 holds it for deal 7000000060's entities.
const comps = [
  { ZCOM_ID: 'DMCC', ZBUKRS: 'AE13', ZVENDOR: 'OLAM-DMCC', ZCUSTOMER: 'OLAM-DMCC', ZRBUSA: '0615', ZRBUSA_B: '0615', ZPRCTR_B: 'AE1340' },
  { ZCOM_ID: 'OSIPL', ZBUKRS: 'IN11', ZVENDOR: 'OUTSPAN-IN', ZCUSTOMER: 'OUT-IN', ZRBUSA: '0223', ZRBUSA_B: '3812', ZPRCTR_B: 'IN1105' },
  { ZCOM_ID: 'OGA', ZBUKRS: 'SG03', ZVENDOR: 'OLAM-OGA', ZCUSTOMER: 'OLAM-OGA', ZRBUSA: '0975', ZRBUSA_B: '0975', ZPRCTR_B: 'SG030006' },
]

const ports = (over: Partial<DeterminationPorts> = {}): DeterminationPorts => ({
  companies: async () => comps,
  origin: async () => 'OSIPL',
  houseBankGl: async (company, bank, account) => (company === 'AE13' && bank === 'CHAUS' && account === 'CHA00' ? '121000' : ''),
  reconciliation: async (kind, company, partner) => (kind === 'customer' && partner ? '140000' : kind === 'vendor' && company === 'SG03' ? '211000' : ''),
  clearingGl: async (currency) => (currency === 'USD' ? '199000' : ''),
  bankPartners: async () => [{ BP: '0660012173', HBKID: 'JPM1', ZHBKID_OGA: 'CHAUS' }, { BP: '0660012175', HBKID: 'SCB', ZHBKID_OGA: 'HB001' }],
  vendorOf: async (bp) => (bp === '0660012175' ? 'JPM-VEND' : ''),
  ...over,
})

// T2-S of deal 7000000060: posting type 01 (bank / customer), seller DMCC (AE13) paid into CHAUS / CHA00.
const t2s = { ZDEAL_ID: '7000000060', ZSEQ: '4', ZT_TYPE: 'T2-S', ZBUKRS: 'AE13', ZSELL: 'DMCC', ZBUY: 'OSIPL', ZFI_TYPE: '01', ZSET_CURR: 'USD', ZREC_HBKID: 'CHAUS', ZREC_HKTID: 'CHA00' }

describe('partnerOf (gt_inv-cus_ven)', () => {
  it('takes the buying entity\'s customer for 01 / 03 / 05 and the selling entity\'s vendor for 02 / 04 / 06', () => {
    strictEqual(partnerOf(t2s, acc('01'), comps), 'OUT-IN') // credit category 03 -> customer of OSIPL (buyer)
    strictEqual(partnerOf({ ...t2s, ZFI_TYPE: '02' }, acc('02'), comps), 'OLAM-DMCC') // debit category 02 -> vendor of DMCC (seller)
    strictEqual(partnerOf({ ...t2s, ZFI_TYPE: '99' }, acc('01'), comps), '')
    strictEqual(partnerOf({ ...t2s, ZBUY: 'NOPE' }, acc('01'), comps), '')
  })
})

describe('determinePosting', () => {
  it('posting type 01: the debit is the receiver\'s bank G/L, the credit the buyer\'s customer, with business area and profit center', async () => {
    const d = await determinePosting(t2s, acc('01'), { dealId: '7000000060' }, ports())
    deepStrictEqual(d.issues, [])
    deepStrictEqual([d.debit.postingKey, d.debit.category, d.debit.label, d.debit.glAccount, d.debit.partner], ['40', '01', 'Bank', '121000', ''])
    deepStrictEqual([d.credit.postingKey, d.credit.category, d.credit.label, d.credit.partner, d.credit.glAccount], ['15', '03', 'BP-Customer', 'OUT-IN', '140000'])
    // AE13 takes the origin entity's business area (ZORIGIN of the Master Contract): OSIPL 0223, not its own 0615.
    deepStrictEqual([d.debit.businessArea, d.debit.profitCenter], ['0223', 'AE1340'])
  })

  it('names what is missing instead of filling it in: no bank chosen, no G/L on the bank account, no customer', async () => {
    const noBank = await determinePosting({ ...t2s, ZREC_HBKID: '', ZREC_HKTID: '' }, acc('01'), { dealId: 'D' }, ports())
    strictEqual(noBank.issues.length >= 1 && /needs a house bank and account ID/.test(noBank.issues[0]!), true)
    const noGl = await determinePosting(t2s, acc('01'), { dealId: 'D' }, ports({ houseBankGl: async () => '' }))
    strictEqual(noGl.issues.some((i) => /has no G\/L account \(T012K\)/.test(i)), true)
    const noCustomer = await determinePosting(t2s, acc('01'), { dealId: 'D' }, ports({ companies: async () => comps.map((c) => ({ ...c, ZCUSTOMER: '' })) }))
    strictEqual(noCustomer.issues.some((i) => /no customer is set in ZSGTSFTR_COMP/.test(i)), true)
    const notExtended = await determinePosting(t2s, acc('01'), { dealId: 'D' }, ports({ reconciliation: async () => '' }))
    strictEqual(notExtended.issues.some((i) => /not extended to that company code/.test(i)), true)
  })

  it('a clearing line (category 04) uses the currency\'s clearing G/L and reports when there is none', async () => {
    const t3 = { ...t2s, ZFI_TYPE: '03', ZREC_HBKID: '', ZREC_HKTID: '' }
    const ok = await determinePosting(t3, acc('03'), { dealId: 'D' }, ports())
    strictEqual(ok.debit.category + ok.debit.glAccount, '04199000')
    const none = await determinePosting({ ...t3, ZSET_CURR: 'EUR' }, acc('03'), { dealId: 'D' }, ports())
    strictEqual(none.issues.some((i) => /no clearing G\/L for currency EUR/.test(i)), true)
  })

  it('a bank-BP line finds the bank\'s vendor by house bank, by ZHBKID_OGA for company SG03', async () => {
    const t1s = { ZDEAL_ID: 'D', ZSEQ: '6', ZT_TYPE: 'T1-S', ZBUKRS: 'SG03', ZSELL: 'OGA', ZBUY: 'DMCC', ZFI_TYPE: '05', ZSET_CURR: 'USD', ZREC_HBKID: 'HB001', ZREC_HKTID: 'HDF01' }
    const d = await determinePosting(t1s, acc('05'), { dealId: 'D' }, ports())
    deepStrictEqual(d.issues, [])
    deepStrictEqual([d.debit.category, d.debit.label, d.debit.partner, d.debit.glAccount], ['05', 'Bank BP', 'JPM-VEND', '211000'])
    // The same house bank id on another company code is looked up in HBKID, which does not hold it: reported, not guessed.
    const other = await determinePosting({ ...t1s, ZBUKRS: 'AE13' }, acc('05'), { dealId: 'D' }, ports())
    strictEqual(other.issues.some((i) => /has no bank partner with a vendor for company AE13 \(ZSGTRMTR_BPEXT HBKID\)/.test(i)), true)
  })

  it('a leg without a posting type is reported', async () => {
    const d = await determinePosting({ ...t2s, ZFI_TYPE: '' }, {}, { dealId: 'D' }, ports())
    strictEqual(/no posting type in ZSGTSFTR_TRD_ACC/.test(d.issues[0]!), true)
  })
})

describe('positionFields (SAVE_POSTING_DATA)', () => {
  it('stores key, category, label, partner, profit center, business area and G/L for both sides', async () => {
    const d = await determinePosting(t2s, acc('01'), { dealId: 'D' }, ports())
    deepStrictEqual(positionFields(d), {
      ZDR_PK: '40', ZDR_ACCNT: 'Bank', ZDR_ACC: '01', ZDR_CV: '', ZDR_PRCTR: 'AE1340', ZDR_RBUSA: '0223', ZDR_GL: '121000',
      ZCR_PK: '15', ZCR_ACCNT: 'BP-Customer', ZCR_ACC: '03', ZCR_CV: 'OUT-IN', ZCR_PRCTR: '', ZCR_RBUSA: '', ZCR_GL: '140000',
    })
  })
})

describe('prepareInvoiceLeg (Update)', () => {
  const stored = { ...t2s, ZAMT: 79552200, ZCURR: 'USD', ZPAY_AMT: 0, ZDUE_DATE: '20261114', ZP_DATE: '' }
  const deps = (over: Partial<PrepareDeps> = {}, writes: Record<string, string | number>[] = [], row: Record<string, unknown> = stored): PrepareDeps => ({
    readPosition: async () => row,
    readPostingType: async (fi) => types.find((t) => t['ZFI_TYPE'] === fi),
    writePosition: async (_d, _s, fields) => {
      writes.push(fields)
    },
    ports: ports(),
    ...over,
  })
  const top: FxLeg[] = []

  it('stores the determined lines, the posting date, the document type and the payment amount, then says what it stored', async () => {
    const writes: Record<string, string | number>[] = []
    const out = await prepareInvoiceLeg('7000000060', '4', top, deps({}, writes))
    strictEqual(out.ok, true)
    strictEqual(writes.length, 1)
    deepStrictEqual([writes[0]!['ZDR_GL'], writes[0]!['ZCR_CV'], writes[0]!['ZP_DATE'], writes[0]!['ZDOC_TYPE'], writes[0]!['ZPAY_AMT']], ['121000', 'OUT-IN', '20261114', 'TR', 79552200])
    strictEqual(out.ok && /T2-S: Dr 40 Bank \/ G\/L 121000; Cr 15 BP-Customer OUT-IN/.test(out.message), true)
  })

  it('refuses a cross-currency leg whose mapped FX deal does not exist, and stores nothing (no zero standing in)', async () => {
    const writes: Record<string, string | number>[] = []
    const t3 = { ...stored, ZT_TYPE: 'T3-S', ZAMT: 79790856.6, ZCURR: 'INR', ZSET_CURR: 'USD', ZD_MAP: 'DS1' }
    const out = await prepareInvoiceLeg('7000000060', '2', top, deps({}, writes, t3))
    strictEqual(out.ok, false)
    strictEqual(!out.ok && /DS1 does not exist yet/.test(out.message), true)
    strictEqual(writes.length, 0)
  })

  it('works the T3 amount out from the spot once it is booked', async () => {
    const writes: Record<string, string | number>[] = []
    const t3 = { ...stored, ZT_TYPE: 'T3-S', ZAMT: 79790856.6, ZCURR: 'INR', ZSET_CURR: 'USD', ZD_MAP: 'DS1', ZFI_TYPE: '01' }
    const spot = { dealType: 'DS1', rate: 83.1 } as FxLeg
    const out = await prepareInvoiceLeg('7000000060', '2', [spot], deps({}, writes, t3))
    strictEqual(out.ok, true)
    strictEqual(writes[0]!['ZPAY_AMT'], 960178.78)
  })

  it('stores nothing when any account cannot be determined, and never touches a posted leg', async () => {
    const writes: Record<string, string | number>[] = []
    const refused = await prepareInvoiceLeg('7000000060', '4', top, deps({ ports: ports({ houseBankGl: async () => '' }) }, writes))
    strictEqual(refused.ok, false)
    strictEqual(writes.length, 0)
    const posted = await prepareInvoiceLeg('7000000060', '4', top, deps({}, writes, { ...stored, ZBELNR: '1900000001' }))
    strictEqual(!posted.ok && /already posted/.test(posted.message), true)
    strictEqual(writes.length, 0)
  })
})
