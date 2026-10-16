import { closeDb, getDb, sqlitePath } from './db.ts'
import { runMigrations } from './migrate.ts'
import { runSeeds, seedDmsTyp, seedTrdAcc, seedSetFx } from './seed.ts'

// Entry point for `npm run db:migrate | db:seed | db:setup`.
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

try {
  console.log(`SQLite: ${sqlitePath()}`)
  if (command === 'migrate') migrate()
  else if (command === 'seed') seed()
  else if (command === 'setup') {
    migrate()
    seed()
  } else if (command === 'seed-set-fx') {
    migrate()
    console.log(`Seeded ${seedSetFx(getDb())} ZSGTSFTR_SET_FX settlement rows.`)
  } else {
    console.error('Usage: cli.ts migrate | seed | setup | seed-set-fx')
    process.exitCode = 1
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
} finally {
  closeDb()
}
