import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { offered, partnerAfterLoad, productTypeOf } from './logic.ts'
import { companyOptions, partnerOptions, txnTypeOptions } from './valueHelps.ts'

// Shapes and values as DS4/100 returned them on 2026-10-01.

describe('Company Code', () => {
  it('keeps only TSF entities (ZSGTSFTR_COMP) that exist in A_CompanyCode, by code', () => {
    const companies = [
      { CompanyCode: '0001', CompanyCodeName: 'SAP SE' },
      { CompanyCode: 'SG03', CompanyCodeName: 'Olam International Limited' },
      { CompanyCode: 'AE13', CompanyCodeName: 'OlamInternaltional DMCC' },
      { CompanyCode: '1000', CompanyCodeName: 'Template' },
    ]
    const tsf = [{ ZBUKRS: 'AE13' }, { ZBUKRS: 'SG03' }, { ZBUKRS: 'TH10' }] // TH10 is not set up in FI
    deepStrictEqual(companyOptions(companies, tsf), [
      { key: 'AE13', text: 'OlamInternaltional DMCC' },
      { key: 'SG03', text: 'Olam International Limited' },
    ])
  })
})

describe('Transaction Type', () => {
  it('offers the 12A / 12B types with their FTR names and product types', () => {
    const rows = [
      { ProductType: '12B', TransactionType: '619', TransactionTypeName: 'Forward - TSF' },
      { ProductType: '12A', TransactionType: '600', TransactionTypeName: 'Spot' },
      { ProductType: '40A', TransactionType: '400', TransactionTypeName: 'Forward' },
      { ProductType: '12A', TransactionType: '605', TransactionTypeName: 'Spot - TSF' },
    ]
    const options = txnTypeOptions(rows)
    deepStrictEqual(options, [
      { productType: '12A', key: '600', text: 'Spot' },
      { productType: '12A', key: '605', text: 'Spot - TSF' },
      { productType: '12B', key: '619', text: 'Forward - TSF' },
    ])
    strictEqual(productTypeOf(options, '619'), '12B')
    strictEqual(productTypeOf(options, '400'), '')
  })
})

describe('Business Partner', () => {
  const banks = [
    { BusinessPartner: '400000005', CompanyCode: 'AE13' },
    { BusinessPartner: '400000006', CompanyCode: 'AE13' },
    { BusinessPartner: '400000006', CompanyCode: 'AE13' }, // a second bank account
    { BusinessPartner: '400000006', CompanyCode: 'SG03' },
    { BusinessPartner: '400000002', CompanyCode: '9990' },
  ]

  it('offers the distinct partners SlcTsfBpBank holds for the picked company code', () => {
    const names = new Map([['400000006', 'Olam Bank Partner']])
    deepStrictEqual(partnerOptions(banks, 'AE13', names), [
      { key: '400000005', text: '400000005' },
      { key: '400000006', text: 'Olam Bank Partner' },
    ])
    deepStrictEqual(partnerOptions(banks, 'SG03', names), [{ key: '400000006', text: 'Olam Bank Partner' }])
  })

  it("keeps the pick, else the row's partner, else none — only while offered", () => {
    const list = partnerOptions(banks, 'AE13', new Map())
    strictEqual(partnerAfterLoad('400000005', '400000006', list), '400000005')
    strictEqual(partnerAfterLoad('', '400000006', list), '400000006')
    strictEqual(partnerAfterLoad('400000002', '0660000680', list), '')
    strictEqual(offered(list, '400000002'), '')
  })
})
