import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { FX_LOGO } from '../fx/logo.ts'
import { mcPdfSections, pngSize, type McPdfInput } from './mcPdf.ts'

const mc: McPdfInput = {
  mcNumber: '2000000052', reference: 'OSIPL_RICE_M033', status: '03-Confirmed by MO', mcDate: '01-10-2026', originEntity: 'OSIPL - Olam Agri',
  entityString: 'OGA → OSIPL → DMCC', amountUsd: 50000, amountOrigin: 4575000, originCurrency: 'INR', exchangeRate: 91.5, tolerance: '',
  commodity: 'C125 - RICE', commodityDescription: 'RICE', shipStart: '01-11-2026', shipEnd: '30-11-2026', paymentTerms: 'P01',
  paymentDate: '', portOfShipment: 'Kakinada', portOfDestination: 'Dubai', fxModel: 'M033', modelDescription: 'INR-INR-INR Forward',
  currencyString: 'INR / INR / INR', foRemarks: '', moRemarks: '', children: [],
}

describe('mcPdfSections', () => {
  const sections = mcPdfSections(mc)
  const row = (title: string, label: string) => sections.find((s) => s.title === title)?.rows.find(([l]) => l === label)?.[1]
  it('lays the details out in titled sections, with no Currency ID', () => {
    deepStrictEqual(sections.map((s) => s.title), ['Basic Details', 'Financial Details', 'Commodity Details', 'Shipment & Payment Details', 'FX Model Details', 'Remarks'])
    strictEqual(sections.some((s) => s.rows.some(([l]) => /currency id/i.test(l))), false)
  })
  it('formats amounts and joins model code and description', () => {
    strictEqual(row('Financial Details', 'MC Amount (USD)'), '50,000.00 USD')
    strictEqual(row('Financial Details', 'MC Amount (Origin)'), '4,575,000.00 INR')
    strictEqual(row('Financial Details', 'Exchange Rate'), '91.5000')
    strictEqual(row('FX Model Details', 'FX Model'), 'M033 - INR-INR-INR Forward')
  })
  it('prints empty values as a dash', () => {
    strictEqual(row('Financial Details', 'Tolerance %'), '—')
    strictEqual(row('Shipment & Payment Details', 'Payment Date'), '—')
    strictEqual(row('Remarks', 'MO Remarks'), '—')
  })
})

describe('pngSize', () => {
  it('reads the company logo size', () => {
    const size = pngSize(FX_LOGO)
    strictEqual(size !== null && size.width > 0 && size.height > 0, true)
  })
  it('is null for anything but a PNG', () => {
    strictEqual(pngSize('data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD'), null)
  })
})
