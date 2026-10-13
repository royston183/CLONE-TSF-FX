import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { houseBankAccounts, toHouseBankAccount } from './house-bank.ts'

describe('house bank accounts (HouseBankAccount)', () => {
  it('reads the properties the service declares', () => {
    deepStrictEqual(
      toHouseBankAccount({
        CompanyCode: 'SG03', HouseBank: 'DBS03', HouseBankAccount: 'DBS00', BankName: 'DBS Bank', BankAccountCurrency: 'USD',
        BankAccountDescription: 'USD account', GLAccount: '0000113100', IBAN: '',
      }),
      { companyCode: 'SG03', houseBank: 'DBS03', accountId: 'DBS00', currency: 'USD', description: 'USD account', bankName: 'DBS Bank', glAccount: '0000113100' },
    )
    // SAP's own spellings still work.
    strictEqual(toHouseBankAccount({ bukrs: 'IN11', hbkid: 'JPM01', hktid: 'JPM02', waers: 'INR' })?.accountId, 'JPM02')
  })

  it('drops a row that names no house bank or no account, and repeats of the same account', () => {
    strictEqual(toHouseBankAccount({ CompanyCode: 'SG03', HouseBank: 'DBS03' }), null)
    const rows = houseBankAccounts([
      { CompanyCode: 'SG03', HouseBank: 'JPM01', HouseBankAccount: 'JPM02' },
      { CompanyCode: 'SG03', HouseBank: 'DBS03', HouseBankAccount: 'DBS00' },
      { CompanyCode: 'SG03', HouseBank: 'DBS03', HouseBankAccount: 'DBS00' },
      { CompanyCode: 'SG03', HouseBank: '', HouseBankAccount: 'X' },
    ])
    deepStrictEqual(rows.map((r) => `${r.houseBank}/${r.accountId}`), ['DBS03/DBS00', 'JPM01/JPM02'])
  })
})
