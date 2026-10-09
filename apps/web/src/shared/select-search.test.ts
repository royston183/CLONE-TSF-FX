import { deepStrictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { rankOptions, type SelectOption } from './select-search.ts'

const opt = (value: string, label = value): SelectOption => ({ value, label, disabled: false })
const labels = (list: SelectOption[]) => list.map((o) => o.label)

describe('rankOptions', () => {
  const companyCodes = [
    opt('', '-- Select --'),
    opt('IN11', 'IN11 - Olam SG Branch'),
    opt('SG01', 'SG01 - Singapore'),
    opt('AE01', 'AE01 - Dubai'),
    opt('SG02', 'SG02 - Singapore Treasury'),
  ]

  it('lists everything for an empty query', () => {
    deepStrictEqual(rankOptions(companyCodes, '  ').length, 5)
  })

  it('puts options starting with the query first, ignoring case, then word matches', () => {
    deepStrictEqual(labels(rankOptions(companyCodes, 'sg')), ['SG01 - Singapore', 'SG02 - Singapore Treasury', 'IN11 - Olam SG Branch'])
  })

  it('matches the value as well as the text', () => {
    deepStrictEqual(labels(rankOptions([opt('M032', 'INR Long Forward')], 'm03')), ['INR Long Forward'])
  })

  it('does not match inside a word', () => {
    deepStrictEqual(rankOptions(companyCodes, 'ngap'), [])
  })
})
