import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { partnerBanks, toPartnerBank } from './partner-bank.ts'

describe('partner banks (SlcTsfBpBank)', () => {
  it('reads a row, with SAP spellings as fallback', () => {
    deepStrictEqual(toPartnerBank({ BusinessPartner: '0000000003', CompanyCode: 'SG03', BankIdentification: 'EUR1', BankName: 'DBS' }), {
      businessPartner: '0000000003', companyCode: 'SG03', bankId: 'EUR1', bankName: 'DBS',
    })
    strictEqual(toPartnerBank({ bkvid: 'USD1' })?.bankId, 'USD1')
  })

  it('drops rows without a bank id and repeats', () => {
    const rows = partnerBanks([{ BankIdentification: 'B' }, { BankIdentification: 'A' }, { BankIdentification: 'A' }, { BusinessPartner: '1' }])
    deepStrictEqual(rows.map((r) => r.bankId), ['A', 'B'])
  })
})
