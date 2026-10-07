/**
 * Create Spot Txn against ZFS_SB_TRMFX_O4_API (entity set FxTransaction).
 *
 * The service's handler books the deal with BAPI_FTR_FXT_DEALCREATE and commits it, so a 201
 * means the deal exists in FTR and its FinancialTransaction is the real spot number. On a
 * refusal the BAPI return lines come back in error.details[] and every one is surfaced.
 */
import { ApiError, apiRequest, service } from '@slc/api-client'
import type { SpotCreatePayload } from './spotCreate.ts'

const trmfx = service('trmfx')

export const FX_TRANSACTION_SET = 'FxTransaction'

export type CreateResult = { ok: true; companyCode: string; transaction: string } | { ok: false; messages: string[] }

/** Books the spot deal. Never throws for a refused create; the SAP messages come back instead. */
export async function createSpotTransaction(payload: SpotCreatePayload): Promise<CreateResult> {
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
