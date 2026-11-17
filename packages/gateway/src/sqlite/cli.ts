import { closeDb, getDb, sqlitePath } from './db.ts'
import { runMigrations } from './migrate.ts'
import { runSeeds, seedDmsTyp, seedTrdAcc, seedSetFx } from './seed.ts'

// Entry point for `npm run db:migrate | db:seed | db:setup | db:ensure`.
const command = process.argv[2]

function migrate(): void {
  const applied = runMigrations(getDb())
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Migrations: already up to date.')
}

function seed(): void {
  console.log(`Seeded ${runSeeds(getDb())} lookup values.`)
  console.log(`Seeded ${seedTrdAcc(getDb())} ZSGTSFTR_TRD_ACC posting types.`)
  console.log(`Seeded ${seedDmsTyp(getDb())} ZSGTSFTR_DMS_TYP document types.`)
  console.log(`Seeded ${seedSetFx(getDb())} ZSGTSFTR_SET_FX settlement rows.`)
}

/**
 * What `npm run dev` and `npm start` run first: brings the database up to date and fills in what is missing, and nothing
 * more. Migrations are applied when new ones exist; each shipped configuration table (posting types, settlement rows,
 * document types) is loaded only while it is empty, so a value changed in the application is never put back. `db:setup`
 * stays the way to reload every shipped row on purpose.
 */
function ensure(): void {
  const db = getDb()
  const applied = runMigrations(db)
  const empty = (table: string) => !db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get()
  runSeeds(db)
  const loaded: string[] = []
  if (empty('zsgtsftr_trd_acc')) loaded.push(`${seedTrdAcc(db)} posting types`)
  if (empty('zsgtsftr_set_fx')) loaded.push(`${seedSetFx(db)} settlement rows`)
  const dms = seedDmsTyp(db)
  if (dms) loaded.push(`${dms} document types`)
  console.log(`Database ready${applied.length ? `; migrations applied: ${applied.join(', ')}` : ''}${loaded.length ? `; loaded ${loaded.join(', ')}` : ''}.`)
}

try {
  console.log(`SQLite: ${sqlitePath()}`)
  if (command === 'migrate') migrate()
  else if (command === 'ensure') ensure()
  else if (command === 'seed') seed()
  else if (command === 'setup') {
    migrate()
    seed()
  } else if (command === 'seed-set-fx') {
    migrate()
    console.log(`Seeded ${seedSetFx(getDb())} ZSGTSFTR_SET_FX settlement rows.`)
  } else {
    console.error('Usage: cli.ts migrate | seed | setup | ensure | seed-set-fx')
    process.exitCode = 1
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
} finally {
  closeDb()
}
