import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { regionLabel, regionOptions } from './regions.ts'

describe('regionOptions', () => {
  // As SAP holds them (DS4/100): COMP R01/R02, BPEXT R01 typed as both IN and SEA.
  const comp = [{ ZREG_ID: 'R01' }, { ZREG_ID: 'R01' }, { ZREG_ID: 'R02' }, { ZREG_ID: '' }]
  const bpext = [
    { ZREG_ID: 'R01', ZREGION: 'IN' },
    { ZREG_ID: 'R01', ZREGION: 'SEA' },
    { ZREG_ID: 'R03', ZREGION: 'Americas' },
    { ZREG_ID: 'R08', ZREGION: 'Brazil' },
    { ZREG_ID: 'R08', ZREGION: '' },
    { ZREG_ID: '', ZREGION: 'R03' },
  ]

  it('offers every code COMP and BPEXT hold, sorted, named only where BPEXT agrees', () => {
    deepStrictEqual(regionOptions(comp, bpext), [
      { id: 'R01', name: '' },
      { id: 'R02', name: '' },
      { id: 'R03', name: 'Americas' },
      { id: 'R08', name: 'Brazil' },
    ])
  })

  it('still lists the COMP codes when BPEXT could not be read', () => {
    deepStrictEqual(regionOptions(comp, []), [
      { id: 'R01', name: '' },
      { id: 'R02', name: '' },
    ])
  })

  it('labels a named region with its code', () => {
    strictEqual(regionLabel({ id: 'R03', name: 'Americas' }), 'R03 · Americas')
    strictEqual(regionLabel({ id: 'R01', name: '' }), 'R01')
  })
})
