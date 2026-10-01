/**
 * Create Spot Txn against ZFS_SB_TRMFX_O4_API (entity set FxTransaction).
 *
 * The service's handler books the deal with BAPI_FTR_FXT_DEALCREATE and commits it, so a 201
 * means the deal exists in FTR and its FinancialTransaction is the real spot number. On a
 * refusal the BAPI return lines come back in error.details[] and every one is surfaced.
 */
import { ApiError, apiRequest, service } from '@slc/api-client'
import { isoFromDate } from '../../shared/fx/sap.ts'
import { parseAmountInput, parseDate } from './format.ts'
import type { CreateFormValues, SpotRow } from './types.ts'

const trmfx = service('trmfx')

export const FX_TRANSACTION_SET = 'FxTransaction'

export type FxTransactionCreate = {
  CompanyCode: string
  ProductType: string
  TransactionType: string
  Partner: string
  ContractDate: string
  ValueDate: string
  BuyCurrency: string
  SellCurrency: string
  LeadCurrency: string
  FollowCurrency: string
  TradedCurrency: string
  SpotRate: number
  BuyAmount?: number
  SellAmount?: number
}

/**
 * The validated form as an FxTransaction create. Only the traded leg (the row's difference
 * amount, in the row's currency) is sent: DEALCREATE derives the other leg from the rate.
 * The quote is USD-led either way, matching recalcAmounts: USD/INR at 88.5, or EUR against
 * USD with the rate as EUR per USD.
 */
export function toCreatePayload(row: SpotRow, values: CreateFormValues, productType: string): FxTransactionCreate {
  const base = Math.abs(Number(row.diffAmt))
  const [lead, follow] = row.currency === 'USD' ? [row.currency, row.otherCurrency] : [row.otherCurrency, row.currency]
  const [buyCurr, sellCurr] = row.side === 'Buy' ? [row.currency, row.otherCurrency] : [row.otherCurrency, row.currency]
  const payload: FxTransactionCreate = {
    CompanyCode: values.companyCode,
    ProductType: productType,
    TransactionType: values.txnType,
    Partner: values.partner,
    ContractDate: isoFromDate(parseDate(values.tradeDate))!,
    ValueDate: isoFromDate(parseDate(values.valueDate))!,
    BuyCurrency: buyCurr,
    SellCurrency: sellCurr,
    LeadCurrency: lead,
    FollowCurrency: follow,
    TradedCurrency: row.currency,
    SpotRate: parseAmountInput(values.rate),
  }
  if (row.side === 'Buy') payload.BuyAmount = base
  else payload.SellAmount = base
  return payload
}

export type CreateResult = { ok: true; companyCode: string; transaction: string } | { ok: false; messages: string[] }

/** Books the spot deal. Never throws for a refused create; the SAP messages come back instead. */
export async function createSpotTransaction(payload: FxTransactionCreate): Promise<CreateResult> {
  try {
    const res = await apiRequest<Record<string, unknown>>(trmfx(FX_TRANSACTION_SET), { method: 'POST', body: payload })
    const transaction = String(res.data?.['FinancialTransaction'] ?? keyFromHeader(res.headers) ?? '')
    if (!transaction) return { ok: false, messages: ['SAP accepted the create but returned no transaction number. Check FTR (TM03) before retrying.'] }
    return { ok: true, companyCode: String(res.data?.['CompanyCode'] ?? payload.CompanyCode), transaction }
  } catch (error) {
    return { ok: false, messages: errorMessages(error) }
  }
}

/** FinancialTransaction='...' out of a Location / OData-EntityId header. */
function keyFromHeader(headers: Headers): string | undefined {
  const header = headers.get('OData-EntityId') ?? headers.get('Location') ?? ''
  return /FinancialTransaction='([^']+)'/.exec(header)?.[1]
}

/**
 * Every line of an OData V4 error. The top message is FTR0/161 "BAPI processing was
 * terminated" on every refusal, so the details (the actual BAPI reason) come first.
 */
export function errorMessages(error: unknown): string[] {
  if (!(error instanceof ApiError)) return [error instanceof Error ? error.message : String(error)]
  const body = error.body as { error?: { message?: string; details?: { message?: string }[] } } | null
  const lines = [...(body?.error?.details ?? []).map((d) => d.message ?? ''), body?.error?.message ?? error.message]
  const messages = [...new Set(lines.map((m) => m.trim()).filter(Boolean))]
  const hint = STATUS_HINTS[error.status]
  return hint ? [...messages, `HTTP ${error.status}: ${hint}`] : messages
}

const STATUS_HINTS: Record<number, string> = {
  0: 'the SLC gateway is not running.',
  401: 'SAP rejected the technical user credentials (check .env).',
  403: 'SAP refused the call (CSRF token or missing authorization).',
  404: `the service or entity set "${FX_TRANSACTION_SET}" was not found.`,
  502: 'the gateway could not reach SAP (network, TLS or timeout).',
}
