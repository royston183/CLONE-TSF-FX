import { deepStrictEqual, ok, rejects, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as xlsx from 'xlsx'
import { canonicalUploadRow, validateUploadRows } from './logic.ts'
import { createUploadTemplate, parseUploadFile } from './upload-file.ts'
import { parseUploadDate, UPLOAD_COLUMNS, uploadNumber } from './upload-schema.ts'
import type { UploadRow } from './types.ts'

const row = (): UploadRow => canonicalUploadRow({
  bukrs: 'SG03', t_date: '14-10-2026', bp: '0400000002', pc: '0000100000', unit: '0001',
  typ: '631', t_curr: 'USD', t_amt: '30,000.50', o_curr: 'INR', buy_sell: 'Buy',
  v_date: '16-11-2026', all_rate: '95.9550', ndf_date: '12-11-2026', ndf_ref: 'FBIL',
  ztsf_deal_id: '000123', zdeal_seq: '01', zmo_remark: 'MO notes', zfo_remark: 'FO notes',
  deal: 'Trade 123', mc_ref: '00001234', zfin_proj: 'Project A',
})

function workbookBytes(values: unknown[][], bookType: 'biff8' | 'xlsx' = 'xlsx'): ArrayBuffer {
  const workbook = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(values), 'Upload')
  return xlsx.write(workbook, { type: 'array', bookType }) as ArrayBuffer
}
const headers = UPLOAD_COLUMNS.map((c) => c.header)
const values = (r: UploadRow): string[] => UPLOAD_COLUMNS.map((c) => r[c.field] ?? '')

describe('FX blotter spreadsheet upload', () => {
  it('downloads real XLS with the exact TY_UPD order, no sample transactions, and instructions', async () => {
    const bytes = await createUploadTemplate()
    deepStrictEqual([...bytes.slice(0, 8)], [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    const workbook = xlsx.read(bytes, { type: 'array' })
    deepStrictEqual(workbook.SheetNames, ['Upload', 'Instructions'])
    const rows = xlsx.utils.sheet_to_json<string[]>(workbook.Sheets['Upload']!, { header: 1, blankrows: false })
    deepStrictEqual(rows.filter((r) => r.some(Boolean)), [headers])
    strictEqual(headers.length, 30)
    deepStrictEqual(headers.slice(8, 13), ['O_CURR', 'DEAL', 'BUY_SELL', 'V_DATE', 'ALL_RATE'])
    deepStrictEqual(headers.slice(-5), ['ZBLOTR_DATE', 'ZFIN_PROJ', 'ZTXN_STATUS', 'ZMO_REMARK', 'ZFO_REMARK'])
    deepStrictEqual(await parseUploadFile(new Uint8Array(bytes).buffer, 'template.xls'), [])
  })

  for (const format of ['biff8', 'xlsx'] as const) {
    it(`round trips all 30 columns in ${format}, preserving codes and remarks`, async () => {
      const input = row()
      const data = workbookBytes([headers, values(input), headers.map(() => '')], format)
      const output = await parseUploadFile(data, format === 'biff8' ? 'upload.xls' : 'upload.xlsx')
      deepStrictEqual(output, [input])
      deepStrictEqual(validateUploadRows(output), { errors: [], warnings: [] })
    })
  }

  it('reads Excel date cells and unformatted serials as day-month-year dates', async () => {
    const data = values(row()) as unknown[]
    data[1] = new Date(Date.UTC(2026, 9, 14))
    data[11] = 46342 // 16 November 2026
    const [output] = await parseUploadFile(workbookBytes([headers, data]), 'dates.xlsx')
    strictEqual(output?.tradeDate, '14-10-2026')
    strictEqual(output?.valueDate, '16-11-2026')
  })

  it('preserves formatted numeric codes with leading zeros', async () => {
    const workbook = xlsx.utils.book_new()
    const sheet = xlsx.utils.aoa_to_sheet([headers, values(row())])
    sheet['C2'] = { t: 'n', v: 123, z: '0000000000' }
    xlsx.utils.book_append_sheet(workbook, sheet, 'Upload')
    const [output] = await parseUploadFile(xlsx.write(workbook, { type: 'array', bookType: 'xlsx' }), 'codes.xlsx')
    strictEqual(output?.bp, '0000000123')
  })

  it('reads CSV quoted commas, embedded newlines and zeros, and TSV headers', async () => {
    const input = { ...row(), remark: 'Trader says "yes",\nconfirmed' }
    const workbook = xlsx.utils.book_new()
    const sheet = xlsx.utils.aoa_to_sheet([headers, values(input)])
    xlsx.utils.book_append_sheet(workbook, sheet, 'Upload')
    const csv = xlsx.utils.sheet_to_csv(sheet)
    deepStrictEqual(await parseUploadFile(new TextEncoder().encode(csv).buffer, 'upload.csv'), [input])
    const tsv = [headers.join('\t'), values(row()).join('\t')].join('\n')
    deepStrictEqual(await parseUploadFile(new TextEncoder().encode(tsv).buffer, 'upload.tsv'), [row()])
  })

  it('rejects missing or duplicate headers, errors, and unsupported files', async () => {
    await rejects(parseUploadFile(workbookBytes([['BUKRS'], ['SG03']]), 'bad.xlsx'), /Missing upload columns/)
    await rejects(parseUploadFile(workbookBytes([[...headers, 'BUKRS'], values(row())]), 'bad.xlsx'), /Duplicate column/)
    await rejects(parseUploadFile(workbookBytes([[...headers, 'Company Code'], values(row())]), 'bad.xlsx'), /same field/)
    await rejects(parseUploadFile(workbookBytes([[...headers, 'ZFO_REMRAK'], values(row())]), 'bad.xlsx'), /Unrecognized upload/)
    await rejects(parseUploadFile(new ArrayBuffer(0), 'empty.xls'), /empty/)
    await rejects(parseUploadFile(new ArrayBuffer(1), 'upload.pdf'), /Choose an XLS/)
    const wb = xlsx.utils.book_new()
    const sheet = xlsx.utils.aoa_to_sheet([headers, values(row())])
    sheet['H2'] = { t: 'e', v: 7 }
    xlsx.utils.book_append_sheet(wb, sheet, 'Upload')
    await rejects(parseUploadFile(xlsx.write(wb, { type: 'array', bookType: 'xlsx' }), 'error.xlsx'), /Excel error/)
  })

  it('handles unformatted date serials in a workbook using the 1904 date system', async () => {
    const workbook = xlsx.utils.book_new()
    const data = values(row()) as unknown[]
    data[11] = 46342 - 1462
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([headers, data]), 'Upload')
    workbook.Workbook = { WBProps: { date1904: true } }
    const [output] = await parseUploadFile(xlsx.write(workbook, { type: 'array', bookType: 'xlsx' }), 'dates.xlsx')
    strictEqual(output?.valueDate, '16-11-2026')
  })
})

describe('FX upload validation', () => {
  it('allows SAP to derive a missing value date and only requires fixing reference for 631', () => {
    deepStrictEqual(validateUploadRows([{ ...row(), valueDate: '', ndfRef: '', txnType: '632' }]), { errors: [], warnings: [] })
    ok(validateUploadRows([{ ...row(), ndfRef: '' }]).errors.some((m) => m.includes('Fixing Ref')))
  })

  it('rejects impossible dates, incomplete numbers, invalid direction, and truncated metadata', () => {
    const result = validateUploadRows([{ ...row(), tradeDate: '31-02-2026', valueDate: '99-11-2026',
      amt1: '30000x', buySell: 'invalid', dealSeq: '123', swap: 'oops' }])
    for (const field of ['Trade Date', 'Value Date', 'Amount 1', 'Buy/Sell', 'ZDEAL_SEQ', 'Swap']) {
      ok(result.errors.some((m) => m.includes(field)), field)
    }
    strictEqual(parseUploadDate('29-02-2025'), null)
    ok(parseUploadDate('29.02.2024'))
    strictEqual(uploadNumber('30,000.50'), 30000.5)
    ok(Number.isNaN(uploadNumber('3,00,0')))
    ok(Number.isNaN(uploadNumber('Infinity')))
  })
})
