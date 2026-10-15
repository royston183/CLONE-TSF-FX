import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { blDocumentKey, blUploadSelectionError, uploadBlDocument, type BlDmsDeps, type BlUploadArgs } from './bl-dms.ts'
import { invoiceDetailChanges, withPendingDeals } from './bl.ts'
import { joinBlDocuments } from './api.ts'
import type { FxRow } from '../../shared/fx/mw.ts'
import type { BlRow } from './types.ts'

const row = (no = '4000000001', split = '01'): BlRow => ({ ZtfNo: '3000000001', ZtfSplit: '01', ZblNo: no, ZblSplit: split, ZblReuse: '' })
const rawBl = (r: BlRow): FxRow => ({ ...blDocumentKey(r), ZTSF_DMS_CODE: 'OLD-BL', ZDMS_CODE_EXC: 'OLD-EXC', ZCHANGED_BY: 'BEFORE', ZCHANGED_DATE: '2026-10-14', ZCHANGED_TIME: '10:00:00' })
type Failure = 'metadata' | 'mapping' | 'bl' | 'lost-response' | 'rollback'
function memory(failure?: Failure, initialMapping = true) {
  const tables: Record<string, FxRow[]> = {
    billOfLading: [rawBl(row()), rawBl(row('4000000002'))],
    blDocument: initialMapping ? [{ ZBL_NO: '4000000001', ZTSF_DMS_CODE: 'OLD-BL', ZSTND_DMS: 'OLD-SAP', ZCHANGED_BY: 'BEFORE', ZCHANGED_DATE: '2026-10-14', ZCHANGED_TIME: '10:00:00' }] : [],
    tsfDocument: [],
    dmsType: ['D01', 'D02'].map((type) => ({ ZDMS_CAT: '01', ZDMS_TYPE: type, ZDMS_DESC: type === 'D01' ? 'BL Document' : 'Exception approval', ZDMS_OBJ: 'ZSGTSFNR07', ZDMS_RANGE: type === 'D01' ? '01' : '02' })),
  }
  const calls: { method: string; resource: string; data: Record<string, unknown> }[] = []
  let uploads = 0
  let flagged = 0
  let failed = false
  const matches = (r: FxRow, key: Record<string, string>) => Object.entries(key).every(([field, value]) => String(r[field] ?? '') === value)
  const deps: BlDmsDeps = {
    list: async (resource, key = {}) => (tables[resource] ?? []).filter((r) => matches(r, key)).map((r) => ({ ...r })),
    hasCodeRange: async () => true,
    stamp: async () => ({ user: 'TESTER', date: '2026-10-15', time: '12:00:00' }),
    upload: async (data) => { uploads++; calls.push({ method: 'upload', resource: 'SAP', data }); return { number: 'SAP-NEW', version: '00' } },
    flagDeleted: async () => { flagged++; calls.push({ method: 'flag', resource: 'SAP', data: {} }) },
    create: async (resource, data) => {
      calls.push({ method: 'create', resource, data })
      if (failure === 'metadata' && resource === 'tsfDocument') throw new Error('metadata refused')
      const complete = resource === 'tsfDocument' ? { ...data, ZTSF_DMS_CODE: '7020000042' } : data
      tables[resource]!.push(complete as FxRow)
      return { assignedNumber: resource === 'tsfDocument' ? '7020000042' : undefined,
        key: resource === 'tsfDocument' ? { ZTSF_DMS_CODE: '7020000042', ZSTND_DMS: 'SAP-NEW', ZDMS_CAT: '01' } : { ZBL_NO: String(data['ZBL_NO']) } }
    },
    update: async (resource, key, changes) => {
      calls.push({ method: 'update', resource, data: { ...key, ...changes } })
      const record = tables[resource]!.find((r) => matches(r, key))!
      if (failure === 'mapping' && resource === 'blDocument' && !failed) { failed = true; throw new Error('mapping refused') }
      if (resource === 'billOfLading' && key['ZBL_NO'] === '4000000002' && !failed && ['bl', 'lost-response', 'rollback'].includes(failure ?? '')) {
        failed = true
        if (failure === 'lost-response') Object.assign(record, changes)
        throw new Error('BL update failed')
      }
      if (failure === 'rollback' && resource === 'billOfLading' && key['ZBL_NO'] === '4000000001' && changes['ZTSF_DMS_CODE'] === 'OLD-BL') throw new Error('restore failed')
      Object.assign(record, changes)
    },
    remove: async (resource, key) => {
      calls.push({ method: 'remove', resource, data: key })
      tables[resource] = tables[resource]!.filter((r) => !matches(r, key))
    },
  }
  return { deps, tables, calls, uploads: () => uploads, flagged: () => flagged }
}
const args = (extra: Partial<BlUploadArgs> = {}): BlUploadArgs => ({ rows: [row(), row('4000000002')], kind: 'D01', fileName: 'C:\\copies\\bl.final.pdf', size: 2048, content: 'aGVsbG8=', comment: 'BL copy', ...extra })

describe('BL-linked DMS upload', () => {
  it('creates one SAP file and metadata record, then maps all selected BLs with full keys', async () => {
    const m = memory()
    const result = await uploadBlDocument(args(), m.deps)
    strictEqual(result.ok, true)
    strictEqual(m.uploads(), 1)
    strictEqual(m.tables['tsfDocument']!.length, 1)
    const metadata = m.tables['tsfDocument']![0]!
    deepStrictEqual([metadata['ZDMS_CAT'], metadata['ZDOC_TYPE'], metadata['ZSTND_DMS'], metadata['ZDOC_NAME'], metadata['ZDOC_EXTN']], ['01', 'D01', 'SAP-NEW', 'bl.final', 'PDF'])
    strictEqual(m.tables['blDocument']!.length, 2)
    for (const bl of m.tables['billOfLading']!) {
      strictEqual(bl['ZTSF_DMS_CODE'], '7020000042')
      strictEqual(bl['ZDMS_CODE_EXC'], 'OLD-EXC')
      strictEqual(bl['ZCHANGED_BY'], 'TESTER')
    }
    const keys = m.calls.filter((c) => c.resource === 'billOfLading' && c.method === 'update')
    for (const key of ['ZTF_NO', 'ZTF_SPLIT', 'ZBL_NO', 'ZBL_SPLIT', 'ZBL_REUSE']) ok(key in keys[0]!.data)
  })

  it('D02 saves the exception pointer without overwriting the normal BL_DMS mapping', async () => {
    const m = memory()
    const before = structuredClone(m.tables['blDocument'])
    strictEqual((await uploadBlDocument(args({ kind: 'D02' }), m.deps)).ok, true)
    deepStrictEqual(m.tables['blDocument'], before)
    strictEqual(m.tables['tsfDocument']![0]!['ZDOC_TYPE'], 'D02')
    for (const bl of m.tables['billOfLading']!) {
      strictEqual(bl['ZDMS_CODE_EXC'], '7020000042')
      strictEqual(bl['ZTSF_DMS_CODE'], 'OLD-BL')
      ok(!('ZBL_EXC' in bl)) // exception flag belongs to the subsequent Deal ID assignment
    }
  })

  it('deduplicates checked rows and writes a shared BL number mapping only once across splits', async () => {
    const m = memory(undefined, false)
    m.tables['billOfLading']!.push(rawBl(row('4000000001', '02')))
    strictEqual((await uploadBlDocument(args({ rows: [row(), row(), row('4000000001', '02')] }), m.deps)).ok, true)
    strictEqual(m.tables['blDocument']!.length, 1)
    strictEqual(m.calls.filter((c) => c.resource === 'billOfLading' && c.method === 'update').length, 2)
  })

  for (const stage of ['metadata', 'mapping', 'bl', 'lost-response'] as const) {
    it(`restores BL references and cleans up the uploaded file after ${stage} failure`, async () => {
      const m = memory(stage)
      const before = structuredClone({ bl: m.tables['billOfLading'], mapping: m.tables['blDocument'] })
      const result = await uploadBlDocument(args(), m.deps)
      strictEqual(result.ok, false)
      deepStrictEqual(m.tables['billOfLading'], before.bl)
      deepStrictEqual(m.tables['blDocument'], before.mapping)
      strictEqual(m.tables['tsfDocument']!.length, 0)
      strictEqual(m.flagged(), 1)
      ok(result.message.includes('BL links were restored'))
      const cleanup = m.calls.find((c) => c.method === 'remove' && c.resource === 'tsfDocument')
      if (cleanup) deepStrictEqual(Object.keys(cleanup.data).sort(), ['ZDMS_CAT', 'ZSTND_DMS', 'ZTSF_DMS_CODE'])
    })
  }

  it('keeps the file and metadata when a remaining BL reference cannot be restored', async () => {
    const m = memory('rollback')
    const result = await uploadBlDocument(args(), m.deps)
    strictEqual(result.ok, false)
    strictEqual(result.retained, true)
    strictEqual(m.flagged(), 0)
    strictEqual(m.tables['tsfDocument']!.length, 1)
    strictEqual(m.tables['billOfLading']![0]!['ZTSF_DMS_CODE'], '7020000042')
    ok(result.message.includes('retained'))
  })

  it('does not remove another upload that replaced a mapping before rollback', async () => {
    const m = memory('bl')
    const update = m.deps.update
    m.deps.update = async (resource, key, changes) => {
      if (resource === 'billOfLading' && key['ZBL_NO'] === '4000000002') Object.assign(m.tables['blDocument']![0]!, { ZTSF_DMS_CODE: 'OTHER', ZSTND_DMS: 'SAP-OTHER' })
      return update(resource, key, changes)
    }
    strictEqual((await uploadBlDocument(args(), m.deps)).ok, false)
    strictEqual(m.tables['blDocument']![0]!['ZSTND_DMS'], 'SAP-OTHER')
  })

  it('checks saved selection, configuration, number range, file and row existence before SAP writes', async () => {
    for (const override of [{ rows: [] }, { rows: [{ ...row(), localId: 'new-1' }] }, { rows: [{ ...row(), ZblNo: '' }] }, { size: 0 }, { size: 21 * 1048576 }]) {
      const m = memory()
      strictEqual((await uploadBlDocument(args(override), m.deps)).ok, false)
      strictEqual(m.uploads(), 0)
    }
    const m = memory()
    m.deps.hasCodeRange = async () => false
    strictEqual((await uploadBlDocument(args(), m.deps)).ok, false)
    strictEqual(m.uploads(), 0)
    const missing = memory()
    missing.tables['billOfLading'] = []
    strictEqual((await uploadBlDocument(args(), missing.deps)).ok, false)
    strictEqual(missing.uploads(), 0)
  })
})

describe('BL exception compliance and document list', () => {
  it('persists both the explicit exception flag and normal compliance clearing', () => {
    deepStrictEqual(invoiceDetailChanges({ ZblExc: '', ZexcNotes: '' }), { ZblExc: '' })
    deepStrictEqual(invoiceDetailChanges({ ZblExc: 'X', ZexcNotes: 'Approved' }), { ZblExc: 'X', ZexcNotes: 'Approved' })
    const fresh = { ...row(), localId: 'new-1' }
    const [result] = withPendingDeals([fresh], new Map([['new-1', 'DEAL1']]), '02', { ZblExc: 'X' })
    strictEqual(result?.ZblExc, 'X')
    ok(blUploadSelectionError([{ ...row(), localId: 'split-1' }]))
  })

  it('lists normal and exception documents separately and deduplicates metadata reads', () => {
    const docs = [
      { ZtsfDmsCode: 'COPY', ZstndDms: '100', ZdmsCat: '01', ZdocType: 'D01', ZdocName: 'BL' },
      { ZtsfDmsCode: 'EXCEPTION', ZstndDms: '101', ZdmsCat: '01', ZdocType: 'D02', ZdocName: 'Approval' },
    ]
    const result = joinBlDocuments([{ ZblNo: 'BL1', ZtsfDmsCode: 'COPY', ZstndDms: '000100' }, { ZblNo: 'BL1', ZtsfDmsCode: 'COPY' }, { ZblNo: 'BL1', ZtsfDmsCode: 'EXCEPTION' }], [...docs, docs[0]!], [
      { ZdmsCat: '01', ZdmsType: 'D01', ZdmsDesc: 'BL copy' }, { ZdmsCat: '01', ZdmsType: 'D02', ZdmsDesc: 'Exception approval' },
    ])
    deepStrictEqual(result.map((r) => [r.dmsCode, r.standardDms, r.typeText]), [['COPY', '100', 'BL copy'], ['EXCEPTION', '101', 'Exception approval']])
  })

  it('can resolve the two different references in a legacy BL_DMS mapping', () => {
    const result = joinBlDocuments([{ ZblNo: 'BL1', ZtsfDmsCode: 'COPY', ZstndDms: '101' }], [
      { ZtsfDmsCode: 'COPY', ZstndDms: '100', ZdocName: 'Copy' }, { ZtsfDmsCode: 'EXCEPTION', ZstndDms: '101', ZdocName: 'Approval' },
    ], [])
    deepStrictEqual(result.map((r) => [r.dmsCode, r.standardDms]), [['COPY', '100'], ['EXCEPTION', '101']])
  })
})
