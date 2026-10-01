/**
 * Create Spot (Additional Spot Booking) against ZFS_SB_TRMFX_O4_API.
 *
 * The service's unmanaged handler (lhc_trmfx) books the deal with BAPI_FTR_FXT_DEALCREATE and
 * commits it in its own DESTINATION 'NONE' session, so a 201 means the deal exists in FTR. On a
 * failure every BAPI return line comes back in the OData error, and all of them are surfaced.
 */
import { ApiError, apiRequest, parseAmount, service } from '@slc/api-client'
import { isoFromDate } from '../../shared/fx/sap.ts'
import { ENTITIES } from './data.ts'
import { parseUiDate } from './format.ts'
import type { AutoSpotForm } from './types.ts'

const trmfx = service('trmfx')

// Entity set per $metadata (the BDEF alias TrmFx is not what the service exposes).
export const TRMFX_SET = 'FxTransaction'

/** FTR product / transaction type for the spot. ZSGTSFR_SPOT_CREATE's DS1 / 609 is not defined on DS4/100 ("Product type DS1 not defined"); 40A / 400 is what the service books. */
export const SPOT_PRODUCT_TYPE = '40A'
export const SPOT_TRANSACTION_TYPE = '400'

export type TrmFxCreate = {
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
 * The form as a TrmFx create, or the reasons it cannot be sent. Only the traded leg's amount
 * is sent: DEALCREATE derives the other from the spot rate, and sending both invites a
 * rounding mismatch. The pair is quoted curr1/curr2 as the blotter shows it (USD/INR 83.20).
 */
export function toSpotPayload(form: AutoSpotForm): { payload?: TrmFxCreate; problems: string[] } {
  const problems: string[] = []
  const cocode = ENTITIES.find((e) => e.code === form.company)?.cocode ?? ''
  if (!cocode) problems.push(`No SAP company code is mapped for entity "${form.company}".`)
  if (!form.bp) problems.push('Select a Business Partner.')
  const contractDate = isoFromDate(parseUiDate(form.tradeDate))
  const valueDate = isoFromDate(parseUiDate(form.valueDate))
  if (!contractDate) problems.push(`Trade Date "${form.tradeDate}" is not a valid date.`)
  if (!valueDate) problems.push(`Value Date "${form.valueDate}" is not a valid date.`)
  const rate = parseAmount(form.rate)
  if (!rate || rate <= 0) problems.push('Spot Rate must be greater than zero.')
  const buy = parseAmount(form.buyAmt) ?? 0
  const sell = parseAmount(form.sellAmt) ?? 0
  if (buy <= 0 && sell <= 0) problems.push('Enter a Buy Amount or a Sell Amount.')
  if (!form.buyCurr || !form.sellCurr || form.buyCurr === form.sellCurr)
    problems.push('Buy and Sell currencies must be two different currencies.')
  if (problems.length) return { problems }

  const payload: TrmFxCreate = {
    CompanyCode: cocode,
    ProductType: SPOT_PRODUCT_TYPE,
    TransactionType: SPOT_TRANSACTION_TYPE,
    Partner: form.bp,
    ContractDate: contractDate!,
    ValueDate: valueDate!,
    BuyCurrency: form.buyCurr,
    SellCurrency: form.sellCurr,
    LeadCurrency: form.buyCurr,
    FollowCurrency: form.sellCurr,
    TradedCurrency: buy > 0 ? form.buyCurr : form.sellCurr,
    SpotRate: rate!,
  }
  if (buy > 0) payload.BuyAmount = buy
  else payload.SellAmount = sell
  return { payload, problems }
}

export type SpotResult = { ok: true; companyCode: string; transaction: string } | { ok: false; messages: string[] }

/** Books the spot deal. Never throws for a refused create; the SAP messages come back instead. */
export async function createSpotDeal(payload: TrmFxCreate): Promise<SpotResult> {
  try {
    const res = await apiRequest<Record<string, unknown>>(trmfx(TRMFX_SET), { method: 'POST', body: payload })
    const transaction = String(res.data?.['FinancialTransaction'] ?? keyFromHeader(res.headers) ?? '')
    if (!transaction) return { ok: false, messages: ['SAP accepted the create but returned no Financial Transaction number. Check FTR (TM03) before retrying.'] }
    return { ok: true, companyCode: String(res.data?.['CompanyCode'] ?? payload.CompanyCode), transaction }
  } catch (error) {
    return { ok: false, messages: errorMessages(error) }
  }
}

/** FinancialTransaction='...' out of an OData-EntityId / Location header. */
function keyFromHeader(headers: Headers): string | undefined {
  const header = headers.get('OData-EntityId') ?? headers.get('Location') ?? ''
  return /FinancialTransaction='([^']+)'/.exec(header)?.[1]
}

/**
 * Every message in an OData V4 error: the top one plus error.details[], which is where RAP puts
 * the rest of the BAPI return table. The HTTP status is named for the non-SAP failures.
 */
export function errorMessages(error: unknown): string[] {
  if (!(error instanceof ApiError)) return [error instanceof Error ? error.message : String(error)]
  const body = error.body as { error?: { code?: string; message?: string; details?: { code?: string; message?: string }[] } } | null
  const lines = [body?.error?.message ?? error.message, ...(body?.error?.details ?? []).map((d) => d.message ?? '')]
  const messages = [...new Set(lines.map((m) => m.trim()).filter(Boolean))]
  const hint = STATUS_HINTS[error.status]
  return hint ? [`HTTP ${error.status}: ${hint}`, ...messages] : messages
}

const STATUS_HINTS: Record<number, string> = {
  0: 'the SLC gateway is not running.',
  401: 'SAP rejected the FS_DEV credentials.',
  403: 'SAP refused the call (CSRF token or missing authorization).',
  404: `the service or entity set "${TRMFX_SET}" was not found. Check the service is published in /IWFND/V4_ADMIN.`,
  502: 'the gateway could not reach SAP (network, TLS or timeout).',
}
