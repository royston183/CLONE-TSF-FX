/**
 * The "Accounting Details" grids of the Transaction Settlement pop-up (ZSGTSF_RDEAL_TRD_INV screen 9003). SAP's own
 * grid works the lines out before posting (TBB1 account determination); no service serves that preview, so MO shows
 * only what BO has actually posted: the items of the FI documents of the transaction (FI Doc 1 = Sell, FI Doc 2 = Buy),
 * read from SAP. Until BO posts there is nothing to show, and the grid says so. Nothing is worked out or invented here.
 */
import { apiFetch, odataString, service } from '@slc/api-client'
import { findFxDocsInSap, readStoredFxDocs, type FxDocs } from '../bo-post-accounting-settlement/posting.ts'
import { dmyFromIso } from '../../shared/fx/sap.ts'
import { formatAmount } from './format.ts'

const fiApi = service('fiaccdoc')
const glApi = service('glaccount')

export type EntryLine = {
  dc: 'Dr' | 'Cr'
  coCode: string
  documentDate: string
  postingDate: string
  /** G/L account, else the customer / vendor the line is posted to. */
  account: string
  description: string
  amount: string
  currency: string
  profitCenter: string
  businessArea: string
}

export type PostedEntries = { document: string; fiscalYear: string; lines: EntryLine[] }
/** FI Doc 2 is the Buy side, FI Doc 1 the Sell side (as the grid's Doc No 1 / 2 columns). */
export type FxEntries = { buy: PostedEntries | null; sell: PostedEntries | null }

type Row = Record<string, unknown>
const text = (r: Row, k: string): string => String(r[k] ?? '').trim()

export type EntryPorts = {
  docs: (company: string, transaction: string, signal?: AbortSignal) => Promise<FxDocs | null>
  journal: (company: string, fiscalYear: string, document: string, signal?: AbortSignal) => Promise<Row | undefined>
  glName: (account: string, signal?: AbortSignal) => Promise<string>
}

export const livePorts: EntryPorts = {
  docs: async (company, transaction, signal) =>
    (await readStoredFxDocs(company, transaction, signal).catch(() => null)) ?? (await findFxDocsInSap(company, transaction, signal)),
  journal: async (company, fiscalYear, document, signal) => {
    const filter = `CompanyCode eq ${odataString(company)} and FiscalYear eq ${odataString(fiscalYear)} and AccountingDocument eq ${odataString(document)}`
    const body = await apiFetch<{ value?: Row[] }>(`${fiApi('JournalEntry')}?$filter=${encodeURIComponent(filter)}&$expand=_Item`, signal ? { signal } : undefined)
    return body?.value?.[0]
  },
  glName: async (account, signal) => {
    const params = new URLSearchParams({ $filter: `GLAccount eq ${odataString(account)} and Language eq 'E'`, $top: '1', $format: 'json' })
    const body = await apiFetch<{ d?: { results?: Row[] } }>(`${glApi('A_GLAccountText')}?${params.toString()}`, signal ? { signal } : undefined)
    return text(body?.d?.results?.[0] ?? {}, 'GLAccountName')
  },
}

/** One journal entry's items as grid lines: a positive amount is a debit, a negative one a credit. */
export function entryLines(entry: Row, names: ReadonlyMap<string, string>): EntryLine[] {
  const items = Array.isArray(entry['_Item']) ? (entry['_Item'] as Row[]) : []
  return items.map((i) => {
    const gl = text(i, 'GLAccount')
    const amount = Number(i['AmountInTransactionCurrency'] ?? 0)
    return {
      dc: amount < 0 ? 'Cr' : 'Dr',
      coCode: text(i, 'CompanyCode'),
      documentDate: dmyFromIso(entry['DocumentDate'] as string | null | undefined),
      postingDate: dmyFromIso(entry['PostingDate'] as string | null | undefined),
      account: gl || text(i, 'Customer') || text(i, 'Supplier'),
      description: gl ? (names.get(gl) ?? '') : '',
      amount: formatAmount(amount),
      currency: text(i, 'TransactionCurrency'),
      profitCenter: text(i, 'ProfitCenter'),
      businessArea: text(i, 'BusinessArea'),
    }
  })
}

async function oneSide(company: string, year: string, document: string, ports: EntryPorts, signal?: AbortSignal): Promise<PostedEntries | null> {
  if (!document) return null
  const entry = await ports.journal(company, year, document, signal)
  if (!entry) return { document, fiscalYear: year, lines: [] }
  const accounts = [...new Set((Array.isArray(entry['_Item']) ? (entry['_Item'] as Row[]) : []).map((i) => text(i, 'GLAccount')).filter(Boolean))]
  // The descriptions are a soft lookup: a failed one leaves the cell blank, never guessed.
  const names = new Map(await Promise.all(accounts.map(async (a): Promise<[string, string]> => [a, await ports.glName(a, signal).catch(() => '')])))
  return { document, fiscalYear: year, lines: entryLines(entry, names) }
}

/** The posted entries of one FX transaction; both sides null while nothing has been posted. */
export async function loadFxEntries(company: string, transaction: string, ports: EntryPorts = livePorts, signal?: AbortSignal): Promise<FxEntries> {
  const docs = await ports.docs(company, transaction, signal)
  if (!docs) return { buy: null, sell: null }
  const [buy, sell] = await Promise.all([
    oneSide(company, docs.year2, docs.doc2, ports, signal),
    oneSide(company, docs.year1, docs.doc1, ports, signal),
  ])
  return { buy, sell }
}
