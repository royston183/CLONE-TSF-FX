/*
 * House banks and their accounts (T012 / T012K), from ZFS_SB_HBKACCT_O4_API — entity set HouseBankAccount (service "housebank").
 * This is what the settlement screens' House Bank / Account ID fields (Execute Settlement, BO: Post Accounting Entries,
 * Invoice Finalisation's Assign House Bank) need as a value help; until now they were free text with the note
 * "T012 / T012K / T012T have no middleware resource".
 *
 * HouseBankAccount is read-only (not insertable, updatable or deletable); its key is CompanyCode + HouseBank + HouseBankAccount.
 * Property names are matched case-insensitively, with SAP's own spellings (BUKRS / HBKID / HKTID) as a fallback. A row without a
 * house bank id and an account id is dropped, never invented.
 */
import { list, odataString, service } from '@tsfx/ref/api-client'

const api = service('housebank')

/** One house bank account of a company code. */
export type HouseBankAccount = {
  companyCode: string
  houseBank: string
  accountId: string
  currency: string
  /** BankAccountDescription. */
  description: string
  /** BankName: the name of the financial institution. */
  bankName: string
  glAccount: string
}

type Row = Record<string, unknown>

const NAMES = {
  companyCode: ['CompanyCode', 'Bukrs'],
  houseBank: ['HouseBank', 'HouseBankId', 'HouseBankID', 'Hbkid', 'HBKID'],
  accountId: ['HouseBankAccount', 'HouseBankAccountId', 'HouseBankAccountID', 'AccountId', 'AccountID', 'Hktid', 'HKTID'],
  currency: ['BankAccountCurrency', 'Currency', 'Waers'],
  description: ['BankAccountDescription', 'AccountDescription', 'Text1'],
  bankName: ['BankName'],
  glAccount: ['GLAccount', 'Hkont'],
} as const

const pick = (row: Row, names: readonly string[]): string => {
  const lower = new Map(Object.keys(row).map((k) => [k.toLowerCase(), k]))
  for (const n of names) {
    const key = lower.get(n.toLowerCase())
    const v = key === undefined ? undefined : row[key]
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim()
  }
  return ''
}

/** A service row as a house bank account, or null when it names no house bank or no account. */
export function toHouseBankAccount(row: Row): HouseBankAccount | null {
  const out: HouseBankAccount = {
    companyCode: pick(row, NAMES.companyCode),
    houseBank: pick(row, NAMES.houseBank),
    accountId: pick(row, NAMES.accountId),
    currency: pick(row, NAMES.currency),
    description: pick(row, NAMES.description),
    bankName: pick(row, NAMES.bankName),
    glAccount: pick(row, NAMES.glAccount),
  }
  return out.houseBank && out.accountId ? out : null
}

/** The distinct accounts of the rows, sorted by house bank then account. */
export function houseBankAccounts(rows: readonly Row[]): HouseBankAccount[] {
  const seen = new Set<string>()
  const out: HouseBankAccount[] = []
  for (const r of rows) {
    const a = toHouseBankAccount(r)
    if (!a) continue
    const key = `${a.companyCode}|${a.houseBank}|${a.accountId}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(a)
  }
  return out.sort((a, b) => a.houseBank.localeCompare(b.houseBank) || a.accountId.localeCompare(b.accountId))
}

/**
 * The house bank accounts, of one company code when given. The company filter is applied here as well as in the query, so a
 * service that ignores the filter (or names the column differently) still answers with the right company's accounts.
 */
export async function loadHouseBankAccounts(companyCode = '', signal?: AbortSignal): Promise<HouseBankAccount[]> {
  const rows = await list<Row>(api('HouseBankAccount'), companyCode ? { filter: `CompanyCode eq ${odataString(companyCode)}`, top: 5000 } : { top: 5000 }, signal ? { signal } : undefined)
  const all = houseBankAccounts(rows)
  return companyCode ? all.filter((a) => !a.companyCode || a.companyCode === companyCode) : all
}
