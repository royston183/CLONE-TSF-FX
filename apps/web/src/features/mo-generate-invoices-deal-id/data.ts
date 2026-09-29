import type { Deal } from './types.ts'

export const STATUS_TEXT: Record<string, string> = {
  '04': '04',
  '05': '05 - Invoice created in TRM',
  '07': '07 - Partial Invoice created in TRM',
}

export const INITIAL_DEALS: Record<string, Deal> = {
  '5100231841': {
    dealId: '5100231841',
    dealRef: 'REF-FX-260184',
    mcRef: 'MC24001987',
    mcDesc: 'Merchanting FX Cover - OGA / DMCC',
    modelId: 'M034-02',
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
      { dealType: 'D1', roll: '', bukrs: 'AE13', bp: 'Barclays Bank PLC', partner: '0000000003', rfha: '2200015842', start: '04-09-2026', end: '31-12-2026', entity: 'OGA', pc1: 'B', bs1: 'Buy', curr1: 'USD', amt1: 3500000, bs2: 'Sell', pc2: 'S', curr2: 'AED', amt2: 12853750, allIn: 3.6725, strike: 3.6725, mc: 'MC24001987', txn: 'Active' },
      { dealType: 'D2', roll: '', bukrs: 'AE13', bp: 'Standard Chartered Bank Singapore', partner: '0660000680', rfha: '2200015843', start: '04-09-2026', end: '31-12-2026', entity: 'DMCC', pc1: 'S', bs1: 'Sell', curr1: 'USD', amt1: 3500000, bs2: 'Buy', pc2: 'B', curr2: 'AED', amt2: 12850250, allIn: 3.6715, strike: 3.6715, mc: 'MC24001987', txn: 'Active' },
    ],
    inv: [
      { ttype: 'T1', invType: 'EXP', seller: 'OGA', buyer: 'DMCC', bp: '0000000003', partnerBank: '', houseBank: 'H001', accountId: 'USD01', invDate: '22-09-2026', dueDate: '22-10-2026', commodity: 'CRUDE OIL', gtComm: 'C101', qty: 18000, usdPrice: 72.25, rate: 3.6725, price: 265.240625, amt: 4774331.25, amtUsd: 1300500.0, planned: 1300000.0, invNo: '', pc: '', locked: false },
      { ttype: 'T2', invType: 'IMP', seller: 'DMCC', buyer: 'OGA', bp: '0660000680', partnerBank: '0001', houseBank: '', accountId: '', invDate: '22-09-2026', dueDate: '22-10-2026', commodity: 'CRUDE OIL', gtComm: 'C101', qty: 17800, usdPrice: 73.5, rate: 3.6715, price: 269.85525, amt: 4803423.45, amtUsd: 1308300.0, planned: 1308500.0, invNo: '', pc: '', locked: false },
      { ttype: 'T3', invType: 'EXP', seller: 'OGA', buyer: 'DMCC', bp: '0000000003', partnerBank: '', houseBank: 'H001', accountId: 'USD01', invDate: '28-09-2026', dueDate: '28-10-2026', commodity: 'GAS OIL', gtComm: 'G203', qty: 11200, usdPrice: 79.75, rate: 3.6725, price: 292.881875, amt: 3280277.0, amtUsd: 893200.0, planned: 892500.0, invNo: '', pc: '', locked: false },
    ],
    bl: [
      { blNo: 'BL2600901', blDate: '12-09-2026', lot: '01', tfNo: 'TF2604511', tfSplit: '01', vessel: 'PACIFIC DAWN', pol: 'Fujairah', pod: 'Jebel Ali', commodity: 'CRUDE OIL', qty: 9200, status: 'Assigned', invType: 'EXP', invDate: '22-09-2026', reuse: '' },
      { blNo: 'BL2600902', blDate: '13-09-2026', lot: '01', tfNo: 'TF2604511', tfSplit: '02', vessel: 'PACIFIC DAWN', pol: 'Fujairah', pod: 'Jebel Ali', commodity: 'CRUDE OIL', qty: 8800, status: 'Assigned', invType: 'EXP', invDate: '22-09-2026', reuse: '' },
      { blNo: 'BL2600914', blDate: '18-09-2026', lot: '02', tfNo: 'TF2604540', tfSplit: '01', vessel: 'ORION BAY', pol: 'Sohar', pod: 'Jebel Ali', commodity: 'GAS OIL', qty: 11200, status: 'Assigned', invType: 'EXP', invDate: '28-09-2026', reuse: '' },
    ],
  },
  '5100231776': {
    dealId: '5100231776',
    dealRef: 'REF-FX-260169',
    mcRef: 'MC24001921',
    mcDesc: 'TSF FX Hedge - OGA / PAN',
    modelId: 'M035-01',
    modelDesc: 'FX Invoice Model - PAN',
    entityString: 'OGA-PAN',
    currencyString: 'USD-INR',
    trader: 'OTL',
    traderDesc: 'OTL Treasury',
    status: '05',
    fxInvModel: 'M035',
    dealStart: '15-08-2026',
    dealEnd: '30-11-2026',
    mcDate: '02-08-2026',
    shipStart: '20-08-2026',
    shipEnd: '20-11-2026',
    dm: false,
    tolerance: 2.0,
    fx: [
      { dealType: 'D1', roll: 'R1-D1', bukrs: 'IN11', bp: 'HSBC Singapore', partner: '0660000807', rfha: '2200015710', start: '15-08-2026', end: '30-11-2026', entity: 'OGA', pc1: 'B', bs1: 'Buy', curr1: 'USD', amt1: 2500000, bs2: 'Sell', pc2: 'S', curr2: 'INR', amt2: 224875000, allIn: 89.95, strike: 89.95, mc: 'MC24001921', txn: 'Active' },
    ],
    inv: [
      { ttype: 'T1', invType: 'EXP', seller: 'OGA', buyer: 'PAN', bp: '0660000807', partnerBank: '', houseBank: 'H003', accountId: 'USD02', invDate: '25-08-2026', dueDate: '25-09-2026', commodity: 'CRUDE OIL', gtComm: 'C101', qty: 25000, usdPrice: 100.0, rate: 89.95, price: 8995.0, amt: 224875000.0, amtUsd: 2500000.0, planned: 2500000.0, invNo: '9000048121', pc: 'C', locked: true },
    ],
    bl: [
      { blNo: 'BL2600830', blDate: '20-08-2026', lot: '01', tfNo: 'TF2604388', tfSplit: '01', vessel: 'EASTERN STAR', pol: 'Ruwais', pod: 'Mundra', commodity: 'CRUDE OIL', qty: 25000, status: 'Invoiced', invType: 'EXP', invDate: '25-08-2026', reuse: '' },
    ],
  },
  '5100231664': {
    dealId: '5100231664',
    dealRef: 'REF-FX-260148',
    mcRef: 'MC24001873',
    mcDesc: 'Partial Invoice Hedge - DMCC / OGA',
    modelId: 'M034-03',
    modelDesc: 'Merchanting FX Invoice Model',
    entityString: 'DMCC-OGA',
    currencyString: 'USD-AED',
    trader: 'OGA',
    traderDesc: 'OGA Treasury',
    status: '07',
    fxInvModel: 'M034',
    dealStart: '03-08-2026',
    dealEnd: '31-10-2026',
    mcDate: '22-07-2026',
    shipStart: '05-08-2026',
    shipEnd: '25-10-2026',
    dm: false,
    tolerance: 2.0,
    fx: [
      { dealType: 'D1', roll: 'R1-D1', bukrs: 'AE13', bp: 'DBS Bank Ltd', partner: '0660000645', rfha: '2200015599', start: '03-08-2026', end: '31-10-2026', entity: 'DMCC', pc1: 'B', bs1: 'Buy', curr1: 'USD', amt1: 4000000, bs2: 'Sell', pc2: 'S', curr2: 'AED', amt2: 14686000, allIn: 3.6715, strike: 3.6715, mc: 'MC24001873', txn: 'Active' },
    ],
    inv: [
      { ttype: 'T1', invType: 'EXP', seller: 'DMCC', buyer: 'OGA', bp: '0660000645', partnerBank: '0002', houseBank: '', accountId: '', invDate: '14-08-2026', dueDate: '14-09-2026', commodity: 'GAS OIL', gtComm: 'G203', qty: 32000, usdPrice: 95.0, rate: 3.6715, price: 348.7925, amt: 111613600.0, amtUsd: 3040000.0, planned: 3040000.0, invNo: '9000047988', pc: 'P', locked: true },
    ],
    bl: [
      { blNo: 'BL2600772', blDate: '09-08-2026', lot: '01', tfNo: 'TF2604210', tfSplit: '01', vessel: 'SEA MERIDIAN', pol: 'Sohar', pod: 'Fujairah', commodity: 'GAS OIL', qty: 32000, status: 'Invoiced', invType: 'EXP', invDate: '14-08-2026', reuse: '' },
    ],
  },
}

export const DEFAULT_DEAL_ID = '5100231841'
