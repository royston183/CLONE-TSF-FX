import { deepStrictEqual, match, ok, rejects, strictEqual } from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { accountsForCompany, bankCompanies, bankSelectionError, changeFxBankField, EMPTY_BANK_CHOICES, loadBankChoices } from './bankChoices.ts'
import type { FxDeal, FxPostForm } from './types.ts'
import type { HouseBankAccount } from '../../shared/fx/house-bank.ts'
import { loadPartnerBanks } from '../../shared/fx/partner-bank.ts'
import { cleanFields } from '../fx-blotter/appStr.ts'
import { updateFxLeg } from './settlement.ts'

const account = (companyCode: string, houseBank = 'CHAUS', accountId = 'CHA00'): HouseBankAccount => ({ companyCode, houseBank, accountId, currency: 'USD', bankName: 'Chase', description: 'USD account', glAccount: '0000113100' })
const form: FxPostForm = {
  bukrs: 'SG03', rfha: '30001', dealType: 'D1', partner: '660000802',
  bAmt: '1,000 USD', bDoc: '', bBankType: '', bTrfType: '', bRecCoCode: 'SG03', bBankId: 'TSF-SLC', bPaymentId: 'USD1', bHouseBank: 'CHAUS', bAccountId: 'CHA00',
  letterCode: '', letterName: '', subNo: false,
  sAmt: '83,000 INR', sDoc: '', sBankType: '', sTrfType: '', sBankId: 'NFX', sPayCoCode: 'SG03', sPaymentId: 'INR1', sHouseBank: 'DBSSG', sAccountId: 'DBS00', remit: false,
}

describe('manual settlement bank selection', () => {
  const originalFetch = globalThis.fetch
  afterEach(() => { globalThis.fetch = originalFetch })

  it('offers only accounts of the selected company, including duplicate bank IDs across companies', () => {
    const rows = [account('AE13'), account('SG03'), account('')]
    deepStrictEqual(accountsForCompany(rows, 'SG03'), [rows[1]])
    deepStrictEqual(accountsForCompany(rows, ''), [])
    deepStrictEqual(accountsForCompany(rows, 'UNKNOWN'), [])
    deepStrictEqual(bankCompanies([{ ZCOM_ID: 'OGA', ZBUKRS: 'SG03', ZBP: '100', ZBUTXT: 'Company' }, { ZBUKRS: 'SG03', ZBP: '100' }, { ZCOM_ID: 'Unknown' }]), [{ code: 'SG03', name: 'Company', businessPartner: '100' }])
  })

  it('clears dependent values without changing instruction IDs or the other side', () => {
    const changed = changeFxBankField(form, 'bRecCoCode', 'AE13')
    deepStrictEqual([changed.bHouseBank, changed.bAccountId, changed.bPaymentId], ['', '', ''])
    strictEqual(changed.bBankId, 'TSF-SLC')
    strictEqual(changed.sHouseBank, form.sHouseBank)
    strictEqual(changeFxBankField(form, 'bRecCoCode', 'SG03'), form)
    strictEqual(changeFxBankField(form, 'sHouseBank', 'CHAUS').sAccountId, '')
    const remit = changeFxBankField(form, 'remit', true)
    deepStrictEqual([remit.sBankId, remit.sHouseBank, remit.sAccountId], ['', '', ''])
  })

  it('requires a complete, loaded account tuple and allows empty banks on non-bank routes', () => {
    const choices = { ...EMPTY_BANK_CHOICES, accounts: [account('SG03')] }
    strictEqual(bankSelectionError('SG03', 'CHAUS', 'CHA00', choices, false, true), '')
    strictEqual(bankSelectionError('SG03', '', '', choices, false), '')
    match(bankSelectionError('SG03', '', '', choices, false, true), /both/)
    match(bankSelectionError('SG03', 'CHAUS', '', choices, false), /both/)
    match(bankSelectionError('AE13', 'CHAUS', 'CHA00', choices, false), /not available/)
    match(bankSelectionError('SG03', 'CHAUS', 'CHA00', choices, true), /loading/)
    match(bankSelectionError('SG03', 'CHAUS', 'CHA00', { ...choices, accountError: 'Unavailable' }, false), /Unavailable/)
  })

  it('scopes both OData reads and preserves accounts when BP bank details fail', async () => {
    const calls: unknown[] = []
    const choices = await loadBankChoices('SG03', '100', undefined, {
      accounts: async (company, signal) => { calls.push([company, signal]); return [account('SG03'), account('AE13')] },
      partnerBanks: async (bp, signal, company) => { calls.push([bp, signal, company]); throw new Error('BP service down') },
    })
    deepStrictEqual(calls, [['SG03', undefined], ['100', undefined, 'SG03']])
    deepStrictEqual(choices.accounts, [account('SG03')])
    match(choices.partnerError, /BP service down/)
    strictEqual(choices.accountError, '')
    const reverse = await loadBankChoices('SG03', '100', undefined, {
      accounts: async () => { throw new Error('Bank service down') },
      partnerBanks: async () => [{ businessPartner: '100', companyCode: 'SG03', bankId: 'USD1', bankName: 'Chase' }, { businessPartner: '100', companyCode: 'AE13', bankId: 'EUR1', bankName: '' }],
    })
    strictEqual(reverse.partnerBanks.length, 1)
    match(reverse.accountError, /Bank service down/)
  })

  it('does not load all companies for a missing company and propagates cancellation', async () => {
    deepStrictEqual(await loadBankChoices('', '', undefined, { accounts: async () => { throw new Error('Unexpected read') }, partnerBanks: async () => { throw new Error('Unexpected read') } }), EMPTY_BANK_CHOICES)
    await rejects(loadBankChoices('SG03', '', undefined, { accounts: async () => { throw new DOMException('Aborted', 'AbortError') }, partnerBanks: async () => [] }), { name: 'AbortError' })
  })

  it('filters raw BP rows before deduplicating a bank-detail ID shared across companies/partners', async () => {
    let requested = ''
    globalThis.fetch = (async (input) => {
      requested = String(input)
      return new Response(JSON.stringify({ value: [
        { BusinessPartner: '100', CompanyCode: 'AE13', BankIdentification: 'USD1' },
        { BusinessPartner: '200', CompanyCode: 'SG03', BankIdentification: 'USD1' },
        { BusinessPartner: '100', CompanyCode: 'SG03', BankIdentification: 'USD1' },
      ] }))
    }) as typeof fetch
    const rows = await loadPartnerBanks('100', undefined, 'SG03')
    strictEqual(rows.length, 1)
    ok(rows[0])
    strictEqual(rows[0].companyCode, 'SG03')
    strictEqual(rows[0].businessPartner, '100')
    match(decodeURIComponent(requested).replaceAll('+', ' '), /CompanyCode eq 'SG03'/)
  })

  it('saves selections and explicit account clears through the real settlement PATCH path', async () => {
    const writes: Record<string, unknown>[] = []
    globalThis.fetch = (async (_input, init) => {
      if (init?.method === 'PATCH') writes.push(JSON.parse(String(init.body)))
      return new Response(null, { status: 204 })
    }) as typeof fetch
    const leg = { bukrs: 'SG03', rfha: '30001', dealType: 'D1', curr1: 'USD', curr2: 'INR' } as FxDeal
    strictEqual((await updateFxLeg(leg, [leg], form)).ok, true)
    ok(writes[0])
    strictEqual(writes[0].ZtsfBhbkID, 'CHAUS')
    strictEqual(writes[0].ZtsfBhktID, 'CHA00')
    strictEqual(writes[0].ZtsfRbukrs, 'SG03')
    strictEqual((await updateFxLeg(leg, [leg], changeFxBankField(form, 'bHouseBank', 'DBSSG'))).ok, true)
    ok(writes[1])
    strictEqual(writes[1].ZtsfBhktID, '')
    deepStrictEqual(cleanFields({ ZtsfBhktID: '', ZtsfExeCo: false }), { ZtsfExeCo: false })
  })
})
