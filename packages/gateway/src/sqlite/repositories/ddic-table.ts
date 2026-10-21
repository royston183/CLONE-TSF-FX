import type { Database, Statement } from '../db.ts'

/** One column of a SAP table as the local SQLite copy has it. `key` marks a primary-key column other than CLIENT. */
export type DdicColumn = { name: string; kind: 'text' | 'number'; max: number; key?: true }

export type DdicRow = Record<string, string | number>

export class DdicInputError extends Error {}

export type DdicTable = {
  /** SQLite table name (lower-case SAP name). */
  table: string
  /** The one client the gateway reads and writes. */
  client: string
  /** The SQLite client column; SAP tables name it CLIENT (the default) or MANDT. */
  clientColumn?: string
  /** Every column except CLIENT, in DDIC order. */
  columns: readonly DdicColumn[]
}

/**
 * A repository over one local copy of a SAP table, rows spoken in SAP's field names (ZDEAL_ID, ZFI_TYPE, ...).
 * Column names reach SQL only from the fixed `columns` list: request fields are checked against it and values
 * are bound parameters, so nothing from a request is ever part of SQL text.
 */
export function createDdicRepository(db: Database, spec: DdicTable) {
  const { table, client, columns } = spec
  const clientCol = spec.clientColumn ?? 'client'
  const keys = columns.filter((c) => c.key)
  const byName = new Map(columns.map((c) => [c.name, c]))
  const lower = (n: string) => n.toLowerCase()
  const selectAll = `SELECT ${columns.map((c) => `${lower(c.name)} AS ${c.name}`).join(', ')} FROM ${table} WHERE ${clientCol} = '${client}'`
  const keyWhere = keys.map((k) => `${lower(k.name)} = @${k.name}`).join(' AND ')
  const order = keys.map((k) => lower(k.name)).join(', ')

  const list = db.prepare<[], DdicRow>(`${selectAll} ORDER BY ${order}`)
  const one = db.prepare<Record<string, string>, DdicRow>(`${selectAll} AND ${keyWhere}`)
  const remove = db.prepare(`DELETE FROM ${table} WHERE ${clientCol} = '${client}' AND ${keyWhere}`)
  const listBy = new Map<string, Statement<[{ value: string }], DdicRow>>()

  const upsertFor = (names: readonly string[]) =>
    db.prepare(
      `INSERT INTO ${table} (${clientCol}, ${keys.map((k) => lower(k.name)).join(', ')}${names.map((n) => `, ${lower(n)}`).join('')})
       VALUES ('${client}', ${keys.map((k) => `@${k.name}`).join(', ')}${names.map((n) => `, @${n}`).join('')})
       ON CONFLICT (${clientCol}, ${keys.map((k) => lower(k.name)).join(', ')}) DO UPDATE SET ${
         names.length ? names.map((n) => `${lower(n)} = excluded.${lower(n)}`).join(', ') : `${lower(keys[0]!.name)} = ${lower(keys[0]!.name)}`
       }`,
    )
  const upserts = new Map<string, ReturnType<typeof upsertFor>>()

  /** Validates a body against the DDIC columns; key columns and unknown names are rejected. */
  function fieldsOf(body: Record<string, unknown>): Record<string, string | number> {
    const out: Record<string, string | number> = {}
    for (const [name, value] of Object.entries(body)) {
      const column = byName.get(name)
      if (!column || column.key) throw new DdicInputError(`Unknown or read-only field: ${name}.`)
      if (column.kind === 'number') {
        const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
        if (typeof n !== 'number' || !Number.isFinite(n)) throw new DdicInputError(`${name} must be a number.`)
        out[name] = n
      } else {
        if (value === null || value === undefined) {
          out[name] = ''
          continue
        }
        if (typeof value !== 'string') throw new DdicInputError(`${name} must be a string.`)
        if (value.length > column.max) throw new DdicInputError(`${name} must be at most ${column.max} characters.`)
        out[name] = value
      }
    }
    return out
  }

  const keyParams = (values: Record<string, string>): Record<string, string> => {
    const params: Record<string, string> = {}
    for (const k of keys) {
      const v = values[k.name]
      if (typeof v !== 'string' || !v.trim()) throw new DdicInputError(`${k.name} is required.`)
      if (v.length > k.max) throw new DdicInputError(`${k.name} must be at most ${k.max} characters.`)
      params[k.name] = v
    }
    return params
  }

  return {
    /** All rows, or those whose `column` equals `value` (the column must exist). */
    list(filter?: { column: string; value: string }): DdicRow[] {
      if (!filter) return list.all()
      if (!byName.has(filter.column)) throw new DdicInputError(`Unknown field: ${filter.column}.`)
      let statement = listBy.get(filter.column)
      if (!statement) {
        statement = db.prepare<[{ value: string }], DdicRow>(`${selectAll} AND ${lower(filter.column)} = @value ORDER BY ${order}`)
        listBy.set(filter.column, statement)
      }
      return statement.all({ value: filter.value })
    },
    get: (key: Record<string, string>): DdicRow | undefined => one.get(keyParams(key)),
    upsert(key: Record<string, string>, body: Record<string, unknown>): DdicRow {
      const params = keyParams(key)
      const fields = fieldsOf(body)
      const names = Object.keys(fields).sort()
      const signature = names.join(',')
      let statement = upserts.get(signature)
      if (!statement) {
        statement = upsertFor(names)
        upserts.set(signature, statement)
      }
      statement.run({ ...params, ...fields })
      return one.get(params)!
    },
    /** True when a row was removed. */
    remove: (key: Record<string, string>): boolean => remove.run(keyParams(key)).changes > 0,
  }
}

export type DdicRepository = ReturnType<typeof createDdicRepository>

const repositories = new WeakMap<Database, Map<string, DdicRepository>>()

/** One repository (and its prepared statements) per connection and table. */
export function ddicRepository(db: Database, spec: DdicTable): DdicRepository {
  let perDb = repositories.get(db)
  if (!perDb) repositories.set(db, (perDb = new Map()))
  let repo = perDb.get(spec.table)
  if (!repo) perDb.set(spec.table, (repo = createDdicRepository(db, spec)))
  return repo
}
