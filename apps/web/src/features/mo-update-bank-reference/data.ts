// Dummy lookup masters from the original page (unchanged business data). The legacy screen
// never called an API; every deal is generated from these on demand.
import type { Column, Company, FxPair, MatchStatus, Partner, Portfolio, Trader, TxnStatus, TxnType } from './types.ts'

export const COMPANIES: readonly Company[] = [
  { code: 'AE13', name: 'Olam International DMCC' },
  { code: 'ES12', name: 'SEDA OUTSPAN IBERIA S.L.U' },
  { code: 'IN11', name: 'Olam Agri India Pvt Ltd' },
  { code: 'SG10', name: 'Olam Global Holdings Pte Ltd' },
  { code: 'TH10', name: 'Olam (Thailand) Ltd' },
  { code: 'US15', name: 'Olam Americas Inc' },
  { code: 'VN10', name: 'Olam Vietnam Limited' },
]

export const FX_PAIRS: readonly FxPair[] = [
  { pair: 'USD/INR', c1: 'USD', c2: 'INR', spot: 87.15 },
  { pair: 'USD/THB', c1: 'USD', c2: 'THB', spot: 34.2 },
  { pair: 'USD/VND', c1: 'USD', c2: 'VND', spot: 25150.0 },
  { pair: 'EUR/USD', c1: 'EUR', c2: 'USD', spot: 1.087 },
  { pair: 'USD/AED', c1: 'USD', c2: 'AED', spot: 3.6725 },
  { pair: 'USD/SGD', c1: 'USD', c2: 'SGD', spot: 1.312 },
  { pair: 'USD/CNH', c1: 'USD', c2: 'CNH', spot: 7.18 },
]

export const TRADERS: readonly Trader[] = [
  { code: 'SKHAN', name: 'S. Khan' },
  { code: 'SALVA', name: 'S. Alva' },
  { code: 'RGUPTA', name: 'R. Gupta' },
  { code: 'NPATEL', name: 'N. Patel' },
  { code: 'MTAN', name: 'M. Tan' },
]

export const PARTNERS: readonly Partner[] = [
  { code: 'P100234', name: 'HSBC' },
  { code: 'P100567', name: 'Citi' },
  { code: 'P100812', name: 'Standard Chartered' },
  { code: 'P101045', name: 'JPMorgan' },
  { code: 'P101390', name: 'Deutsche Bank' },
]

export const FX_TXN_TYPES: readonly TxnType[] = [
  { code: 'FWD', desc: 'Forward' },
  { code: 'SPT', desc: 'Spot' },
  { code: 'SWP', desc: 'FX Swap' },
  { code: 'NDF', desc: 'Non-Deliverable Forward' },
]

export const OP_TXN_TYPES: readonly TxnType[] = [
  { code: 'CALL', desc: 'Call Option' },
  { code: 'PUT', desc: 'Put Option' },
  { code: 'CPCB', desc: 'Call & Put Combo' },
]

export const TXN_STATUSES: readonly TxnStatus[] = ['Active', 'Pending', 'Settled']
export const MATCH_STATUSES: readonly MatchStatus[] = ['Matched', 'Unmatched']
export const PORTFOLIOS: readonly Portfolio[] = [
  { code: 'P0010', name: 'Trading Book' },
  { code: 'P0020', name: 'Hedging Book' },
  { code: 'P0030', name: 'Treasury Book' },
]
export const PROFIT_CENTERS: readonly string[] = ['PC-1001', 'PC-1002', 'PC-1003', 'PC-2001']
export const BUSINESS_AREAS: readonly string[] = ['BA01', 'BA02', 'BA03']

export const LAYOUTS: readonly { value: string; label: string }[] = [
  { value: '', label: 'Default Layout' },
  { value: 'STD', label: 'Standard View' },
  { value: 'MYVAR', label: 'My Layout' },
]

export const PAGE_SIZES: readonly number[] = [10, 15, 25, 50]
export const DEFAULT_PAGE_SIZE = 15

/**
 * Column definitions (confirmed FIELDCATALOG order). The OP list substitutes option-specific
 * fields for the FX-only rate fields, per the original's documented assumption.
 */
export const FX_COLUMNS: readonly Column[] = [
  { key: 'RFHA', label: 'Transaction', type: 'hotspot', pin: true },
  { key: 'BUKRS', label: 'Company Code', type: 'text' },
  { key: 'BUTXT', label: 'Company Name', type: 'text' },
  { key: 'SFHAART', label: 'Transaction Type', type: 'text' },
  { key: 'XTEXT', label: 'Type Description', type: 'text' },
  { key: 'CPAIR', label: 'Currency Pair', type: 'text' },
  { key: 'BS_1', label: 'Buy/Sell 1', type: 'text' },
  { key: 'CURR1', label: 'Currency 1', type: 'text' },
  { key: 'AMT1', label: 'Amount 1', type: 'number' },
  { key: 'BS_2', label: 'Buy/Sell 2', type: 'text' },
  { key: 'CURR2', label: 'Currency 2', type: 'text' },
  { key: 'AMT2', label: 'Amount 2', type: 'number' },
  { key: 'DBLFZ', label: 'Trade Date', type: 'date' },
  { key: 'DELFZ', label: 'Value Date', type: 'date' },
  { key: 'SPOT', label: 'Spot Rate', type: 'rate' },
  { key: 'SWAP', label: 'Swap Points', type: 'rate' },
  { key: 'TOT_RATE', label: 'All-in Rate', type: 'rate' },
  { key: 'RDEALER', label: 'Trader', type: 'text' },
  { key: 'BP_NAME', label: 'Partner Name', type: 'text' },
  { key: 'KONTRH', label: 'Partner Code', type: 'text' },
  { key: 'RBUSA', label: 'Business Area', type: 'text' },
  { key: 'RPORTB', label: 'Portfolio', type: 'text' },
  { key: 'PRCTR', label: 'Profit Center', type: 'text' },
  { key: 'TXN_STATUS', label: 'Txn Status', type: 'status' },
  { key: 'MAT_UNMAT', label: 'Match/Unmatch', type: 'status2' },
  { key: 'ZTSF_DEAL_ID', label: 'Deal ID', type: 'text' },
  { key: 'ZMC_REF_NO', label: 'MC Reference No', type: 'text' },
  { key: 'NORDEXT', label: 'External Reference', type: 'edit' },
  { key: 'ZOLAM_DEAL_NO', label: 'Int Ref', type: 'edit' },
]

export const OP_COLUMNS: readonly Column[] = [
  { key: 'RFHA', label: 'Transaction', type: 'hotspot', pin: true },
  { key: 'BUKRS', label: 'Company Code', type: 'text' },
  { key: 'BUTXT', label: 'Company Name', type: 'text' },
  { key: 'SFHAART', label: 'Transaction Type', type: 'text' },
  { key: 'XTEXT', label: 'Type Description', type: 'text' },
  { key: 'CPAIR', label: 'Currency Pair', type: 'text' },
  { key: 'OPTION_TYPE', label: 'Option Type', type: 'text' },
  { key: 'BS_1', label: 'Buy/Sell 1', type: 'text' },
  { key: 'CURR1', label: 'Currency 1', type: 'text' },
  { key: 'AMT1', label: 'Amount 1', type: 'number' },
  { key: 'STRIKE_RATE', label: 'Strike Rate', type: 'rate' },
  { key: 'PREMIUM_AMT', label: 'Premium Amount', type: 'number' },
  { key: 'PREMIUM_CURR', label: 'Premium Currency', type: 'text' },
  { key: 'DBLFZ', label: 'Trade Date', type: 'date' },
  { key: 'DELFZ', label: 'Value Date', type: 'date' },
  { key: 'EXPIRY_DATE', label: 'Expiry Date', type: 'date' },
  { key: 'RDEALER', label: 'Trader', type: 'text' },
  { key: 'BP_NAME', label: 'Partner Name', type: 'text' },
  { key: 'KONTRH', label: 'Partner Code', type: 'text' },
  { key: 'RBUSA', label: 'Business Area', type: 'text' },
  { key: 'RPORTB', label: 'Portfolio', type: 'text' },
  { key: 'PRCTR', label: 'Profit Center', type: 'text' },
  { key: 'TXN_STATUS', label: 'Txn Status', type: 'status' },
  { key: 'MAT_UNMAT', label: 'Match/Unmatch', type: 'status2' },
  { key: 'ZTSF_DEAL_ID', label: 'Deal ID', type: 'text' },
  { key: 'ZMC_REF_NO', label: 'MC Reference No', type: 'text' },
  { key: 'NORDEXT', label: 'External Reference', type: 'edit' },
  { key: 'ZOLAM_DEAL_NO', label: 'Int Ref', type: 'edit' },
]
