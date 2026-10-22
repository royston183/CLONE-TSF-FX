import type { FxTransaction } from '../mo-fx-deal-confirmation/api.ts'
import type { TrmFxApp } from '../../shared/fx/app-str.ts'
import type { FxRow } from '../../shared/fx/mw.ts'

export type Basis = 'blotter' | 'trade' | 'value'
export type Selection = { company: string; from: string; to: string; basis: Basis }
export type Filters = {
  search: string; type: string; status: string; trader: string; traderGroup: string
  businessArea: string; profitCenter: string; partner: string; deal: string; txnType: string; pair: string
}
export type Lookups = { companies: { code: string; name: string }[]; traders: { code: string; name: string }[]; notice: string }
export type Source = { fx: FxTransaction; app?: TrmFxApp | undefined }
export type Row = {
  id: string; company: string; deal: string; source: string; product: string
  blotter: string; trade: string; value: string; bs1: string; c1: string; a1: number | null
  bs2: string; c2: string; a2: number | null; rate: number | null; spot: number | null; swap: number | null; quotation: string
  ndfDate: string; ndfRef: string; partner: string; partnerName: string; bankRef: string
  statusCode: string; status: string; businessArea: string; profitCenter: string
  txnType: string; pair: string; traderGroup: string; tradeCategory: string; requestor: string
  trader: string; traderCode: string; tsf: string; tradeCatCode: string; acctCat: string
  intExt: string; dealId: string; remark: string; reversed: boolean
}
export type Column = { field: keyof Row; label: string; kind?: 'date' | 'amount' | 'rate' }
export type Sort = { field: keyof Row; direction: 'asc' | 'desc' }
export type ReportDeps = {
  transactions: (selection: Selection, companies: readonly string[], signal?: AbortSignal) => Promise<Source[]>
  details: (source: readonly Source[], signal?: AbortSignal) => Promise<FxRow[]>
}
