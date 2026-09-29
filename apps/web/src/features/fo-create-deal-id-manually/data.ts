import type { Deal, MasterContract, PoolTxn } from './types.ts'

export const INITIAL_DEALS: Record<string, Deal> = {
  '700241': {
    id: '700241',
    ref: 'OGA_FX_2026 / DMCC-PAN',
    description: 'OGA_FX_2026 / DMCC-PAN',
    startDate: '15-09-2026',
    endDate: '30-11-2026',
    status: '01',
    mcRef: 'MC000842',
    mcDesc: 'OGA DMCC / PAN Forward Program',
    mcDate: '01-04-2026',
    shipEnd: '31-03-2027',
    fxModel: 'M001',
    entityString: 'OGA-DMCC-PAN',
    currencyString: 'USD-INR-AED',
    trader: 'Nidhi S',
    traderCode: 'NIDHI',
    origin: 'OGA',
    fxOp: 'FX1',
    fxRows: [
      { dealType: 'D1', bukrs: 'AE13', rfha: '3100047812', sfhaart: '102', start: '15-09-2026', end: '30-11-2026', text: 'Sell USD / Buy AED', entity: 'DMCC', side1: 'Sell', curr1: 'USD', amt1: 1800000, side2: 'Buy', curr2: 'AED', amt2: 6610500, spot: 3.6725, swap: 0.0018, allIn: 3.6743, mcRef: 'MC000842', txnStatus: '07' },
      { dealType: 'D2', bukrs: 'IN11', rfha: '3100047819', sfhaart: '102', start: '15-09-2026', end: '29-11-2026', text: 'Buy USD / Sell INR', entity: 'PAN', side1: 'Buy', curr1: 'USD', amt1: 1800000, side2: 'Sell', curr2: 'INR', amt2: 150840000, spot: 83.62, swap: 0.18, allIn: 83.80, mcRef: 'MC000842', txnStatus: '07' },
      { dealType: 'FX Deal P&L', bukrs: '', rfha: '', sfhaart: '', start: '', end: '', text: '', entity: '', side1: '', curr1: 'USD', amt1: 1800000, side2: '', curr2: 'INR', amt2: 149994000, spot: '', swap: '', allIn: 83.33, mcRef: '', txnStatus: '' },
    ],
    invoices: [
      { tradeType: 'T1', dealType: 'D1', sell: 'DMCC', buy: 'PAN', currency: 'USD', amount: 720000, exchangeRate: 83.78, invAmount: 60321600, invTrmNo: '700241-T1', mcPurchase: 'MC000842', mcSale: 'MC000842' },
      { tradeType: 'T2', dealType: 'D2', sell: 'PAN', buy: 'DMCC', currency: 'USD', amount: 610000, exchangeRate: 83.84, invAmount: 51142400, invTrmNo: '700241-T2', mcPurchase: 'MC000842', mcSale: 'MC000842' },
      { tradeType: 'T3', dealType: 'D2', sell: 'PAN', buy: 'DMCC', currency: 'USD', amount: 470000, exchangeRate: 83.91, invAmount: 39437700, invTrmNo: '700241-T3', mcPurchase: 'MC000842', mcSale: 'MC000842' },
    ],
    premium: { dealValue: 1800000, dealCurr: 'USD', localNet: 0, localCurr: 'INR', rbi: 83.51, rbiDate: '28-09-2026', foreignNet: 0, foreignCurr: 'USD', perUsd: 0, strike: 83.80, invoiceRate: 83.84 },
  },
  '700242': {
    id: '700242',
    ref: 'OTL_FX_2026 / OSIPL-OGA',
    description: 'OTL_FX_2026 / OSIPL-OGA',
    startDate: '01-10-2026',
    endDate: '31-01-2027',
    status: '02',
    mcRef: 'MC000857',
    mcDesc: 'OTL OSIPL / OGA FX Model',
    mcDate: '01-07-2026',
    shipEnd: '30-06-2027',
    fxModel: 'M002',
    entityString: 'OSIPL-OGA',
    currencyString: 'USD-INR',
    trader: 'TERRY TAY',
    traderCode: 'TERRY',
    origin: 'OTL',
    fxOp: 'FX1',
    fxRows: [
      { dealType: 'D1', bukrs: 'IN11', rfha: '3100048125', sfhaart: '102', start: '01-10-2026', end: '31-01-2027', text: 'Buy USD / Sell INR', entity: 'OSIPL', side1: 'Buy', curr1: 'USD', amt1: 2400000, side2: 'Sell', curr2: 'INR', amt2: 201120000, spot: 83.65, swap: 0.15, allIn: 83.80, mcRef: 'MC000857', txnStatus: '07' },
      { dealType: 'D2', bukrs: 'AE13', rfha: '3100048133', sfhaart: '102', start: '01-10-2026', end: '30-01-2027', text: 'Sell USD / Buy AED', entity: 'OGA', side1: 'Sell', curr1: 'USD', amt1: 2400000, side2: 'Buy', curr2: 'AED', amt2: 8811600, spot: 3.6725, swap: 0.0007, allIn: 3.6732, mcRef: 'MC000857', txnStatus: '07' },
      { dealType: 'FX Deal P&L', bukrs: '', rfha: '', sfhaart: '', start: '', end: '', text: '', entity: '', side1: '', curr1: 'USD', amt1: 2400000, side2: '', curr2: 'INR', amt2: 200760000, spot: '', swap: '', allIn: 83.65, mcRef: '', txnStatus: '' },
    ],
    invoices: [
      { tradeType: 'T1', dealType: 'D1', sell: 'OSIPL', buy: 'OGA', currency: 'USD', amount: 1000000, exchangeRate: 83.73, invAmount: 83730000, invTrmNo: '700242-T1', mcPurchase: 'MC000857', mcSale: 'MC000857' },
      { tradeType: 'T2', dealType: 'D2', sell: 'OGA', buy: 'OSIPL', currency: 'USD', amount: 800000, exchangeRate: 83.81, invAmount: 67048000, invTrmNo: '700242-T2', mcPurchase: 'MC000857', mcSale: 'MC000857' },
      { tradeType: 'T3', dealType: 'D2', sell: 'OGA', buy: 'OSIPL', currency: 'USD', amount: 600000, exchangeRate: 83.88, invAmount: 50328000, invTrmNo: '700242-T3', mcPurchase: 'MC000857', mcSale: 'MC000857' },
    ],
    premium: { dealValue: 2400000, dealCurr: 'USD', localNet: 0, localCurr: 'INR', rbi: 83.58, rbiDate: '28-09-2026', foreignNet: 0, foreignCurr: 'USD', perUsd: 0, strike: 83.80, invoiceRate: 83.81 },
  },
  '700243': {
    id: '700243',
    ref: 'SEDA_FX_2026 / SEDA-OGA',
    description: 'SEDA_FX_2026 / SEDA-OGA',
    startDate: '10-09-2026',
    endDate: '30-09-2027',
    status: '01',
    mcRef: 'MC000866',
    mcDesc: 'SEDA / OGA Hedge Structure',
    mcDate: '01-08-2026',
    shipEnd: '31-12-2027',
    fxModel: 'M001',
    entityString: 'SEDA-OGA',
    currencyString: 'EUR-USD-INR',
    trader: 'Amey T',
    traderCode: 'AMEY',
    origin: 'SEDA',
    fxOp: 'FX1',
    fxRows: [
      { dealType: 'D1', bukrs: 'ES12', rfha: '3100048501', sfhaart: '102', start: '10-09-2026', end: '30-09-2027', text: 'Sell EUR / Buy USD', entity: 'SEDA', side1: 'Sell', curr1: 'EUR', amt1: 1250000, side2: 'Buy', curr2: 'USD', amt2: 1475000, spot: 1.1780, swap: 0.0020, allIn: 1.1800, mcRef: 'MC000866', txnStatus: '07' },
      { dealType: 'D2', bukrs: 'IN11', rfha: '3100048514', sfhaart: '102', start: '10-09-2026', end: '29-09-2027', text: 'Sell USD / Buy INR', entity: 'OGA', side1: 'Sell', curr1: 'USD', amt1: 1475000, side2: 'Buy', curr2: 'INR', amt2: 125375000, spot: 84.65, swap: 0.35, allIn: 85.00, mcRef: 'MC000866', txnStatus: '07' },
      { dealType: 'FX Deal P&L', bukrs: '', rfha: '', sfhaart: '', start: '', end: '', text: '', entity: '', side1: '', curr1: 'USD', amt1: 1475000, side2: '', curr2: 'INR', amt2: 124785000, spot: '', swap: '', allIn: 84.60, mcRef: '', txnStatus: '' },
    ],
    invoices: [
      { tradeType: 'T1', dealType: 'D1', sell: 'SEDA', buy: 'OGA', currency: 'USD', amount: 590000, exchangeRate: 84.71, invAmount: 49978900, invTrmNo: '700243-T1', mcPurchase: 'MC000866', mcSale: 'MC000866' },
      { tradeType: 'T2', dealType: 'D2', sell: 'OGA', buy: 'SEDA', currency: 'USD', amount: 480000, exchangeRate: 84.86, invAmount: 40732800, invTrmNo: '700243-T2', mcPurchase: 'MC000866', mcSale: 'MC000866' },
      { tradeType: 'T3', dealType: 'D2', sell: 'OGA', buy: 'SEDA', currency: 'USD', amount: 405000, exchangeRate: 84.93, invAmount: 34396650, invTrmNo: '700243-T3', mcPurchase: 'MC000866', mcSale: 'MC000866' },
    ],
    premium: { dealValue: 1475000, dealCurr: 'USD', localNet: 0, localCurr: 'INR', rbi: 84.55, rbiDate: '28-09-2026', foreignNet: 0, foreignCurr: 'USD', perUsd: 0, strike: 85.00, invoiceRate: 84.86 },
  },
}

export const INITIAL_MASTER_CONTRACTS: MasterContract[] = [
  { ref: 'MC000842', origin: 'OGA', model: 'M001', mcDate: '01-04-2026', shipEnd: '31-03-2027', amount: 10000000, balance: 6400000, desc: 'OGA DMCC / PAN Forward Program', entity: 'OGA-DMCC-PAN', currency: 'USD-INR-AED' },
  { ref: 'MC000857', origin: 'OTL', model: 'M002', mcDate: '01-07-2026', shipEnd: '30-06-2027', amount: 12000000, balance: 7200000, desc: 'OTL OSIPL / OGA FX Model', entity: 'OSIPL-OGA', currency: 'USD-INR' },
  { ref: 'MC000866', origin: 'SEDA', model: 'M001', mcDate: '01-08-2026', shipEnd: '31-12-2027', amount: 9000000, balance: 5100000, desc: 'SEDA / OGA Hedge Structure', entity: 'SEDA-OGA', currency: 'EUR-USD-INR' },
]

export const TRANSACTION_POOL: PoolTxn[] = [
  { rfha: '3100049001', bukrs: 'AE13', sfhaart: '102', entity: 'DMCC', start: '01-10-2026', end: '30-12-2026', side1: 'Sell', curr1: 'USD', amt1: 1000000, side2: 'Buy', curr2: 'AED', amt2: 3673000, trader: 'OGA' },
  { rfha: '3100049002', bukrs: 'IN11', sfhaart: '102', entity: 'PAN', start: '01-10-2026', end: '29-12-2026', side1: 'Buy', curr1: 'USD', amt1: 1000000, side2: 'Sell', curr2: 'INR', amt2: 83900000, trader: 'OGA' },
  { rfha: '3100049010', bukrs: 'IN11', sfhaart: '102', entity: 'OSIPL', start: '15-10-2026', end: '31-01-2027', side1: 'Buy', curr1: 'USD', amt1: 1500000, side2: 'Sell', curr2: 'INR', amt2: 125850000, trader: 'OTL' },
  { rfha: '3100049011', bukrs: 'AE13', sfhaart: '102', entity: 'OGA', start: '15-10-2026', end: '30-01-2027', side1: 'Sell', curr1: 'USD', amt1: 1500000, side2: 'Buy', curr2: 'AED', amt2: 5509500, trader: 'OTL' },
  { rfha: '3100049020', bukrs: 'ES12', sfhaart: '102', entity: 'SEDA', start: '20-10-2026', end: '28-02-2027', side1: 'Sell', curr1: 'EUR', amt1: 850000, side2: 'Buy', curr2: 'USD', amt2: 1003000, trader: 'OTL' },
  { rfha: '3100049021', bukrs: 'IN11', sfhaart: '102', entity: 'OGA', start: '20-10-2026', end: '27-02-2027', side1: 'Sell', curr1: 'USD', amt1: 1003000, side2: 'Buy', curr2: 'INR', amt2: 84653200, trader: 'OTL' },
]

export const DEFAULT_DEAL_ID = '700241'
export const FIRST_NEW_DEAL_NUMBER = 700244
