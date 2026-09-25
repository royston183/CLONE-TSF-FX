import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MC_STATUS_DUMMY } from '../../shared/fx/status.ts'
import { coAreaFor, criteriaFilter, REJECT_STATUS, rejectKeys, statusLabel, toContract, type MapContext } from './api.ts'
import { BLANK_CRITERIA } from './logic.ts'
import { MC_STATUS_MASTER, REJECTED, STATUS_CLASS, seedContracts } from './data.ts'

const row = {
  CLIENT: '100',
  ZMC_REF_NO: '2000000007',
  ZMC_DESC: 'OSIPL_SESAME_M036_2.226516M',
  ZMC_DATE: '2026-08-04',
  ZORIGIN: 'OSIPL',
  ZAMT: '421528.93',
  ZCURR: 'USD',
  ZORG_AMT: '2226515.81',
  ZOCURR: 'INR',
  ZEX_RATE: '5.2820000',
  ZSHIP_START: '2026-08-05',
  ZSHIP_END: '2026-09-24',
  ZCOMMODITY: 'C114',
  ZCOM_DESC: 'SESAME',
  ZCOM_DESC_LONG: 'SESAME SEEDS',
  ZENT_ID: 'E001',
  ZENT_DESC: 'OSIPL-DMCC',
  ZCURR_DESC: 'USD-USD-INR',
  ZMOD_ID: 'M036',
  ZMOD_DESC: 'USD-INR-Put & Call Option',
  ZMC_STAT: '09',
  ZPAY_TERMS: 'P01',
  ZPAY_TERMS_TEXT: '270 days from bill of lading date',
  ZPOS: 'Singapore',
  ZPOD: 'Visakhapatnam, India',
  ZOLD_MC_REF_NO: '2000000001',
  ZUTI_AMT: '1000.00',
  ZMO_REMARKS: 'Pending compliance check',
  ZFO_REMARKS: 'Escalated to desk head',
  ZCREATED_BY: 'ROYSTOND',
  ZCREATED_DATE: '2026-08-04',
  ZCREATED_TIME: '10:00:00',
}

const ctx: MapContext = {
  statuses: MC_STATUS_DUMMY,
  entities: [
    { code: 'OSIPL', name: 'Olam Agri India Pvt Ltd', region: 'R02' },
    { code: 'OTL', name: 'Olam (Thailand) Ltd', region: 'R01' },
  ],
  rules: [],
}

describe('toContract (ZSGTSFTR_MAS_CON -> screen)', () => {
  it('maps every column the screen shows', () => {
    const c = toContract(row, ctx)
    deepStrictEqual(c, {
      mcNumber: '2000000007',
      mcReferenceNo: 'OSIPL_SESAME_M036_2.226516M',
      mcDescription: 'OSIPL_SESAME_M036_2.226516M',
      originEntity: 'OSIPL',
      originEntityName: 'Olam Agri India Pvt Ltd',
      region: 'R02',
      coArea: 'CA01',
      fxModel: 'M036',
      modelDescription: 'USD-INR-Put & Call Option',
      entityString: 'OSIPL-DMCC',
      mcDate: '04-08-2026',
      currencyString: 'USD-USD-INR',
      status: 'Expired',
      gtCommodity: 'C114',
      commodity: 'SESAME',
      commodityDescriptionLong: 'SESAME SEEDS',
      businessPartnerD1: '',
      businessPartnerD2: '',
      shipmentStart: '05-08-2026',
      shipmentEnd: '24-09-2026',
      mcAmountUSD: 421528.93,
      currency: 'USD',
      exchangeRate: 5.282,
      mcAmountOrigin: 2226515.81,
      originCurrency: 'INR',
      utilization: 0,
      balanceAmount: 421528.93,
      utilizationOrigin: 0,
      balanceOrigin: 2226515.81,
      portOfShipment: 'Singapore',
      portOfDestination: 'Visakhapatnam, India',
      paymentTerms: 'P01',
      paymentTermsDesc: '270 days from bill of lading date',
      moRemarks: 'Pending compliance check',
      foRemarks: 'Escalated to desk head',
      createdMCReference: '2000000001',
      enteredBy: 'ROYSTOND',
      enteredOn: '04-08-2026',
    })
  })

  it('reads nulls and unknown origins as blanks', () => {
    const c = toContract({ ...row, ZORIGIN: 'XYZ', ZMC_DATE: null, ZAMT: null, ZMO_REMARKS: null }, ctx)
    strictEqual(c.originEntityName, '')
    strictEqual(c.region, '')
    strictEqual(c.coArea, '')
    strictEqual(c.mcDate, '')
    strictEqual(c.mcAmountUSD, 0)
    strictEqual(c.balanceAmount, 0)
    strictEqual(c.moRemarks, '')
  })

  it("keeps the labels the screen compares, and MC_STAT's text for the rest", () => {
    strictEqual(statusLabel(MC_STATUS_DUMMY, '13'), REJECTED)
    strictEqual(statusLabel(MC_STATUS_DUMMY, '03'), 'Confirmed by MO')
    strictEqual(statusLabel(MC_STATUS_DUMMY, '04'), 'In Use')
    strictEqual(statusLabel(MC_STATUS_DUMMY, '09'), 'Expired')
    strictEqual(statusLabel(MC_STATUS_DUMMY, '02'), 'Release to MO')
    strictEqual(statusLabel(MC_STATUS_DUMMY, '99'), '99')
    for (const code of ['03', '04', '09', '13']) {
      const label = statusLabel(MC_STATUS_DUMMY, code)
      strictEqual(MC_STATUS_MASTER.includes(label), true, label)
      strictEqual(label in STATUS_CLASS, true, label)
    }
  })
})

describe('coAreaFor', () => {
  it("falls back to the dummy's per-entity CO Area while RULE_BT is empty", () => {
    strictEqual(coAreaFor([], 'M038', 'OTL'), 'CA02')
    strictEqual(coAreaFor([], 'M032', 'OVL'), 'CA03')
  })

  it("takes RULE_BT's ZCO_AREA, preferring the row for the MC's origin", () => {
    const rules = [
      { ZMOD_ID: 'M032', ZORIGIN: 'OSIPL', ZCO_AREA: 'OA01' },
      { ZMOD_ID: 'M032', ZORIGIN: 'OVL', ZCO_AREA: 'OV01' },
      { ZMOD_ID: 'M038', ZORIGIN: 'OTL', ZCO_AREA: 'OT01' },
    ]
    strictEqual(coAreaFor(rules, 'M032', 'OVL'), 'OV01')
    strictEqual(coAreaFor(rules, 'M032', 'OTL'), 'OA01')
    strictEqual(coAreaFor(rules, 'M099', 'OTL'), '')
  })
})

describe('criteriaFilter (selection screen -> middleware filter)', () => {
  const dates = { ...BLANK_CRITERIA, mcDateFrom: new Date(2026, 0, 1), mcDateTo: new Date(2026, 11, 31) }

  it('sends the MC date range as between from,to', () => {
    deepStrictEqual(criteriaFilter(dates), { 'ZMC_DATE[between]': '2026-01-01,2026-12-31' })
  })

  it('sends the MC number range zero-padded to the 10-digit key', () => {
    strictEqual(criteriaFilter({ ...dates, mcFrom: '2000002700', mcTo: '2000002799' })['ZMC_REF_NO[between]'], '2000002700,2000002799')
    strictEqual(criteriaFilter({ ...dates, mcFrom: '2000' })['ZMC_REF_NO[gte]'], '0000002000')
    strictEqual(criteriaFilter({ ...dates, mcTo: '2000002799' })['ZMC_REF_NO[lte]'], '2000002799')
    // Not a number: left to the screen's own comparison.
    deepStrictEqual(Object.keys(criteriaFilter({ ...dates, mcFrom: 'abc' })), ['ZMC_DATE[between]'])
  })

  it('sends origin, FX model and a known status code; region and CO Area stay client-side', () => {
    deepStrictEqual(
      criteriaFilter({ ...dates, originEntity: 'OTL', fxModel: 'M038', mcStatus: 'Rejected', region: 'R01', coArea: 'CA02' }),
      { 'ZMC_DATE[between]': '2026-01-01,2026-12-31', ZORIGIN: 'OTL', ZMOD_ID: 'M038', ZMC_STAT: '13' },
    )
    strictEqual(criteriaFilter({ ...dates, mcStatus: 'Expired' })['ZMC_STAT'], '09')
    // No FX screen gives "Correction after Deal" a code, so it is not sent.
    strictEqual('ZMC_STAT' in criteriaFilter({ ...dates, mcStatus: 'Correction after Deal' }), false)
  })
})

describe('reject', () => {
  it('writes status 13', () => {
    strictEqual(REJECT_STATUS, '13')
  })

  it('sends only the selected contracts that are not already Rejected', () => {
    const all = seedContracts()
    const rejected = all.find((c) => c.status === REJECTED)!
    const open = all.filter((c) => c.status !== REJECTED).slice(0, 2)
    deepStrictEqual(rejectKeys(all, [rejected.mcNumber, ...open.map((c) => c.mcNumber)]), open.map((c) => c.mcNumber))
  })
})
