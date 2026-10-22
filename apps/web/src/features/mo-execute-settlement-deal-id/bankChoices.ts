import { loadHouseBankAccounts, type HouseBankAccount } from '../../shared/fx/house-bank.ts'
import { loadPartnerBanks, type PartnerBank } from '../../shared/fx/partner-bank.ts'
import { messageOf } from '../../shared/fx/master-contract.ts'
import { isAbort, type FxRow } from '../../shared/fx/mw.ts'
import { txt } from '../../shared/fx/masters.ts'
import type { FxPostForm } from './types.ts'

export type BankCompany = { code: string; name: string; businessPartner: string }
export type BankChoices = { accounts: HouseBankAccount[]; partnerBanks: PartnerBank[]; accountError: string; partnerError: string }
export const EMPTY_BANK_CHOICES: BankChoices = { accounts: [], partnerBanks: [], accountError: '', partnerError: '' }

export function bankCompanies(rows: readonly FxRow[]): BankCompany[] {
  const companies = new Map<string, BankCompany>()
  for (const row of rows) {
    const code = txt(row, 'ZBUKRS')
    if (code && !companies.has(code)) companies.set(code, { code, name: txt(row, 'ZBUTXT'), businessPartner: txt(row, 'ZBP') })
  }
  return [...companies.values()].sort((a, b) => a.code.localeCompare(b.code))
}

export const accountsForCompany = (rows: readonly HouseBankAccount[], company: string) =>
  company ? rows.filter((r) => r.companyCode === company) : []

type BankPorts = {
  accounts: typeof loadHouseBankAccounts
  partnerBanks: typeof loadPartnerBanks
}

/** One failed value help must not remove the other; company and BP filters also guard ignored server filters. */
export async function loadBankChoices(company: string, businessPartner: string, signal?: AbortSignal, ports: BankPorts = { accounts: loadHouseBankAccounts, partnerBanks: loadPartnerBanks }): Promise<BankChoices> {
  if (!company) return { ...EMPTY_BANK_CHOICES }
  const [accounts, banks] = await Promise.allSettled([
    ports.accounts(company, signal),
    businessPartner ? ports.partnerBanks(businessPartner, signal, company) : Promise.resolve([] as PartnerBank[]),
  ])
  for (const result of [accounts, banks]) if (result.status === 'rejected' && isAbort(result.reason)) throw result.reason
  return {
    accounts: accounts.status === 'fulfilled' ? accountsForCompany(accounts.value, company) : [],
    partnerBanks: banks.status === 'fulfilled' ? banks.value.filter((r) => r.companyCode === company && r.businessPartner === businessPartner) : [],
    accountError: accounts.status === 'rejected' ? `Bank accounts could not be loaded: ${messageOf(accounts.reason)}` : '',
    partnerError: !businessPartner ? 'No company BP is configured for this company, so its bank-detail IDs cannot be listed.' : banks.status === 'rejected' ? `Company BP bank details could not be loaded: ${messageOf(banks.reason)}` : '',
  }
}

/** Changing company invalidates the old account and the old company's BP bank-detail ID. */
export function changeFxBankField<K extends keyof FxPostForm>(form: FxPostForm, key: K, value: FxPostForm[K]): FxPostForm {
  if (form[key] === value) return form
  if (key === 'bRecCoCode') return { ...form, bRecCoCode: String(value), bHouseBank: '', bAccountId: '', bPaymentId: '' }
  if (key === 'sPayCoCode') return { ...form, sPayCoCode: String(value), sHouseBank: '', sAccountId: '', sPaymentId: '' }
  if (key === 'bHouseBank') return { ...form, bHouseBank: String(value), bAccountId: '' }
  if (key === 'sHouseBank') return { ...form, sHouseBank: String(value), sAccountId: '' }
  if (key === 'remit' && value === true) return { ...form, remit: true, sBankId: '', sHouseBank: '', sAccountId: '' }
  return { ...form, [key]: value }
}

/**
 * Empty banks are valid for clearing/BP routes; a selected bank always needs a real account in its company. A required bank
 * is only enforced while the company has accounts to pick from: SAP holds no house bank for some companies (e.g. IN11), and
 * blocking Settlement Complete on a field that has no options would make the leg impossible to settle.
 */
export function bankSelectionError(company: string, houseBank: string, accountId: string, choices: BankChoices, loading: boolean, required = false): string {
  if (!houseBank && !accountId && !required) return ''
  if (!houseBank && !accountId && company && !loading && !choices.accountError && !choices.accounts.length) return ''
  if (!company) return 'Select a company code before selecting its bank account.'
  if (!houseBank || !accountId) return 'Select both a house bank and an account ID.'
  if (loading) return 'Bank accounts are still loading. Try again once they are available.'
  if (choices.accountError) return choices.accountError
  if (!choices.accounts.some((r) => r.companyCode === company && r.houseBank === houseBank && r.accountId === accountId)) {
    return `House bank ${houseBank} / account ${accountId} is not available for company ${company}. Select an account from the list.`
  }
  return ''
}
