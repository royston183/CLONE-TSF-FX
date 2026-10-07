import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

/**
 * A local JSON record store on SQLite, served as a `sqlite` backend kind.
 *
 * It exists so applications with no SAP contract yet — the scaffold apps that run on
 * hard-coded data — can persist what users enter without waiting for an ABAP service.
 * Records are schemaless JSON grouped into named collections, so a new app needs no
 * migration: it just writes to a collection name nobody else uses.
 *
 * node:sqlite ships with Node 24, so there is no native module to build on Windows.
 */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export type Fields = { [key: string]: Json }

export type RecordMeta = { createdAt: string; updatedAt: string; createdBy: string; updatedBy: string }

/** A stored record as returned to callers: its fields, its id, and bookkeeping under `_meta`. */
export type StoredRecord = Fields & { id: string; _meta: RecordMeta }

export type Condition = { field: string; value: string | number | boolean | null }
export type OrderBy = { field: string; descending: boolean }
export type ListQuery = { where: Condition[]; orderBy: OrderBy[]; top: number; skip: number }

/** A caller mistake — bad name, bad body, bad query. The route answers 400 with the message. */
export class StoreInputError extends Error {}

export const MAX_TOP = 5000
const NAME = /^[A-Za-z0-9_-]{1,64}$/
const FIELD = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/
const ID = /^[^/\\?#\s]{1,128}$/
const META_COLUMNS: Record<string, string> = {
  id: 'id',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  createdBy: 'created_by',
  updatedBy: 'updated_by',
}

/**
 * Ordered, append-only. user_version records how many have run, so an existing database
 * picks up only the ones it has not seen. Never edit a shipped migration — add another.
 */
const MIGRATIONS: string[] = [
  `CREATE TABLE records (
     collection TEXT NOT NULL,
     id         TEXT NOT NULL,
     data       TEXT NOT NULL CHECK (json_valid(data)),
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     created_by TEXT NOT NULL,
     updated_by TEXT NOT NULL,
     PRIMARY KEY (collection, id)
   ) WITHOUT ROWID;
   CREATE INDEX records_updated ON records (collection, updated_at);`,
]

type Row = {
  id: string
  data: string
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string
}

export function checkName(collection: string): void {
  if (!NAME.test(collection)) {
    throw new StoreInputError(`Collection name "${collection}" must be 1-64 letters, digits, "_" or "-".`)
  }
}

function checkId(id: string): void {
  if (!ID.test(id)) throw new StoreInputError(`Record id "${id}" must be 1-128 characters with no slashes or spaces.`)
}

export function checkField(field: string): void {
  if (!FIELD.test(field)) throw new StoreInputError(`"${field}" is not a valid field name.`)
}

/** `id` and `_meta` belong to the store; a body that carries them has them stripped, not stored twice. */
function ownFields(body: Fields): Fields {
  const { id: _id, _meta: _m, ...rest } = body
  return rest
}

function toRecord(row: Row): StoredRecord {
  return {
    ...(JSON.parse(row.data) as Fields),
    id: row.id,
    _meta: {
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
    },
  }
}

/** A JSON path for one top-level field, bound as a parameter rather than spliced into SQL. */
function jsonPath(field: string): string {
  return `$."${field}"`
}

export class SqliteStore {
  readonly file: string
  private readonly db: DatabaseSync

  constructor(file: string) {
    this.file = file
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
    this.db = new DatabaseSync(file)
    // WAL lets reads proceed during a write; busy_timeout covers a second process (a test,
    // a CLI) briefly holding the lock instead of failing at once with SQLITE_BUSY.
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;')
    this.migrate()
  }

  private migrate(): void {
    const { user_version: current } = this.db.prepare('PRAGMA user_version').get() as { user_version: number }
    for (let version = current; version < MIGRATIONS.length; version++) {
      this.transaction(() => {
        this.db.exec(MIGRATIONS[version]!)
        this.db.exec(`PRAGMA user_version = ${version + 1}`)
      })
    }
  }

  private transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const result = work()
      this.db.exec('COMMIT')
      return result
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  collections(): { name: string; count: number }[] {
    const rows = this.db
      .prepare('SELECT collection AS name, COUNT(*) AS count FROM records GROUP BY collection ORDER BY collection')
      .all() as { name: string; count: number }[]
    return rows.map(({ name, count }) => ({ name, count }))
  }

  list(collection: string, query: ListQuery): StoredRecord[] {
    checkName(collection)
    const params: (string | number | null)[] = [collection]
    const where = ['collection = ?']

    for (const { field, value } of query.where) {
      const column = META_COLUMNS[field]
      if (column) {
        where.push(`${column} = ?`)
        params.push(value === null ? null : String(value))
      } else if (value === null) {
        where.push('json_extract(data, ?) IS NULL')
        params.push(jsonPath(field))
      } else {
        // json_extract returns JSON true/false as 1/0, so booleans are compared that way.
        where.push('json_extract(data, ?) = ?')
        params.push(jsonPath(field), typeof value === 'boolean' ? Number(value) : value)
      }
    }

    const order = query.orderBy.map(({ field, descending }) => {
      const column = META_COLUMNS[field]
      const direction = descending ? 'DESC' : 'ASC'
      if (column) return `${column} ${direction}`
      params.push(jsonPath(field))
      return `json_extract(data, ?) ${direction}`
    })
    // A stable default, so paging with $skip never repeats or drops a record.
    order.push('created_at ASC', 'id ASC')

    params.push(query.top, query.skip)
    const sql = `SELECT id, data, created_at, updated_at, created_by, updated_by FROM records
                 WHERE ${where.join(' AND ')} ORDER BY ${order.join(', ')} LIMIT ? OFFSET ?`
    return (this.db.prepare(sql).all(...params) as Row[]).map(toRecord)
  }

  get(collection: string, id: string): StoredRecord | undefined {
    checkName(collection)
    checkId(id)
    const row = this.db
      .prepare(
        'SELECT id, data, created_at, updated_at, created_by, updated_by FROM records WHERE collection = ? AND id = ?',
      )
      .get(collection, id) as Row | undefined
    return row ? toRecord(row) : undefined
  }

  /** Creates a record. The id comes from the body when given, otherwise a UUID is generated. */
  create(collection: string, body: Fields, user: string): StoredRecord {
    checkName(collection)
    const id = typeof body['id'] === 'string' || typeof body['id'] === 'number' ? String(body['id']) : randomUUID()
    checkId(id)
    const now = new Date().toISOString()
    try {
      this.db
        .prepare(
          `INSERT INTO records (collection, id, data, created_at, updated_at, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(collection, id, JSON.stringify(ownFields(body)), now, now, user, user)
    } catch (err) {
      if (err instanceof Error && /UNIQUE|PRIMARY KEY/i.test(err.message)) {
        throw new ConflictError(`A record with id "${id}" already exists in "${collection}".`)
      }
      throw err
    }
    return this.get(collection, id)!
  }

  /** PUT replaces every field; PATCH merges the given top-level fields over the stored ones. */
  update(collection: string, id: string, body: Fields, user: string, merge: boolean): StoredRecord | undefined {
    const existing = this.get(collection, id)
    if (!existing) return undefined
    const fields = merge ? { ...ownFields(existing), ...ownFields(body) } : ownFields(body)
    this.db
      .prepare('UPDATE records SET data = ?, updated_at = ?, updated_by = ? WHERE collection = ? AND id = ?')
      .run(JSON.stringify(fields), new Date().toISOString(), user, collection, id)
    return this.get(collection, id)
  }

  remove(collection: string, id: string): boolean {
    checkName(collection)
    checkId(id)
    const result = this.db.prepare('DELETE FROM records WHERE collection = ? AND id = ?').run(collection, id)
    return Number(result.changes) > 0
  }

  close(): void {
    if (this.db.isOpen) this.db.close()
  }
}

export class ConflictError extends Error {}

/**
 * Parses the OData subset this store answers: `$filter` as `field eq value` clauses joined
 * by `and`, `$orderby`, `$top` and `$skip`. Anything else is refused with a 400 naming what
 * is supported — silently ignoring an unsupported filter would return the wrong records.
 */
export function parseListQuery(search: URLSearchParams): ListQuery {
  for (const key of search.keys()) {
    if (key.startsWith('$') && !['$filter', '$orderby', '$top', '$skip'].includes(key)) {
      throw new StoreInputError(`${key} is not supported by the local store. Use $filter, $orderby, $top or $skip.`)
    }
  }

  const top = search.has('$top') ? Number(search.get('$top')) : 1000
  const skip = search.has('$skip') ? Number(search.get('$skip')) : 0
  if (!Number.isInteger(top) || top < 0 || top > MAX_TOP) throw new StoreInputError(`$top must be 0-${MAX_TOP}.`)
  if (!Number.isInteger(skip) || skip < 0) throw new StoreInputError('$skip must be a non-negative integer.')

  const orderBy: OrderBy[] = []
  for (const part of (search.get('$orderby') ?? '').split(',').map((p) => p.trim()).filter(Boolean)) {
    const [field = '', direction = 'asc', ...extra] = part.split(/\s+/)
    if (extra.length || !['asc', 'desc'].includes(direction.toLowerCase())) {
      throw new StoreInputError(`Cannot read $orderby "${part}". Use "field" or "field desc".`)
    }
    checkField(field)
    orderBy.push({ field, descending: direction.toLowerCase() === 'desc' })
  }

  return { where: parseFilter(search.get('$filter') ?? ''), orderBy, top, skip }
}

const CLAUSE = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s+eq\s+('(?:[^']|'')*'|-?\d+(?:\.\d+)?|true|false|null)\s*(?:and\b|$)/i

export function parseFilter(filter: string): Condition[] {
  const conditions: Condition[] = []
  let rest = filter.trim()
  while (rest) {
    const match = CLAUSE.exec(rest)
    if (!match) {
      throw new StoreInputError(
        `Cannot read $filter at "${rest}". The local store supports "field eq value" clauses joined by "and".`,
      )
    }
    const [whole, field = '', literal = ''] = match
    const lower = literal.toLowerCase()
    const value =
      literal.startsWith("'") ? literal.slice(1, -1).replace(/''/g, "'")
      : lower === 'true' ? true
      : lower === 'false' ? false
      : lower === 'null' ? null
      : Number(literal)
    conditions.push({ field, value })
    rest = rest.slice(whole.length).trim()
    if (!rest && /and$/i.test(whole.trim())) throw new StoreInputError('$filter ends with a dangling "and".')
  }
  return conditions
}
