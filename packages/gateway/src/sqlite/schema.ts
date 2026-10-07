/**
 * Shapes of the local SQLite data. The tables themselves are defined by the SQL files in
 * database/migrations; these types are what the repositories hand to the rest of the gateway.
 *
 * SAP owns the transaction. A DealMetadata row only adds what SAP has no field for, and is
 * linked to it by the business key (companyCode + transactionId), never by `id`.
 */
export type DealMetadata = {
  id: number
  companyCode: string
  transactionId: string
  productType: string | null
  strategy: string | null
  internalReference: string | null
  remark: string | null
  createdAt: string
  updatedAt: string
}

/** The editable, nullable fields. Present-and-null clears a value; absent leaves it alone. */
export type DealMetadataFields = {
  productType?: string | null
  strategy?: string | null
  internalReference?: string | null
  remark?: string | null
}

export type CreateDealMetadataInput = DealMetadataFields & {
  companyCode: string
  transactionId: string
}

export type UpdateDealMetadataInput = DealMetadataFields

export type LookupValue = {
  category: string
  code: string
  label: string
  sortOrder: number
}
