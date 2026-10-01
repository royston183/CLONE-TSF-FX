import { deepStrictEqual, ok, rejects, strictEqual, throws } from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import type { FxRow } from '../../shared/fx/mw.ts'
import { BUSINESS_AREAS, BUSINESS_PARTNERS, COMMODITIES, ENTITIES, FX_MODELS, GROUPS, PROFIT_CENTERS, TRADERS, entityOf, modelOf } from './data.ts'
import {
  MasterLoadError,
  USABLE_MC_STATUSES,
  buildMasters,
  entityStringParts,
  installMasters,
  loadBlotterMasters,
  toBusinessAreas,
  toCommodities,
  toEntities,
  toFxModels,
  toMasterContracts,
  toProfitCenters,
  toTolerance,
} from './masters.ts'
import { spotPartners } from './logic.ts'

// Rows shaped like the live middleware answers (columns trimmed to the ones the blotter reads).
const comp = (over: FxRow): FxRow => ({
  ZCOM_ID: 'OGA', ZBUKRS: 'SG03', ZBUTXT: 'Olam Global Agri Pte. Ltd', ZWAERS: 'USD',
  ZFX_PC_NAME: 'FX', ZBA_NAME: 'SINGAPORE', ZBA_NAME_O: '', ZBA_NAME_B: '', ZBA_NAME_CT: '', ...over,
})
const COMP_ROWS: FxRow[] = [
  comp({}),
  comp({ ZCOM_ID: 'DMCC', ZBUKRS: 'AE13', ZBUTXT: 'Olam International DMCC', ZWAERS: 'AED', ZFX_PC_NAME: 'TSF-FX', ZBA_NAME: 'OLAM INTERNATIONAL DMCC', ZBA_NAME_O: 'OLAM INTERNATIONAL DMCC', ZBA_NAME_B: 'Olam Outspan TSF' }),
  comp({ ZCOM_ID: 'OSIPL', ZBUKRS: 'IN11', ZBUTXT: 'Olam Agri India Pvt Ltd', ZWAERS: 'INR', ZFX_PC_NAME: 'TSF - FX', ZBA_NAME: 'OLAM AGRI INDIA PRIVATE LIMITE', ZBA_NAME_O: 'HCMC Head Office' }),
  comp({ ZCOM_ID: 'SEDA', ZBUKRS: 'ES12', ZBUTXT: 'SEDA OUTSPAN IBERIA S.L.U', ZWAERS: 'EUR', ZFX_PC_NAME: '', ZBA_NAME: '', ZBA_NAME_O: 'SEDA OUTSPAN IBERIA S.L.' }),
  comp({ ZCOM_ID: 'ORPHAN', ZBUKRS: '' }),
  comp({ ZCOM_ID: '', ZBUKRS: 'XX99' }),
]

const MODEL_ROWS: FxRow[] = [
  { ZMOD_ID: 'M032', ZMOD_DESC: 'INR Long Forward', ZENT_DESC: 'OGA-DMCC-OSIPL', ZD1_BCURR: 'USD', ZD2_BCURR: 'INR', ZSS: 'N' },
  { ZMOD_ID: 'M037', ZMOD_DESC: 'INR Short Forward', ZENT_DESC: 'OGA-OSIPL-DMCC', ZD1_BCURR: 'USD', ZD2_BCURR: 'INR', ZSS: 'N' },
  { ZMOD_ID: 'M042', ZMOD_DESC: 'INR Self-Settled Forward', ZENT_DESC: 'OGA-DMCC-OSIPL', ZD1_BCURR: 'USD', ZD2_BCURR: 'INR', ZSS: 'X' },
  { ZMOD_ID: 'M099', ZMOD_DESC: 'Odd pair', ZENT_DESC: 'OGA-DMCC-OSIPL', ZD1_BCURR: 'USD', ZD2_BCURR: 'XYZ', ZSS: '' },
  { ZMOD_ID: '', ZMOD_DESC: 'No id' },
]

const MC_ROWS: FxRow[] = [
  { ZMC_REF_NO: '2000000005', ZMOD_ID: 'M032', ZMOD_DESC: 'INR Long Forward', ZENT_DESC: 'OGA-DMCC-OSIPL', ZCURR: 'USD', ZOCURR: 'INR', ZCOMMODITY: 'C105', ZCOM_DESC: 'CORN', ZCOM_DESC_LONG: 'CORN (YELLOW)', ZMC_DATE: '2026-08-22', ZSHIP_START: '2026-08-22', ZSHIP_END: '2026-10-15', ZAMT: '100000.00', ZUTI_AMT: '25000.00', ZPOS: 'Mumbai', ZPOD: 'Singapore', ZMC_STAT: '04' },
  { ZMC_REF_NO: '2000000009', ZMOD_ID: 'M032', ZMOD_DESC: 'INR Long Forward', ZENT_DESC: 'OGA-DMCC-OSIPL', ZCURR: 'EUR', ZOCURR: 'INR', ZMC_DATE: '2026-08-22', ZSHIP_START: '2026-08-22', ZSHIP_END: '2026-10-15', ZAMT: '100.00', ZMC_STAT: '03' },
  { ZMC_REF_NO: '2000000010', ZMOD_ID: 'M032', ZCURR: 'USD', ZOCURR: 'INR', ZMC_DATE: '2026-08-22', ZSHIP_START: null, ZSHIP_END: '2026-10-15', ZAMT: '100.00', ZMC_STAT: '03' },
  { ZMC_REF_NO: '', ZCURR: 'USD', ZOCURR: 'INR', ZMC_DATE: '2026-08-22', ZSHIP_START: '2026-08-22', ZSHIP_END: '2026-10-15' },
]

const TOL_ROWS: FxRow[] = [
  { ZTOL_ID: 'T01', ZTOL_TYPE: 'Master Contract tolerance', ZTOL_PER: '5.0000000' },
  { ZTOL_ID: 'T02', ZTOL_TYPE: 'Deal amount tolerance', ZTOL_PER: '2.0000000' },
]

const COMMODITY_ROWS: FxRow[] = [
  { ZCOM_ID: 'C001', ZCOM_SDESC: 'Multi-Commodity', ZCOM_DESC: 'Multiple Commodities' },
  { ZCOM_ID: 'C102', ZCOM_SDESC: 'WHEAT', ZCOM_DESC: '' },
  { ZCOM_ID: '', ZCOM_SDESC: 'no id' },
]

describe('comp -> entities', () => {
  it('maps entity code, SAP company code, name, currency, profit centre and business area', () => {
    const e = toEntities(COMP_ROWS)
    deepStrictEqual(e[0], { code: 'OGA', cocode: 'SG03', name: 'Olam Global Agri Pte. Ltd', currency: 'USD', defaultProfitCenter: 'FX', businessArea: 'SINGAPORE' })
    deepStrictEqual(e[1], { code: 'DMCC', cocode: 'AE13', name: 'Olam International DMCC', currency: 'AED', defaultProfitCenter: 'TSF-FX', businessArea: 'OLAM INTERNATIONAL DMCC' })
  })

  it('keeps the entity code and the company code apart, and skips a row missing either', () => {
    const e = toEntities(COMP_ROWS)
    deepStrictEqual(e.map((x) => [x.code, x.cocode]), [['OGA', 'SG03'], ['DMCC', 'AE13'], ['OSIPL', 'IN11'], ['SEDA', 'ES12']])
  })
})

describe('comp -> profit centres and business areas', () => {
  it('lists each FX profit centre once and ignores blanks', () => {
    deepStrictEqual(toProfitCenters(COMP_ROWS).map((p) => p.code), ['FX', 'TSF-FX', 'TSF - FX'])
    deepStrictEqual(toProfitCenters(COMP_ROWS)[0], { code: 'FX', label: 'FX' })
  })

  it('lists each business area once, from the company, _O and _B columns, ignoring blanks', () => {
    deepStrictEqual(
      toBusinessAreas(COMP_ROWS).map((b) => b.code),
      ['SINGAPORE', 'OLAM INTERNATIONAL DMCC', 'Olam Outspan TSF', 'OLAM AGRI INDIA PRIVATE LIMITE', 'HCMC Head Office', 'SEDA OUTSPAN IBERIA S.L.'],
    )
  })

  it('does not use the _CT (ICFS) column', () => {
    const rows = [comp({ ZBA_NAME: '', ZBA_NAME_CT: 'ICFS ONLY' })]
    deepStrictEqual(toBusinessAreas(rows), [])
  })

  it('trims values and treats whitespace as blank', () => {
    deepStrictEqual(toProfitCenters([comp({ ZFX_PC_NAME: '  FX ' }), comp({ ZFX_PC_NAME: '   ' })]).map((p) => p.code), ['FX'])
  })
})

describe('commodity', () => {
  it('maps the ID and the long description, falling back to the short one', () => {
    deepStrictEqual(toCommodities(COMMODITY_ROWS), [
      { code: 'C001', desc: 'Multiple Commodities' },
      { code: 'C102', desc: 'WHEAT' },
    ])
  })
})

describe('tolerance', () => {
  it('reads the Master Contract tolerance (T01) as a percentage', () => {
    strictEqual(toTolerance(TOL_ROWS), 5)
    strictEqual(toTolerance(TOL_ROWS, 'T02'), 2)
  })
  it('is undefined when the row is missing', () => {
    strictEqual(toTolerance([TOL_ROWS[1]!]), undefined)
  })
})

describe('fxModel', () => {
  it('splits the entity string into the two legs and reads the pair from the legs\' currencies', () => {
    const m = toFxModels(MODEL_ROWS, 5)
    deepStrictEqual(m.map((x) => x.code), ['M032', 'M037', 'M042', 'M099'])
    const a = m[0]!
    deepStrictEqual(a.entities, ['OGA', 'DMCC', 'OSIPL'])
    deepStrictEqual(a.d1, { from: 'OGA', to: 'DMCC', bs1: 'S', bs2: 'B' })
    deepStrictEqual(a.d2, { from: 'DMCC', to: 'OSIPL', bs1: 'S', bs2: 'B' })
    strictEqual(a.pair, 'USD/INR')
    strictEqual(a.tolerancePct, 5)
    strictEqual(a.valueDateToleranceDays, 5)
  })

  it('reads a Short model as Buy then Sell, and the self-settled flag from ZSS', () => {
    const m = toFxModels(MODEL_ROWS, 5)
    deepStrictEqual(m[1]!.d1, { from: 'OGA', to: 'OSIPL', bs1: 'B', bs2: 'S' })
    strictEqual(m[0]!.ssEligible, false)
    strictEqual(m[2]!.ssEligible, true)
  })

  it('gives a model whose pair the blotter does not quote no pair, and skips one without an ID', () => {
    const m = toFxModels(MODEL_ROWS, 5)
    strictEqual(m[3]!.pair, '')
    ok(!m.some((x) => x.code === ''))
  })

  it('takes the tolerance it is given', () => {
    strictEqual(toFxModels(MODEL_ROWS, 2)[0]!.tolerancePct, 2)
  })

  it('splits entity strings on the dash and drops empties', () => {
    deepStrictEqual(entityStringParts('OGA-DMCC-OSIPL'), ['OGA', 'DMCC', 'OSIPL'])
    deepStrictEqual(entityStringParts(' OGA - DMCC '), ['OGA', 'DMCC'])
    deepStrictEqual(entityStringParts(''), [])
  })
})

describe('masterContract', () => {
  it('maps a contract, reading the balance as USD and keeping the loaded utilisation', () => {
    const [mc] = toMasterContracts(MC_ROWS)
    ok(mc)
    strictEqual(mc.mcNumber, '2000000005')
    strictEqual(mc.fxModel, 'M032')
    strictEqual(mc.modelDesc, 'INR Long Forward')
    deepStrictEqual(mc.entities, ['OGA', 'DMCC', 'OSIPL'])
    strictEqual(mc.currPair, 'USD/INR')
    strictEqual(mc.commodityCode, 'C105')
    strictEqual(mc.commodityDesc, 'CORN (YELLOW)')
    strictEqual(mc.amtUSD, 100000)
    strictEqual(mc.utilizedUSD, 25000)
    strictEqual(mc.baseUtilizedUSD, 25000)
    strictEqual(mc.portShipment, 'Mumbai')
    strictEqual(mc.portDestination, 'Singapore')
    strictEqual(mc.shipStart.getMonth(), 7)
    strictEqual(mc.shipEnd.getDate(), 15)
  })

  it('leaves out a contract that is not in USD, has no number, or has no shipping window', () => {
    deepStrictEqual(toMasterContracts(MC_ROWS).map((m) => m.mcNumber), ['2000000005'])
  })

  it('asks the API only for the usable statuses', () => {
    deepStrictEqual([...USABLE_MC_STATUSES], ['03', '04'])
  })
})

describe('buildMasters', () => {
  const raw = { comp: COMP_ROWS, fxModel: MODEL_ROWS, commodity: COMMODITY_ROWS, masterContract: MC_ROWS, tolerance: TOL_ROWS }

  it('builds every master and applies the tolerance to the models', () => {
    const m = buildMasters(raw)
    strictEqual(m.entities.length, 4)
    strictEqual(m.fxModels[0]!.tolerancePct, 5)
    strictEqual(m.commodities.length, 2)
    strictEqual(m.contracts.length, 1)
  })

  it('names the master that came back empty, and does not invent one', () => {
    throws(() => buildMasters({ ...raw, comp: [] }), (e) => e instanceof MasterLoadError && e.resource === 'comp')
    throws(() => buildMasters({ ...raw, fxModel: [] }), (e) => e instanceof MasterLoadError && e.resource === 'fxModel')
    throws(() => buildMasters({ ...raw, commodity: [] }), (e) => e instanceof MasterLoadError && e.resource === 'commodity')
    throws(() => buildMasters({ ...raw, tolerance: [TOL_ROWS[1]!] }), (e) => e instanceof MasterLoadError && e.resource === 'tolerance')
  })

  it('accepts no usable Master Contract: that is an answer, not a failure', () => {
    strictEqual(buildMasters({ ...raw, masterContract: [] }).contracts.length, 0)
  })
})

describe('loadBlotterMasters', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  const bodies: Record<string, FxRow[]> = {
    comp: COMP_ROWS, fxModel: MODEL_ROWS, commodity: COMMODITY_ROWS, masterContract: MC_ROWS, tolerance: TOL_ROWS,
  }
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  it('reads the five masters through the gateway and filters the contracts by status', async () => {
    const urls: string[] = []
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      urls.push(url)
      const name = /\/data\/([A-Za-z]+)/.exec(url)?.[1] ?? ''
      return json(200, { ok: true, rows: bodies[name] ?? [] })
    }) as typeof fetch
    const m = await loadBlotterMasters()
    strictEqual(m.entities.length, 4)
    deepStrictEqual(urls.map((u) => /\/data\/([A-Za-z]+)/.exec(u)?.[1]).sort(), ['commodity', 'comp', 'fxModel', 'masterContract', 'tolerance'])
    const mcUrl = urls.find((u) => u.includes('/data/masterContract'))!
    ok(decodeURIComponent(mcUrl).includes('ZMC_STAT[in]=03,04'))
  })

  it('fails with the name of the master when one read fails, and substitutes nothing', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/data/fxModel')) return json(500, { error: { message: 'database unavailable' } })
      const name = /\/data\/([A-Za-z]+)/.exec(url)?.[1] ?? ''
      return json(200, { ok: true, rows: bodies[name] ?? [] })
    }) as typeof fetch
    await rejects(
      () => loadBlotterMasters(),
      (e: unknown) => e instanceof MasterLoadError && e.resource === 'fxModel' && /database unavailable/.test(e.message),
    )
  })

  it('shows the reason and status when the gateway words its error as { message: { value } }', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes('/data/tolerance')) return json(401, { error: { message: { value: 'Not signed in.' } } })
      const name = /\/data\/([A-Za-z]+)/.exec(String(input))?.[1] ?? ''
      return json(200, { ok: true, rows: bodies[name] ?? [] })
    }) as typeof fetch
    await rejects(
      () => loadBlotterMasters(),
      (e: unknown) =>
        e instanceof MasterLoadError &&
        e.resource === 'tolerance' &&
        e.message === 'Could not load tolerance: Not signed in. (HTTP 401)' &&
        !e.message.includes('[object Object]'),
    )
  })

  it('fails when the gateway cannot be reached', async () => {
    globalThis.fetch = (async () => {
      throw new TypeError('network down')
    }) as typeof fetch
    await rejects(() => loadBlotterMasters(), MasterLoadError)
  })
})

describe('installMasters', () => {
  it('fills the blotter lists in place, so the lookups see them', () => {
    const entitiesRef = ENTITIES
    installMasters(buildMasters({ comp: COMP_ROWS, fxModel: MODEL_ROWS, commodity: COMMODITY_ROWS, masterContract: MC_ROWS, tolerance: TOL_ROWS }))
    ok(ENTITIES === entitiesRef)
    strictEqual(entityOf('DMCC')?.cocode, 'AE13')
    strictEqual(modelOf('M037')?.desc, 'INR Short Forward')
    deepStrictEqual(PROFIT_CENTERS.map((p) => p.code), ['FX', 'TSF-FX', 'TSF - FX'])
    strictEqual(BUSINESS_AREAS.length, 6)
    strictEqual(COMMODITIES.length, 2)
    strictEqual(FX_MODELS.length, 4)
  })

  it('does not touch Group, Trader or Business Partner', () => {
    installMasters(buildMasters({ comp: COMP_ROWS, fxModel: MODEL_ROWS, commodity: COMMODITY_ROWS, masterContract: MC_ROWS, tolerance: TOL_ROWS }))
    deepStrictEqual(GROUPS.map((g) => g.code), ['G02', 'G03', 'G04', 'G07'])
    strictEqual(TRADERS.length, 14)
    deepStrictEqual(TRADERS.filter((t) => t.group === 'G03').map((t) => t.code), ['TER', 'RAY', 'SUN'])
    ok(BUSINESS_PARTNERS.some((b) => b.code === 'BP1001'))
    deepStrictEqual(spotPartners(BUSINESS_PARTNERS).map((b) => b.code), ['400000002'])
  })
})
