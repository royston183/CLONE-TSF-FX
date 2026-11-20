// npm run db:import-deals -- <deals.xlsx> [sheet]   loads the demo Deal IDs (default sheet: Sheet2)
// node tools/import-demo-deals.mjs export <deals.xlsx> <out.json> [sheet]   the Deal IDs as JSON, for the in-app import page
// npm run db:clear-deals                             removes them again
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { REPO_ROOT } from '../packages/gateway/src/config.ts'
import { clearDemoDeals, parseDealDump, saveDemoDeals } from '../packages/gateway/src/sqlite/demo-deals.ts'
import { SqliteStore } from '../packages/gateway/src/sqlite/store.ts'

const [command, file, third, fourth] = process.argv.slice(2)
const out = command === 'export' ? third : undefined
const sheet = (command === 'export' ? fourth : third) ?? 'Sheet2'
const store = new SqliteStore(resolve(REPO_ROOT, 'data/slc.db'))
try {
  if (command === 'clear') {
    console.log(`Removed ${clearDemoDeals(store)} demo records.`)
  } else if ((command === 'import' || (command === 'export' && out)) && file) {
    const XLSX = createRequire(import.meta.url)('xlsx')
    const book = XLSX.readFile(resolve(file))
    if (!book.Sheets[sheet]) throw new Error(`No sheet "${sheet}" in ${file}. It has: ${book.SheetNames.join(', ')}.`)
    const data = parseDealDump(XLSX.utils.sheet_to_json(book.Sheets[sheet], { header: 1, raw: false, defval: '' }))
    if (command === 'export') {
      writeFileSync(resolve(out), JSON.stringify(data.dealIds.map(({ id, DEMO, ZBUKRS1, ZRFHA1, ...deal }) => deal), null, 1))
      console.log(`Wrote ${data.dealIds.length} Deal IDs to ${out}.`)
      process.exit(0)
    }
    console.log(`Saved ${saveDemoDeals(store, data)} demo Deal IDs (${data.statuses.length} statuses, ${data.skipped} total rows skipped).`)
  } else {
    console.log('Usage: import <deals.xlsx> [sheet] | clear')
    process.exitCode = 1
  }
} finally {
  store.close()
}
