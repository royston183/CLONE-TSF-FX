import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { closedReason, dats, dayLockState, lockBlocker, previousWorkingDay, type LockedDay } from './dayLock.ts'
import { initialBlotter } from './logic.ts'
import type { BlotterRow, Ctx } from './types.ts'

const ctx = (date: Date, group = 'G01', trader = 'T001'): Ctx => ({ date, group, trader })
const day = (date: string, group = 'G01'): LockedDay => ({ date, group })
const fri = new Date(2026, 9, 16) // Fri 16 Oct 2026
const mon = new Date(2026, 9, 19) // Mon 19 Oct 2026
const thu = new Date(2026, 9, 15) // Thu 15 Oct 2026

describe('Lock Blotter: the day lock', () => {
  it('writes the date as the DATS ZPDATE', () => strictEqual(dats(new Date(2026, 0, 5)), '20260105'))

  it('the previous working day skips weekends and the factory-calendar holidays', () => {
    strictEqual(dats(previousWorkingDay(fri)), '20261015')
    strictEqual(dats(previousWorkingDay(mon)), '20261016', 'Monday looks back to Friday')
    strictEqual(dats(previousWorkingDay(new Date(2026, 9, 5))), '20261001', '2 Oct 2026 is a holiday, and 3 / 4 Oct a weekend')
  })

  it('this day locked closes the blotter', () => {
    const s = dayLockState([day('20261016')], ctx(fri))
    ok(s.locked)
    ok(closedReason(s).startsWith('Blotter is locked'))
  })

  it('an unlocked blotter whose previous working day is locked is open', () => {
    const s = dayLockState([day('20261015')], ctx(fri))
    deepStrictEqual([s.locked, s.previousOpen], [false, false])
    strictEqual(closedReason(s), '')
  })

  it('a missed lock closes the next blotter until the missed day is locked, and says which day', () => {
    const missed = dayLockState([day('20261014')], ctx(fri)) // 15 Oct was never locked
    ok(missed.previousOpen)
    strictEqual(closedReason(missed), 'The blotter of the previous working day (15-10-2026) is not locked. Lock it before working on this date.')
    ok(!dayLockState([day('20261014'), day('20261015')], ctx(fri)).previousOpen)
  })

  it('Monday follows Friday, not Sunday', () => {
    ok(!dayLockState([day('20261016')], ctx(mon)).previousOpen)
    ok(dayLockState([day('20261015')], ctx(mon)).previousOpen)
  })

  it('a group that has never locked a day has no chain to continue, so its first blotter is open', () => {
    const s = dayLockState([], ctx(fri))
    deepStrictEqual([s.locked, s.previousOpen], [false, false])
    strictEqual(closedReason(s), '')
    ok(!dayLockState([day('20261020')], ctx(fri)).previousOpen, 'only EARLIER locks start the chain')
  })

  it('another group\'s locks do not count', () => {
    ok(!dayLockState([day('20261016', 'G02')], ctx(fri)).locked)
    ok(!dayLockState([day('20261014', 'G02')], ctx(fri)).previousOpen)
  })

  it('no state yet (still loading, or unreadable) is not a reason to close the blotter', () => strictEqual(closedReason(null), ''))
})

describe('Lock Blotter: what blocks the lock', () => {
  // Two example Created rows plus the ten blank drafts.
  const rows = (): BlotterRow[] => initialBlotter(thu, [], [], { demoLegs: true }).rows
  const created = (rs: BlotterRow[]) => rs.filter((r) => r.status === 'CREATED')

  it('a transaction still Created (not released to MO) refuses the lock', () => {
    const rs = rows()
    ok(created(rs).length > 0)
    strictEqual(lockBlocker(rs), 'Release all Created transactions to MO before locking the blotter.')
  })

  it('with every Created row released, blank draft rows do not refuse it', () => {
    const rs = rows().map((r): BlotterRow => (r.status === 'CREATED' ? { ...r, status: 'RELEASED' } : r))
    strictEqual(lockBlocker(rs), '')
  })

  it('a started but not created row refuses it, whichever of the four fields was filled', () => {
    const base = rows().filter((r) => r.status === 'DRAFT')
    for (const field of ['bp', 'profitCenter', 'businessArea', 'txnType'] as const) {
      const rs = base.map((r, i): BlotterRow => (i === 0 ? { ...r, [field]: 'X' } : r))
      strictEqual(lockBlocker(rs), 'Some rows are started but not created. Create or clear them before locking the blotter.', field)
    }
  })

  it('reversed rows do not refuse it', () => {
    const rs = rows().map((r): BlotterRow => (r.status === 'CREATED' ? { ...r, status: 'REVERSED' } : r))
    strictEqual(lockBlocker(rs), '')
  })

  it('Created is checked first, as the program does', () => {
    const rs = rows().map((r, i): BlotterRow => (r.status === 'DRAFT' && i === 2 ? { ...r, bp: 'BP1' } : r))
    ok(lockBlocker(rs).startsWith('Release all Created'))
  })
})
