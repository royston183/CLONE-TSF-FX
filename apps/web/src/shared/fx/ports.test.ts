import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { matchPortGroup, portValue, toPortGroups } from './ports.ts'

describe('port groups', () => {
  const groups = toPortGroups([
    { ZPORT_GRP: 'PG01', ZPORT_GRP_SDESC: 'Africa/Europe', ZPORT_GRP_DESC: 'Any port in Africa or Europe' },
    { ZPORT_GRP: 'PG02', ZPORT_GRP_SDESC: 'Benelux', ZPORT_GRP_DESC: null },
    { ZPORT_GRP: 'PG02', ZPORT_GRP_SDESC: 'Benelux duplicate' },
    { ZPORT_GRP: '', ZPORT_GRP_SDESC: 'No code' },
    { ZPORT_GRP: 'PG03', ZPORT_GRP_SDESC: '', ZPORT_GRP_DESC: '' },
  ])
  it('maps code, label and description; drops duplicates and blanks', () => {
    deepStrictEqual(groups, [
      { code: 'PG01', label: 'Africa/Europe', desc: 'Any port in Africa or Europe' },
      { code: 'PG02', label: 'Benelux' },
    ])
  })
  it('stores the final description, else the short text', () => {
    strictEqual(portValue(groups[0]!), 'Any port in Africa or Europe')
    strictEqual(portValue(groups[1]!), 'Benelux')
  })
  it('finds a group again from the stored text', () => {
    strictEqual(matchPortGroup('any port in africa or europe', groups)?.code, 'PG01')
    strictEqual(matchPortGroup('Benelux', groups)?.code, 'PG02')
    strictEqual(matchPortGroup('Mumbai', groups), undefined)
    strictEqual(matchPortGroup('', groups), undefined)
  })
})
