import { defaultDeps, MAX_BYTES, mimeTypeOf, safeFileName, sizeOf, splitFileName, typesOf, type Created, type DmsDeps } from '../../shared/fx/dms.ts'
import { messageOf } from '../../shared/fx/master-contract.ts'
import type { FxRow } from '../../shared/fx/mw.ts'
import type { BlRow } from './types.ts'

export type BlDocumentKind = 'D01' | 'D02'
export const BL_DMS_CATEGORY = '01'
const META = 'tsfDocument'
const MAP = 'blDocument'
const BL = 'billOfLading'
type Key = Record<string, string>
export type BlDmsDeps = Pick<DmsDeps, 'list' | 'create' | 'update' | 'remove' | 'hasCodeRange' | 'upload' | 'flagDeleted' | 'stamp'>
export type BlDmsResult = { ok: boolean; message: string; code?: string; standardDoc?: string; retained?: boolean }

export function blDocumentKey(row: BlRow): Key {
  return { ZTF_NO: String(row.ZtfNo ?? '').trim(), ZTF_SPLIT: String(row.ZtfSplit ?? '').trim(),
    ZBL_NO: String(row.ZblNo ?? '').trim(), ZBL_SPLIT: String(row.ZblSplit ?? '').trim(), ZBL_REUSE: String(row.ZblReuse ?? '').trim() }
}

/** A split staged in the grid has no stored key yet, even if it already has its parent's BL ID. */
export function blUploadSelectionError(rows: readonly BlRow[]): string {
  if (!rows.length) return 'Select at least one BL line item.'
  return rows.some((r) => r.localId || Object.entries(blDocumentKey(r)).some(([field, value]) => field !== 'ZBL_REUSE' && !value))
    ? 'Save the selected BL line items with Update before uploading a document.' : ''
}

const codeField = (kind: BlDocumentKind) => kind === 'D02' ? 'ZDMS_CODE_EXC' : 'ZTSF_DMS_CODE'
const value = (row: FxRow | undefined, field: string) => String(row?.[field] ?? '')
const changed = (st: Awaited<ReturnType<DmsDeps['stamp']>>) => ({ ZCHANGED_BY: st.user, ZCHANGED_DATE: st.date, ZCHANGED_TIME: st.time })
const created = (st: Awaited<ReturnType<DmsDeps['stamp']>>) => ({ ZCREATED_BY: st.user, ZCREATED_DATE: st.date, ZCREATED_TIME: st.time })

type Journal = { resource: string; key: Key; before: FxRow | undefined; fields: string[] }

export type BlUploadArgs = { rows: readonly BlRow[]; kind: BlDocumentKind; fileName: string; size: number; content: string; mimeType?: string; comment: string }

/** One SAP original shared by selected saved BLs. D02 never overwrites the normal BL_DMS mapping. */
export async function uploadBlDocument(a: BlUploadArgs, deps: BlDmsDeps = defaultDeps): Promise<BlDmsResult> {
  const selectionError = blUploadSelectionError(a.rows)
  if (selectionError) return { ok: false, message: selectionError }
  if (!['D01', 'D02'].includes(a.kind)) return { ok: false, message: 'Choose a BL copy or exception approval.' }
  const name = safeFileName(a.fileName)
  const { base, extension } = splitFileName(name)
  if (!name || !a.content || !Number.isFinite(a.size) || a.size <= 0 || a.size > MAX_BYTES) return { ok: false, message: 'Choose a non-empty file of at most 20 MB.' }
  if (base.length > 90 || extension.length > 4) return { ok: false, message: 'Use a filename of at most 90 characters before the extension and an extension of at most 4 characters.' }
  if (a.comment.length > 255) return { ok: false, message: 'The comment is at most 255 characters.' }

  const targets = [...new Map(a.rows.map((r) => { const key = blDocumentKey(r); return [JSON.stringify(key), key] })).values()]
  const previous: Array<{ key: Key; row: FxRow }> = []
  const mappings = new Map<string, FxRow | undefined>()
  let stamp: Awaited<ReturnType<DmsDeps['stamp']>>
  let description: string
  try {
    const types = typesOf(await deps.list('dmsType', { ZDMS_CAT: BL_DMS_CATEGORY }), BL_DMS_CATEGORY)
    const type = types.find((t) => t.type === a.kind)
    if (!type) throw new Error(`Document type ${BL_DMS_CATEGORY}/${a.kind} is not configured.`)
    description = type.description
    if (!(await deps.hasCodeRange())) throw new Error('The custom document number range is not available. Nothing was uploaded.')
    stamp = await deps.stamp()
    for (const key of targets) {
      const rows = await deps.list(BL, key)
      const row = rows.find((r) => Object.entries(key).every(([field, expected]) => value(r, field) === expected))
      if (!row) throw new Error(`BL ${key['ZBL_NO']} / ${key['ZBL_SPLIT']} is no longer available. Refresh and try again.`)
      previous.push({ key, row })
      // BL_DMS is keyed by BL number alone. Only the normal copy updates that mapping.
      if (a.kind === 'D01' && !mappings.has(key['ZBL_NO']!)) mappings.set(key['ZBL_NO']!, (await deps.list(MAP, { ZBL_NO: key['ZBL_NO']! }))[0])
    }
  } catch (error) { return { ok: false, message: messageOf(error) } }

  let doc: Created
  try {
    doc = await deps.upload({ fileName: name, mimeType: mimeTypeOf(name, a.mimeType), description: name.slice(0, 40), content: a.content })
    if (!doc.number) throw new Error('SAP did not return the document number. Check SAP DMS before uploading again.')
  } catch (error) { return { ok: false, message: `The file could not be uploaded: ${messageOf(error)}` } }

  let code = ''
  let metaKey: Key | undefined
  const journal: Journal[] = []
  try {
    const size = sizeOf(a.size)
    const metadata = await deps.create(META, { ZSTND_DMS: doc.number, ZDMS_CAT: BL_DMS_CATEGORY, ZDOC_TYPE: a.kind,
      ZDOC_NAME: base, ZDOC_EXTN: extension, ZDOC_DESC: description, ZSOURCE_PATH: name,
      ZFILE_SIZE: size.size, ZSIZE_BYTE: size.unit, ZCOMMENT: a.comment.trim(),
      CREATED_BY: stamp.user, CREATED_DATE: stamp.date, CREATED_TIME: stamp.time })
    code = metadata.assignedNumber || metadata.key['ZTSF_DMS_CODE'] || ''
    if (!code) throw new Error('The server returned no custom document code.')
    metaKey = { ZTSF_DMS_CODE: code, ZSTND_DMS: doc.number, ZDMS_CAT: BL_DMS_CATEGORY }
    if (a.kind === 'D01') {
      for (const [blNo, before] of mappings) {
        const key = { ZBL_NO: blNo }
        const fields = ['ZTSF_DMS_CODE', 'ZSTND_DMS', ...Object.keys(changed(stamp))]
        journal.push({ resource: MAP, key, before, fields })
        if (before) await deps.update(MAP, key, { ZTSF_DMS_CODE: code, ZSTND_DMS: doc.number, ...changed(stamp) })
        else await deps.create(MAP, { ...key, ZTSF_DMS_CODE: code, ZSTND_DMS: doc.number, ...created(stamp) })
      }
    }
    for (const { key, row } of previous) {
      const fields = [codeField(a.kind), ...Object.keys(changed(stamp))]
      journal.push({ resource: BL, key, before: row, fields })
      await deps.update(BL, key, { [codeField(a.kind)]: code, ...changed(stamp) })
    }
    return { ok: true, code, standardDoc: doc.number, message: `${a.kind === 'D02' ? 'Exception approval' : 'BL copy'} attached to ${targets.length} BL line item(s). DMS code ${code}; SAP document ${doc.number}.` }
  } catch (error) {
    const failedUndo: string[] = []
    // Include the write that failed: it may have committed before its response was lost.
    for (const entry of [...journal].reverse()) {
      try {
        const current = (await deps.list(entry.resource, entry.key))[0]
        const ours = entry.resource === BL ? value(current, codeField(a.kind)) === code
          : value(current, 'ZSTND_DMS') === doc.number && value(current, 'ZTSF_DMS_CODE') === code
        if (!ours) continue // absent, unchanged, or replaced by another user's document
        if (entry.before) await deps.update(entry.resource, entry.key, Object.fromEntries(entry.fields.map((field) => [field, value(entry.before, field)])))
        else await deps.remove(entry.resource, entry.key)
      } catch { failedUndo.push(`${entry.resource} ${entry.key['ZBL_NO']}`) }
    }
    if (failedUndo.length) return { ok: false, retained: true, code, standardDoc: doc.number,
      message: `The upload was partly recorded (${messageOf(error)}). Could not restore ${failedUndo.join(', ')}. SAP document ${doc.number} and its metadata were retained so no remaining BL link points to a deleted file. Refresh and check these BLs before uploading again.` }
    const cleanup: string[] = []
    if (!metaKey) {
      // A metadata insert can commit before a timeout; recover its key from this SAP document.
      try {
        const found = await deps.list(META, { ZSTND_DMS: doc.number, ZDMS_CAT: BL_DMS_CATEGORY })
        const row = found.find((r) => r['ZDOC_TYPE'] === a.kind)
        if (row?.['ZTSF_DMS_CODE']) metaKey = { ZTSF_DMS_CODE: row['ZTSF_DMS_CODE'], ZSTND_DMS: doc.number, ZDMS_CAT: BL_DMS_CATEGORY }
      } catch { cleanup.push('metadata cleanup could not be verified') }
    }
    if (metaKey) await deps.remove(META, metaKey).then(() => cleanup.push('metadata removed'), () => cleanup.push('metadata could not be removed'))
    await deps.flagDeleted(doc).then(() => cleanup.push('SAP document flagged for deletion'), () => cleanup.push('SAP document could not be flagged for deletion'))
    return { ok: false, message: `The document could not be attached (${messageOf(error)}). BL links were restored; ${cleanup.join('; ')}.` }
  }
}
