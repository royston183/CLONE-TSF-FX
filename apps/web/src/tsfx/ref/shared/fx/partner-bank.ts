/*
 * Partner banks (BUT0BK) of a business partner, from ZFS_SB_SLCTSFBPBANK_O4_API — entity set SlcTsfBpBank (service "slctsfbpbank").
 * This is the value help of MODULE get_ptnr_bank on Generate Invoices' "Update House Bank / Account ID" popup.
 *
 * Property names are matched case-insensitively, with SAP's own spellings (BKVID) as a fallback. A row without a bank detail id
 * is dropped, never invented.
 */
import { list, odataString, service } from '@tsfx/ref/api-client'

const api = service('slctsfbpbank')

/** One bank detail (BUT0BK) of a business partner. */
export type PartnerBank = {
  businessPartner: string
  companyCode: string
  /** The bank details id (BUT0BK-BKVID), what ZPTNR_BKID stores. */
  bankId: string
  bankName: string
}

type Row = Record<string, unknown>

const NAMES = {
  businessPartner: ['BusinessPartner', 'Partner'],
  companyCode: ['CompanyCode', 'Bukrs'],
  bankId: ['BankIdentification', 'BankDetailId', 'BankDetailID', 'BankId', 'BankID', 'PartnerBank', 'Bkvid', 'BKVID'],
  bankName: ['BankName', 'BankAccountHolderName'],
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

/** A service row as a partner bank, or null when it names no bank detail id. */
export function toPartnerBank(row: Row): PartnerBank | null {
  const out: PartnerBank = {
    businessPartner: pick(row, NAMES.businessPartner),
    companyCode: pick(row, NAMES.companyCode),
    bankId: pick(row, NAMES.bankId),
    bankName: pick(row, NAMES.bankName),
  }
  return out.bankId ? out : null
}

/** The distinct bank detail ids of the rows, sorted. */
export function partnerBanks(rows: readonly Row[]): PartnerBank[] {
  const seen = new Set<string>()
  const out: PartnerBank[] = []
  for (const r of rows) {
    const b = toPartnerBank(r)
    if (!b || seen.has(b.bankId)) continue
    seen.add(b.bankId)
    out.push(b)
  }
  return out.sort((a, b) => a.bankId.localeCompare(b.bankId))
}

/** The partner banks of one business partner. The partner filter is applied here as well as in the query. */
export async function loadPartnerBanks(businessPartner: string, signal?: AbortSignal, companyCode = ''): Promise<PartnerBank[]> {
  if (!businessPartner) return []
  const filter = `BusinessPartner eq ${odataString(businessPartner)}` + (companyCode ? ` and CompanyCode eq ${odataString(companyCode)}` : '')
  const rows = await list<Row>(api('SlcTsfBpBank'), { filter, top: 5000 }, signal ? { signal } : undefined)
  // Scope before deduplicating IDs: the same USD1 ID can occur in different companies.
  const scoped = rows.filter((r) => {
    const bank = toPartnerBank(r)
    return bank && (!bank.businessPartner || bank.businessPartner === businessPartner) && (!companyCode || bank.companyCode === companyCode)
  })
  return partnerBanks(scoped)
}
