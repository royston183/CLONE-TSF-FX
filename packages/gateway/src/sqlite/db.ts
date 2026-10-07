import { mkdirSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { REPO_ROOT } from '../config.ts'

const DEFAULT_PATH = './data/tsf-fx.db'

/** SQLITE_PATH, resolved against the repo root so the result does not depend on the cwd. */
export function sqlitePath(): string {
  const configured = process.env['SQLITE_PATH']?.trim() || DEFAULT_PATH
  return isAbsolute(configured) ? configured : resolve(REPO_ROOT, configured)
}

/** Opens a database with the pragmas every connection here must have. */
export function openDatabase(path: string): Database.Database {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  return db
}

let shared: Database.Database | undefined

/**
 * The one connection the gateway shares. Opened on first use, not at startup: SQLite is an
 * addition, so a missing native binary or an unwritable data folder must fail the /api/localdb
 * routes, never keep the gateway from serving SAP and middleware traffic.
 */
export function getDb(): Database.Database {
  shared ??= openDatabase(sqlitePath())
  return shared
}

export function closeDb(): void {
  shared?.close()
  shared = undefined
}
