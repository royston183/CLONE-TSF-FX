import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { INITIAL_DEAL_SEQ, MC_SEED } from './data.ts'
import { commitAmount, fmtNum, parseAmountShorthand } from './format.ts'
import {
  applyEdit,
  applyFilters,
  buildSeed,
  canCreateOrReverse,
  computeAmounts,
  computeKpis,
  createDeal,
  defaultDealAmount,
  editAccess,
  editModelCandidates,
  nextDealId,
  pagerWindow,
  reverseMc,
  validateReverseRemark,
} from './logic.ts'
import type { Filters, MasterContract } from './types.ts'

const NOW = new Date(2026, 8, 25)
const ALL: Filters = { search: '', asOf: '2026-09-25', status: 'ALL', entity: 'ALL', region: 'ALL', model: 'ALL' }
const seed = () => buildSeed(MC_SEED, INITIAL_DEAL_SEQ)
const mc = (contracts: MasterContract[], ref: number) => contracts.find((c) => c.mcRef === ref)!

describe('parseAmountShorthand', () => {
  it('reads plain, comma-grouped and M / T shorthand amounts', () => {
    strictEqual(parseAmountShorthand('1,250.5'), 1250.5)
    strictEqual(parseAmountShorthand('5M'), 5_000_000)
    strictEqual(parseAmountShorthand('250t'), 250_000)
  })

  it('is 0 for empty or unreadable text, as the ABAP conversion was', () => {
    strictEqual(parseAmountShorthand(''), 0)
    strictEqual(parseAmountShorthand('abc'), 0)
    strictEqual(commitAmount('5M'), '5,000,000.00')
    strictEqual(fmtNum(-1234.5), '-1,234.50')
  })
})

describe('buildSeed', () => {
  it('derives descriptions, dates and origin amounts from the seed block', () => {
    const { contracts } = seed()
    const first = mc(contracts, 4500001001)
    strictEqual(first.mcDesc, 'OSIPL_WHEAT_M050_8.0M')
    strictEqual(first.entityDesc, 'OGA-DMCC-OSIPL')
    strictEqual(first.amtOrigin, 8_000_000 * 83.15)
    strictEqual(first.payTerms, 'P01')
    strictEqual(mc(contracts, 4500001003).mcDesc, 'OTL_Multi-Commodity_M051_3.0M')
    strictEqual(mc(contracts, 4500001006).changedBy, 'MO_REVIEWER')
  })

  it('numbers the seeded deals from the number range, starting after 9088', () => {
    const { deals, lastSeq } = seed()
    deepStrictEqual(deals.map((d) => d.dealId), ['0000009089', '0000009090', '0000009091', '0000009092', '0000009093', '0000009094'])
    strictEqual(lastSeq, 9094)
    strictEqual(nextDealId(lastSeq), '0000009095')
  })
})

describe('computeAmounts', () => {
  const { contracts, deals } = seed()

  it('excludes Cancelled (30) deals from the utilized amount', () => {
    deepStrictEqual(computeAmounts(mc(contracts, 4500001002), deals), { uti: 5_000_000, bal: 0, exp: 0 })
    deepStrictEqual(computeAmounts(mc(contracts, 4500001008), deals), { uti: 8_000_000, bal: 1_000_000, exp: 0 })
  })

  it('moves the unutilized balance of an Expired (09) contract to the expiry amount', () => {
    deepStrictEqual(computeAmounts(mc(contracts, 4500001005), deals), { uti: 900_000, bal: 0, exp: 900_000 })
  })
})

describe('applyFilters', () => {
  const { contracts, deals } = seed()

  it('keeps only contracts whose ship end is after the As of Date', () => {
    strictEqual(applyFilters(contracts, ALL, NOW).filtered.length, 8)
    const late = applyFilters(contracts, { ...ALL, asOf: '2026-12-31' }, NOW).filtered
    deepStrictEqual(late.map((c) => c.mcRef), [4500001001, 4500001004, 4500001007, 4500001008])
  })

  it('combines search, entity, region and model filters', () => {
    const f = (patch: Partial<Filters>) => applyFilters(contracts, { ...ALL, ...patch }, NOW).filtered.map((c) => c.mcRef)
    deepStrictEqual(f({ search: 'soyabean' }), [4500001002, 4500001007])
    deepStrictEqual(f({ entity: 'OVL' }), [4500001005, 4500001006])
    deepStrictEqual(f({ region: 'R05' }), [])
    deepStrictEqual(f({ model: 'M051', search: 'rice' }), [4500001004, 4500001008])
  })

  it('applies the status filter to the table but not to the KPI scope', () => {
    const { scope, filtered } = applyFilters(contracts, { ...ALL, status: '04' }, NOW)
    strictEqual(scope.length, 8)
    deepStrictEqual(filtered.map((c) => c.mcRef), [4500001002, 4500001008])
    const { cards, totalUti } = computeKpis(scope, deals)
    deepStrictEqual(cards.map((c) => c.val), [8, 2, 2, 1])
    strictEqual(totalUti, 5_000_000 + 900_000 + 8_000_000)
  })
})

describe('pagerWindow', () => {
  it('shows at most five pages around the current one', () => {
    deepStrictEqual(pagerWindow(1, 3), [1, 2, 3])
    deepStrictEqual(pagerWindow(5, 9), [3, 4, 5, 6, 7])
    deepStrictEqual(pagerWindow(9, 9), [5, 6, 7, 8, 9])
  })
})

describe('status rules', () => {
  const { contracts, deals, lastSeq } = seed()

  it('offers Create Deal ID / Reverse MC only for Confirmed or In-Use contracts', () => {
    deepStrictEqual(
      contracts.map((c) => [c.mcStat, canCreateOrReverse(c)]),
      [['03', true], ['04', true], ['01', false], ['02', false], ['09', false], ['21', false], ['03', true], ['04', true]],
    )
    strictEqual(canCreateOrReverse(undefined), false)
  })

  it('creates a Deal ID from the next number and moves the MC to 04', () => {
    const confirmed = mc(contracts, 4500001001)
    strictEqual(defaultDealAmount(confirmed, deals), 8_000_000)
    const r = createDeal(confirmed, '2.5M', lastSeq, NOW)
    strictEqual(r.deal.dealId, '0000009095')
    strictEqual(r.lastSeq, 9095)
    strictEqual(r.deal.dealStat, '01')
    strictEqual(r.deal.amt1, 2_500_000)
    strictEqual(r.deal.amt2, 2_500_000 * 83.15)
    strictEqual(r.deal.dealDesc, 'SIDDHI PATEL_OSIPL_2026/OGA-DMCC-OSIPL')
    strictEqual(r.contract.mcStat, '04')
    deepStrictEqual(computeAmounts(r.contract, [...deals, r.deal]), { uti: 2_500_000, bal: 5_500_000, exp: 0 })
  })

  it('requires a remark to reverse, then sets status 21 with the remark', () => {
    strictEqual(validateReverseRemark('   '), false)
    strictEqual(validateReverseRemark('Contract cancelled'), true)
    const r = reverseMc(mc(contracts, 4500001007), '  Contract cancelled ', NOW)
    strictEqual(r.mcStat, '21')
    strictEqual(r.moRemarks, 'Contract cancelled')
    strictEqual(r.changedBy, 'MO_REVIEWER')
  })

  it('locks editing from status 03 and forbids it for Expired / Reversed', () => {
    deepStrictEqual(editAccess(mc(contracts, 4500001003)), { editable: true, locked: false, canSave: true })
    deepStrictEqual(editAccess(mc(contracts, 4500001001)), { editable: true, locked: true, canSave: false })
    deepStrictEqual(editAccess(mc(contracts, 4500001006)), { editable: false, locked: true, canSave: false })
  })

  it('re-derives the FX model fields on edit', () => {
    const created = mc(contracts, 4500001003)
    deepStrictEqual(editModelCandidates(created.origin).map((m) => m.code), ['M051'])
    const edited = applyEdit(created, { amount: '4M', payTerms: 'P07', model: 'M051' }, NOW)
    strictEqual(edited.amtUSD, 4_000_000)
    strictEqual(edited.amtOrigin, 4_000_000)
    strictEqual(edited.payTerms, 'P07')
    strictEqual(edited.entityDesc, 'OAL-DMCC-OTL')
    strictEqual(edited.origCurr, 'USD')
    strictEqual(edited.changedOn, NOW)
  })
})
