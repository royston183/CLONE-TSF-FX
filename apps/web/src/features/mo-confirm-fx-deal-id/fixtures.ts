/**
 * TEST FIXTURES ONLY — imported by the *.test.ts files, never by the screen.
 *
 * The legacy page's dummy legs (its "mock backend"), kept so the pure table helpers in logic.ts
 * stay covered while the FX legs' view (ZSGTSFCDS_FX / _OPTION) is not served by the middleware.
 */
import type { Deal, Leg } from './types.ts'

export function makeOptionLegs(): Leg[] {
  return [
    { rfha: '5000128522', dealType: 'OPT', bpName: 'HSBC Bank plc', bpCode: '100511',
      dealDate: '21-09-2026', valueDate: '14-10-2026', desc: 'Call option leg',
      bs1: 'Buy', curr1: 'USD', amt1: 22889.0, bs2: 'Sell', curr2: 'INR', amt2: 2058010.0,
      rateVal: 89.92, rateLabel: 'Strike', txnStatus: '02', fxPl: 4120.0 },
    { rfha: '5000128523', dealType: 'OPT', bpName: 'HSBC Bank plc', bpCode: '100511',
      dealDate: '21-09-2026', valueDate: '14-10-2026', desc: 'Put option leg',
      bs1: 'Sell', curr1: 'USD', amt1: 22889.0, bs2: 'Buy', curr2: 'INR', amt2: 2052400.0,
      rateVal: 89.68, rateLabel: 'Strike', txnStatus: '02', fxPl: -1680.0 },
  ]
}

export function makeDeal(overrides: Partial<Deal> = {}): Deal {
  return {
    dealId: '7000000006', dealDesc: 'OSIPL_FX_2026 / OGA-DMCC-OSIPL',
    trader: 'C', traderName: 'Nidhi S',
    startDate: '30-09-2026', endDate: '30-10-2026',
    fxModel: 'M032', modelDesc: 'INR Long Forward',
    entityString: 'OGA-DMCC-OSIPL', currString: 'USD-USD-INR',
    mcRef: '2000000005', mcDesc: 'DUMMY CORN M032', mcDate: '22-08-2026',
    shipStart: '22-08-2026', shipEnd: '15-10-2026',
    bukrs: '', status: '01', statusText: 'FO: FX Deals Created',
    noInv: false, ssDeal: false, unwind: false,
    legs: makeOptionLegs(),
    ...overrides,
  }
}
