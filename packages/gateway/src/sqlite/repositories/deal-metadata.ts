import type { Database } from '../db.ts'
import type {
  CreateDealMetadataInput,
  DealMetadata,
  DealMetadataFields,
  UpdateDealMetadataInput,
} from '../schema.ts'

const SELECT = `
  SELECT
    id,
    company_code       AS companyCode,
    transaction_id     AS transactionId,
    product_type       AS productType,
    strategy,
    internal_reference AS internalReference,
    remark,
    created_at         AS createdAt,
    updated_at         AS updatedAt
  FROM deal_metadata
`

/**
 * Binds the four editable fields as value + "was it supplied" flag. The SQL then keeps the
 * stored value when a field is absent and overwrites it (including with NULL) when present,
 * which is what lets PATCH clear a field without any dynamic SQL.
 */
function fieldParams(fields: DealMetadataFields) {
  return {
    hasProductType: fields.productType !== undefined ? 1 : 0,
    productType: fields.productType ?? null,
    hasStrategy: fields.strategy !== undefined ? 1 : 0,
    strategy: fields.strategy ?? null,
    hasInternalReference: fields.internalReference !== undefined ? 1 : 0,
    internalReference: fields.internalReference ?? null,
    hasRemark: fields.remark !== undefined ? 1 : 0,
    remark: fields.remark ?? null,
  }
}

function prepareStatements(db: Database) {
  return {
    findAll: db.prepare<[], DealMetadata>(`${SELECT} ORDER BY updated_at DESC, id DESC`),
    findOne: db.prepare<{ companyCode: string; transactionId: string }, DealMetadata>(
      `${SELECT} WHERE company_code = @companyCode AND transaction_id = @transactionId`,
    ),
    insert: db.prepare(`
      INSERT INTO deal_metadata
        (company_code, transaction_id, product_type, strategy, internal_reference, remark, created_at, updated_at)
      VALUES
        (@companyCode, @transactionId, @productType, @strategy, @internalReference, @remark, @now, @now)
    `),
    update: db.prepare(`
      UPDATE deal_metadata SET
        product_type       = CASE WHEN @hasProductType       THEN @productType       ELSE product_type       END,
        strategy           = CASE WHEN @hasStrategy          THEN @strategy          ELSE strategy           END,
        internal_reference = CASE WHEN @hasInternalReference THEN @internalReference ELSE internal_reference END,
        remark             = CASE WHEN @hasRemark            THEN @remark            ELSE remark             END,
        updated_at         = @now
      WHERE company_code = @companyCode AND transaction_id = @transactionId
    `),
    upsert: db.prepare(`
      INSERT INTO deal_metadata
        (company_code, transaction_id, product_type, strategy, internal_reference, remark, created_at, updated_at)
      VALUES
        (@companyCode, @transactionId, @productType, @strategy, @internalReference, @remark, @now, @now)
      ON CONFLICT (company_code, transaction_id) DO UPDATE SET
        product_type       = CASE WHEN @hasProductType       THEN @productType       ELSE deal_metadata.product_type       END,
        strategy           = CASE WHEN @hasStrategy          THEN @strategy          ELSE deal_metadata.strategy           END,
        internal_reference = CASE WHEN @hasInternalReference THEN @internalReference ELSE deal_metadata.internal_reference END,
        remark             = CASE WHEN @hasRemark            THEN @remark            ELSE deal_metadata.remark             END,
        updated_at         = @now
    `),
    remove: db.prepare(`DELETE FROM deal_metadata WHERE company_code = @companyCode AND transaction_id = @transactionId`),
  }
}

export type DealMetadataRepository = ReturnType<typeof createDealMetadataRepository>

/**
 * Timestamps are written here, as ISO-8601 UTC with milliseconds, rather than left to
 * CURRENT_TIMESTAMP: that has one-second resolution, so two edits inside a second would leave
 * updated_at unchanged. The column default still covers inserts that bypass this module.
 */
export function createDealMetadataRepository(db: Database) {
  const sql = prepareStatements(db)
  const now = () => new Date().toISOString()

  const get = (companyCode: string, transactionId: string): DealMetadata | undefined =>
    sql.findOne.get({ companyCode, transactionId })

  return {
    listDealMetadata: (): DealMetadata[] => sql.findAll.all(),

    getDealMetadata: get,

    /** Throws a SQLITE_CONSTRAINT_UNIQUE error if the key already exists; callers map it to 409. */
    createDealMetadata(input: CreateDealMetadataInput): DealMetadata {
      sql.insert.run({ ...fieldParams(input), companyCode: input.companyCode, transactionId: input.transactionId, now: now() })
      return get(input.companyCode, input.transactionId)!
    },

    /** Undefined when there is no such row. */
    updateDealMetadata(companyCode: string, transactionId: string, input: UpdateDealMetadataInput): DealMetadata | undefined {
      const changed = sql.update.run({ ...fieldParams(input), companyCode, transactionId, now: now() }).changes
      return changed ? get(companyCode, transactionId) : undefined
    },

    /** Insert, or update the supplied fields of the existing row. */
    upsertDealMetadata(input: CreateDealMetadataInput): DealMetadata {
      sql.upsert.run({ ...fieldParams(input), companyCode: input.companyCode, transactionId: input.transactionId, now: now() })
      return get(input.companyCode, input.transactionId)!
    },

    /** True when a row was removed. */
    deleteDealMetadata: (companyCode: string, transactionId: string): boolean =>
      sql.remove.run({ companyCode, transactionId }).changes > 0,
  }
}

const repositories = new WeakMap<Database, DealMetadataRepository>()

/** One prepared-statement set per connection, built on first use. */
export function dealMetadataRepository(db: Database): DealMetadataRepository {
  let repo = repositories.get(db)
  if (!repo) {
    repo = createDealMetadataRepository(db)
    repositories.set(db, repo)
  }
  return repo
}
