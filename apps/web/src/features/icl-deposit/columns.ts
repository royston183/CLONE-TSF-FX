import { addDaysIso, calcDepositAmt, displayDate } from './calc.ts'
import type { EditColumn, MainColumn } from './types.ts'

export const MAIN_COLUMNS: readonly MainColumn[] = [
  { key: 'depositAmt', label: 'Deposit Amt', width: 105, number: true, compute: (r) => calcDepositAmt(r) },
  { key: 'ottkNo', label: 'OTTK No.', width: 90 },
  { key: 'ottkAmount', label: 'OTTK Amount', width: 105, number: true },
  { key: 'startDate', label: 'Start Date', width: 105, compute: (r) => displayDate(r.startDate) },
  { key: 'endDate', label: 'End Date', width: 105, compute: (r) => displayDate(addDaysIso(r.startDate, r.noOfDays)) },
  { key: 'iclAmount', label: 'ICL Amount', width: 105, number: true, compute: (r) => calcDepositAmt(r) },
  { key: 'depositRequest', label: 'Deposit Request', width: 135 },
  { key: 'depositTxn', label: 'Deposit Txn', width: 105 },
  { key: 'dealId', label: 'Deal ID', width: 90 },
]

export const BANK_COLUMNS = [
  { key: 'coCd', label: 'CoCd' },
  { key: 'houseBank', label: 'House bk' },
  { key: 'bankKey', label: 'Bank Key' },
  { key: 'bankAccount', label: 'Bank Account' },
  { key: 'bankName', label: 'Name of bank' },
  { key: 'currency', label: 'Crcy' },
  { key: 'partnerBank', label: 'PBank' },
] as const

export const DEPOSIT_COLUMNS: readonly EditColumn[] = [
  { label: 'Dep. ID', width: 90 },
  { label: 'OTTK Trade Value', width: 140 },
  { label: 'Deposit Amount', width: 140 },
  { label: 'Int Rate', width: 95 },
  { label: 'Fixing', width: 90 },
  { label: 'Start Date', width: 110 },
  { label: 'End Date', width: 110 },
  { label: 'Deposit Txn', width: 110 },
  { label: 'Save', width: 90 },
  { label: 'Create', width: 90 },
]

export const ICL_COLUMNS: readonly EditColumn[] = [
  { label: 'OTTK Trade Value', width: 140 },
  { label: 'ICL Request Amount', width: 150 },
  { label: 'Start Date', width: 110 },
  { label: 'Planned End Date', width: 125 },
  { label: 'Direct/Indirect Payment', width: 230 },
  { label: 'Payment ID (Pay To)', width: 170, required: true },
  { label: 'Request No', width: 110 },
  { label: 'Create', width: 90 },
]
