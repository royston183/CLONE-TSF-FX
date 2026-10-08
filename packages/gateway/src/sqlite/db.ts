import { mkdirSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { REPO_ROOT } from '../config.ts'

const DEFAULT_PATH = './data/tsf-fx.db'

/*
 * node:sqlite ships with Node, so there is no native module to compile (better-sqlite3 needs
 * Python + the MSVC build tools on Windows when no prebuilt binary matches the Node version, which
 * kept the gateway from starting). This wrapper keeps the small better-sqlite3 surface the
 * migrations, seeds and repositories use: prepare / pluck / get / all / run, transaction, exec,
 * pragma, close.
 */

/** Positional values, or one object of named values (`@name` in the SQL, `name` in the object). */
type Params<P> = P extends readonly unknown[] ? P : [P]

export type RunResult = { changes: number; lastInsertRowid: number | bigint }

export interface Statement<P = unknown[], R = unknown> {
  run(...params: Params<P>): RunResult
  get(...params: Params<P>): R | undefined
  all(...params: Params<P>): R[]
  /** Rows as their first column's value, as better-sqlite3's pluck(). */
  pluck(): Statement<P, unknown>
}

export interface Database {
  prepare<P = unknown[], R = unknown>(sql: string): Statement<P, R>
  exec(sql: string): void
  pragma(pragma: string): void
  /** Wraps fn in BEGIN / COMMIT (a SAVEPOINT when nested); any throw rolls back. */
  transaction<A extends unknown[], T>(fn: (...args: A) => T): (...args: A) => T
  close(): void
}

// node:sqlite returns null-prototype rows; plain objects compare and serialise like before.
const plain = (row: unknown): unknown => (row && typeof row === 'object' ? { ...(row as object) } : row)
const first = (row: unknown): unknown => (row && typeof row === 'object' ? Object.values(row as object)[0] : undefined)

/** SQLite result codes by number, so errors carry better-sqlite3's `code` (callers map SQLITE_CONSTRAINT* to 409). */
const SQLITE_CODES: Record<number, string> = {
  19: 'SQLITE_CONSTRAINT',
  275: 'SQLITE_CONSTRAINT_CHECK',
  787: 'SQLITE_CONSTRAINT_FOREIGNKEY',
  1299: 'SQLITE_CONSTRAINT_NOTNULL',
  1555: 'SQLITE_CONSTRAINT_PRIMARYKEY',
  1811: 'SQLITE_CONSTRAINT_TRIGGER',
  2067: 'SQLITE_CONSTRAINT_UNIQUE',
  2579: 'SQLITE_CONSTRAINT_ROWID',
  5: 'SQLITE_BUSY',
  1: 'SQLITE_ERROR',
}

function sqliteCode<T>(work: () => T): T {
  try {
    return work()
  } catch (error) {
    const e = error as { errcode?: number; code?: string }
    if (typeof e?.errcode === 'number') e.code = SQLITE_CODES[e.errcode] ?? (SQLITE_CODES[e.errcode & 0xff] ?? `SQLITE_${e.errcode}`)
    throw error
  }
}

function wrapStatement<P, R>(stmt: StatementSync, pluck = false): Statement<P, R> {
  const args = (params: readonly unknown[]) => params as unknown as Parameters<StatementSync['run']>
  return {
    run: (...params) => {
      const r = sqliteCode(() => stmt.run(...args(params)))
      return { changes: Number(r.changes), lastInsertRowid: r.lastInsertRowid }
    },
    get: (...params) => {
      const row = sqliteCode(() => stmt.get(...args(params)))
      return (row === undefined ? undefined : pluck ? first(row) : plain(row)) as R | undefined
    },
    all: (...params) => sqliteCode(() => stmt.all(...args(params))).map((row) => (pluck ? first(row) : plain(row))) as R[],
    pluck: () => wrapStatement<P, unknown>(stmt, true),
  }
}

function wrapDatabase(db: DatabaseSync): Database {
  let depth = 0
  return {
    prepare: <P, R>(sql: string) => {
      const stmt = db.prepare(sql)
      // better-sqlite3 ignores object keys the statement does not use; so do we.
      stmt.setAllowUnknownNamedParameters(true)
      return wrapStatement<P, R>(stmt)
    },
    exec: (sql) => sqliteCode(() => db.exec(sql)),
    pragma: (pragma) => db.exec(`PRAGMA ${pragma}`),
    transaction:
      (fn) =>
      (...args) => {
        const name = `sp${depth}`
        db.exec(depth === 0 ? 'BEGIN' : `SAVEPOINT ${name}`)
        depth++
        try {
          const result = fn(...args)
          depth--
          db.exec(depth === 0 ? 'COMMIT' : `RELEASE ${name}`)
          return result
        } catch (error) {
          depth--
          db.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${name}; RELEASE ${name}`)
          throw error
        }
      },
    close: () => db.close(),
  }
}

/** SQLITE_PATH, resolved against the repo root so the result does not depend on the cwd. */
export function sqlitePath(): string {
  const configured = process.env['SQLITE_PATH']?.trim() || DEFAULT_PATH
  return isAbsolute(configured) ? configured : resolve(REPO_ROOT, configured)
}

/** Opens a database with the pragmas every connection here must have. */
export function openDatabase(path: string): Database {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = wrapDatabase(new DatabaseSync(path))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  return db
}

let shared: Database | undefined

/**
 * The one connection the gateway shares. Opened on first use, not at startup: SQLite is an
 * addition, so an unwritable data folder must fail the /api/localdb routes, never keep the
 * gateway from serving SAP and middleware traffic.
 */
export function getDb(): Database {
  shared ??= openDatabase(sqlitePath())
  return shared
}

export function closeDb(): void {
  shared?.close()
  shared = undefined
}
