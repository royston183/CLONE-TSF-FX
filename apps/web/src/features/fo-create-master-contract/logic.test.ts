import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { FIRST_CHILD_REFS, seedContracts } from './data.ts'
import { commitAmount, parseAmountInput, parseDMY } from './format.ts'
import {
  blankForm,
  buildContract,
  commodityDescription,
  ensureChildContracts,
  filterSortContracts,
  formFromContract,
  originAmount,
  releaseToMO,
  seedChildStore,
  validateForm,
} from './logic.ts'
import type { FormValues } from './types.ts'

const filled = (overrides: Partial<FormValues> = {}): FormValues => ({
  ...blankForm('23-09-2026'),
  originEntity: 'OSIPL',
  mcAmountUsd: '10K',
  exchangeRate: '2',
  commodity: 'C102',
  shipStart: '01-10-2026',
  shipEnd: '31-10-2026',
  fxModel: 'M032',
  ...overrides,
})

describe('parseAmountInput', () => {
  it('reads plain, comma-grouped and shorthand amounts', () => {
    strictEqual(parseAmountInput('1,250.5'), 1250.5)
    strictEqual(parseAmountInput('10K'), 10_000)
    strictEqual(parseAmountInput('2.5m'), 2_500_000)
    strictEqual(parseAmountInput('3L'), 300_000)
    strictEqual(parseAmountInput('1Cr'), 10_000_000)
  })

  it('is NaN for text that is not an amount, so it is never silently zeroed', () => {
    strictEqual(Number.isNaN(parseAmountInput('abc')), true)
    strictEqual(commitAmount('abc'), 'abc')
    strictEqual(commitAmount('10k'), '10,000.00')
  })
})

describe('parseDMY', () => {
  it('rejects impossible dates', () => {
    strictEqual(parseDMY('31-02-2026'), null)
    strictEqual(parseDMY('2026-02-01'), null)
    strictEqual(parseDMY('01-02-2026')?.getMonth(), 1)
  })
})

describe('ensureChildContracts', () => {
  const [contract] = seedContracts()

  it('creates T1/T2/T3 sell and purchase children sharing one reference per trade type', () => {
    const { store, children } = ensureChildContracts({ byMc: {}, nextRef: { ...FIRST_CHILD_REFS } }, contract!)
    deepStrictEqual(
      children.map((c) => [c.childType, c.childReference, c.description, c.sellEntity, c.buyEntity]),
      [
        ['T1S', 110001, 'OGA-DMCC-S', 'OGA', 'DMCC'],
        ['T1P', 110001, 'DMCC-OGA-P', 'OGA', 'DMCC'],
        ['T2S', 220001, 'DMCC-OSIPL-S', 'DMCC', 'OSIPL'],
        ['T2P', 220001, 'OSIPL-DMCC-P', 'DMCC', 'OSIPL'],
        ['T3S', 330001, 'OSIPL-OGA-S', 'OSIPL', 'OGA'],
        ['T3P', 330001, 'OGA-OSIPL-P', 'OSIPL', 'OGA'],
      ],
    )
    strictEqual(children[0]?.childContractNo, '2026 / 2000002728 / T1S')
    deepStrictEqual(store.nextRef, { T1: 110002, T2: 220002, T3: 330002 })
  })

  it('returns the existing children without consuming numbers', () => {
    const first = ensureChildContracts({ byMc: {}, nextRef: { ...FIRST_CHILD_REFS } }, contract!)
    const again = ensureChildContracts(first.store, contract!)
    strictEqual(again.store, first.store)
    strictEqual(again.children, first.children)
  })

  it('seeds every contract in list order', () => {
    const contracts = seedContracts()
    const store = seedChildStore(contracts, FIRST_CHILD_REFS)
    strictEqual(Object.keys(store.byMc).length, contracts.length)
    strictEqual(store.nextRef.T1, FIRST_CHILD_REFS.T1 + contracts.length)
  })
})

describe('validateForm', () => {
  it('accepts a complete form', () => {
    deepStrictEqual(validateForm(filled()), { valid: true, errors: {} })
  })

  it('flags every missing required field on a blank form', () => {
    const { valid, errors } = validateForm(blankForm())
    strictEqual(valid, false)
    deepStrictEqual(Object.keys(errors).sort(), [
      'commodity', 'exchangeRate', 'fxModel', 'mcAmountUsd', 'mcDate', 'originEntity', 'shipEnd', 'shipStart',
    ])
  })

  it('rejects a shipment end before its start', () => {
    deepStrictEqual(validateForm(filled({ shipEnd: '30-09-2026' })).errors, { shipEnd: true })
  })

  it('needs at least one picked commodity for Multiple Commodity', () => {
    deepStrictEqual(validateForm(filled({ commodity: 'C101' })).errors, { commodity: true })
    strictEqual(validateForm(filled({ commodity: 'C101', selectedCommodities: ['C102'] })).valid, true)
  })
})

describe('buildContract', () => {
  it('fills the defaults a new contract gets', () => {
    const c = buildContract(filled(), 2000002729, null)
    strictEqual(c.status, 'Created')
    strictEqual(c.statusCode, '01')
    strictEqual(c.mcAmountUsd, 10_000)
    strictEqual(c.mcAmountOrigin, 20_000)
    strictEqual(c.reference, 'MC/OSIPL/2026/729')
    strictEqual(c.paymentTerms, 'P01')
    strictEqual(c.paymentDate, '31-10-2026')
    strictEqual(c.selectedCommodities, null)
  })

  it('keeps status and linked deal when editing', () => {
    const [existing] = seedContracts()
    const c = buildContract(formFromContract(existing!), existing!.mcNumber, existing!)
    strictEqual(c.status, 'In Use')
    strictEqual(c.linkedDealId, 'DEAL-900187')
    strictEqual(c.mcAmountUsd, 100_000)
  })

  it('reads back a grouped exchange rate of 1,000 or more from Edit/Copy', () => {
    const [existing] = seedContracts()
    const values = formFromContract({ ...existing!, exchangeRate: 16000.1234 })
    strictEqual(values.exchangeRate, '16,000.1234')
    strictEqual(buildContract(values, existing!.mcNumber, existing!).exchangeRate, 16000.1234)
    strictEqual(originAmount({ ...values, mcAmountUsd: '2' }), '32,000.25')
    strictEqual(validateForm(values).errors.exchangeRate, undefined)
  })
})

describe('form helpers', () => {
  it('computes the origin amount only for positive inputs', () => {
    strictEqual(originAmount(filled()), '20,000.00')
    strictEqual(originAmount(filled({ exchangeRate: '0' })), '')
  })

  it('shortens a long multiple-commodity description', () => {
    deepStrictEqual(
      commodityDescription(filled({ commodity: 'C101', selectedCommodities: ['C102', 'C104', 'C105', 'C106'] })),
      { value: 'WHEAT, BARLEY, CORN +1 more', title: 'WHEAT, BARLEY, CORN, MAIZE' },
    )
  })
})

describe('filterSortContracts', () => {
  const contracts = seedContracts()
  const noFilters = { status: '', entity: '', fxModel: '', commodity: '' }

  it('sorts by MC number descending by default', () => {
    const list = filterSortContracts(contracts, '', noFilters, { field: 'mcNumber', dir: 'desc' })
    strictEqual(list[0]?.mcNumber, 2000002728)
  })

  it('sorts DD-MM-YYYY dates chronologically, not as text', () => {
    const list = filterSortContracts(contracts, '', noFilters, { field: 'mcDate', dir: 'asc' })
    strictEqual(list[0]?.mcDate, '22-08-2026')
  })

  it('combines search with filters', () => {
    const list = filterSortContracts(contracts, 'rice', { ...noFilters, entity: 'OSIPL' }, { field: 'mcNumber', dir: 'desc' })
    deepStrictEqual(list.map((c) => c.mcNumber), [2000002727, 2000002712, 2000002706, 2000002694])
  })
})

describe('releaseToMO', () => {
  it('moves only newly created contracts to Released to M.O.', () => {
    const created = buildContract(filled(), 2000002729, null)
    strictEqual(releaseToMO(created).status, 'Released to M.O.')
    const [inUse] = seedContracts()
    strictEqual(releaseToMO(inUse!), inUse)
  })
})
