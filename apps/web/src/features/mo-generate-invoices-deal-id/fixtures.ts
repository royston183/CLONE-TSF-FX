/**
 * TEST FIXTURES ONLY — imported by the *.test.ts files, never by the screen. This is the sample
 * deal the screen used to start with, kept so the pure logic can be exercised.
 */
import type { Deal, FxRow, InvRow } from './types.ts'

const fx = (r: Partial<FxRow>): FxRow => ({
  dealType: '', roll: '', bukrs: '', bp: '', partner: '', rfha: '', start: '', end: '', entity: '', pc1: '', bs1: '', curr1: '', amt1: 0,
  bs2: '', pc2: '', curr2: '', amt2: 0, allIn: 0, strike: 0, preAmt: 0, mc: '', txn: '', ...r,
})

const inv = (r: Partial<InvRow>): InvRow => ({
  ttype: '', invType: '', seller: '', buyer: '', bp: '', partnerBank: '', houseBank: '', accountId: '', invDate: '', dueDate: '', commodity: '',
  gtComm: '', qty: 0, usdPrice: 0, rate: 0, price: 0, amt: 0, amtUsd: 0, planned: 0, invNo: '', invTrmRef: '', pc: '', locked: false, curr: 'USD', dealType: '', rec: {}, ...r,
})

export const fxRow = fx
export const invRow = inv

export const SAMPLE_DEAL: Deal = {
  dealId: '5100231841',
  dealRef: 'REF-FX-260184',
  mcRef: 'MC24001987',
  mcDesc: 'Merchanting FX Cover - OGA / DMCC',
  modelId: 'M03402',
  modelDesc: 'Merchanting FX Invoice Model',
  entityString: 'OGA-DMCC-PAN',
  currencyString: 'USD-AED',
  trader: 'OGA',
  traderDesc: 'OGA Treasury',
  status: '04',
  fxInvModel: 'M034',
  dealStart: '04-09-2026',
  dealEnd: '31-12-2026',
  mcDate: '18-08-2026',
  shipStart: '10-09-2026',
  shipEnd: '15-12-2026',
  dm: false,
  tolerance: 2.0,
  fx: [
    fx({ dealType: 'D1', bukrs: 'AE13', bp: 'Barclays Bank PLC', partner: '0000000003', rfha: '2200015842', start: '04-09-2026', end: '31-12-2026', entity: 'OGA', bs1: 'Buy', curr1: 'USD', amt1: 3500000, bs2: 'Sell', curr2: 'AED', amt2: -12853750, allIn: 3.6725, txn: '03' }),
    fx({ dealType: 'D2', bukrs: 'AE13', bp: 'Standard Chartered Bank Singapore', partner: '0660000680', rfha: '2200015843', start: '04-09-2026', end: '31-12-2026', entity: 'DMCC', bs1: 'Sell', curr1: 'USD', amt1: -3500000, bs2: 'Buy', curr2: 'AED', amt2: 12850250, allIn: 3.6715, txn: '03' }),
  ],
  inv: [
    inv({ ttype: 'T1', invType: 'I01', seller: 'OGA', buyer: 'DMCC', qty: 18000, usdPrice: 72.25, rate: 3.6725, amtUsd: 1300500, curr: 'AED' }),
    inv({ ttype: 'T2', invType: 'I01', seller: 'DMCC', buyer: 'OGA', qty: 17800, usdPrice: 73.5, rate: 3.6715, amtUsd: 1308300, curr: 'AED' }),
    inv({ ttype: 'T3', invType: 'I01', seller: 'OGA', buyer: 'DMCC', qty: 11200, usdPrice: 79.75, rate: 3.6725, amtUsd: 893200, curr: 'AED' }),
  ],
  bl: [],
  diff: [],
  fxReason: '',
  invReason: '',
  blReason: '',
  region: 'R04',
  profitMaintained: true,
}
