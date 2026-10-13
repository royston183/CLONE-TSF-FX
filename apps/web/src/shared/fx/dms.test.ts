import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  RES, buildSlots, canPreview, editDocument, fetchOriginal, isoOfDmy, loadDealDms, safeFileName, sizeOf, splitFileName, typesOf, uploadDocument, validateForm,
  type DmsDeps, type DmsSlot, type DmsType, type Original,
} from './dms.ts'
import type { FxRow } from './mw.ts'

const T: DmsType = { category: '10', type: 'D01', description: 'Invoice', object: 'ZDMS', range: '01' }
const typeRows: FxRow[] = ['D01', 'D07', 'D08', 'D10', 'D16', 'D02'].map((t) => ({ ZDMS_CAT: '10', ZDMS_TYPE: t, ZDMS_DESC: `desc ${t}` }))
typeRows.push({ ZDMS_CAT: '20', ZDMS_TYPE: 'X01', ZDMS_DESC: 'other cat' })

type Calls = { creates: [string, Record<string, unknown>][]; updates: [string, Record<string, string>, Record<string, unknown>][]; removes: string[]; flagged: string[]; uploads: number; versions: number }
const mk = (over: Partial<DmsDeps> = {}, links: FxRow[] = []): { deps: DmsDeps; calls: Calls } => {
  const calls: Calls = { creates: [], updates: [], removes: [], flagged: [], uploads: 0, versions: 0 }
  const deps: DmsDeps = {
    list: async (resource) => (resource === RES.type ? typeRows : resource === RES.link ? links : []),
    create: async (resource, data) => {
      calls.creates.push([resource, data])
      return resource === RES.meta ? { key: { ZTSF_DMS_CODE: '0000000042' }, assignedNumber: '0000000042' } : { key: {}, assignedNumber: undefined }
    },
    update: async (r, k, c) => void calls.updates.push([r, k, c]),
    remove: async (r) => void calls.removes.push(r),
    hasCodeRange: async () => true,
    upload: async () => (calls.uploads++, { number: '10000000001', version: '00' }),
    newVersion: async ({ number }) => (calls.versions++, { number, version: '01' }),
    flagDeleted: async (c) => void calls.flagged.push(c.number),
    originalsOf: async () => [],
    original: async () => ({ fileName: 'a.pdf', mimeType: 'application/pdf', description: '', content: btoa('hello') }),
    stamp: async () => ({ user: 'SIDDHI', date: '2026-10-13', time: '10:00:00' }),
    ...over,
  }
  return { deps, calls }
}

const upload = (deps: DmsDeps, over = {}) =>
  uploadDocument({ dealId: 'D1', category: '10', type: T, date: '13-10-2026', comment: 'c', fileName: 'C:\\fakepath\\inv.pdf', size: 2048, content: 'QQ==', existing: [], ...over }, deps)

describe('document types', () => {
  it('category 10 leaves out D07 / D08 / D10 / D16 and other categories', () => {
    deepStrictEqual(typesOf(typeRows, '10').map((t) => t.type), ['D01', 'D02'])
    deepStrictEqual(typesOf(typeRows, '20').map((t) => t.type), ['X01'])
  })
})

describe('form rules', () => {
  it('dates must be real; files named, non-empty and within 20 MB', () => {
    strictEqual(isoOfDmy('13-10-2026'), '2026-10-13')
    strictEqual(isoOfDmy('31-02-2026'), null)
    strictEqual(Object.keys(validateForm({ type: 'D01', date: '13-10-2026', comment: '', file: { name: 'a.pdf', size: 10 } }, { fileRequired: true })).length, 0)
    const bad = validateForm({ type: '', date: '31-02-2026', comment: '', file: { name: 'a.pdf', size: 21 * 1048576 } }, { fileRequired: true })
    deepStrictEqual(Object.keys(bad).sort(), ['date', 'file', 'type'])
    strictEqual(validateForm({ type: 'D01', date: '13-10-2026', comment: '', file: null }, { fileRequired: false })['file'], undefined)
  })
  it('file names carry no path; size units; previewable types', () => {
    strictEqual(safeFileName('C:\\Users\\x\\a<b>.pdf'), 'a_b_.pdf')
    deepStrictEqual(splitFileName('Report.final.pdf'), { base: 'Report.final', extension: 'PDF' })
    deepStrictEqual(sizeOf(2048), { size: 2, unit: 'KB' })
    deepStrictEqual(sizeOf(3 * 1048576), { size: 3, unit: 'MB' })
    strictEqual(canPreview('application/pdf'), true)
    strictEqual(canPreview('image/svg+xml'), false)
  })
})

describe('slots', () => {
  const link = { dealId: 'D1', category: '10', type: 'D01', date: '2026-10-13', code: '42', standardDoc: '100', createdBy: 'X' }
  const meta = { code: '42', standardDoc: '100', name: 'a', extension: 'PDF', description: '', size: 1, unit: 'KB', comment: '' }
  const orig = (over: Partial<Original> = {}): Original => ({ number: '100', version: '00', fileName: 'a.pdf', mimeType: 'application/pdf', size: 1, deleted: false, createdBy: '', created: '', ...over })
  it('empty, ok, no-original and unchecked are told apart', () => {
    const types = [T, { ...T, type: 'D02' }]
    deepStrictEqual(buildSlots(types, [link], [meta], new Map([['100', [orig()]]])).map((x) => x.status), ['ok', 'empty'])
    strictEqual(buildSlots(types, [link], [meta], new Map())[0]!.status, 'no-original')
    strictEqual(buildSlots(types, [link], [meta], new Map([['100', [orig({ deleted: true })]]]))[0]!.status, 'no-original')
    strictEqual(buildSlots(types, [link], [meta], null)[0]!.status, 'unchecked')
  })
  it('loads a Deal ID through the injected reads', async () => {
    const { deps } = mk({ originalsOf: async () => [orig()] }, [{ ZDEAL_ID: 'D1', ZDMS_CAT: '10', ZDMS_TYPE: 'D01', ZDDATE: '2026-10-13', ZDMS_CODE: '42', ZSTND_DMS: '100' }])
    const l = await loadDealDms('D1', '10', deps)
    strictEqual(l.slots.length, 2)
    strictEqual(l.slots[0]!.status, 'ok')
  })
  it('an unreachable SAP DMS reads as unchecked, with the reason', async () => {
    const { deps } = mk({ originalsOf: async () => { throw new Error('503') } }, [{ ZDEAL_ID: 'D1', ZDMS_CAT: '10', ZDMS_TYPE: 'D01', ZDMS_CODE: '42', ZSTND_DMS: '100' }])
    const l = await loadDealDms('D1', '10', deps)
    strictEqual(l.slots[0]!.status, 'unchecked')
    strictEqual(l.originalsNote.includes('503'), true)
  })
})

describe('upload', () => {
  it('SAP DMS, then TSF_DMS with the drawn code, then DEALDMS; the standard number is SAP\'s', async () => {
    const { deps, calls } = mk()
    const r = await upload(deps)
    strictEqual(r.ok, true)
    deepStrictEqual(calls.creates.map(([res]) => res), [RES.meta, RES.link])
    strictEqual(calls.creates[0]![1]['ZSTND_DMS'], '10000000001')
    strictEqual(calls.creates[0]![1]['ZDOC_NAME'], 'inv')
    strictEqual(calls.creates[1]![1]['ZDMS_CODE'], '0000000042')
    strictEqual(calls.creates[1]![1]['ZDDATE'], '2026-10-13')
    strictEqual(calls.creates[1]![1]['ZDMS_CAT'], '10')
  })
  it('a slot that already has a document is refused before anything is uploaded', async () => {
    const { deps, calls } = mk({}, [{ ZDEAL_ID: 'D1', ZDMS_CAT: '10', ZDMS_TYPE: 'D01', ZSTND_DMS: '100' }])
    strictEqual((await upload(deps)).ok, false)
    strictEqual(calls.uploads, 0)
  })
  it('without a number range for the custom code nothing is uploaded', async () => {
    const { deps, calls } = mk({ hasCodeRange: async () => false })
    const r = await upload(deps)
    strictEqual(r.ok, false)
    strictEqual(calls.uploads, 0)
  })
  it('SAP DMS refusing is an error, nothing is written', async () => {
    const { deps, calls } = mk({ upload: async () => { throw new Error('no storage category') } })
    const r = await upload(deps)
    strictEqual(r.ok, false)
    strictEqual(calls.creates.length, 0)
  })
  it('a failed link undoes the metadata and the DMS document, and says so', async () => {
    const { deps, calls } = mk({
      create: async (resource, data) => {
        if (resource === RES.link) throw new Error('duplicate key')
        calls.creates.push([resource, data])
        return { key: { ZTSF_DMS_CODE: '0000000042' }, assignedNumber: '0000000042' }
      },
    })
    const r = await upload(deps)
    strictEqual(r.ok, false)
    deepStrictEqual(calls.removes, [RES.meta])
    deepStrictEqual(calls.flagged, ['10000000001'])
    strictEqual(r.message.includes('flagged for deletion'), true)
  })
  it('invalid input never reaches SAP', async () => {
    const { deps, calls } = mk()
    strictEqual((await upload(deps, { size: 0 })).ok, false)
    strictEqual((await upload(deps, { date: 'x' })).ok, false)
    strictEqual(calls.uploads, 0)
  })
})

describe('edit', () => {
  const slot = (): DmsSlot => ({
    type: T,
    link: { dealId: 'D1', category: '10', type: 'D01', date: '2026-10-01', code: '42', standardDoc: '100', createdBy: '' },
    meta: { code: '42', standardDoc: '100', name: 'a', extension: 'PDF', description: '', size: 1, unit: 'KB', comment: 'old' },
    originals: [{ number: '100', version: '00', fileName: 'a.pdf', mimeType: '', size: 1, deleted: false, createdBy: '', created: '' }],
    status: 'ok',
  })
  it('date and comment only: no file call, and only the changed fields are written', async () => {
    const { deps, calls } = mk()
    const r = await editDocument('D1', '10', { slot: slot(), date: '13-10-2026', comment: 'old', file: null }, deps)
    strictEqual(r.ok, true)
    strictEqual(calls.versions, 0)
    deepStrictEqual(calls.updates.map(([res]) => res), [RES.link])
    deepStrictEqual(calls.updates[0]![2], { ZDDATE: '2026-10-13' })
  })
  it('a new file is a new version of the same document; ZSTND_DMS is never rewritten', async () => {
    const { deps, calls } = mk()
    const r = await editDocument('D1', '10', { slot: slot(), date: '01-10-2026', comment: 'old', file: { name: 'new.pdf', size: 10, content: 'QQ==' } }, deps)
    strictEqual(r.ok, true)
    strictEqual(calls.versions, 1)
    for (const [, k, changes] of calls.updates) {
      strictEqual(k['ZSTND_DMS'] === undefined || k['ZSTND_DMS'] === '100', true)
      strictEqual('ZSTND_DMS' in changes, false)
      strictEqual('ZTSF_DMS_CODE' in changes, false)
    }
  })
  it('nothing changed says so; an empty slot cannot be edited', async () => {
    const { deps } = mk()
    strictEqual((await editDocument('D1', '10', { slot: slot(), date: '01-10-2026', comment: 'old', file: null }, deps)).message, 'Nothing was changed.')
    strictEqual((await editDocument('D1', '10', { slot: { ...slot(), link: null, meta: null, status: 'empty' }, date: '01-10-2026', comment: '', file: null }, deps)).ok, false)
  })
})

describe('download', () => {
  it('returns the original as a blob with its name and MIME type; blank content is an error', async () => {
    const { deps } = mk()
    const r = await fetchOriginal({ number: '100', version: '00' }, deps)
    if (!r.ok) throw new Error(r.message)
    strictEqual(r.mimeType, 'application/pdf')
    strictEqual(await r.blob.text(), 'hello')
    const { deps: empty } = mk({ original: async () => ({ fileName: 'a.pdf', mimeType: 'application/pdf', description: '', content: '' }) })
    strictEqual((await fetchOriginal({ number: '100', version: '00' }, empty)).ok, false)
  })
})
