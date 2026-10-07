import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type Database from 'better-sqlite3'
import { REPO_ROOT } from '../config.ts'

export const MIGRATIONS_DIR = resolve(REPO_ROOT, 'database/migrations')

// 001_name.sql — the number fixes the order, so it is part of the contract.
const MIGRATION_FILE = /^\d+_.+\.sql$/

/**
 * Applies every migration not yet recorded in _migrations, in filename order, and returns
 * the names it applied. Each runs in its own transaction together with its bookkeeping row,
 * so a migration that fails halfway leaves neither its changes nor a record behind, and a
 * later run retries it. An applied migration is never re-run, and never edited: change the
 * schema with a new file.
 */
export function runMigrations(db: Database.Database, dir = MIGRATIONS_DIR): string[] {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  const done = new Set(db.prepare('SELECT name FROM _migrations').pluck().all() as string[])
  const record = db.prepare('INSERT INTO _migrations (name) VALUES (?)')
  const applied: string[] = []

  for (const name of readdirSync(dir).filter((f) => MIGRATION_FILE.test(f)).sort()) {
    if (done.has(name)) continue
    const sql = readFileSync(resolve(dir, name), 'utf8')
    db.transaction(() => {
      db.exec(sql)
      record.run(name)
    })()
    applied.push(name)
  }
  return applied
}
