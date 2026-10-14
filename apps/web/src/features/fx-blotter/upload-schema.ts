import type { UploadRow } from './types.ts'

/** Exact positional layout of TY_UPD in ZSGTSF_PFX_BLOTTER_TSFMUPD_TOP. */
export const UPLOAD_COLUMNS: ReadonlyArray<{ header: string; field: keyof UploadRow; label: string; length: number }> = [
  { header: 'BUKRS', field: 'companyCode', label: 'Company Code', length: 4 },
  { header: 'T_DATE', field: 'tradeDate', label: 'Trade Date', length: 20 },
  { header: 'BP', field: 'bp', label: 'Business Partner code or short name', length: 20 },
  { header: 'PC', field: 'profitCenter', label: 'Profit Center', length: 10 },
  { header: 'UNIT', field: 'businessArea', label: 'Business Area', length: 10 },
  { header: 'TYP', field: 'txnType', label: 'Transaction Type', length: 20 },
  { header: 'T_CURR', field: 'curr1', label: 'Currency 1', length: 20 },
  { header: 'T_AMT', field: 'amt1', label: 'Amount 1', length: 20 },
  { header: 'O_CURR', field: 'curr2', label: 'Currency 2', length: 20 },
  { header: 'DEAL', field: 'deal', label: 'Olam Deal Number', length: 30 },
  { header: 'BUY_SELL', field: 'buySell', label: 'Buy / Sell (B, S, 1 or 2)', length: 30 },
  { header: 'V_DATE', field: 'valueDate', label: 'Value Date', length: 20 },
  { header: 'ALL_RATE', field: 'totalRate', label: 'All in Rate', length: 30 },
  { header: 'SWAP', field: 'swap', label: 'Swap Rate', length: 30 },
  { header: 'SPOT', field: 'spot', label: 'Spot Rate', length: 30 },
  { header: 'NDF_DATE', field: 'ndfDate', label: 'NDF Fixing Date', length: 10 },
  { header: 'NDF_REF', field: 'ndfRef', label: 'NDF Fixing Reference', length: 30 },
  { header: 'MOT', field: 'assignment', label: 'Mode of Trade', length: 50 },
  { header: 'REMARK', field: 'remark', label: 'Remark', length: 100 },
  { header: 'EXT_REF', field: 'externalRef', label: 'External Reference', length: 16 },
  { header: 'MC_REF', field: 'mcRef', label: 'Master Contract Reference', length: 10 },
  { header: 'ZTSF_DEAL_ID', field: 'dealId', label: 'Deal ID', length: 30 },
  { header: 'DEAL_DESC', field: 'dealDesc', label: 'Deal Description', length: 70 },
  { header: 'ZDEAL_TYPE', field: 'dealType', label: 'Deal Type', length: 2 },
  { header: 'ZDEAL_SEQ', field: 'dealSeq', label: 'Deal Sequence', length: 2 },
  { header: 'ZBLOTR_DATE', field: 'blotterDate', label: 'Blotter Date', length: 15 },
  { header: 'ZFIN_PROJ', field: 'financeProject', label: 'Finance Project', length: 100 },
  { header: 'ZTXN_STATUS', field: 'txnStatus', label: 'Transaction Status', length: 100 },
  { header: 'ZMO_REMARK', field: 'moRemark', label: 'MO Remark', length: 100 },
  { header: 'ZFO_REMARK', field: 'foRemark', label: 'FO Remark', length: 100 },
]

/** Unlike the grid parser, rejects dates such as 31 February rather than rolling them into March. */
export function parseUploadDate(raw: string): Date | null {
  const s = raw.trim()
  const local = /^(\d{2})[-./](\d{2})[-./](\d{4})$/.exec(s)
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!local && !iso) return null
  const year = Number(local?.[3] ?? iso?.[1])
  const month = Number(local?.[2] ?? iso?.[2])
  const day = Number(local?.[1] ?? iso?.[3])
  const date = new Date(year, month - 1, day)
  return year >= 1900 && date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null
}

export function uploadNumber(raw: string): number {
  const s = raw.trim()
  if (!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(s)) return NaN
  return Number(s.replace(/,/g, ''))
}

export const UPLOAD_LEVEL_LABELS = { CREATE: 'Create Deal', CONTRACT: 'Contract / Release to MO', SETTLEMENT: 'Settlement' } as const
