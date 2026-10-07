/*
 * SAP data for TBB1 — Treasury: Post Flows (RFTBBB00). Nothing falls back to sample data.
 *
 *   Company Code               T001 (API_COMPANYCODE_SRV / A_CompanyCode)
 *   Product / Transaction /    FTR customizing (ZFS_SB_TRMMASTER_O4_API): ProductType, TransactionType, FlowType.
 *   Flow Type, Flow Class      ContractType is RANTYP, so it also tells each flow type's application.
 *   Flows to post              VTBFHAPO (SLC middleware "vtbfhapo"): SBEWEBE = '1' (released for posting), DZTERM <= the
 *                              due date, company codes; the remaining select-options in logic.selectDueFlows.
 *   Transaction header         VTBFHA is not served; for FX deals FxTransaction (ZFS_SB_TRMFX_O4_API) gives product /
 *                              transaction type, partner and portfolio. Other applications have no header service.
 *   Posting run (Execute)      SUBMIT RFTBBB00 runs SAP's posting engine; no service exposes it. The proposed service
 *                              (docs/abap/ZFS_SD_TRMPOSTING.md, registry key "trmposting") is used as soon as SAP
 *                              answers for it; until then Execute lists the due flows read-only.
 *   Server / Server Group      SAP's application servers / RFC groups: no service, typed as text.
 */
import { apiFetch, apiRequest, odataQuery, service } from '@slc/api-client'
import { txt } from '../../shared/fx/masters.ts'
import { fxList, isAbort } from '../../shared/fx/mw.ts'
import { num } from '../../shared/fx/sap.ts'
import { MSG_NAMES, POSTING_RELEASED } from './data.ts'
import { dmyToIso, isoToDmy } from './logic.ts'
import type { Flow, Form, LogLine, Masters, MsgType, Option } from './types.ts'

const companyApi = service('companycode')
const masterApi = service('trmmaster')
const fxApi = service('trmfx')
const postingApi = service('trmposting')

const byValue = (a: Option, b: Option) => (a.v < b.v ? -1 : a.v > b.v ? 1 : 0)
const noZeros = (v: string) => v.replace(/^0+/, '') || '0'

/* ---------------- pure mappings (tested) ---------------- */

type ProductTypeRow = { ProductType?: string; ProductTypeName?: string; ContractType?: string }
type TransactionTypeRow = { ProductType?: string; TransactionType?: string; TransactionTypeName?: string }
type FlowTypeRow = { ContractType?: string; FlowType?: string; FlowTypeName?: string; FlowClass?: string }

/** The value helps as "<code> · <name>". A flow type code used by several contract types is listed once. */
export function mastersFrom(
  companies: readonly { CompanyCode?: string; CompanyCodeName?: string }[],
  products: readonly ProductTypeRow[],
  transactions: readonly TransactionTypeRow[],
  flows: readonly FlowTypeRow[],
): Masters {
  const label = (code: string, name: string) => (name ? `${code} · ${name}` : code)
  const seenFlow = new Set<string>()
  return {
    companies: companies
      .filter((c) => c.CompanyCode)
      .map((c) => ({ v: String(c.CompanyCode), t: label(String(c.CompanyCode), String(c.CompanyCodeName ?? '').trim()) }))
      .sort(byValue),
    productTypes: products
      .filter((p) => p.ProductType)
      .map((p) => ({ v: String(p.ProductType), t: label(String(p.ProductType), String(p.ProductTypeName ?? '')), contract: String(p.ContractType ?? '') }))
      .sort(byValue),
    transactionTypes: transactions
      .filter((t) => t.TransactionType)
      .map((t) => ({ v: String(t.TransactionType), t: label(String(t.TransactionType), String(t.TransactionTypeName ?? '')), product: String(t.ProductType ?? '') }))
      .sort(byValue),
    flowTypes: flows
      .filter((f) => f.FlowType && !seenFlow.has(String(f.FlowType)) && !!seenFlow.add(String(f.FlowType)))
      .map((f) => ({ v: String(f.FlowType), t: label(String(f.FlowType), String(f.FlowTypeName ?? '')), contract: String(f.ContractType ?? ''), flowClass: String(f.FlowClass ?? '') }))
      .sort(byValue),
  }
}

/**
 * Each flow type's application and classification. A flow type code that several contract types
 * define gets no application (it cannot be told apart without the transaction header).
 */
export function flowTypeIndex(rows: readonly FlowTypeRow[]): Map<string, { contract: string; flowClass: string }> {
  const out = new Map<string, { contract: string; flowClass: string }>()
  for (const r of rows) {
    const code = String(r.FlowType ?? '')
    if (!code) continue
    const prev = out.get(code)
    if (!prev) out.set(code, { contract: String(r.ContractType ?? ''), flowClass: String(r.FlowClass ?? '') })
    else if (prev.contract !== String(r.ContractType ?? '')) out.set(code, { contract: '', flowClass: prev.flowClass })
  }
  return out
}

export type FxHeader = { CompanyCode: string; FinancialTransaction: string; ProductType?: string; TransactionType?: string; Partner?: string; Portfolio?: string }

/** One VTBFHAPO row with its flow type's application and, for FX deals, the deal header. */
export function flowFrom(
  r: Record<string, string | null>,
  types: ReadonlyMap<string, { contract: string; flowClass: string }>,
  headers: ReadonlyMap<string, FxHeader>,
): Flow {
  const flowType = txt(r, 'SFHAZBA')
  const type = types.get(flowType)
  const head = headers.get(`${txt(r, 'BUKRS')}|${noZeros(txt(r, 'RFHA'))}`)
  const sign = txt(r, 'SSIGN')
  return {
    bukrs: txt(r, 'BUKRS'),
    rfha: txt(r, 'RFHA'),
    rfhazu: txt(r, 'RFHAZU'),
    flowType,
    contract: type?.contract ?? '',
    flowClass: type?.flowClass ?? '',
    amount: num(r['BZBETR']),
    currency: txt(r, 'WZBETR'),
    sign: sign === '+' || sign === '-' ? sign : '',
    dueDate: txt(r, 'DZTERM'),
    postingDate: txt(r, 'DBUCHUNG'),
    postingStatus: txt(r, 'SBEWEBE'),
    headerKnown: !!head,
    productType: head?.ProductType ?? '',
    transactionType: head?.TransactionType ?? '',
    partner: head?.Partner ?? '',
    portfolio: head?.Portfolio ?? '',
  }
}

/* ---------------- reads ---------------- */

export type MastersResult = { masters: Masters; flowTypes: FlowTypeRow[]; problems: string[] }

async function pagedOData<T>(url: string, signal?: AbortSignal): Promise<T[]> {
  const rows: T[] = []
  for (let skip = 0; ; skip += 1000) {
    const body = await apiFetch<{ value?: T[] }>(`${url}?${odataQuery({ top: 1000, skip })}`, signal ? { signal } : undefined)
    const page = body?.value ?? []
    rows.push(...page)
    if (page.length < 1000) return rows
  }
}

/** The value helps. A list SAP cannot serve stays empty and is named in `problems`. */
export async function loadMasters(signal?: AbortSignal): Promise<MastersResult> {
  const problems: string[] = []
  const soft = async <T,>(what: string, p: Promise<T[]>): Promise<T[]> => {
    try {
      return await p
    } catch (error) {
      if (isAbort(error)) throw error
      console.warn(`[tbb1] ${what} unavailable`, error)
      problems.push(`${what} could not be read from SAP.`)
      return []
    }
  }
  const params = new URLSearchParams({ $select: 'CompanyCode,CompanyCodeName', $top: '5000', $format: 'json' })
  const [companies, products, transactions, flows] = await Promise.all([
    soft(
      'Company codes (T001)',
      apiFetch<{ d?: { results?: { CompanyCode?: string; CompanyCodeName?: string }[] } }>(`${companyApi('A_CompanyCode')}?${params}`, signal ? { signal } : undefined).then(
        (v2) => v2?.d?.results ?? [],
      ),
    ),
    soft('Product types', pagedOData<ProductTypeRow>(masterApi('ProductType'), signal)),
    soft('Transaction types', pagedOData<TransactionTypeRow>(masterApi('TransactionType'), signal)),
    soft('Flow types', pagedOData<FlowTypeRow>(masterApi('FlowType'), signal)),
  ])
  return { masters: mastersFrom(companies, products, transactions, flows), flowTypes: flows, problems }
}

/** VTBFHAPO flows released for posting and due up to the due date, with what is known of their transaction. */
export async function loadDueFlows(f: Form, flowTypes: readonly FlowTypeRow[], signal?: AbortSignal): Promise<Flow[]> {
  const filter: Record<string, string> = { SBEWEBE: POSTING_RELEASED }
  const due = dmyToIso(f.dzterm)
  if (due) filter['DZTERM[lte]'] = due
  if (f.bukrs.length) filter['BUKRS[in]'] = f.bukrs.join(',')
  const rows = await fxList('vtbfhapo', filter, { signal })
  const companies = [...new Set(rows.map((r) => txt(r, 'BUKRS')))]
  const headers = new Map<string, FxHeader>()
  if (companies.length) {
    try {
      const fx = await apiFetch<{ value?: FxHeader[] }>(
        `${fxApi('FxTransaction')}?${odataQuery({
          filter: companies.map((c) => `CompanyCode eq '${c.replace(/'/g, "''")}'`).join(' or '),
          select: ['CompanyCode', 'FinancialTransaction', 'ProductType', 'TransactionType', 'Partner', 'Portfolio'],
          top: 5000,
        })}`,
        signal ? { signal } : undefined,
      )
      for (const h of fx?.value ?? []) headers.set(`${h.CompanyCode}|${noZeros(h.FinancialTransaction)}`, h)
    } catch (error) {
      if (isAbort(error)) throw error
      console.warn('[tbb1] FxTransaction headers unavailable', error)
    }
  }
  const types = flowTypeIndex(flowTypes)
  return rows.map((r) => flowFrom(r, types, headers))
}

/* ---------------- the posting run (proposed service) ---------------- */

let postingProbe: Promise<boolean> | undefined

/** Whether SAP answers for the posting service (its $metadata declares PostingRun). Read once per page load. */
export function postingServiceAvailable(): Promise<boolean> {
  postingProbe ??= fetch(postingApi('$metadata'), { headers: { accept: 'application/xml' }, credentials: 'same-origin' })
    .then(async (res) => res.ok && /<EntitySet\s+Name="PostingRun"/.test(await res.text()))
    .catch(() => false)
  return postingProbe
}

/** The selection as the proposed PostingRun entity takes it (RFTBBB00's parameters). */
export function postingRunBody(f: Form): Record<string, unknown> {
  const list = (l: string[]) => l.join(',')
  return {
    ForeignExchange: f.apps.tx,
    MoneyMarket: f.apps.tm,
    Derivatives: f.apps.ti,
    Securities: f.apps.ts,
    TradeFinance: f.apps.tf,
    CompanyCodes: list(f.bukrs),
    TransactionFrom: f.rfhaFrom,
    TransactionTo: f.rfhaTo,
    ProductTypes: list(f.sgsart),
    TransactionTypes: list(f.sfhaar),
    SecurityIds: list(f.ranl),
    SecuritiesAccounts: list(f.rldepo),
    PositionAccounts: list(f.posacc),
    Counterparties: list(f.kontrh),
    Portfolios: list(f.rportb),
    Currencies: list(f.wzbetr),
    FlowClasses: list(f.bkklas),
    FlowTypes: list(f.fhazba),
    Direction: f.sign,
    DueDateTo: dmyToIso(f.dzterm) || null,
    PostingDateTo: dmyToIso(f.dbuchu) || null,
    ByCurrencyChosen: f.wzbetrFlag,
    ReleasedOnly: f.releas,
    PostingDate: dmyToIso(f.budat) || null,
    DocumentDate: dmyToIso(f.bldat) || null,
    PostingPeriod: f.monat,
    PostingDateForTranslation: f.postda,
    TestRun: f.test,
    PostingScope: f.mode,
    ProcessInPackages: f.pack,
    PackageSize: f.psize,
    Multitasking: f.mtA,
    Server: f.mtS,
    ServerGroup: f.mtRg,
    Processes: f.mtNr,
    TaskPackageSize: f.mtPs,
  }
}

type PostingLogRow = {
  Line?: number
  MessageType?: string
  CompanyCode?: string
  FinancialTransaction?: string
  ProductType?: string
  TransactionType?: string
  FlowType?: string
  DueDate?: string | null
  Direction?: string
  AccountingDocument?: string
  FiscalYear?: string
  PaymentRequest?: string
  MessageClass?: string
  MessageNumber?: string
  Message?: string
  Amount?: number | string
  Currency?: string
}

export function logLineFrom(r: PostingLogRow, id: number): LogLine {
  const type = (['E', 'W', 'S', 'I'].includes(String(r.MessageType)) ? r.MessageType : 'I') as MsgType
  const sign = r.Direction === '+' || r.Direction === '-' ? r.Direction : ''
  return {
    id,
    type,
    typeName: MSG_NAMES[type],
    bukrs: r.CompanyCode ?? '',
    rfha: r.FinancialTransaction ?? '',
    sgsart: r.ProductType ?? '',
    sfhaart: r.TransactionType ?? '',
    sfhazba: r.FlowType ?? '',
    dzterm: isoToDmy(String(r.DueDate ?? '')),
    ssign: sign,
    belnr: r.AccountingDocument ?? '',
    gjahr: r.FiscalYear ?? '',
    prkey: r.PaymentRequest ?? '',
    text: r.Message ?? '',
    amount: num(r.Amount ?? 0),
    currency: r.Currency ?? '',
    hasFlow: !!r.FlowType,
    msgid: r.MessageClass ?? '',
    msgno: r.MessageNumber ?? '',
  }
}

/** Runs RFTBBB00 through the posting service and returns its log. */
export async function runPosting(f: Form): Promise<LogLine[]> {
  const created = await apiRequest<{ RunId?: string }>(postingApi('PostingRun'), { method: 'POST', body: postingRunBody(f) })
  const runId = created.data?.RunId ?? ''
  const log = await apiFetch<{ value?: PostingLogRow[] }>(`${postingApi('PostingLog')}?${odataQuery({ filter: `RunId eq '${runId}'`, orderby: 'Line' })}`)
  return (log?.value ?? []).map((r, i) => logLineFrom(r, i + 1))
}
