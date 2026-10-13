import type { BankColumn, HeaderColumn, ListColumn } from './types.ts'

export const LIST_COLUMNS: readonly ListColumn[] = [
  { key: 'entityString', label: 'Entity String', width: 190 },
  { key: 'dealId', label: 'Deal ID', width: 100 },
  { key: 'ottkNo', label: 'OTTK No', width: 90 },
  { key: 'dttkNo', label: 'DTTK No', width: 90 },
  { key: 'ottkValue', label: 'OTTK Value', width: 115, number: true },
  { key: 'ottkCurr', label: 'OTTK Curr', width: 85 },
  { key: 'lcApp', label: 'LC App.', width: 80 },
  { key: 'ottkStatDesc', label: 'OTTK Stat Desc', width: 180 },
  { key: 'ottkBankDesc', label: 'OTTK Bank Desc', width: 260 },
  { key: 'trader', label: 'Trader', width: 105 },
  { key: 'requestNo', label: 'ICL Request No', width: 120 },
]

/** The original gives the bank picker no widths, so every column falls back to 110px. */
export const BANK_COLUMNS: readonly BankColumn[] = [
  { key: 'coCd', label: 'CoCd', width: 110 },
  { key: 'houseBank', label: 'House bk', width: 110 },
  { key: 'bankKey', label: 'Bank Key', width: 110 },
  { key: 'bankAccount', label: 'Bank Account', width: 110 },
  { key: 'bankName', label: 'Name of bank', width: 110 },
  { key: 'currency', label: 'Crcy', width: 110 },
  { key: 'partnerBank', label: 'PBank', width: 110 },
]

export const DEPOSIT_COLUMNS: readonly HeaderColumn[] = [
  { label: 'Dep. ID', width: 85 },
  { label: 'OTTK Trade Value', width: 140 },
  { label: 'Deposit Amount', width: 140 },
  { label: 'Int Rate', width: 95 },
  { label: 'Fixing', width: 90 },
  { label: 'Start Date', width: 110 },
  { label: 'End Date', width: 110 },
  { label: 'Deposit Txn', width: 110 },
  { label: 'Save', width: 90 },
]

export const ICL_COLUMNS: readonly HeaderColumn[] = [
  { label: 'OTTK Trade Value', width: 140 },
  { label: 'ICL Request Amount', width: 150 },
  { label: 'Start Date', width: 110 },
  { label: 'Planned End Date', width: 125 },
  { label: 'Direct/Indirect Payment', width: 230 },
  { label: 'Payment ID (Pay To)', width: 170, required: true },
  { label: 'Request No', width: 110 },
  { label: 'Create', width: 90 },
]
