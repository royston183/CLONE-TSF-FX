import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { loadServices, REPO_ROOT } from '../packages/gateway/src/config.ts'
import { cloudTable } from '../packages/gateway/src/cloud/table.ts'
import { sqlitePath } from '../packages/gateway/src/sqlite/db.ts'
import { TRD_POS_COLUMNS } from '../packages/gateway/src/sqlite/repositories/trd-pos-columns.ts'
import { TRD_ACC_COLUMNS } from '../packages/gateway/src/sqlite/repositories/trd-acc-columns.ts'
import { DEALDMS_COLUMNS } from '../packages/gateway/src/sqlite/repositories/dealdms-columns.ts'
import { DAYLOCK_COLUMNS } from '../packages/gateway/src/sqlite/repositories/daylock-columns.ts'

// Dry run by default. Only missing keys can be inserted; differing shared rows stop the migration.
const apply = process.argv.includes('--apply')
if (process.argv.slice(2).some((arg) => arg !== '--apply')) throw new Error('Usage: node --env-file-if-exists=.env tools/migrate-tsf-cloud.mjs [--apply]')
const services = loadServices(process.env.SLC_SERVICES_CONFIG)
const db = new DatabaseSync(sqlitePath(), { readOnly: true })
const specs = [
  ['trdPos', 'zsgtsftr_trd_pos', TRD_POS_COLUMNS],
  ['tsfTrdAcc', 'zsgtsftr_trd_acc', TRD_ACC_COLUMNS],
  ['tsfDealdms', 'zsgtsftr_dealdms', DEALDMS_COLUMNS],
  ['daylock', 'zsgtsftr_daylock', DAYLOCK_COLUMNS, 'upper'],
]
const plans = []
const conflicts = []
// The middleware owns these audit times on POST/PATCH; retain source times in the snapshot.
const middlewareTimes = new Set(['ZCREATED_TIME', 'ZCHANGED_TIME'])
const differencesOf = (source, target) => Object.keys(source).filter((name) => !middlewareTimes.has(name) && (source[name] ?? '') !== (target[name] ?? ''))
try {
  for (const [resource, table, columns, columnCase] of specs) {
    const repo = cloudTable(services.get('middleware'), resource, columns, columnCase)
    const keys = columns.filter((c) => c.key).map((c) => c.name)
    const keyOf = (row) => Object.fromEntries(keys.map((k) => [k, row[k]]))
    const signature = (row) => JSON.stringify(keys.map((k) => resource === 'daylock' && k === 'ZMONTH' ? String(Number(row[k])) : row[k]))
    const remote = new Map((await repo.list()).map((row) => [signature(row), row]))
    const local = db.prepare(`SELECT * FROM ${table} WHERE client = ?`).all('100').map((raw) =>
      Object.fromEntries(columns.map((c) => [c.name, raw[c.name.toLowerCase()]])))
    const missing = []
    for (const row of local) {
      const existing = remote.get(signature(row))
      if (!existing) { missing.push(row); continue }
      const differences = differencesOf(resource === 'daylock' ? { ...row, ZMONTH: existing.ZMONTH } : row, existing)
      if (differences.length) conflicts.push({ resource, key: keyOf(row), differences })
    }
    console.log(JSON.stringify({ resource, localRows: local.length, cloudRows: remote.size, missing: missing.length }))
    plans.push({ resource, repo, keyOf, missing })
  }
  if (conflicts.length) throw new Error(`Shared rows differ; no rows copied: ${JSON.stringify(conflicts)}`)
  if (!apply) {
    console.log('Dry run complete. Use --apply to insert missing rows; shared rows are preserved.')
  } else if (plans.some((p) => p.missing.length)) {
    const directory = resolve(REPO_ROOT, 'data/cloud-migrations')
    mkdirSync(directory, { recursive: true })
    const backup = resolve(directory, `tsf-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
    writeFileSync(backup, JSON.stringify(plans.map(({ resource, missing }) => ({ resource, rows: missing })), null, 2))
    console.log(`Source snapshot: ${backup}`)
    for (const { resource, repo, keyOf, missing } of plans) {
      for (const row of missing) {
        const key = keyOf(row)
        // Recheck just before insertion. POST's unique key also prevents a racing overwrite.
        if (await repo.get(key)) throw new Error(`Cloud key appeared during migration: ${resource} ${JSON.stringify(key)}`)
        const fields = Object.fromEntries(Object.entries(row).filter(([name]) => !(name in key)))
        await repo.upsert(key, fields, undefined)
        const saved = await repo.get(key)
        if (!saved || differencesOf(row, saved).length) {
          throw new Error(`Cloud read-back differs: ${resource} ${JSON.stringify(key)}. Source snapshot is preserved.`)
        }
      }
      console.log(JSON.stringify({ resource, copied: missing.length }))
    }
  } else {
    console.log('Cloud already contains every local row; nothing to copy.')
  }
} finally {
  db.close()
  for (const service of services.values()) {
    service.store?.close()
    await service.agent.close()
  }
}
