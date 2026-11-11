import { refFetch } from '@tsfx/ref/api-client'
import { apiFetch, entityPath, service } from '@tsfx/ref/api-client'

/** Original GV_EXT uses TB_NORDEXT; TrmFxApp's live metadata declares ZolamDealNo as CHAR(15). */
export const EXTERNAL_REFERENCE_MAX_LENGTH = 16
export const INTERNAL_REFERENCE_MAX_LENGTH = 15

const fxApi = service('fx')

/** Check the transaction entity itself, rather than a similarly named property on another entity. */
export function supportsExternalReference(xml: string): boolean {
  const entity = /<(?:\w+:)?EntityType\b[^>]*\bName="FxTransactionType"[^>]*>[\s\S]*?<\/(?:\w+:)?EntityType>/.exec(xml)?.[0] ?? ''
  return /<(?:\w+:)?Property\b[^>]*\bName="ExternalReference"(?:\s|\/|>)/.test(entity)
}

/** Fail before settlement when the connected SAP service cannot save the supplied reference. */
export async function assertExternalReferenceSupported(): Promise<void> {
  const response = await refFetch(fxApi('$metadata'), {
    headers: { accept: 'application/xml' },
    credentials: 'same-origin',
  })
  if (!response.ok) throw new Error('External Ref support could not be checked. Try again before confirming the deal.')
  if (!supportsExternalReference(await response.text())) {
    throw new Error('External Ref cannot be saved by the connected SAP service yet. SAP must enable ExternalReference before confirming with this field filled.')
  }
}

/** SAP must expose ExternalReference and map PATCH to GENERALCONTRACTDATA-EXTERNAL_REFERENCE. */
export async function saveExternalReference(companyCode: string, transaction: string, reference: string): Promise<void> {
  const value = reference.trim()
  if (!value) return
  const key = entityPath('FxTransaction', { CompanyCode: companyCode, FinancialTransaction: transaction })
  await apiFetch(fxApi(key), {
    method: 'PATCH',
    headers: { 'If-Match': '*' },
    body: { ExternalReference: value },
  })
}
