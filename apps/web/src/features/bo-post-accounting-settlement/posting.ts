/**
 * The live accounting postings of BO: Post Accounting Entries for Settlement (ZSGTSFR081 / ZSGTSF_RDEAL_TRD_POST).
 *
 *   FX deal         ZFS_SB_TRMFLOWPOST_O4_API, static action PostFlows on TreasuryFlow: TB_DEAL_FIX_POST_PAR, the engine
 *                   behind RFTBBB00 / TBB1, for one transaction. A test run rolls back and returns no document. A real run
 *                   returns one row per FI document; the transaction's TXN_STATUS then moves to 50 on TrmFxApp
 *                   (POST_STAT_UPDATE).
 *   Trade invoice   ZFS_SB_FIACCDOC_O4_API, deep insert FiAccDoc + _Item: BAPI_ACC_DOCUMENT_POST (BAPI_ACC_DOCUMENT_CHECK
 *                   for a test run). The lines come from the leg's ZSGTSFTR_TRD_POS row (the gateway's local SQLite) and
 *                   its ZSGTSFTR_TRD_ACC posting type (also local): ZBELNR, ZMSG are written back to that row.
 *
 * Guarantees (docs/abap/BO-SETTLEMENT-POSTING-BLOCKER.md): the leg is re-read right before posting and refused when it
 * already has a document; a result the service did not confirm (timeout, 5xx) is stored as UNCONFIRMED and blocks a
 * retry until the document, if SAP holds one, is found by its reference; ZBELNR is only ever a number SAP returned;
 * a test run writes nothing.
 *
 * Property names are those the SAP behaviour implementations use (CDS ZFS_CE_FIACCDOCTP / ..ITEMTP, abstract entity
 * ZFS_AE_TRMFLOWPOSTRESULT); the $metadata of the two services has not been read yet.
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

export type FxPostDeps = {
  postFlows: (p: { CompanyCode: string; FinancialTransaction: string; PostingDate: string; DocumentDate: string; DueDate: string; TestRun: boolean }) => Promise<Record<string, unknown>[]>
  setTxnStatus: (companyCode: string, transaction: string, fields: AppStrFields) => Promise<void>
}

export const defaultFxDeps: FxPostDeps = {
  postFlows: async (params) => {
    const url = `${flowApi('TreasuryFlow')}/${POST_FLOWS_ACTION}`
    const res = await apiRequest<{ value?: Record<string, unknown>[] } | Record<string, unknown>>(url, { method: 'POST', body: params })
    const body = res.data as { value?: Record<string, unknown>[] } | undefined
    return Array.isArray(body?.value) ? body.value : body && Object.keys(body).length ? [body as Record<string, unknown>] : []
  },
  setTxnStatus: updateAppStrRecord,
}

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
 * (flows due up to it), today when not given. A real run that returned a document moves TXN_STATUS to 50; the status
 * write failing after SAP posted is reported as such, never as a failed posting.
 */
export async function postFxLeg(
  leg: Pick<FxLeg, 'entity' | 'rfha'>,
  opts: { testRun: boolean; postingDate?: string; dueDate?: string },
  deps: FxPostDeps = defaultFxDeps,
): Promise<FxPostOutcome> {
  const today = isoToday()
  let rows: Record<string, unknown>[]
  try {
    rows = await deps.postFlows({
      CompanyCode: leg.entity,
      FinancialTransaction: leg.rfha,
      PostingDate: opts.postingDate || today,
      DocumentDate: today,
      DueDate: opts.dueDate || today,
      TestRun: opts.testRun,
    })
  } catch (error) {
    return { ok: false, message: `${opts.testRun ? 'Test run' : 'Posting'} of transaction ${leg.rfha} refused by SAP: ${messageOf(error)}` }
  }
  const docs = rows.map(toFlowDoc).filter((d) => d.document || opts.testRun)
  if (opts.testRun) return { ok: true, test: true, docs: [], message: `Test run for transaction ${leg.rfha}: SAP found nothing to refuse. Nothing was posted.` }
  if (!docs.length) return { ok: false, message: `SAP posted no document for transaction ${leg.rfha}: no flow was due for posting (status unchanged).` }
  const numbers = docs.map((d) => `${d.document}/${d.fiscalYear}`).join(', ')
  try {
    await deps.setTxnStatus(leg.entity, leg.rfha, { TxnStatus: TXN_POSTED })
  } catch (error) {
    return { ok: true, test: false, docs, message: `Transaction ${leg.rfha} posted (FI ${numbers}), but its TXN_STATUS could not be set to ${TXN_POSTED}: ${messageOf(error)}` }
  }
  return { ok: true, test: false, docs, message: `Transaction ${leg.rfha} posted: FI ${numbers}.` }
}

/* ------------------------------------------------------------------ trade invoice: FiAccDoc */

export type PositionRow = Record<string, unknown>
export type PostingType = Record<string, unknown>

/** The posting key's account class (SAP: 0x / 1x customer, 2x / 3x vendor, anything else a G/L line). */
export function lineCategory(postingKey: string): 'G' | 'K' | 'D' {
  const first = postingKey.trim().charAt(0)
  if (first === '0' || first === '1') return 'D'
  if (first === '2' || first === '3') return 'K'
  return 'G'
}

export type FiItem = {
  AccountingDocumentItem: string
  LineCategory: 'G' | 'K' | 'D'
  GLAccount?: string
  Supplier?: string
  Customer?: string
  TransactionCurrency: string
  AmountInTransactionCurrency: string
  ProfitCenter?: string
  BusinessArea?: string
  DocumentItemText?: string
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

const line = (row: PositionRow, side: 'DR' | 'CR', amount: number, currency: string, itemText: string, no: number): FiItem => {
  const account = text(row, `Z${side}_ACCNT`)
  const gl = text(row, `Z${side}_GL`)
  const category = lineCategory(text(row, `Z${side}_PK`))
  const signed = side === 'DR' ? amount : -amount
  return {
    AccountingDocumentItem: String(no),
    LineCategory: category,
    ...(category === 'G' ? { GLAccount: gl || account } : category === 'K' ? { Supplier: account } : { Customer: account }),
    TransactionCurrency: currency,
    AmountInTransactionCurrency: signed.toFixed(2),
    ...(text(row, `Z${side}_PRCTR`) ? { ProfitCenter: text(row, `Z${side}_PRCTR`) } : {}),
    ...(text(row, `Z${side}_RBUSA`) ? { BusinessArea: text(row, `Z${side}_RBUSA`) } : {}),
    ...(itemText ? { DocumentItemText: clip(itemText, 50) } : {}),
  }
}

export type BuildResult = { ok: true; body: FiDocBody } | { ok: false; message: string }

/**
 * The FI document of one trade invoice leg: HEADER_DATA / DEBIT / CREDIT. Debit is the positive line, credit the
 * negative one, for ZPAY_AMT in ZSET_CURR. A leg missing what SAP cannot be asked to guess is refused with the field.
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
  for (const side of ['DR', 'CR'] as const) {
    if (!text(row, `Z${side}_PK`) || !(text(row, `Z${side}_ACCNT`) || text(row, `Z${side}_GL`))) {
      return { ok: false, message: `${name} has no ${side === 'DR' ? 'debit' : 'credit'} posting key / account: update its posting details first.` }
    }
  }
  const docType = text(row, 'ZDOC_TYPE') || (acc ? text(acc, 'ZDOC_TYPE') : '')
  if (!docType) return { ok: false, message: `${name} has no FI document type (ZDOC_TYPE).` }
  const posting = opts.postingDate || (text(row, 'ZP_DATE') ? `${text(row, 'ZP_DATE').slice(0, 4)}-${text(row, 'ZP_DATE').slice(4, 6)}-${text(row, 'ZP_DATE').slice(6, 8)}` : today)
  return {
    ok: true,
    body: {
      CompanyCode: company,
      DocumentDate: today,
      PostingDate: posting,
      AccountingDocumentType: docType,
      DocumentReferenceID: clip((acc ? text(acc, 'ZXBLNR1') : '') || text(row, 'ZDEAL_ID'), 16),
      AccountingDocumentHeaderText: clip((acc ? text(acc, 'ZBKTXT') : '') || text(row, 'ZSET_DESC'), 25),
      TransactionCurrency: currency,
      TestRun: opts.testRun,
      _Item: [
        line(row, 'DR', amount, currency, acc ? text(acc, 'ZDR_TEXT') : '', 1),
        line(row, 'CR', amount, currency, acc ? text(acc, 'ZCR_TEXT') : '', 2),
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
    const body = await apiFetch<{ value?: Record<string, unknown>[] }>(`${fiApi('FiAccDoc')}?$filter=${encodeURIComponent(filter)}&$select=CompanyCode,FiscalYear,AccountingDocument`)
    return (body?.value ?? []).map((r) => ({ fiscalYear: text(r, 'FiscalYear'), document: text(r, 'AccountingDocument') })).filter((d) => d.document)
  },
  postDocument: async (body) => {
    const res = await apiRequest<Record<string, unknown>>(fiApi('FiAccDoc'), { method: 'POST', body })
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
