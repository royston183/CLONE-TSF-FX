import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// SheetJS is already a dependency of @slc/web; importing the seed never needs Excel support.
const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const XLSX = require('xlsx')
const root = fileURLToPath(new URL('../', import.meta.url))
const norm = (value) => String(value).trim().toLowerCase().replace(/\s+/g, ' ')
const pad = (value, length = 2) => String(value).padStart(length, '0')

export function importSetFx(workbookPath, metadataPath) {
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'))
  const table = metadata.tables.find((t) => t.name === 'ZSGTSFTR_SET_FX')
  if (!table || JSON.stringify(table.primaryKey) !== JSON.stringify(['CLIENT', 'ZMOD_ID', 'ZD_MAP', 'ZBS'])) {
    throw new Error('Expected the ZSGTSFTR_SET_FX DDIC table and its four-column primary key.')
  }
  const client = metadata.source.client
  if (client !== '100') throw new Error('The local SET_FX seed is configured for SAP client 100.')
  const workbook = XLSX.readFile(workbookPath, { cellDates: false })
  if (workbook.SheetNames.length !== 1) throw new Error('Expected one SET_FX worksheet.')
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true })
  const headers = data[0]
  const fields = table.fields.filter((f) => f.name !== 'CLIENT')
  const mapping = new Map(fields.map((f) => [norm(f.description), f]))
  mapping.set('curr1', fields.find((f) => f.name === 'ZCURR'))
  const columns = headers.map((header) => {
    const field = mapping.get(norm(header))
    if (!field) throw new Error(`Unrecognized Excel column: ${header}`)
    return field
  })
  if (columns.length !== fields.length || new Set(columns.map((f) => f.name)).size !== fields.length) {
    throw new Error('Excel columns must cover every non-client DDIC field exactly once.')
  }
  const keys = new Set()
  const rows = data.slice(1).flatMap((cells, index) => {
    if (cells.every((v) => v === '')) return []
    const row = { CLIENT: client }
    for (const [col, field] of columns.entries()) {
      const cell = sheet[XLSX.utils.encode_cell({ r: index + 1, c: col })]
      if (cell?.f) throw new Error(`Excel row ${index + 2}: formulas are not supported.`)
      const raw = cells[col] ?? ''
      let value = typeof raw === 'number' ? XLSX.utils.format_cell(cell) : String(raw)
      if (raw !== '' && field.dataType === 'DATS') {
        const date = typeof raw === 'number' ? XLSX.SSF.parse_date_code(raw, { date1904: !!workbook.Workbook?.WBProps?.date1904 }) : null
        if (!date) throw new Error(`Excel row ${index + 2}: expected an Excel date for ${field.name}.`)
        value = `${pad(date.y, 4)}${pad(date.m)}${pad(date.d)}`
      } else if (raw !== '' && field.dataType === 'TIMS') {
        if (typeof raw !== 'number' || raw < 0 || raw >= 1) throw new Error(`Excel row ${index + 2}: invalid time for ${field.name}.`)
        const seconds = Math.round(raw * 86400) % 86400
        value = `${pad(Math.floor(seconds / 3600))}${pad(Math.floor(seconds / 60) % 60)}${pad(seconds % 60)}`
      }
      if (value.length > field.length) throw new Error(`Excel row ${index + 2}: ${field.name} exceeds DDIC length ${field.length}.`)
      row[field.name] = value
    }
    if (!row.ZMOD_ID || !row.ZD_MAP || !['B', 'S'].includes(row.ZBS)) throw new Error(`Excel row ${index + 2}: invalid model/deal/side key.`)
    const key = JSON.stringify(table.primaryKey.map((k) => row[k]))
    if (keys.has(key)) throw new Error(`Excel row ${index + 2}: duplicate key ${key}.`)
    keys.add(key)
    return [row]
  })
  if (!rows.length) throw new Error('The worksheet contains no SET_FX rows.')
  return { rows, fields: table.fields, primaryKey: table.primaryKey }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [workbook, metadata] = process.argv.slice(2)
  if (!workbook || !metadata) throw new Error('Usage: node tools/import-set-fx.mjs <EXPORT_set_fx.XLSX> <SET_FX.json>')
  const { rows } = importSetFx(workbook, metadata)
  const output = resolve(root, 'database/seed/zsgtsftr_set_fx.json')
  writeFileSync(output, JSON.stringify(rows, null, 2) + '\n')
  console.log(`Converted ${rows.length} rows to ${output}; no database was changed.`)
}
