import type {
  BkpfSeed,
  ColumnDef,
  ColumnKey,
  Company,
  DealSeed,
  LayoutVariant,
  Partner,
  Portfolio,
  StatusMeta,
} from './types.ts'

/** Every piece of mock data and constant of the screen lives here; nothing in it comes from SAP. */

/** Fixed "today" so the demo data stays consistent. */
export const AS_OF = '2026-10-05'

export const COMPANIES: Company[] = [
  { code: 'IN11', name: 'Olam Agri India Pvt Ltd', tsfEntity: 'OSIPL', pair: 'USD/INR', local: 'INR', ba: '1100', baName: 'Agri Trading India', pc: 'PC11000', pcName: 'India Origination', acct: '0044-271093-006' },
  { code: 'TH10', name: 'Olam (Thailand) Ltd', tsfEntity: 'OTL', pair: 'USD/THB', local: 'THB', ba: '2100', baName: 'Agri Trading Thailand', pc: 'PC21000', pcName: 'Thailand Origination', acct: '0185-402219-310' },
  { code: 'VN10', name: 'Olam Vietnam Limited', tsfEntity: 'OVL', pair: 'USD/VND', local: 'VND', ba: '3100', baName: 'Agri Trading Vietnam', pc: 'PC31000', pcName: 'Vietnam Origination', acct: '0721-118806-554' },
]

export const PARTNERS: Partner[] = [
  {
    id: '100231',
    name: 'HSBC',
    contact: 'Rahul Mehta',
    swift: 'HSBCINBB',
    formal: 'The Hongkong and Shanghai Banking Corporation Ltd',
    addr: ['52/60 Mahatma Gandhi Road, Fort', 'Mumbai - 400001', 'India'],
    attn: 'Attn: FX Settlements - Global Markets Operations',
  },
  {
    id: '100245',
    name: 'Citibank N.A.',
    contact: 'Priya Nair',
    swift: 'CITIINBX',
    formal: 'Citibank N.A.',
    addr: ['FIFC, C-54 & 55, G Block, Bandra Kurla Complex', 'Mumbai - 400051', 'India'],
    attn: 'Attn: Treasury Services - Derivatives Settlements',
  },
  {
    id: '100258',
    name: 'Standard Chartered Bank',
    contact: 'Daniel Tan',
    swift: 'SCBLSG22',
    formal: 'Standard Chartered Bank',
    addr: ['8 Marina Boulevard, Marina Bay Financial Centre', 'Singapore - 018981', 'Singapore'],
    attn: 'Attn: Financial Markets Operations - NDF Desk',
  },
  {
    id: '100267',
    name: 'JPMorgan Chase Bank',
    contact: 'Vikram Shah',
    swift: 'CHASINBX',
    formal: 'JPMorgan Chase Bank, N.A.',
    addr: ['J.P. Morgan Tower, Off C.S.T. Road, Kalina', 'Mumbai - 400098', 'India'],
    attn: 'Attn: Markets Operations - FX Confirmations',
  },
  {
    id: '100274',
    name: 'Deutsche Bank AG',
    contact: 'Anita Kulkarni',
    swift: 'DEUTINBB',
    formal: 'Deutsche Bank AG',
    addr: ['Hazarimal Somani Marg, Fort', 'Mumbai - 400001', 'India'],
    attn: 'Attn: Global Transaction Banking - FX Settlements',
  },
]

export const PORTFOLIOS: Portfolio[] = [
  { rportb: 'FXHDG-EXP', xportb: 'Cash Flow Hedge' },
  { rportb: 'FXHDG-IMP', xportb: 'Cash Flow Hedge' },
  { rportb: 'FXECON-01', xportb: 'Economic Hedge' },
]

export const TRADERS = ['RPATEL', 'SNAIR', 'AGUPTA', 'MDESAI']
export const FO_REMARKS = [
  'Hedge for export receivables',
  'Rollover of earlier maturity',
  'Hedge for rice import payables',
  'Cotton shipment cover',
  'Palm olein payables cover',
  'Fertilizer import cover',
]
export const MO_REMARKS = ['Confirmed with counterparty', 'Confirmation received', 'Limit checked', 'Docs verified']
export const FIX_FO_REMARKS = ['Fixing as per official reference rate', 'Fixing rate accepted', 'Fixing verified by front office']
export const FIX_MO_REMARKS = ['Rate verified against market page', 'Rate matched with bank advice', 'Fixing checked by middle office']

/** txn_status descriptions (dummy: the SAP status text table was not part of the export). */
export const TXN_STATUS_META: Record<string, StatusMeta> = {
  '13': { text: 'Fixed', cls: 'status-text-fixed' },
  '50': { text: 'Posted', cls: 'status-text-posted' },
}
/** The class of a status code that has no description. */
export const UNKNOWN_STATUS_CLASS = 'status-text-draft'

/** Seed for each VTBFHA row — see DealSeed for the column order. */
export const DEAL_SEEDS: DealSeed[] = [
  ['5000004101','IN11',0,'B',2500000,90.2150,90.8800,'2026-10-01',90,'13','1','12D','2000002728',0],
  ['5000004102','IN11',1,'S',1800000,90.5400,90.1275,'2026-10-01',60,'13','1','12D','2000002727',1],
  ['5000004103','IN11',2,'B',3200000,89.9600,90.4120,'2026-10-05',120,'13','1','12D','2000002726',2],
  ['5000004104','IN11',3,'B',1250000,90.1000,89.7340,'2026-10-06',45,'13','1','12D','2000002725',3],
  ['5000004105','IN11',4,'S',4000000,90.8800,91.2600,'2026-10-07',150,'13','2','12D','2000002724',0],
  ['5000004106','IN11',0,'B',2000000,90.3300,90.9100,'2026-10-08',90,'13','1','12D','2000002723',1],
  ['5000004107','IN11',1,'B',5000000,89.8500,90.0200,'2026-10-09',180,'13','1','12D','2000002722',2],
  ['5000004108','IN11',2,'S',750000,90.7200,90.3300,'2026-10-12',30,'13','1','12D','2000002719',3],
  ['5000004109','IN11',3,'B',2750000,90.4400,90.6600,'2026-10-13',75,'13','1','12D','2000002718',0],
  ['5000004110','IN11',4,'B',1600000,90.0900,90.4800,'2026-10-14',60,'13','1','12D','2000002717',1],
  ['5000004111','IN11',0,'S',3300000,91.0100,90.7500,'2026-10-15',120,'13','1','12D','2000002716',2],
  ['5000004112','IN11',1,'B',6000000,90.2600,90.9900,'2026-10-16',90,'13','1','12D','2000002715',3],
  ['5000004113','IN11',2,'B',900000,90.5000,90.4200,'2026-10-19',30,'13','1','12D','2000002714',0],
  ['5000004114','IN11',3,'S',2200000,90.9500,91.4000,'2026-10-20',100,'13','1','12D','2000002713',1],
  ['5000004115','IN11',4,'B',1000000,90.3800,90.2300,'2026-10-21',45,'13','1','12D','2000002712',2],
  ['5000004116','IN11',0,'B',2900000,90.1700,90.6100,'2026-10-22',80,'13','1','12D','2000002711',3],
  ['5000004117','IN11',1,'S',1400000,91.0500,91.2200,'2026-10-26',60,'13','1','12D','2000002710',0],
  ['5000004118','IN11',2,'B',3600000,90.4700,90.8300,'2026-10-28',130,'13','1','12D','2000002709',1],
  ['5000004201','VN10',0,'B',1500000,26180.00,26275.50,'2026-10-02',90,'13','1','12D','2000002708',2],
  ['5000004202','VN10',3,'S',2000000,26310.00,26244.00,'2026-10-06',60,'13','1','12D','2000002702',3],
  ['5000004203','VN10',1,'B',1000000,26220.00,26338.25,'2026-10-09',120,'13','1','12D','2000002701',0],
  ['5000004204','VN10',2,'B',2400000,26150.00,26190.00,'2026-10-14',45,'13','1','12D','2000002700',1],
  ['5000004205','VN10',4,'S',800000,26405.00,26352.00,'2026-10-16',75,'13','1','12D','2000002699',2],
  ['5000004206','VN10',0,'B',1750000,26260.00,26420.75,'2026-10-23',150,'13','2','12D','2000002691',3],
  ['5000004207','VN10',1,'S',1200000,26385.00,26298.00,'2026-10-27',90,'13','1','12D','2000002689',0],
  ['5000004301','TH10',2,'B',1000000,34.8200,35.1450,'2026-10-02',60,'13','1','12D','2000002688',1],
  ['5000004302','TH10',0,'S',1300000,35.2500,34.9100,'2026-10-07',90,'13','1','12D','2000002728',2],
  ['5000004303','TH10',3,'B',900000,34.6500,34.7200,'2026-10-12',30,'13','1','12D','2000002727',3],
  ['5000004304','TH10',1,'B',1600000,35.0100,35.3600,'2026-10-15',120,'13','1','12D','2000002726',0],
  ['5000004305','TH10',4,'S',700000,35.4200,35.1800,'2026-10-21',45,'13','1','12D','2000002725',1],
  ['5000004306','TH10',2,'B',1100000,34.9500,35.2200,'2026-10-29',100,'13','1','12D','2000002724',2],
  // outside the default value-date range
  ['5000004098','IN11',0,'B',2000000,90.0500,89.9100,'2026-09-29',90,'13','1','12D','2000002723',3],
  ['5000004099','VN10',1,'S',1000000,26120.00,26190.00,'2026-09-30',60,'13','1','12D','2000002722',0],
  ['5000004119','IN11',3,'B',1500000,91.2000,91.5500,'2026-11-04',90,'13','1','12D','2000002719',1],
  ['5000004308','TH10',0,'B',800000,35.5000,35.3000,'2026-11-10',60,'13','1','12D','2000002718',2],
  // removed by the report's own selection rules (status / active flag / product type)
  ['5000004120','IN11',1,'B',2000000,90.3000,90.5000,'2026-10-10',60,'05','1','12D','2000002717',3],
  ['5000004121','IN11',2,'S',1500000,90.6000,90.2000,'2026-10-12',60,'08','1','12D','2000002716',0],
  ['5000004122','IN11',4,'B',1800000,90.2000,90.4000,'2026-10-13',60,'12','1','12D','2000002715',1],
  ['5000004123','VN10',0,'B',900000,26200.00,26260.00,'2026-10-14',60,'07','1','12D','2000002714',2],
  ['5000004124','IN11',3,'B',2300000,90.1100,90.4400,'2026-10-15',60,'50','1','12D','2000002713',3],
  ['5000004125','TH10',1,'B',650000,35.0000,35.2000,'2026-10-16',60,'13','3','12D','2000002712',0],
  ['5000004126','IN11',0,'S',1900000,90.7000,90.3000,'2026-10-19',60,'13','1','11D','2000002711',1]
]

/** BKPF seeds — see BkpfSeed for the column order. */
export const BKPF_SEEDS: BkpfSeed[] = [
  ['IN11','1400004210','2026','5000004101','USD','TR','2026-10-01','TSF','',''],
  ['IN11','1400004211','2026','5000004103','USD','TR','2026-10-05','TSF','',''],
  ['IN11','1400004215','2026','5000004106','USD','TR','2026-10-08','TSF','',''],
  ['IN11','1400004219','2026','5000004109','USD','TR','2026-10-13','TSF','',''],
  ['VN10','1400004222','2026','5000004201','USD','TR','2026-10-02','TSF','',''],
  ['TH10','1400004230','2026','5000004301','USD','TR','2026-10-02','TSF','',''],
  ['IN11','1400004205','2026','5000004112','USD','TR','2026-09-29','TSF','',''], // posted before the default date range
  ['IN11','1400004208','2026','5000004105','USD','TR','2026-10-07','TSF','2',''], // reversed document - ignored by the report
  ['IN11','1400004209','2026','5000004115','USD','TR','2026-10-21','TSF','','X'] // reversal document - ignored by the report
]

/** VTBFHAPO flow rows with posting status '2' (posted). */
export const FLOW_SEEDS = ['5000004101', '5000004103', '5000004106', '5000004109', '5000004201', '5000004301']

/** First document number the simulated posting run hands out. */
export const FIRST_DOC_NO = 1400004300

export const COLUMN_CATALOG: Record<ColumnKey, ColumnDef> = {
  rfha: { label: 'Transaction No', type: 'link' },
  bukrs: { label: 'Company Code' },
  butxt: { label: 'Company Name' },
  zcom_id: { label: 'TSF Entity' },
  ztsf_deal_id: { label: 'TSF Deal ID' },
  ztsf_mc_ref_no: { label: 'MC Reference No' },
  ltx: { label: 'Product Type' },
  txn_status: { label: 'Status', type: 'status' },
  kontrh: { label: 'Business Partner' },
  bp_name: { label: 'Partner Name' },
  gsppart: { label: 'Contact Person' },
  bs_1: { label: 'Buy/Sell' },
  cpair: { label: 'Currency Pair' },
  curr1: { label: 'Currency 1' },
  amt1: { label: 'Amount 1', type: 'amount' },
  curr2: { label: 'Currency 2' },
  amt2: { label: 'Amount 2', type: 'amount' },
  dblfz: { label: 'Trade Date', type: 'date' },
  delfz: { label: 'Value Date', type: 'date' },
  ndf_date: { label: 'Fixing Date', type: 'date' },
  ndf_ref: { label: 'Fixing Reference ID' },
  ospot: { label: 'Spot Rate', type: 'rate' },
  oswap: { label: 'Swap Rate', type: 'rate' },
  otot_rate: { label: 'All in Rate', type: 'rate' },
  ndf_rate: { label: 'NDF Rate', type: 'rate' },
  cash_curr: { label: 'Cash Currency' },
  zcash_amt: { label: 'Cash Amount', type: 'amount' },
  fi_doc: { label: 'FI Document', type: 'fidoc' },
  nordext: { label: 'External Reference' },
  refer: { label: 'Internal Reference' },
  rdealer: { label: 'Trader' },
  rportb: { label: 'Portfolio' },
  xportb: { label: 'Accounting Category' },
  fo_remark: { label: 'FO Remark' },
  mo_remark: { label: 'MO Remark' },
  ndf_fo_rem: { label: 'NDF FO Remark' },
  ndf_mo_rem: { label: 'NDF MO Remark' },
  cruser: { label: 'Entered By' },
  dcrdat: { label: 'Entered On', type: 'date' },
  upuser: { label: 'Last Changed By' },
  dupdat: { label: 'Changed On', type: 'date' },
}

/** Layout variants (REUSE_ALV_VARIANT_F4 value help). The real list lives in SAP — these are dummy variants. */
export const LAYOUT_VARIANTS: LayoutVariant[] = [
  { id: '/DEFAULT', text: 'Default layout', cols: ['rfha', 'bukrs', 'zcom_id', 'ztsf_deal_id', 'txn_status', 'bp_name', 'cpair', 'bs_1', 'delfz', 'ndf_date', 'ndf_rate', 'cash_curr', 'zcash_amt', 'fi_doc'] },
  { id: '/BANKSETTLE', text: 'Bank settlement', cols: ['rfha', 'bukrs', 'butxt', 'kontrh', 'bp_name', 'gsppart', 'delfz', 'cash_curr', 'zcash_amt', 'ndf_ref', 'nordext', 'fi_doc'] },
  { id: '/RATES', text: 'Rates and amounts', cols: ['rfha', 'bukrs', 'cpair', 'bs_1', 'curr1', 'amt1', 'curr2', 'amt2', 'ospot', 'oswap', 'otot_rate', 'ndf_rate', 'zcash_amt', 'cash_curr'] },
  { id: '/AUDIT', text: 'Remarks and audit', cols: ['rfha', 'bukrs', 'rdealer', 'cruser', 'dcrdat', 'upuser', 'dupdat', 'fo_remark', 'mo_remark', 'ndf_fo_rem', 'ndf_mo_rem'] },
]

/** The screen's initial (and Reset) selection. */
export const DEFAULTS = {
  bukrs: ['IN11', 'TH10', 'VN10'],
  dateFrom: '2026-10-01',
  dateTo: '2026-10-31',
  rfha: '',
  layout: '/DEFAULT',
  pageSize: 20,
} as const

export const PAGE_SIZES = [8, 12, 20] as const

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
export const CALENDAR_FIRST_YEAR = 2020
export const CALENDAR_LAST_YEAR = 2035

export const TOAST_MS = 3200
/** Time the modal close animation runs before the overlay is removed. */
export const MODAL_CLOSE_MS = 160
/** Delay between Confirm and the action it runs, so the confirm dialog has faded out first. */
export const CONFIRM_DELAY_MS = 170
