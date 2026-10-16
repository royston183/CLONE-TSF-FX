import { writeFileSync } from 'node:fs'
import { markAccountingComplete } from '../../../apps/web/src/features/bo-post-accounting-settlement/accounting.ts'

// Dependency stubs only: no network, database, or production status writes.
const evidence = []
for (const [name, positions] of [
  ['posted invoice leg; no FX document evidence supplied', [{ ZT_TYPE: 'T1-S', ZEXE_CO: 'X', ZPOST_CHECK: 'X', ZBELNR: '123' }]],
  ['no-invoice model with no trade positions', []],
]) {
  const capturedStatusWrites = []
  const result = await markAccountingComplete('AUDIT', {
    readDeal: async () => ({ ZDEAL_ID: 'AUDIT', ZDEAL_STAT: '21' }),
    readPositions: async () => positions,
    writeStatus: async (_row, status) => { capturedStatusWrites.push(status) },
  })
  evidence.push({ name, result, capturedStatusWrites })
}
writeFileSync(new URL('./accounting-reproduction.json', import.meta.url), JSON.stringify(evidence, null, 2) + '\n')
console.log(JSON.stringify(evidence, null, 2))
