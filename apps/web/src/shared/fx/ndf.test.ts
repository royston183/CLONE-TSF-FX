import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ApiError } from '@slc/api-client'
import { anyOf, capabilitiesFromMetadata, correctNdfFixing, fixNdf, fixingHint, fixingRateValue, joinQueue, metadataHasAction, ndfRecord, sapMessage, statusLabel, type FxTransaction, type TrmFxAppRow } from './ndf.ts'

/* SG03 / 2000000000001 as FxTransaction and ZSGTSFV_FX served it on 2026-10-06. */
const fx: FxTransaction = {
  CompanyCode: 'SG03',
  FinancialTransaction: '2000000000001',
  ProductType: '12D',
  TransactionType: '631',
  Partner: '400000002',
  ContractDate: '2026-10-01',
  BuyCurrency: 'INR',
  SellCurrency: 'USD',
  LeadCurrency: 'USD',
  FollowCurrency: 'INR',
  BuyAmount: 3328000,
  SellAmount: 40000,
  ValueDate: '2026-11-03',
  SpotRate: 83.2,
  SwapRate: 0,
  ForwardRate: 83.2,
  ActiveStatus: '0',
  ActivityCategory: '20',
}
const app: TrmFxAppRow = {
  CompanyCode: 'SG03',
  FinancialTransaction: '2000000000001',
  TxnStatus: '07',
  Ztrcode: 'C14',
  NdfFoRem: '',
  '@odata.etag': 'W/"20261006120000"',
}

describe('ndfRecord', () => {
  it('reads CURR1 as the lead currency and signs the legs as ZSGTSFV_FX does (CURR1 USD -40000, BS_1 Sell)', () => {
    const r = ndfRecord(fx, app)
    deepStrictEqual([r.c1, r.c2, r.side, r.amt1, r.amt2], ['USD', 'INR', 'Sell', -40000, 3328000])
    deepStrictEqual([r.fwd, r.txnStatus, r.traderCode, r.etag], [83.2, '07', 'C14', 'W/"20261006120000"'])
  })

  it('falls back to FxTransaction NdfFixingDate before the value date', () => {
    strictEqual(ndfRecord({ ...fx, NdfFixingDate: '2026-10-28' }, app).fixingDate, '2026-10-28')
  })

  it('takes NDF_DATE / NDF_REF / names from the view, and the value date when NDF_DATE is blank', () => {
    strictEqual(ndfRecord(fx, app).fixingDate, '2026-11-03')
    const v = ndfRecord(fx, app, { BUKRS: 'SG03', RFHA: '2000000000001', NDF_DATE: '2026-10-30', NDF_REF: 'RBI', BP_NAME: '0400000002 - FMC Corporation' })
    deepStrictEqual([v.fixingDate, v.ndfRef, v.partnerName], ['2026-10-30', 'RBI', '0400000002 - FMC Corporation'])
  })
})

describe('joinQueue', () => {
  it('keeps status rows whose deal exists, is an NDF and is not reversed', () => {
    const deals: FxTransaction[] = [
      fx,
      { ...fx, FinancialTransaction: '2', ActiveStatus: '3' }, // reversed
      { ...fx, FinancialTransaction: '3', ProductType: '12B' }, // forward
    ]
    const apps: TrmFxAppRow[] = [app, { ...app, FinancialTransaction: '2' }, { ...app, FinancialTransaction: '3' }, { ...app, FinancialTransaction: '4' }]
    deepStrictEqual(joinQueue(apps, deals, []).map((r) => r.rfha), ['2000000000001'])
  })
})

describe('helpers', () => {
  it('builds an OData or-filter with quotes doubled', () => {
    strictEqual(anyOf('TxnStatus', ['10', "1'2"]), "TxnStatus eq '10' or TxnStatus eq '1''2'")
  })
  it('labels a status from ZSGTSFTR_TXNSTAT', () => {
    strictEqual(statusLabel('10', { '10': 'FO: NDF Fixing - pending MO confirmation' }), '10 - FO: NDF Fixing - pending MO confirmation')
    strictEqual(statusLabel('99', {}), '99')
  })
  it('keeps the cause and drops the generic BAPI noise (Settle refusal as SAP returned it on 2026-10-06)', () => {
    const settle = new ApiError('x', 400, {
      error: {
        code: 'T0/075',
        message: 'Transaction 9999999999999 does not exist in company code ZZZZ',
        details: [{ code: 'FTR0/161', message: 'BAPI processing was terminated' }],
      },
    })
    strictEqual(sapMessage(settle), 'Transaction 9999999999999 does not exist in company code ZZZZ')
    const detail = new ApiError('x', 400, {
      error: { code: 'FTR0/161', message: 'BAPI processing was terminated', details: [{ code: 'FTR0/201', message: 'Fixing missing' }] },
    })
    strictEqual(sapMessage(detail), 'Fixing missing')
  })
})

describe('FixNdf switch', () => {
  // ZFS_SD_TRMFX's $metadata before and after NdfFixing was added (2026-10-06).
  const today = '<Action Name="Settle" EntitySetPath="_it" IsBound="true"><Parameter Name="_it"/></Action>'
  const withFix = `<Action Name="NdfFixing" EntitySetPath="_it" IsBound="true"><Parameter Name="_it"/><Parameter Name="FixingRate" Type="Edm.Decimal" Precision="13" Scale="9"/></Action>${today}`

  it('enables fixing only when the service declares NdfFixing (as it does since 2026-10-06)', () => {
    strictEqual(metadataHasAction(today, 'NdfFixing'), false)
    strictEqual(metadataHasAction(withFix, 'NdfFixing'), true)
    strictEqual(metadataHasAction(today, 'Settle'), true)
  })

  it('rounds the rate to 4 decimals', () => {
    strictEqual(fixingRateValue(90.4), 90.4)
    strictEqual(fixingRateValue(90.12345678912), 90.1235)
  })

  it('refuses a missing or non-positive rate before calling SAP', async () => {
    const deal = { bukrs: 'SG03', rfha: '2000000000015', etag: '' }
    deepStrictEqual(await fixNdf(deal, 0, '10'), { ok: false, message: 'Enter a fixing rate greater than zero.' })
    deepStrictEqual(await fixNdf(deal, Number.NaN, '12'), { ok: false, message: 'Enter a fixing rate greater than zero.' })
  })
})

describe('fixingHint', () => {
  it('explains SAP\'s T1/079 refusal (deal still a contract) and nothing else', () => {
    // As SAP answered NdfFixing on 2026-10-06 for a status-07 deal that had not been settled.
    const contract = new ApiError('x', 400, { error: { code: 'T1/079', message: 'Transaction belongs to activity category Contract' } })
    ok(fixingHint(contract).includes('settled (MO Match & Release for Settlement)'))
    strictEqual(fixingHint(new ApiError('x', 400, { error: { code: 'T0/075', message: 'x' } })), '')
    // The same code on an already-fixed deal (AE1, 2026-10-06) is not a missing settlement.
    const fixed = new ApiError('x', 400, { error: { code: 'T1/079', message: 'Transaction belongs to activity category Fixing' } })
    strictEqual(fixingHint(fixed), '')
  })
})

describe('correctNdfFixing', () => {
  it('refuses a missing or non-positive rate before reversing anything', async () => {
    const deal = { bukrs: 'SG03', rfha: '2000000000019', etag: '' }
    deepStrictEqual(await correctNdfFixing(deal, 0), { ok: false, message: 'Enter a fixing rate greater than zero.' })
  })
})

describe('trmfx capabilities', () => {
  it('reads the actions and FxTransaction properties from $metadata', () => {
    // Shape of ZFS_SD_TRMFX's $metadata on 2026-10-06 (trimmed).
    const xml =
      '<EntityType Name="FxTransactionType"><Key><PropertyRef Name="CompanyCode"/></Key>' +
      '<Property Name="CompanyCode" Type="Edm.String"/><Property Name="ActivityCategory" Type="Edm.String"/></EntityType>' +
      '<ComplexType Name="SAP__Message"><Property Name="code" Type="Edm.String"/></ComplexType>' +
      '<Action Name="NdfFixing" IsBound="true"/><Action Name="Settle" IsBound="true"/>'
    const c = capabilitiesFromMetadata(xml)
    deepStrictEqual([...c.actions], ['NdfFixing', 'Settle'])
    deepStrictEqual([...c.fxProperties], ['CompanyCode', 'ActivityCategory'])
    deepStrictEqual([...capabilitiesFromMetadata('').actions], [])
  })
})
