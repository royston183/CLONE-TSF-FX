import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { importSetFx } from './import-set-fx.mjs'

const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const XLSX = require('xlsx')

test('Excel conversion retains formatted codes, normalizes serial dates/times and rejects ambiguous rows', () => {
  const folder = mkdtempSync(join(tmpdir(), 'slc-set-fx-'))
  const metadata = join(folder, 'schema.json')
  const workbook = join(folder, 'export.xlsx')
  const fields = [
    ['CLIENT', 'Client', 'CLNT', 3], ['ZMOD_ID', 'FX Model', 'CHAR', 10],
    ['ZD_MAP', 'FX Deal', 'CHAR', 5], ['ZBS', 'Buy/Sell', 'CHAR', 1],
    ['ZCURR', 'Currency', 'CUKY', 5], ['ZACC', 'Account', 'CHAR', 2],
    ['ZCREATED_DATE', 'Entered On', 'DATS', 8], ['ZCREATED_TIME', 'Entry Time', 'TIMS', 6],
  ].map(([name, description, dataType, length]) => ({ name, description, dataType, length }))
  const schema = { source: { client: '100' }, tables: [{ name: 'ZSGTSFTR_SET_FX', primaryKey: ['CLIENT', 'ZMOD_ID', 'ZD_MAP', 'ZBS'], fields }] }
  writeFileSync(metadata, JSON.stringify(schema))
  const headers = ['FX Model', 'FX Deal', 'Buy/Sell', 'Curr1', 'Account', 'Entered On', 'Entry Time']
  const row = ['M032', 'D1', 'S', 'USD', 1, 45632, 9650 / 86400]
  const write = (rows, tweak) => {
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
    sheet.E2.z = '00'
    tweak?.(sheet)
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, 'Sheet1')
    XLSX.writeFile(book, workbook)
  }
  write([row])
  deepStrictEqual(importSetFx(workbook, metadata).rows, [{
    CLIENT: '100', ZMOD_ID: 'M032', ZD_MAP: 'D1', ZBS: 'S', ZCURR: 'USD', ZACC: '01', ZCREATED_DATE: '20241206', ZCREATED_TIME: '024050',
  }])
  write([row, row])
  throws(() => importSetFx(workbook, metadata), /duplicate key/)
  write([row], (sheet) => { sheet.E2.f = '1+1' })
  throws(() => importSetFx(workbook, metadata), /formulas/)
  write([row], (sheet) => { sheet.A1.v = 'Unknown'; delete sheet.A1.w })
  throws(() => importSetFx(workbook, metadata), /Unrecognized/)
  // Source fixtures are still present; the converter only reads them.
  strictEqual(JSON.parse(readFileSync(metadata, 'utf8')).source.client, '100')
})
