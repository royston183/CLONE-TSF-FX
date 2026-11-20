import type { DealDetail, Entity, Leg } from './types.ts'

/**
 * Sample deals for the unit tests of calc.ts. The report itself shows none of them: api.ts serves only what the P&L service returns.
 * 1100002739 is the deal in the reference workbook (D1 DF buy at 99.00, D2 NDF sell at 99.60, fixed at 100.00); the others
 * are labelled "(sample)" and exist to show a loss, an open deal, a matured but unsettled deal and a second currency pair.
 * They are inputs only: every P&L figure on screen is calculated from them by calc.ts.
 */

const OIL: Entity = { code: 'OIL-USD', company: 'SG00', ccy: 'USD' }
const INDIA: Entity = { code: 'OFIIPL-INR', company: 'IN11', ccy: 'INR' }
const DMCC: Entity = { code: 'DMCC-USD', company: 'AE13', ccy: 'USD' }
const MALAYSIA: Entity = { code: 'OFIMY-MYR', company: 'MY10', ccy: 'MYR' }

const leg = (ref: 'D1' | 'D2', label: string, type: string, entity: string, usd: number, local: number, localCcy: string, rate: number, tradeDate: string, maturityDate: string): Leg => ({
  ref, label, type, entity, direction: usd >= 0 ? 'Buy USD' : 'Sell USD', usd, local, localCcy, rate, tradeDate, maturityDate,
})

export const MOCK_DEALS: DealDetail[] = [
  {
    id: '1100002739', model: 'M032', description: 'USD-INR Long Forward (Extra Invoicing)', type: 'Long Forward (Extra Invoicing)', pair: 'USD/INR', localCcy: 'INR',
    status: 'Settled', tradeDate: '2026-11-11', maturityDate: '2027-11-09', entities: [OIL, INDIA, DMCC],
    legs: [
      leg('D1', 'DF (OFIIPL India)', 'Deliverable Forward', 'OFIIPL-INR', 10_000_000, -990_000_000, 'INR', 99.0, '2026-11-11', '2027-11-09'),
      leg('D2', 'NDF (OIL)', 'Non-Deliverable Forward', 'OIL-USD', -10_000_000, 996_000_000, 'INR', 99.6, '2026-11-11', '2027-11-09'),
    ],
    fixings: [{ legRef: 'D2', rate: 100, date: '2027-11-09' }],
    flows: [
      { entity: 'OIL-USD', payRef: 'Settlement 20 / OIL', receiveRef: 'Receipt 20 / OIL', pay: -9_959_851, receive: 9_975_100, note: 'Pay: invoice settlement; Receive: NDF settlement from bank.' },
      { entity: 'OFIIPL-INR', payRef: 'Settlement 20 / India', receiveRef: 'Receipt 20 / India', pay: -990_000_000, receive: 996_010_000, note: 'Pay: DF purchase leg; Receive: sale proceeds.' },
      { entity: 'DMCC-USD', payRef: 'Settlement 20 / DMCC', receiveRef: 'Receipt 20 / DMCC', pay: -9_975_100, receive: 10_000_000, note: 'Pay: inter-company; Receive: commodity sale.' },
    ],
    plannedEntity: 'OFIIPL-INR', reportingRate: 100, settlementDate: '2027-11-09',
  },
  {
    id: '1100002738', model: 'M037', description: 'USD-INR Short Forward (sample)', type: 'Short Forward', pair: 'USD/INR', localCcy: 'INR',
    status: 'Settled', tradeDate: '2026-10-15', maturityDate: '2026-11-27', entities: [OIL, INDIA],
    legs: [
      leg('D1', 'DF (OFIIPL India)', 'Deliverable Forward', 'OFIIPL-INR', -5_000_000, 498_000_000, 'INR', 99.6, '2026-10-15', '2026-11-27'),
      leg('D2', 'NDF (OIL)', 'Non-Deliverable Forward', 'OIL-USD', 5_000_000, -495_000_000, 'INR', 99.0, '2026-10-15', '2026-11-27'),
    ],
    fixings: [{ legRef: 'D2', rate: 99.9, date: '2026-11-27' }],
    flows: [
      { entity: 'OIL-USD', payRef: 'Settlement 20 / OIL', receiveRef: 'Receipt 20 / OIL', pay: -4_954_955, receive: 4_990_000, note: 'Sample flow.' },
      { entity: 'OFIIPL-INR', payRef: 'Settlement 20 / India', receiveRef: 'Receipt 20 / India', pay: -495_000_000, receive: 498_030_000, note: 'Sample flow.' },
    ],
    plannedEntity: 'OFIIPL-INR', reportingRate: 100, settlementDate: '2026-11-27',
  },
  {
    id: '1100002737', model: 'M032', description: 'USD-INR Long Forward, open (sample)', type: 'Long Forward (Extra Invoicing)', pair: 'USD/INR', localCcy: 'INR',
    status: 'Open', tradeDate: '2026-11-04', maturityDate: '2027-02-26', entities: [OIL, INDIA],
    legs: [
      leg('D1', 'DF (OFIIPL India)', 'Deliverable Forward', 'OFIIPL-INR', 5_000_000, -497_000_000, 'INR', 99.4, '2026-11-04', '2027-02-26'),
      leg('D2', 'NDF (OIL)', 'Non-Deliverable Forward', 'OIL-USD', -5_000_000, 495_500_000, 'INR', 99.1, '2026-11-04', '2027-02-26'),
    ],
    fixings: [], flows: [], plannedEntity: 'OFIIPL-INR', reportingRate: 100, settlementDate: null,
  },
  {
    id: '1100002736', model: 'M032', description: 'USD-INR Long Forward, matured (sample)', type: 'Long Forward (Extra Invoicing)', pair: 'USD/INR', localCcy: 'INR',
    status: 'Matured', tradeDate: '2026-09-22', maturityDate: '2026-12-29', entities: [OIL, INDIA],
    legs: [
      leg('D1', 'DF (OFIIPL India)', 'Deliverable Forward', 'OFIIPL-INR', 3_000_000, -296_400_000, 'INR', 98.8, '2026-09-22', '2026-12-29'),
      leg('D2', 'NDF (OIL)', 'Non-Deliverable Forward', 'OIL-USD', -3_000_000, 297_900_000, 'INR', 99.3, '2026-09-22', '2026-12-29'),
    ],
    fixings: [{ legRef: 'D2', rate: 99.6, date: '2026-12-29' }], flows: [], plannedEntity: 'OFIIPL-INR', reportingRate: 100, settlementDate: null,
  },
  {
    id: '1100002741', model: 'M032', description: 'USD-MYR Long Forward (sample)', type: 'Long Forward (Extra Invoicing)', pair: 'USD/MYR', localCcy: 'MYR',
    status: 'Settled', tradeDate: '2026-08-10', maturityDate: '2026-11-10', entities: [OIL, MALAYSIA],
    legs: [
      leg('D1', 'DF (OFIMY Malaysia)', 'Deliverable Forward', 'OFIMY-MYR', 2_000_000, -8_800_000, 'MYR', 4.4, '2026-08-10', '2026-11-10'),
      leg('D2', 'NDF (OIL)', 'Non-Deliverable Forward', 'OIL-USD', -2_000_000, 8_960_000, 'MYR', 4.48, '2026-08-10', '2026-11-10'),
    ],
    fixings: [{ legRef: 'D2', rate: 4.46, date: '2026-11-10' }],
    flows: [
      { entity: 'OIL-USD', payRef: 'Settlement 20 / OIL', receiveRef: 'Receipt 20 / OIL', pay: -1_998_500, receive: 2_008_000, note: 'Sample flow.' },
      { entity: 'OFIMY-MYR', payRef: 'Settlement 20 / Malaysia', receiveRef: 'Receipt 20 / Malaysia', pay: -8_800_000, receive: 8_961_000, note: 'Sample flow.' },
    ],
    plannedEntity: 'OFIMY-MYR', reportingRate: 4.45, settlementDate: '2026-11-10',
  },
  {
    id: '1100002742', model: 'M033', description: 'USD-INR-INR Forward, loss-making (sample)', type: 'INR-INR-INR Forward', pair: 'USD/INR', localCcy: 'INR',
    status: 'Settled', tradeDate: '2026-07-06', maturityDate: '2026-10-06', entities: [OIL, INDIA, DMCC],
    legs: [
      leg('D1', 'DF (OFIIPL India)', 'Deliverable Forward', 'OFIIPL-INR', 8_000_000, -792_000_000, 'INR', 99.0, '2026-07-06', '2026-10-06'),
      leg('D2', 'NDF (OIL)', 'Non-Deliverable Forward', 'OIL-USD', -8_000_000, 790_400_000, 'INR', 98.8, '2026-07-06', '2026-10-06'),
    ],
    fixings: [{ legRef: 'D2', rate: 99.2, date: '2026-10-06' }],
    flows: [
      { entity: 'OIL-USD', payRef: 'Settlement 20 / OIL', receiveRef: 'Receipt 20 / OIL', pay: -7_967_742, receive: 7_975_000, note: 'Sample flow.' },
      { entity: 'OFIIPL-INR', payRef: 'Settlement 20 / India', receiveRef: 'Receipt 20 / India', pay: -792_000_000, receive: 790_300_000, note: 'Sample flow.' },
      { entity: 'DMCC-USD', payRef: 'Settlement 20 / DMCC', receiveRef: 'Receipt 20 / DMCC', pay: -8_000_000, receive: 8_001_500, note: 'Sample flow.' },
    ],
    plannedEntity: 'OFIIPL-INR', reportingRate: 100, settlementDate: '2026-10-06',
  },
  {
    id: '1100002744', model: 'M037', description: 'USD-INR Short Forward, open (sample)', type: 'Short Forward', pair: 'USD/INR', localCcy: 'INR',
    status: 'Open', tradeDate: '2026-11-16', maturityDate: '2027-05-14', entities: [OIL, INDIA],
    legs: [
      leg('D1', 'DF (OFIIPL India)', 'Deliverable Forward', 'OFIIPL-INR', -12_000_000, 1_195_200_000, 'INR', 99.6, '2026-11-16', '2027-05-14'),
      leg('D2', 'NDF (OIL)', 'Non-Deliverable Forward', 'OIL-USD', 12_000_000, -1_188_000_000, 'INR', 99.0, '2026-11-16', '2027-05-14'),
    ],
    fixings: [], flows: [], plannedEntity: 'OFIIPL-INR', reportingRate: 100, settlementDate: null,
  },
]
