// Static screen configuration only. Every list the screen offers comes from SAP (see api.ts);
// the legacy page's dummy masters now live in fixtures.ts for the tests.
import type { Column } from './types.ts'

/**
 * P_LAYOUT: the ABAP offers the user's ALV variants (LTDX, REUSE_ALV_VARIANT_F4). There is no
 * API for them, so only the default layout is selectable (see LAYOUT_WAITING in api.ts).
 */
export const LAYOUTS: readonly { value: string; label: string }[] = [{ value: '', label: 'Default Layout' }]

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
  { key: 'NDF_DATE', label: 'NDF Fixing Date', type: 'date' },
  { key: 'NDF_REF', label: 'NDF Ref', type: 'text' },
  { key: 'NDF_RATE', label: 'NDF Settlement Rate', type: 'rate' },
  { key: 'ZCASH_AMT', label: 'Cash Settlement Amount', type: 'number' },
  { key: 'CASH_CURR', label: 'Cash Currency', type: 'text' },
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
