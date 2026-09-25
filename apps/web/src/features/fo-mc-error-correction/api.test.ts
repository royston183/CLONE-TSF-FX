import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { McRow } from '../../shared/fx/master-contract.ts'
import { correctionColumns, correctionStatus, matchPortGroup, toErrorRow, toFxModels, toPortGroups } from './api.ts'
import { buildFreshDataset } from './data.ts'
import { applyCorrection, cellText, formFromRow, picksFromRow } from './logic.ts'
import type { CorrectionForm } from './types.ts'

const TODAY = new Date(2026, 8, 25)
const REGIONS = new Map([['OSIPL', 'R01']])

const masCon = (overrides: McRow = {}): McRow => ({
  ZMC_REF_NO: '2000000001',
  ZMC_DESC: 'MC/OSIPL/2026/001',
  ZMC_DATE: '2026-09-02',
  ZAMENDMC_DATE: null,
  ZORIGIN: 'OSIPL',
  ZAMT: '3459.00',
  ZCURR: 'USD',
  ZORG_AMT: '13836.00',
  ZOCURR: 'INR',
  ZEX_RATE: '4.0000000',
  ZSHIP_START: '2026-09-27',
  ZSHIP_END: '2026-09-30',
  ZCOMMODITY: 'C001',
  ZCOM_DESC: 'Multi-Commodity',
  ZCOM_DESC_LONG: 'WHEAT, SOYABEAN',
  ZENT_ID: 'E099',
  ZENT_DESC: 'OGA-OSIPL-DMCC',
  ZCURR_ID: 'C099',
  ZCURR_DESC: 'INR-INR-USD',
  ZMOD_ID: 'M034',
  ZMOD_DESC: 'INR - INR Staggered Call & Put Option',
  ZMC_STAT: '11',
  ZPAY_TERMS: 'P02',
  ZPAY_TERMS_TEXT: '270 days from shipment date against the copy docs',
  ZPOS: 'Any Port(s) in Indonesia or any other port(s)',
  ZPOD: 'Somewhere not in the list',
  ZUTI_AMT: '500.00',
  ZMO_REMARKS: 'Rate is wrong',
  ZFO_REMARKS: '',
  ...overrides,
})

describe('toErrorRow', () => {
  it('maps a MAS_CON row onto the queue row', () => {
    const row = toErrorRow(masCon(), REGIONS)
    strictEqual(row.mcRef, 2000000001)
    strictEqual(row.abapStatus, '11')
    strictEqual(row.status, 'correction')
    strictEqual(row.mcDescription, 'MC/OSIPL/2026/001')
    strictEqual(row.mcDate, '02-09-2026')
    strictEqual(row.mcAmt, 3459)
    strictEqual(row.mcAmountOrigin, 13836)
    strictEqual(row.exRate, 4)
    strictEqual(row.gtCommodity, 'C001')
    strictEqual(row.commodityText, 'WHEAT, SOYABEAN')
    strictEqual(row.moRemarks, 'Rate is wrong')
    strictEqual(row.mcAmendedDate, '')
    strictEqual(row.paymentTermsCode, 'P02')
    strictEqual(row.ownExplanation, '270 days from shipment date against the copy docs')
    strictEqual(row.paymentDate, '30-09-2026')
    strictEqual(row.regionId, 'R01')
  })

  it('maps the stored model code and currency string back to the dummy id', () => {
    strictEqual(toErrorRow(masCon(), REGIONS).fxId, 'M034b')
    strictEqual(toErrorRow(masCon({ ZCURR_DESC: 'INR-INR-INR' }), REGIONS).fxId, 'M034a')
    strictEqual(toErrorRow(masCon({ ZMOD_ID: 'M999' }), REGIONS).fxId, 'M999')
  })

  it('prefers the stored entity and currency IDs over the string tables', () => {
    const row = toErrorRow(masCon(), REGIONS)
    strictEqual(row.entityId, 'E099')
    strictEqual(row.currencyI, 'C099')
    const bare = toErrorRow(masCon({ ZENT_ID: '', ZCURR_ID: '' }), REGIONS)
    strictEqual(bare.entityId, 'E026')
    strictEqual(bare.currencyI, 'C003')
  })

  it('shows no utilization: ZSGTSFV_FX is not in MySQL', () => {
    const row = toErrorRow(masCon(), REGIONS)
    strictEqual(row.utilization, 0)
    strictEqual(row.mcBalAmt, row.mcAmt)
  })

  it('finds the port group from its description and keeps unmatched text visible', () => {
    const row = toErrorRow(masCon(), REGIONS)
    strictEqual(row.shipRegionCode, 'PG07')
    strictEqual(row.shipPortText, undefined)
    strictEqual(row.destRegionCode, '')
    strictEqual(row.destPortText, 'Somewhere not in the list')
    strictEqual(cellText(row, 'portDestination'), 'Somewhere not in the list')
    strictEqual(cellText(row, 'portShipment'), 'Any Port(s) in Indonesia or any other port(s)')
  })

  it('leaves the region blank without comp', () => {
    const row = toErrorRow(masCon(), new Map())
    strictEqual(row.regionId, '')
    strictEqual(cellText(row, 'regionId'), '')
  })
})

describe('port groups', () => {
  const groups = toPortGroups([
    { ZPORT_GRP: 'PG01', ZPORT_GRP_SDESC: 'Africa/Europe', ZPORT_GRP_DESC: 'Any port in Africa or Europe' },
    { ZPORT_GRP: 'PG02', ZPORT_GRP_SDESC: 'Benelux', ZPORT_GRP_DESC: null },
  ])

  it('reads code, short description and final description', () => {
    deepStrictEqual(groups, [
      { code: 'PG01', label: 'Africa/Europe', desc: 'Any port in Africa or Europe' },
      { code: 'PG02', label: 'Benelux' },
    ])
  })

  it('matches on the final description or the short one', () => {
    strictEqual(matchPortGroup('any port in africa or europe', groups)?.code, 'PG01')
    strictEqual(matchPortGroup('Benelux', groups)?.code, 'PG02')
    strictEqual(matchPortGroup('', groups), undefined)
  })
})

describe('toFxModels', () => {
  it('gives each currency string of a model its own id', () => {
    const models = toFxModels([
      { ZMOD_ID: 'M034', ZMOD_DESC: 'Staggered', ZENT_DESC: 'OGA-OSIPL-DMCC', ZENT_ID: 'E026', ZCURR_DESC: 'INR-INR-INR', ZCURR_ID: 'C001' },
      { ZMOD_ID: 'M034', ZMOD_DESC: 'Staggered', ZENT_DESC: 'OGA-OSIPL-DMCC', ZENT_ID: 'E026', ZCURR_DESC: 'INR-INR-USD', ZCURR_ID: 'C003' },
      { ZMOD_ID: 'M032', ZMOD_DESC: 'Long', ZENT_DESC: 'OGA-DMCC-OSIPL', ZENT_ID: 'E015', ZCURR_DESC: 'USD-USD-INR', ZCURR_ID: 'C002' },
    ])
    deepStrictEqual(
      models.map((m) => m.id),
      ['M034-C001', 'M034-C003', 'M032'],
    )
  })
})

describe('correctionColumns', () => {
  const form = (row: ReturnType<typeof toErrorRow>, overrides: Partial<CorrectionForm> = {}): CorrectionForm => ({
    ...formFromRow(row, TODAY),
    foRemarks: 'Rate corrected',
    ...overrides,
  })

  it('writes the permitted fields and moves 11 to 13', () => {
    const row = toErrorRow(masCon(), REGIONS)
    const updated = applyCorrection(row, form(row, { amountUsd: '5,000.00', exRate: '3.5' }), {
      ...picksFromRow(row),
      paymentTerms: 'P04',
      portShipment: 'PG10',
    })
    deepStrictEqual(correctionColumns(updated), {
      ZAMENDMC_DATE: '2026-09-25',
      ZAMT: '5000.00',
      ZEX_RATE: '3.5000000',
      ZORG_AMT: '17500.00',
      ZSHIP_START: '2026-09-27',
      ZSHIP_END: '2026-09-30',
      ZPAY_TERMS: 'P04',
      ZPAY_TERMS_TEXT: '360 days from bill of lading date',
      ZPOS: 'Any Port(s) in China or any other port(s)',
      // No group matched the stored ZPOD, so it goes back as it was.
      ZPOD: 'Somewhere not in the list',
      ZFO_REMARKS: 'Rate corrected',
      ZMC_STAT: '13',
    })
  })

  it('moves a correction of a 21 to 22', () => {
    const row = toErrorRow(masCon({ ZMC_STAT: '21' }), REGIONS)
    strictEqual(correctionColumns(applyCorrection(row, form(row), picksFromRow(row)))['ZMC_STAT'], '22')
    strictEqual(correctionStatus('11'), '13')
    strictEqual(correctionStatus(undefined), '13')
  })

  it('clips the FO remarks to ZFO_REMARKS', () => {
    const row = toErrorRow(masCon(), REGIONS)
    const updated = applyCorrection(row, form(row, { foRemarks: 'x'.repeat(90) }), picksFromRow(row))
    strictEqual(String(correctionColumns(updated)['ZFO_REMARKS']).length, 80)
  })

  it('writes a seed row with the dummy port wording', () => {
    const seed = buildFreshDataset()[0]!
    const cols = correctionColumns(applyCorrection(seed, form(seed), picksFromRow(seed)))
    strictEqual(cols['ZPOS'], 'Any Port(s) in Africa/Europe or any other port(s)')
    strictEqual(cols['ZPAY_TERMS_TEXT'], '270 days from bill of lading date')
  })
})
