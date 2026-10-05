/**
 * Dummy data — quarantined. The legacy page ran entirely on these seeds ("mirrors the worked
 * example used across the TSF suite: Model M021 (INR Long Forward), MC-7001, 5,000 MT soybean
 * oil, Deal ID TSF-9081, entity chain OIL -> DMCC -> OAIPL"). Nothing here is read from SAP.
 */
import type { Deal, DmsDoc, FxDeal, Headsup, StatusMeta, TradeInvoice } from './types.ts'

export const STATUS_LIST: readonly StatusMeta[] = [
  { code: '01', text: 'Deal Created', cls: 'pill-early' },
  { code: '04', text: 'Deal Released', cls: 'pill-early' },
  { code: '05', text: 'Pending Shipment Match', cls: 'pill-progress' },
  { code: '10', text: 'BL Attached - Invoicing in Progress', cls: 'pill-progress' },
  { code: '19', text: 'Settlement Due', cls: 'pill-due' },
  { code: '20', text: 'Settlement Initiated', cls: 'pill-init' },
  { code: '21', text: 'Settlement Complete', cls: 'pill-done' },
  { code: '25', text: 'Closed', cls: 'pill-done' },
]

export const SAMPLE_DEAL_ID = 'TSF-9081'

export const seedDeal = (): Deal => ({
  dealId: 'TSF-9081',
  dealStartDate: '15-01-2026',
  dealEndDate: '15-03-2026',
  revisedEndDate: '',
  mcRefNo: 'MC-7001',
  mcDesc: 'Soybean Oil 5,000 MT - Olam Agri India Pvt Ltd',
  mcDate: '10-01-2026',
  shipEndDate: '28-02-2026',
  fxModelId: 'M021',
  fxModelDesc: 'INR Long Forward',
  entityString: 'OIL - DMCC - OAIPL',
  fxInvModel: 'M021',
  trader: 'OTL',
  traderDesc: 'Olam Trading Ltd',
  currencyString: 'USD - USD - INR',
  dealStatus: '10',
  noInvoiceFlag: false,
})

export const seedFxDeals = (): FxDeal[] => [
  {
    seq: '01', dealType: 'D1', dealTypeChip: 'chip-d1', rfha: '5000001', bp: 'DMCC (Olam International DMCC)',
    txnDate: '15-01-2026', valDate: '15-03-2026', entity: 'OIL', bs1: 'Sell', curr1: 'USD', amt1: 5000000.0,
    bs2: 'Buy', curr2: 'INR', amt2: 415000000.0, spot: '83.0000', rate: '83.0000', mcRefNo: 'MC-7001',
    status: 'Confirmed', statusChip: 'chip-open', doc1: '', doc2: '',
  },
  {
    seq: '02', dealType: 'D2', dealTypeChip: 'chip-d2', rfha: '5000002', bp: 'OAIPL (Olam Agri India Pvt Ltd)',
    txnDate: '15-01-2026', valDate: '15-03-2026', entity: 'OAIPL', bs1: 'Buy', curr1: 'USD', amt1: 5000000.0,
    bs2: 'Sell', curr2: 'INR', amt2: 415425000.0, spot: '83.0850', rate: '83.0850', mcRefNo: 'MC-7001',
    status: 'Confirmed', statusChip: 'chip-open', doc1: '', doc2: '',
  },
]

export const seedTradeInvoices = (): TradeInvoice[] => [
  {
    leg: 'T1', trfDesc: 'OIL sells to DMCC', docType: 'RV', xblnr: 'INV-T1-9081', drPost: 'Dr DMCC Trade A/R',
    crPost: 'Cr OIL Trade Revenue', dueDate: '20-03-2026', postDate: '', invAmt: 5000000.0, curr: 'USD',
    payAmt: 5000000.0, recPay: 'Receipt', trfType: 'TT Form', fiDoc: '', setCo: false,
  },
  {
    leg: 'T2', trfDesc: 'DMCC sells to OAIPL', docType: 'RV', xblnr: 'INV-T2-9081', drPost: 'Dr OAIPL Trade A/P',
    crPost: 'Cr DMCC Trade Revenue', dueDate: '20-03-2026', postDate: '', invAmt: 5010000.0, curr: 'USD',
    payAmt: 5010000.0, recPay: 'Payment', trfType: 'TT Form', fiDoc: '', setCo: false,
  },
  {
    leg: 'T3', trfDesc: 'OAIPL final sale (end customer)', docType: 'RV', xblnr: 'INV-T3-9081', drPost: 'Dr Customer A/R',
    crPost: 'Cr OAIPL Trade Revenue', dueDate: '20-03-2026', postDate: '', invAmt: 415425000.0, curr: 'INR',
    payAmt: 415425000.0, recPay: 'Receipt', trfType: 'Letter', fiDoc: '', setCo: false,
  },
]

export const HEADSUP_DATA: readonly Headsup[] = [
  { date: '01-03-2026', cat: 'Shipment', msg: 'Shipment window for MC-7001 closes on 28-02-2026 - confirm Bill of Lading has been attached to this Deal ID.' },
  { date: '10-03-2026', cat: 'Settlement', msg: 'FX deal value date (15-03-2026) is approaching - initiate settlement once trade invoices are posted.' },
  { date: '12-03-2026', cat: 'Documentation', msg: 'SSI / bank letter for the DMCC leg has not yet been generated.' },
]

export const seedDms = (): DmsDoc[] => [
  { type: 'Bill of Lading', file: 'BL-44821.pdf', date: '02-03-2026', by: 'trade.flow.team' },
  { type: 'FX Confirmation', file: 'FXCONF-5000001.pdf', date: '15-01-2026', by: 'fo.trader' },
  { type: 'FX Confirmation', file: 'FXCONF-5000002.pdf', date: '15-01-2026', by: 'fo.trader' },
]

export const DMS_DOC_TYPES: readonly string[] = [
  'Bill of Lading',
  'Commercial Invoice',
  'SSI / Bank Letter',
  'FX Confirmation',
  'Other Supporting Document',
]

export const BANK_TYPES: readonly string[] = ['Standard Chartered Bank', 'HSBC', 'DBS Bank', 'Barclays PLC']
export const TRANSFER_TYPES: readonly string[] = ['TT Form', 'ECM', 'Letter', 'Indirect']

/** Fixed values the legacy posting popups filled in. */
export const FX_POST_COMPANY_CODE = 'AE13'
export const INV_POST_BANK = 'Standard Chartered Bank Singapore'
export const LETTER_SIGNATORY = 'Olam Agri India Private Limited'
