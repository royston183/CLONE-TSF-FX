import { canonicalUploadRow, normalizeHeader } from './logic.ts'
import { UPLOAD_COLUMNS } from './upload-schema.ts'
import type { UploadRow } from './types.ts'
import type { WorkBook, CellObject } from 'xlsx'

const REQUIRED_HEADERS = ['companyCode', 'tradeDate', 'bp', 'businessArea', 'txnType', 'curr1', 'amt1', 'curr2', 'buySell', 'totalRate'] as const
const DATE_FIELDS = new Set(['tradeDate', 'valueDate', 'ndfDate', 'blotterDate'])
const normalize = (value: unknown): string => String(value ?? '').trim()

/** The library is loaded only when a file is read or a template is downloaded. */
export async function createUploadTemplate(): Promise<Uint8Array> {
  const xlsx = await import('xlsx')
  const workbook = xlsx.utils.book_new()
  const data = xlsx.utils.aoa_to_sheet([UPLOAD_COLUMNS.map((c) => c.header), UPLOAD_COLUMNS.map(() => '')])
  data['!cols'] = UPLOAD_COLUMNS.map((c) => ({ wch: Math.max(14, c.header.length + 2) }))
  // Input cells are text: company / partner / deal codes must keep leading zeros.
  UPLOAD_COLUMNS.forEach((_, column) => { data[xlsx.utils.encode_cell({ r: 1, c: column })] = { t: 's', v: '', z: '@' } })
  xlsx.utils.book_append_sheet(workbook, data, 'Upload')
  const notes = xlsx.utils.aoa_to_sheet([
    ['FX Blotter Upload — instructions'],
    ['Fill the Upload sheet from row 2. Row 1 is the header. Keep all 30 columns in this order for SAP GUI compatibility.'],
    ['This XLS template matches TY_UPD in ZSGTSF_PFX_BLOTTER_TSF_MUPD. XLSX, CSV and TSV are also accepted by the web screen.'],
    ['Enter dates as DD-MM-YYYY. Keep codes as text to preserve leading zeros. Review calculated Amount 2 in the web preview.'],
    ['BP accepts a SAP partner code or configured short name. TYP accepts a configured transaction name or external transaction type.'],
    ['BUY_SELL: B / Buy / 1 = Buy Currency 1; S / Sell / 2 = Sell Currency 1.'],
    ['V_DATE is required for web deal creation. Enter the agreed value date; the web upload does not derive it from SAP calendars.'],
    ['NDF fixing date and reference are required for type 631 (NDF). Fixing date must not be after value date.'],
    ['Blotter date, group and trader are selected in the upload dialog. ZBLOTR_DATE is the optional per-row blotter date.'],
    ['Create Deal creates a SAP contract directly. Contract also releases it to MO. Settlement also settles it.'],
    ['All in Rate is the lead/follow rate. IDR / KWA / VND / TWD use the blotter convention per 100 units; review Amount 2 before processing.'],
    ['Fields unavailable in the connected services are listed in the preview before processing. A preview alone does not create transactions.'],
    [],
    ['Column', 'Description', 'Maximum characters'],
    ...UPLOAD_COLUMNS.map((c) => [c.header, c.label, c.length]),
  ])
  notes['!cols'] = [{ wch: 110 }, { wch: 48 }, { wch: 22 }]
  xlsx.utils.book_append_sheet(workbook, notes, 'Instructions')
  return new Uint8Array(xlsx.write(workbook, { bookType: 'biff8', type: 'array' }) as ArrayBuffer)
}

export async function downloadUploadTemplate(): Promise<void> {
  const data = await createUploadTemplate()
  const blob = new Blob([new Uint8Array(data)], { type: 'application/vnd.ms-excel' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'FX_Blotter_Upload_Template.xls'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function dateText(value: Date): string {
  return `${String(value.getUTCDate()).padStart(2, '0')}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${value.getUTCFullYear()}`
}

/** Reads the first sheet, as TEXT_CONVERT_XLS_TO_SAP does, with a mandatory header row. */
export async function parseUploadFile(data: ArrayBuffer, name: string): Promise<UploadRow[]> {
  if (!/\.(xls|xlsx|csv|tsv|txt)$/i.test(name)) throw new Error('Choose an XLS, XLSX, CSV or TSV upload file.')
  if (!data.byteLength) throw new Error('The selected upload file is empty.')
  if (data.byteLength > 10 * 1024 * 1024) throw new Error('The upload file must be 10 MB or smaller.')
  const xlsx = await import('xlsx')
  let workbook: WorkBook
  try {
    workbook = xlsx.read(data, { type: 'array', cellDates: true, cellNF: true, raw: true })
  } catch {
    throw new Error('Could not read this spreadsheet. Save it as XLS, XLSX, CSV or TSV and try again.')
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? '']
  if (!sheet?.['!ref']) throw new Error('The first sheet is empty. Use the downloaded template.')
  const range = xlsx.utils.decode_range(sheet['!ref'])
  if (range.e.r > 10000 || range.e.c > 100) throw new Error('Use at most 10,000 rows and 101 columns per upload.')
  const cellText = (cell: CellObject | undefined, date = false): string => {
    if (!cell) return ''
    if (cell.t === 'e') throw new Error('The spreadsheet contains an Excel error. Correct the cell before uploading.')
    if (cell.f && (cell.v === undefined || cell.v === null)) throw new Error('A formula has no saved value. Recalculate and save the spreadsheet first.')
    if (cell.v instanceof Date) return dateText(cell.v)
    // An unformatted numeric date is a serial, even when Excel did not mark it as a date.
    if (date && typeof cell.v === 'number') {
      const parsed = xlsx.SSF.parse_date_code(cell.v, { date1904: !!workbook.Workbook?.WBProps?.date1904 })
      if (parsed) return `${String(parsed.d).padStart(2, '0')}-${String(parsed.m).padStart(2, '0')}-${parsed.y}`
    }
    if (cell.t === 'n' && typeof cell.z === 'string' && /^0+$/.test(cell.z)) return xlsx.utils.format_cell(cell)
    return normalize(cell.v)
  }
  const headers: string[] = []
  for (let col = 0; col <= range.e.c; col++) headers.push(normalizeHeader(cellText(sheet[xlsx.utils.encode_cell({ r: 0, c: col })])))
  const activeHeaders = headers.filter(Boolean)
  if (new Set(activeHeaders).size !== activeHeaders.length) throw new Error('Duplicate column headers were found. Use each template column once.')
  const fields = activeHeaders.map((header) => Object.entries(canonicalUploadRow({ [header]: 'present' })).find(([, value]) => value === 'present')?.[0])
  const unknown = activeHeaders.filter((_, i) => !fields[i])
  if (unknown.length) throw new Error(`Unrecognized upload columns: ${unknown.join(', ')}. Use the downloaded template.`)
  if (new Set(fields).size !== fields.length) throw new Error('Multiple column headers refer to the same field. Use each template column once.')
  const headerFields = canonicalUploadRow(Object.fromEntries(activeHeaders.map((h) => [h, 'present'])))
  const missing = REQUIRED_HEADERS.filter((field) => !headerFields[field])
  if (missing.length) throw new Error(`Missing upload columns: ${missing.map((f) => UPLOAD_COLUMNS.find((c) => c.field === f)?.header).join(', ')}. Use the downloaded template.`)
  const rows: UploadRow[] = []
  for (let row = 1; row <= range.e.r; row++) {
    const record: Record<string, string> = {}
    for (let col = 0; col <= range.e.c; col++) {
      const header = headers[col]
      if (!header) {
        if (cellText(sheet[xlsx.utils.encode_cell({ r: row, c: col })])) throw new Error(`Row ${row + 1} has data in a column without a header.`)
        continue
      }
      const field = UPLOAD_COLUMNS.find((c) => c.header.toLowerCase() === header)?.field
        ?? Object.entries(canonicalUploadRow({ [header]: 'present' })).find(([, value]) => value === 'present')?.[0]
      record[header] = cellText(sheet[xlsx.utils.encode_cell({ r: row, c: col })], DATE_FIELDS.has(field ?? ''))
    }
    if (Object.values(record).some(Boolean)) rows.push(canonicalUploadRow(record))
  }
  return rows
}
