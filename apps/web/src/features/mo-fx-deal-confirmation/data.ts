/**
 * The screen's own constants: the status texts it shows and the deal table's columns.
 *
 * No runtime sample data: the legacy page's dummy deals, company codes, partners and traders moved to
 * fixtures.ts (tests only). Company codes and traders now come from SAP (api.ts); the deal queue is
 * WAITING FOR API because ZSGTSFR024's ABAP source is not exported.
 */
import type { Column, DealStatus } from './types.ts'

export const STATUS = {
  UNMATCHED: 'FO->MO: Unmatched',
  CORRECTION: 'MO->FO: Correction Required',
  MATCHED: 'Matched & Released',
} as const satisfies Record<string, DealStatus>

export const STATUSES: DealStatus[] = [STATUS.UNMATCHED, STATUS.CORRECTION, STATUS.MATCHED]

/** The deal table's columns, in the page's order. Only those marked sortable take a header click. */
export const COLUMNS: Column[] = [
  { key: 'select', label: '' },
  { key: 'dealId', label: 'Deal ID', sortable: true },
  { key: 'coCode', label: 'CoCode', sortable: true },
  { key: 'transaction', label: 'Transaction', sortable: true },
  { key: 'partnerName', label: 'Partner Name', sortable: true },
  { key: 'txnTypeDesc', label: 'Transaction Type Description' },
  { key: 'tradeDate', label: 'Trade Date', sortable: true, type: 'date' },
  { key: 'buySell1', label: 'Buy/Sell 1' },
  { key: 'currency1', label: 'Currency 1', sortable: true },
  { key: 'amount1', label: 'Amount 1', sortable: true, type: 'amount' },
  { key: 'buySell2', label: 'Buy/Sell 2' },
  { key: 'currency2', label: 'Currency 2' },
  { key: 'amount2', label: 'Amount 2', type: 'amount' },
  { key: 'fixingDate', label: 'Fixing Date', sortable: true, type: 'date' },
  { key: 'valueDate', label: 'Value Date', sortable: true, type: 'date' },
  { key: 'allInRate', label: 'All in Rate', type: 'rate' },
  { key: 'status', label: 'Txn Status Desc', sortable: true },
  { key: 'traderName', label: 'Trader Name', sortable: true },
  { key: 'groupDesc', label: 'Group Description' },
  { key: 'companyName', label: 'Company Name' },
  { key: 'profitCenterDesc', label: 'Profit Center Description' },
  { key: 'businessAreaDesc', label: 'Business Area Description' },
  { key: 'accounting', label: 'Accounting' },
  { key: 'assignment', label: 'Assignment' },
  { key: 'traderShort', label: 'Trader' },
  { key: 'fixRefId', label: 'Fix.Ref.ID' },
  { key: 'foRemark', label: 'FO Remark' },
  { key: 'moRemark', label: 'MO Remark' },
]
