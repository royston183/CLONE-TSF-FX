/**
 * The live accounting postings of BO: Post Accounting Entries for Settlement (ZSGTSFR081 / ZSGTSF_RDEAL_TRD_POST).
 *
 *   FX deal         ZFS_SB_TRMFLOWPOST_O4_API, static action PostFlows on TreasuryFlow: TB_DEAL_FIX_POST_PAR, the engine
 *                   behind RFTBBB00 / TBB1, for one transaction. A test run rolls back and returns no document. A real run
 *                   returns one row per FI document; the transaction's TXN_STATUS then moves to 50 on TrmFxApp
 *                   (POST_STAT_UPDATE).
 *   Trade invoice   ZFS_SB_FIACCDOC_O4_API, deep insert JournalEntry + _Item: BAPI_ACC_DOCUMENT_POST (BAPI_ACC_DOCUMENT_CHECK
 *                   for a test run). The lines come from the leg's ZSGTSFTR_TRD_POS row (the gateway's local SQLite) and
 *                   its ZSGTSFTR_TRD_ACC posting type (also local): ZBELNR, ZMSG are written back to that row.
 *
 * Guarantees (docs/abap/BO-SETTLEMENT-POSTING-BLOCKER.md): the leg is re-read right before posting and refused when it
 * already has a document; a result the service did not confirm (timeout, 5xx) is stored as UNCONFIRMED and blocks a
 * retry until the document, if SAP holds one, is found by its reference; ZBELNR is only ever a number SAP returned;
 * a test run writes nothing.
 *
 * Property names are those the SAP behaviour implementations use (CDS ZFS_CE_FIACCDOCTP / ..ITEMTP, abstract entity
 * ZFS_AE_TRMFLOWPOSTRESULT), checked against both services' $metadata on 13 October 2026. AmountInTransactionCurrency is an
 * Edm.Decimal and travels as a JSON number: SAP refuses it as a string.
 */
import { apiFetch, apiRequest, odataString, service } from '@slc/api-client'
import { messageOf } from '../../shared/fx/master-contract.ts'
import { updateAppStrRecord, type AppStrFields } from '../fx-blotter/appStr.ts'
import type { FxLeg } from './types.ts'

/** Off by default: the screen keeps its browser-only demo posting until this is switched on (VITE_BO_LIVE_POSTING=true). */
export const LIVE_POSTING = (import.meta as { env?: Record<string, string | undefined> }).env?.['VITE_BO_LIVE_POSTING'] === 'true'

const flowApi = service('trmflowpost')
const fiApi = service('fiaccdoc')
const tradePositionApi = service('localdb')('tsf-trade-position')
const postingTypeApi = service('localdb')('tsf-posting-type')
const fxPostDocApi = service('localdb')('tsf-fx-post-doc')

export const POST_FLOWS_ACTION = 'com.sap.gateway.srvd_a2x.zfs_sd_trmflowpost.v0001.PostFlows'
/** TXN_STATUS "Bank Settlement Completed" (ZSGTSFTR_TXNSTAT): what POST_STAT_UPDATE sets once flows are posted. */
export const TXN_POSTED = '50'
export const UNCONFIRMED = 'UNCONFIRMED'

const text = (r: Record<string, unknown>, k: string): string => String(r[k] ?? '').trim()
const clip = (v: string, n: number): string => v.trim().slice(0, n)
const isoToday = (): string => new Date().toISOString().slice(0, 10)
const ymd = (iso: string): string => iso.replace(/-/g, '')

/* ------------------------------------------------------------------ FX deal: PostFlows */

export type FlowDoc = { companyCode: string; transaction: string; fiscalYear: string; document: string; referenceKey: string; valuationArea: string }

export type FxPostOutcome = { ok: true; test: boolean; docs: FlowDoc[]; message: string } | { ok: false; message: string }

/** One TreasuryFlow row: FinTransFlowPostingStatus '2' is posted; only a released flow (FinTransFlowPostingRelease) is posted by TBB1. */
export type FlowState = { paymentDate: string; status: string; released: boolean }

/** FinTransFlowPostingStatus of a posted flow. */
export const FLOW_POSTED = '2'

export type FxPostDeps = {
  postFlows: (p: { CompanyCode: string; FinancialTransaction: string; PostingDate: string; DocumentDate: string; DueDate: string; TestRun: boolean }) => Promise<Record<string, unknown>[]>
  readFlows: (companyCode: string, transaction: string) => Promise<FlowState[]>
  setTxnStatus: (companyCode: string, transaction: string, fields: AppStrFields) => Promise<void>
  /** Keeps the documents SAP returned (local TSF_FX_POST_DOC): BKPF has no resource to read them back from. */
  saveDocs: (companyCode: string, transaction: string, docs: readonly FlowDoc[], message: string) => Promise<void>
}

/** FI Doc 1 / 2 of an FX leg, with their fiscal years. */
export type FxDocs = { doc1: string; year1: string; doc2: string; year2: string }

const pkey = (companyCode: string, transaction: string) => `${fxPostDocApi}/${encodeURIComponent(companyCode)}/${encodeURIComponent(transaction)}`

/** The documents BO stored for a leg's posting; null when none are stored. */
export async function readStoredFxDocs(companyCode: string, transaction: string, signal?: AbortSignal): Promise<FxDocs | null> {
  try {
    const r = await apiFetch<Record<string, unknown>>(pkey(companyCode, transaction), signal ? { signal } : undefined)
    const docs = { doc1: text(r, 'ZDOC1'), year1: text(r, 'ZGJAHR1'), doc2: text(r, 'ZDOC2'), year2: text(r, 'ZGJAHR2') }
    return docs.doc1 || docs.doc2 ? docs : null
  } catch (error) {
    if ((error as { status?: number }).status === 404) return null
    throw error
  }
}

/**
 * A posted leg with no stored documents (posted before they were kept, or elsewhere in TBB1): the journal entries SAP
 * holds in its company code whose reference is the transaction number, oldest first. Display only, never stored.
 */
export async function findFxDocsInSap(companyCode: string, transaction: string, signal?: AbortSignal): Promise<FxDocs | null> {
  const filter = `CompanyCode eq ${odataString(companyCode)} and DocumentReferenceID eq ${odataString(transaction)}`
  const body = await apiFetch<{ value?: Record<string, unknown>[] }>(
    `${fiApi('JournalEntry')}?$filter=${encodeURIComponent(filter)}&$select=CompanyCode,FiscalYear,AccountingDocument`,
    signal ? { signal } : undefined,
  )
  const found = (body?.value ?? [])
    .map((r) => ({ year: text(r, 'FiscalYear'), doc: text(r, 'AccountingDocument') }))
    .filter((d) => d.doc)
    .sort((a, b) => a.year.localeCompare(b.year) || a.doc.localeCompare(b.doc))
  if (!found.length) return null
  return { doc1: found[0]!.doc, year1: found[0]!.year, doc2: found[1]?.doc ?? '', year2: found[1]?.year ?? '' }
}

export const defaultFxDeps: FxPostDeps = {
  postFlows: async (params) => {
    const url = `${flowApi('TreasuryFlow')}/${POST_FLOWS_ACTION}`
    const res = await apiRequest<{ value?: Record<string, unknown>[] } | Record<string, unknown>>(url, { method: 'POST', body: params })
    const body = res.data as { value?: Record<string, unknown>[] } | undefined
    return Array.isArray(body?.value) ? body.value : body && Object.keys(body).length ? [body as Record<string, unknown>] : []
  },
  readFlows: async (companyCode, transaction) => {
    const filter = `CompanyCode eq ${odataString(companyCode)} and FinancialTransaction eq ${odataString(transaction)}`
    const select = 'FinTransFlowPaymentDate,FinTransFlowPostingStatus,FinTransFlowPostingRelease'
    const body = await apiFetch<{ value?: Record<string, unknown>[] }>(`${flowApi('TreasuryFlow')}?$filter=${encodeURIComponent(filter)}&$select=${select}`)
    return (body?.value ?? []).map((r) => ({
      paymentDate: text(r, 'FinTransFlowPaymentDate'),
      status: text(r, 'FinTransFlowPostingStatus'),
      released: r['FinTransFlowPostingRelease'] === true,
    }))
  },
  setTxnStatus: updateAppStrRecord,
  saveDocs: async (companyCode, transaction, docs, message) => {
    await apiFetch(pkey(companyCode, transaction), {
      method: 'PUT',
      body: {
        ZDOC1: docs[0]?.document ?? '',
        ZGJAHR1: docs[0]?.fiscalYear ?? '',
        ZDOC2: docs[1]?.document ?? '',
        ZGJAHR2: docs[1]?.fiscalYear ?? '',
        ZMSG: clip(message, 255),
      },
    })
  },
}

/** The released flows TBB1 still has to post. */
const pendingFlows = (flows: readonly FlowState[]): FlowState[] => flows.filter((f) => f.released && f.status !== FLOW_POSTED)

export const toFlowDoc = (r: Record<string, unknown>): FlowDoc => ({
  companyCode: text(r, 'CompanyCode'),
  transaction: text(r, 'FinancialTransaction'),
  fiscalYear: text(r, 'FiscalYear'),
  document: text(r, 'AccountingDocument'),
  referenceKey: text(r, 'ReferenceKey'),
  valuationArea: text(r, 'ValuationArea'),
})

/**
 * Test or post one FX transaction (TBB1). `postingDate` / `dueDate` are ISO dates; the due date is RFTBBB00's p_dzterm
 * (flows due up to it). Not given, it is the latest payment date of the transaction's released, unposted flows: a
 * settled deal's flows fall due at maturity, so today would select none of them. A real run moves TXN_STATUS to 50
 * once no flow of the transaction is left unposted; the status write failing after SAP posted is reported as such,
 * never as a failed posting.
 *
 * PostFlows can commit the flows yet answer an empty list (no document numbers), so an empty answer is checked
 * against the flows' posting status before it is called "nothing posted".
 */
export async function postFxLeg(
  leg: Pick<FxLeg, 'entity' | 'rfha'>,
  opts: { testRun: boolean; postingDate?: string; dueDate?: string },
  deps: FxPostDeps = defaultFxDeps,
): Promise<FxPostOutcome> {
  const today = isoToday()
  let before: FlowState[]
  try {
    before = await deps.readFlows(leg.entity, leg.rfha)
  } catch (error) {
    return { ok: false, message: `The flows of transaction ${leg.rfha} could not be read: ${messageOf(error)}` }
  }
  const pending = pendingFlows(before)
  if (!pending.length) return { ok: false, message: `Transaction ${leg.rfha} has no released flow waiting to be posted.` }
  const dueDate = opts.dueDate || pending.map((f) => f.paymentDate).filter(Boolean).sort().at(-1) || today
  let rows: Record<string, unknown>[]
  try {
    rows = await deps.postFlows({
      CompanyCode: leg.entity,
      FinancialTransaction: leg.rfha,
      PostingDate: opts.postingDate || today,
      DocumentDate: today,
      DueDate: dueDate,
      TestRun: opts.testRun,
    })
  } catch (error) {
    return { ok: false, message: `${opts.testRun ? 'Test run' : 'Posting'} of transaction ${leg.rfha} refused by SAP: ${messageOf(error)}` }
  }
  const docs = rows.map(toFlowDoc).filter((d) => d.document || opts.testRun)
  if (opts.testRun) return { ok: true, test: true, docs: [], message: `Test run for transaction ${leg.rfha}: SAP found nothing to refuse. Nothing was posted.` }

  // The documents are kept before anything else can fail: SAP returns them only in this answer.
  let keepNote = ''
  if (docs.length) {
    const numbers = docs.map((d) => `${d.document}/${d.fiscalYear}`).join(', ')
    try {
      await deps.saveDocs(leg.entity, leg.rfha, docs, `Posted: FI ${numbers}`)
    } catch (error) {
      keepNote = ` The FI documents could not be stored for this screen (${messageOf(error)}): note ${numbers}.`
    }
  }
  const out = await afterPost(leg, docs, before, dueDate, deps)
  return keepNote ? { ...out, message: out.message + keepNote } : out
}

async function afterPost(leg: Pick<FxLeg, 'entity' | 'rfha'>, docs: FlowDoc[], before: FlowState[], dueDate: string, deps: FxPostDeps): Promise<FxPostOutcome> {
  let after: FlowState[]
  try {
    after = await deps.readFlows(leg.entity, leg.rfha)
  } catch (error) {
    if (!docs.length) return { ok: false, message: `SAP returned no document for transaction ${leg.rfha} and its flows could not be re-read (${messageOf(error)}). Check TBB1 / FTR_EDIT before posting again.` }
    const numbers = docs.map((d) => `${d.document}/${d.fiscalYear}`).join(', ')
    return { ok: true, test: false, docs, message: `Transaction ${leg.rfha} posted (FI ${numbers}), but its flows could not be re-read (${messageOf(error)}), so TXN_STATUS stays unchanged.` }
  }
  const posted = after.filter((f) => f.status === FLOW_POSTED).length - before.filter((f) => f.status === FLOW_POSTED).length
  if (!docs.length && !posted) return { ok: false, message: `SAP posted no document for transaction ${leg.rfha}: no flow was due for posting by ${dueDate} (status unchanged).` }
  const numbers = docs.length ? `FI ${docs.map((d) => `${d.document}/${d.fiscalYear}`).join(', ')}` : `${posted} flow(s) posted; SAP returned no FI document number`
  const open = after.filter((f) => f.status !== FLOW_POSTED).length
  if (open) return { ok: true, test: false, docs, message: `Transaction ${leg.rfha} posted (${numbers}), but ${open} flow(s) are still unposted (not released / blocked in SAP), so TXN_STATUS stays unchanged.` }
  try {
    await deps.setTxnStatus(leg.entity, leg.rfha, { TxnStatus: TXN_POSTED })
  } catch (error) {
    return { ok: true, test: false, docs, message: `Transaction ${leg.rfha} posted (${numbers}), but its TXN_STATUS could not be set to ${TXN_POSTED}: ${messageOf(error)}` }
  }
  return { ok: true, test: false, docs, message: `Transaction ${leg.rfha} posted: ${numbers}.` }
}

/* ------------------------------------------------------------------ trade invoice: FiAccDoc */

export type PositionRow = Record<string, unknown>
export type PostingType = Record<string, unknown>

/**
 * The line class of an account category (ZSGTSFTR_TRD_ACC ZDR_ACC / ZCR_ACC), as the ABAP's DEBIT / CREDIT forms read them:
 * 01 bank and 04 clearing are G/L lines, 03 a customer line, 02 a vendor line, and 05 / 06 a vendor line that also carries
 * the G/L (reconciliation) account. The posting key does not choose the account class; the category does.
 */
export function categoryLine(category: string): 'G' | 'K' | 'D' | null {
  switch (category) {
    case '01':
    case '04':
      return 'G'
    case '02':
    case '05':
    case '06':
      return 'K'
    case '03':
      return 'D'
    default:
      return null
  }
}

export type FiItem = {
  AccountingDocumentItem: string
  LineCategory: 'G' | 'K' | 'D'
  GLAccount?: string
  Supplier?: string
  Customer?: string
  TransactionCurrency: string
  AmountInTransactionCurrency: number
  ProfitCenter?: string
  BusinessArea?: string
  DocumentItemText?: string
  ValueDate?: string
}

export type FiDocBody = {
  CompanyCode: string
  DocumentDate: string
  PostingDate: string
  AccountingDocumentType: string
  DocumentReferenceID: string
  AccountingDocumentHeaderText: string
  TransactionCurrency: string
  TestRun: boolean
  _Item: FiItem[]
}

/** What a side of the stored row lacks to be posted: '' when complete. ZDR_ACCNT / ZCR_ACCNT are labels, never accounts. */
function sideIssue(row: PositionRow, side: 'DR' | 'CR'): string {
  const word = side === 'DR' ? 'debit' : 'credit'
  const category = text(row, `Z${side}_ACC`)
  const kind = categoryLine(category)
  if (!kind) return `has no ${word} account category (Z${side}_ACC '${category}')`
  if (kind === 'G' && !text(row, `Z${side}_GL`)) return `has no ${word} G/L account (Z${side}_GL)`
  if (kind !== 'G' && !text(row, `Z${side}_CV`)) return `has no ${word} ${kind === 'D' ? 'customer' : 'vendor'} number (Z${side}_CV)`
  return ''
}

const line = (row: PositionRow, side: 'DR' | 'CR', amount: number, currency: string, itemText: string, no: number, valueDate: string): FiItem => {
  const kind = categoryLine(text(row, `Z${side}_ACC`)) ?? 'G'
  const gl = text(row, `Z${side}_GL`)
  const partner = text(row, `Z${side}_CV`)
  const category = text(row, `Z${side}_ACC`)
  const signed = side === 'DR' ? amount : -amount
  return {
    AccountingDocumentItem: String(no),
    LineCategory: kind,
    ...(kind === 'G' ? { GLAccount: gl } : kind === 'D' ? { Customer: partner } : { Supplier: partner, ...(category !== '02' && gl ? { GLAccount: gl } : {}) }),
    TransactionCurrency: currency,
    AmountInTransactionCurrency: Number(signed.toFixed(2)),
    ...(text(row, `Z${side}_PRCTR`) ? { ProfitCenter: text(row, `Z${side}_PRCTR`) } : {}),
    ...(text(row, `Z${side}_RBUSA`) ? { BusinessArea: text(row, `Z${side}_RBUSA`) } : {}),
    ...(itemText ? { DocumentItemText: clip(itemText, 50) } : {}),
    ValueDate: valueDate,
  }
}

export type BuildResult = { ok: true; body: FiDocBody } | { ok: false; message: string }

/** HEADER_DATA's header text: the posting type (S1 / P1 / S2 / P2 read as 01..04), a dash and the Deal ID. */
const headerText = (row: PositionRow): string => {
  const fi = text(row, 'ZFI_TYPE')
  const mapped = ({ S1: '01', P1: '02', S2: '03', P2: '04' } as Record<string, string>)[fi] ?? fi
  return clip(`${mapped} - ${text(row, 'ZDEAL_ID')}`, 25)
}

const sapToIso = (d: string): string => (/^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : '')

/**
 * The FI document of one trade invoice leg: HEADER_DATA / DEBIT / CREDIT of ZSGTSF_RDEAL_TRD_POST. Debit is the positive
 * line, credit the negative one, for ZPAY_AMT in ZSET_CURR; the lines come from the stored posting fields (ZDR_ACC / ZDR_CV /
 * ZDR_GL and the credit twins, filled by Update). Document date, posting date and value date are the leg's posting date
 * (ZP_DATE, else its due date). A leg missing what SAP cannot be asked to guess is refused with the field.
 * Kept from this app, not from the ABAP: the reference defaults to the Deal ID, because an unconfirmed posting is found again by it.
 */
export function buildFiDocument(row: PositionRow, acc: PostingType | undefined, opts: { testRun: boolean; postingDate?: string; today?: string }): BuildResult {
  const today = opts.today ?? isoToday()
  const name = `${text(row, 'ZT_TYPE')} (seq ${text(row, 'ZSEQ')})`
  const company = text(row, 'ZBUKRS')
  if (!company) return { ok: false, message: `${name} has no company code (ZBUKRS), so it cannot be posted.` }
  const currency = text(row, 'ZSET_CURR') || text(row, 'ZCURR')
  if (!currency) return { ok: false, message: `${name} has no settlement currency (ZSET_CURR).` }
  const amount = Math.abs(Number(row['ZPAY_AMT']))
  if (!Number.isFinite(amount) || amount === 0) return { ok: false, message: `${name} has no payment amount (ZPAY_AMT is zero): nothing to post.` }
  const gaps = (['DR', 'CR'] as const).map((side) => sideIssue(row, side)).filter(Boolean)
  if (gaps.length) return { ok: false, message: `${name} ${gaps.join(' and ')}: update its posting details first.` }
  const docType = text(row, 'ZDOC_TYPE') || (acc ? text(acc, 'ZDOC_TYPE') : '')
  if (!docType) return { ok: false, message: `${name} has no FI document type (ZDOC_TYPE).` }
  const posting = opts.postingDate || sapToIso(text(row, 'ZP_DATE')) || sapToIso(text(row, 'ZDUE_DATE')) || today
  return {
    ok: true,
    body: {
      CompanyCode: company,
      DocumentDate: posting,
      PostingDate: posting,
      AccountingDocumentType: docType,
      DocumentReferenceID: clip((acc ? text(acc, 'ZXBLNR1') : '') || text(row, 'ZDEAL_ID'), 16),
      AccountingDocumentHeaderText: headerText(row),
      TransactionCurrency: currency,
      TestRun: opts.testRun,
      _Item: [
        line(row, 'DR', amount, currency, acc ? text(acc, 'ZDR_TEXT') : '', 1, posting),
        line(row, 'CR', amount, currency, acc ? text(acc, 'ZCR_TEXT') : '', 2, posting),
      ],
    },
  }
}

export type InvPostDeps = {
  readPosition: (dealId: string, seq: string) => Promise<PositionRow | null>
  readPostingType: (fiType: string) => Promise<PostingType | undefined>
  /** The documents SAP holds for a company code + document reference (reconciliation after an unconfirmed attempt). */
  findByReference: (companyCode: string, reference: string) => Promise<{ fiscalYear: string; document: string }[]>
  postDocument: (body: FiDocBody) => Promise<{ fiscalYear: string; document: string }>
  writePosition: (dealId: string, seq: string, fields: Record<string, string | number>) => Promise<void>
}

export const defaultInvDeps: InvPostDeps = {
  readPosition: async (dealId, seq) => {
    try {
      return await apiFetch<PositionRow>(`${tradePositionApi}/${encodeURIComponent(dealId)}/${encodeURIComponent(seq)}`)
    } catch (error) {
      if ((error as { status?: number }).status === 404) return null
      throw error
    }
  },
  readPostingType: async (fiType) => {
    if (!fiType) return undefined
    try {
      return await apiFetch<PostingType>(`${postingTypeApi}/${encodeURIComponent(fiType)}`)
    } catch {
      return undefined
    }
  },
  findByReference: async (companyCode, reference) => {
    const filter = `CompanyCode eq ${odataString(companyCode)} and DocumentReferenceID eq ${odataString(reference)}`
    const body = await apiFetch<{ value?: Record<string, unknown>[] }>(`${fiApi('JournalEntry')}?$filter=${encodeURIComponent(filter)}&$select=CompanyCode,FiscalYear,AccountingDocument`)
    return (body?.value ?? []).map((r) => ({ fiscalYear: text(r, 'FiscalYear'), document: text(r, 'AccountingDocument') })).filter((d) => d.document)
  },
  postDocument: async (body) => {
    const res = await apiRequest<Record<string, unknown>>(fiApi('JournalEntry'), { method: 'POST', body })
    return { fiscalYear: text(res.data ?? {}, 'FiscalYear'), document: text(res.data ?? {}, 'AccountingDocument') }
  },
  writePosition: async (dealId, seq, fields) => {
    await apiFetch(`${tradePositionApi}/${encodeURIComponent(dealId)}/${encodeURIComponent(seq)}`, { method: 'PUT', body: fields })
  },
}

export type InvPostOutcome = { ok: true; test: boolean; document: string; message: string } | { ok: false; message: string }

/** An error with no HTTP answer, or a 5xx / timeout: SAP may or may not have posted. */
export const isUnconfirmed = (error: unknown): boolean => {
  const status = (error as { status?: number } | null)?.status
  return status === undefined || status === 0 || status >= 500
}

/**
 * Post (or test) one trade invoice leg. Re-reads the row first: a leg that has a document is refused, never posted twice.
 * After an UNCONFIRMED attempt the reference is looked up in SAP: exactly one document is adopted, several or an
 * unreadable lookup block the retry.
 */
export async function postInvoiceLeg(
  dealId: string,
  seq: string,
  opts: { testRun: boolean; postingDate?: string },
  deps: InvPostDeps = defaultInvDeps,
): Promise<InvPostOutcome> {
  let row: PositionRow | null
  try {
    row = await deps.readPosition(dealId, seq)
  } catch (error) {
    return { ok: false, message: `The settlement leg ${seq} of ${dealId} could not be read: ${messageOf(error)}` }
  }
  if (!row) return { ok: false, message: `No settlement leg ${seq} is stored for Deal ID ${dealId}.` }
  const name = text(row, 'ZT_TYPE') || seq
  if (text(row, 'ZBELNR')) return { ok: false, message: `${name} is already posted (FI document ${text(row, 'ZBELNR')}).` }
  if (text(row, 'ZPOST_CHECK') !== 'X') return { ok: false, message: `FI Posting is not set for ${name}, so it is not posted to accounting.` }
  if (text(row, 'ZEXE_CO') !== 'X') return { ok: false, message: `${name} is not settled yet: run Settlement Complete on MO: Execute Settlement for Deal ID first.` }

  const acc = await deps.readPostingType(text(row, 'ZFI_TYPE'))
  const built = buildFiDocument(row, acc, opts)
  if (!built.ok) return built

  if (!opts.testRun && text(row, 'ZMSG').startsWith(UNCONFIRMED)) {
    let found: { fiscalYear: string; document: string }[]
    try {
      found = await deps.findByReference(built.body.CompanyCode, built.body.DocumentReferenceID)
    } catch (error) {
      return { ok: false, message: `An earlier posting of ${name} was not confirmed and SAP could not be asked whether it exists (${messageOf(error)}). Check FB03 for reference ${built.body.DocumentReferenceID} before posting again.` }
    }
    if (found.length === 1) {
      await deps.writePosition(dealId, seq, { ZBELNR: found[0]!.document, ZMSG: 'Posted Successfully (recovered after timeout)' })
      return { ok: true, test: false, document: found[0]!.document, message: `${name}: SAP already held document ${found[0]!.document}/${found[0]!.fiscalYear} from the earlier attempt; it was recorded, nothing was posted again.` }
    }
    if (found.length > 1) {
      return { ok: false, message: `An earlier posting of ${name} was not confirmed and SAP holds ${found.length} documents with reference ${built.body.DocumentReferenceID}: ${found.map((d) => d.document).join(', ')}. Identify yours in FB03; nothing was posted.` }
    }
  }

  let result: { fiscalYear: string; document: string }
  try {
    result = await deps.postDocument(built.body)
  } catch (error) {
    const reason = messageOf(error)
    if (!opts.testRun) {
      const stamp = isUnconfirmed(error) ? `${UNCONFIRMED}: ${reason}` : reason
      await deps.writePosition(dealId, seq, { ZMSG: clip(stamp, 80) }).catch(() => undefined)
    }
    return {
      ok: false,
      message: isUnconfirmed(error)
        ? `SAP did not confirm the posting of ${name} (${reason}). It may exist: the next attempt looks for it by reference before posting.`
        : `${name} refused by SAP: ${reason}`,
    }
  }
  if (opts.testRun) return { ok: true, test: true, document: '', message: `Test run for ${name}: SAP found nothing to refuse. Nothing was posted.` }
  if (!result.document) return { ok: false, message: `SAP returned no document number for ${name}; nothing was recorded. Check FB03 for reference ${built.body.DocumentReferenceID}.` }
  try {
    await deps.writePosition(dealId, seq, {
      ZBELNR: result.document,
      ZMSG: 'Posted Successfully',
      ZP_DATE: ymd(built.body.PostingDate),
    })
  } catch (error) {
    return { ok: true, test: false, document: result.document, message: `${name} posted: FI document ${result.document}/${result.fiscalYear}, but it could not be saved to TRD_POS (${messageOf(error)}). Record it before retrying; do not post again.` }
  }
  return { ok: true, test: false, document: result.document, message: `Trade invoice posted for ${name}: FI document ${result.document}/${result.fiscalYear}.` }
}

/** Posting All (P_ALL): every pending leg, one at a time, each reported separately; a failure does not stop the others. */
export async function postAllInvoiceLegs(
  dealId: string,
  seqs: readonly string[],
  opts: { postingDate?: string },
  deps: InvPostDeps = defaultInvDeps,
): Promise<{ seq: string; outcome: InvPostOutcome }[]> {
  const out: { seq: string; outcome: InvPostOutcome }[] = []
  for (const seq of seqs) out.push({ seq, outcome: await postInvoiceLeg(dealId, seq, { testRun: false, ...opts }, deps) })
  return out
}
