import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ndfRecord, type FxTransaction } from '../../shared/fx/ndf.ts'
import { bankAddress, companyOptions, dealFromRecord, letterFormName } from './api.ts'

describe('S_BUKRS value help', () => {
  it('T001 keys as SAP holds them (leading zeros), by code', () => {
    deepStrictEqual(
      companyOptions([
        { CompanyCode: 'SG03', CompanyCodeName: 'OLAM GlobalAgri Pte. Ltd' },
        { CompanyCode: '0001', CompanyCodeName: 'SAP SE ' },
        { CompanyCodeName: 'no key' },
      ]),
      [
        { code: '0001', name: 'SAP SE' },
        { code: 'SG03', name: 'OLAM GlobalAgri Pte. Ltd' },
      ],
    )
  })
})

/* SG03 / 2000000000015 as SAP served it on 2026-10-06: FxTransaction + TrmFxApp status 13. */
const fx: FxTransaction = {
  CompanyCode: 'SG03', FinancialTransaction: '2000000000015', ProductType: '12D', TransactionType: '631', Partner: '400000002',
  ContractDate: '2026-10-06', BuyCurrency: 'USD', SellCurrency: 'INR', LeadCurrency: 'USD', FollowCurrency: 'INR',
  BuyAmount: 10000, SellAmount: 902500, ValueDate: '2026-11-06', SpotRate: 90.25, SwapRate: 0, ForwardRate: 90.25,
  ActiveStatus: '0', ActivityCategory: '55',
}
const app = { CompanyCode: 'SG03', FinancialTransaction: '2000000000015', TxnStatus: '13', Ztrcode: 'C14', '@odata.etag': 'W/"x"' }

describe('GET_DATA rows from the TSF append + FTR deal', () => {
  it('maps the deal; settlement fields are unknown while FxTransaction does not serve them', () => {
    const d = dealFromRecord(ndfRecord(fx, app))
    deepStrictEqual(
      [d.bukrs, d.rfha, d.sgsart, d.saktiv, d.txn_status, d.delfz, d.bs_1, d.amt1, d.amt2, d.otot_rate, d.etag],
      ['SG03', '2000000000015', '12D', '0', '13', '2026-11-06', 'Buy', 10000, -902500, 90.25, 'W/"x"'],
    )
    deepStrictEqual([d.settlement_known, d.fi_known, d.zcash_amt, d.ndf_rate, d.fi_doc], [false, false, 0, 0, ''])
  })

  it('uses the proposed settlement fields as soon as the service serves them', () => {
    const d = dealFromRecord(
      ndfRecord(
        { ...fx, NdfFixingRate: '91.000000000', CashSettlementAmount: '82.42', CashSettlementCurrency: 'USD', AccountingDocument: '' },
        app,
      ),
    )
    deepStrictEqual([d.settlement_known, d.fi_known, d.ndf_rate, d.zcash_amt, d.cash_curr, d.fi_doc], [true, true, 91, 82.42, 'USD', ''])
  })
})

describe('GET_ADDR (the partner\'s Z002 address)', () => {
  it('formats the block as the ABAP does', () => {
    deepStrictEqual(
      bankAddress(
        { FullName: 'HSBC Bank', StreetName: '52/60 MG Road', StreetPrefixName: 'Fort', CityName: 'Mumbai', PostalCode: '400001', CareOfName: 'FX Desk', to_FaxNumber: { results: [{ FaxNumber: '22661234' }] } },
        '2026-11-06',
        '2026-10-06',
      ),
      {
        zdate: '06-10-2026',
        zbank: 'HSBC Bank',
        zaddr1: '52/60 MG Road',
        zaddr2: 'Fort',
        zaddr3: 'MUMBAI - 400001',
        zattn: 'Attn : FX Desk , Fax : 22661234',
        zvdate: 'Value Date - 06-11-2026',
      },
    )
  })
  it('leaves the block empty without a Z002 address, keeping the dates', () => {
    const a = bankAddress(null, '2026-11-06', '2026-10-06')
    deepStrictEqual([a.zbank, a.zaddr3, a.zattn, a.zvdate], ['', '', '', 'Value Date - 06-11-2026'])
  })
})

describe('FORM pdf form name', () => {
  it("SELECT SINGLE zform_name WHERE zlet_code = 'L003'", () => {
    strictEqual(letterFormName([{ ZLET_CODE: 'L001', ZFORM_NAME: 'X' }, { ZLET_CODE: 'L003', ZFORM_NAME: 'ZSGTSFAF_NDF_BANK' }]), 'ZSGTSFAF_NDF_BANK')
    strictEqual(letterFormName([]), '')
  })
})
