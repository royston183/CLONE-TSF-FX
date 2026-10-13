/**
 * Deal ID documents (DMS) for the settlement screens: MO Execute Settlement (ZSGTSF_RDEAL_TRD_INV, function code DMS ->
 * FM ZSGTSFFM_DMS with IM_DEAL / IM_CAT '10') and BO Posting Accounting Entries (ZSGTSF_RDEAL_TRD_POST). One client, so a
 * Deal ID shows the same attachments in both.
 *
 *   Document types   ZSGTSFTR_DMS_TYP  (local SQLite, /api/localdb/tsf-dms-type) WHERE ZDMS_CAT; category 10 leaves out D07 / D08 / D10 / D16
 *   Deal link        ZSGTSFTR_DEALDMS  (middleware "dealDocument") ZDEAL_ID + ZDMS_CAT + ZDMS_TYPE: one slot per type
 *   Metadata         ZSGTSFTR_TSF_DMS  (middleware "tsfDocument")  ZTSF_DMS_CODE (the custom code) + ZSTND_DMS
 *   The document     SAP DMS, document type TRM / part 000, through ZFS_SB_ALMDMSDOC_O4_API (service "almdmsdoc"):
 *                    Upload, CreateNewVersion (the replacement original: the document number stays), GetOriginal
 *                    (CVAPI_DOC_CHECKOUTVIEW), SetDeletionFlag. The file travels base64 in the JSON body, through the
 *                    authenticated gateway: there is no URL to the content.
 *
 * Upload order: SAP DMS first (it owns the standard number), then TSF_DMS (its custom code is drawn by the middleware's
 * number range, never made up here), then DEALDMS. A failure after the DMS document exists undoes what was written
 * (the TSF_DMS row, the DMS document's deletion flag) and says so; nothing is reported as uploaded until all three exist.
 * Edit changes only what changed: the date, the comment, or a new original (a new version of the same document).
 * ZSTND_DMS is never rewritten with anything but what SAP returned (the legacy EDIT_UPLOAD_DOCUMENT cleared and reused LV_DOCNR).
 *
 * Not decided by this file, see the report that came with it: the middleware's registry rows for DEALDMS and the number
 * range of TSF_DMS-ZTSF_DMS_CODE per document type (ZDMS_OBJ / ZDMS_RANGE), and what the almdmsdoc Upload action returns.
 */
import { apiFetch, apiRequest, odataString, service } from '@slc/api-client'
import { messageOf } from './master-contract.ts'
import { fxCreate, fxDelete, fxHasNumberRange, fxList, fxUpdate, type FxRow } from './mw.ts'
import { isoFromDmy, sapNow, sapUser } from './sap.ts'

export const DMS_CATEGORY = '10'
/** Types a category does not offer (the legacy PROCESS_DATA excludes them for category 10). */
export const EXCLUDED_TYPES: Readonly<Record<string, readonly string[]>> = { '10': ['D07', 'D08', 'D10', 'D16'] }
export const MAX_BYTES = 20 * 1024 * 1024

export const RES = { type: 'dmsType', meta: 'tsfDocument', link: 'dealDocument' } as const

const docApi = service('almdmsdoc')('Document')
/** ZSGTSFTR_DMS_TYP lives in the gateway's local SQLite (migration 005), not behind the middleware. */
const dmsTypeApi = service('localdb')('tsf-dms-type')
const NS = 'com.sap.gateway.srvd_a2x.zfs_sd_almdmsdoc.v0001'

/* ------------------------------------------------------------------ types */

export type DmsType = { category: string; type: string; description: string; object: string; range: string }
export type DealLink = { dealId: string; category: string; type: string; date: string; code: string; standardDoc: string; createdBy: string }
export type DocMeta = { code: string; standardDoc: string; name: string; extension: string; description: string; size: number; unit: string; comment: string }
export type Original = { number: string; version: string; fileName: string; mimeType: string; size: number; deleted: boolean; createdBy: string; created: string }

export type SlotStatus = 'empty' | 'ok' | 'no-original' | 'unchecked'
export type DmsSlot = {
  type: DmsType
  link: DealLink | null
  meta: DocMeta | null
  /** The document's versions, newest first: each one is an original. */
  originals: Original[]
  status: SlotStatus
}

/* ------------------------------------------------------------------ pure mappings */

const s = (r: FxRow, k: string): string => (r[k] ?? '').trim()

export const toType = (r: FxRow): DmsType => ({
  category: s(r, 'ZDMS_CAT'),
  type: s(r, 'ZDMS_TYPE'),
  description: s(r, 'ZDMS_DESC') || s(r, 'ZDMS_DDESC') || s(r, 'ZDMS_TYPE'),
  object: s(r, 'ZDMS_OBJ'),
  range: s(r, 'ZDMS_RANGE'),
})

/** The category's document types, the excluded ones left out, in type order. */
export function typesOf(rows: readonly FxRow[], category: string): DmsType[] {
  const excluded = EXCLUDED_TYPES[category] ?? []
  const seen = new Set<string>()
  return rows
    .map(toType)
    .filter((t) => t.category === category && t.type && !excluded.includes(t.type) && !seen.has(t.type) && !!seen.add(t.type))
    .sort((a, b) => a.type.localeCompare(b.type))
}

export const toLink = (r: FxRow): DealLink => ({
  dealId: s(r, 'ZDEAL_ID'),
  category: s(r, 'ZDMS_CAT'),
  type: s(r, 'ZDMS_TYPE'),
  date: s(r, 'ZDDATE'),
  code: s(r, 'ZDMS_CODE'),
  standardDoc: s(r, 'ZSTND_DMS'),
  createdBy: s(r, 'ZCREATED_BY'),
})

export const toMeta = (r: FxRow): DocMeta => ({
  code: s(r, 'ZTSF_DMS_CODE'),
  standardDoc: s(r, 'ZSTND_DMS'),
  name: s(r, 'ZDOC_NAME'),
  extension: s(r, 'ZDOC_EXTN'),
  description: s(r, 'ZDOC_DESC'),
  size: Number(s(r, 'ZFILE_SIZE')) || 0,
  unit: s(r, 'ZSIZE_BYTE'),
  comment: s(r, 'ZCOMMENT'),
})

export const toOriginal = (r: Record<string, unknown>): Original => ({
  number: String(r['DocumentNumber'] ?? '').trim(),
  version: String(r['DocumentVersion'] ?? '').trim(),
  fileName: String(r['FileName'] ?? '').trim(),
  mimeType: String(r['MimeType'] ?? '').trim(),
  size: Number(r['FileSize']) || 0,
  deleted: r['DeletionFlag'] === true || r['DeletionFlag'] === 'X',
  createdBy: String(r['CreatedBy'] ?? '').trim(),
  created: String(r['CreationDateTime'] ?? '').trim(),
})

/**
 * PROCESS_DATA's join: every configured type is a slot, with its DEALDMS link, that link's TSF_DMS row (by custom code
 * and standard number) and the originals SAP DMS holds for the standard number. `originals` null = SAP DMS could not be
 * asked: the slot says unchecked instead of claiming the file exists.
 */
export function buildSlots(types: readonly DmsType[], links: readonly DealLink[], metas: readonly DocMeta[], originals: ReadonlyMap<string, Original[]> | null): DmsSlot[] {
  return types.map((type) => {
    const link = links.find((l) => l.type === type.type) ?? null
    const meta = link ? (metas.find((m) => m.code === link.code && m.standardDoc === link.standardDoc) ?? metas.find((m) => m.code === link.code) ?? null) : null
    const versions = link && originals ? (originals.get(link.standardDoc) ?? []).filter((o) => !o.deleted) : []
    const status: SlotStatus = !link ? 'empty' : originals === null ? 'unchecked' : versions.length ? 'ok' : 'no-original'
    return { type, link, meta, originals: versions, status }
  })
}

/** Newest version first (versions are two-digit strings). */
export const newestFirst = (list: readonly Original[]): Original[] => [...list].sort((a, b) => b.version.localeCompare(a.version))

export function splitFileName(name: string): { base: string; extension: string } {
  const clean = safeFileName(name)
  const dot = clean.lastIndexOf('.')
  return dot > 0 ? { base: clean.slice(0, dot), extension: clean.slice(dot + 1).toUpperCase() } : { base: clean, extension: '' }
}

/** A file name with no path part and no characters a download or a DMS file name must not carry. */
export function safeFileName(name: string): string {
  return name.replace(/^.*[\\/]/, '').replace(/[\u0000-\u001f<>:"|?*]/g, '_').trim().slice(0, 100)
}

/** ZFILE_SIZE / ZSIZE_BYTE: KB below a megabyte, MB above. */
export function sizeOf(bytes: number): { size: number; unit: 'KB' | 'MB' } {
  return bytes >= 1048576 ? { size: Math.round((bytes / 1048576) * 100) / 100, unit: 'MB' } : { size: Math.round((bytes / 1024) * 100) / 100, unit: 'KB' }
}

export function formatSize(bytes: number): string {
  const { size, unit } = sizeOf(bytes)
  return `${size} ${unit}`
}

/** dd-mm-yyyy that is a real calendar date; the ISO form, or null. */
export function isoOfDmy(value: string): string | null {
  const iso = isoFromDmy(value)
  if (!iso) return null
  const d = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso
}

export type UploadForm = { type: string; date: string; comment: string; file: { name: string; size: number } | null }

/** Inline validation of the upload / edit form: field -> message. */
export function validateForm(form: UploadForm, opts: { fileRequired: boolean }): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!form.type) errors['type'] = 'Select a document type.'
  if (!form.date.trim()) errors['date'] = 'Enter the document date.'
  else if (!isoOfDmy(form.date)) errors['date'] = 'Use a real date as dd-mm-yyyy.'
  if (form.comment.length > 255) errors['comment'] = 'The comment is at most 255 characters.'
  if (!form.file) {
    if (opts.fileRequired) errors['file'] = 'Choose a file.'
  } else if (!safeFileName(form.file.name)) errors['file'] = 'The file has no usable name.'
  else if (form.file.size === 0) errors['file'] = 'The file is empty.'
  else if (form.file.size > MAX_BYTES) errors['file'] = `The file is ${formatSize(form.file.size)}; the limit is ${formatSize(MAX_BYTES)}.`
  return errors
}

/** MIME types the panel shows inline; anything else downloads. SVG is left out: it can carry script. */
export const PREVIEWABLE = /^(application\/pdf|image\/(png|jpe?g|gif|webp|bmp)|text\/plain)$/i
export const canPreview = (mimeType: string): boolean => PREVIEWABLE.test(mimeType)

export async function fileToBase64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let out = ''
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(out)
}

export function base64ToBlob(content: string, mimeType: string): Blob {
  const bin = atob(content)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mimeType || 'application/octet-stream' })
}

/* ------------------------------------------------------------------ dependencies (real by default, injected in tests) */

export type Created = { number: string; version: string }
export type OriginalContent = { fileName: string; mimeType: string; description: string; content: string }

export type DmsDeps = {
  list: (resource: string, filter?: Record<string, string>) => Promise<FxRow[]>
  create: (resource: string, data: Record<string, unknown>) => Promise<{ key: Record<string, string>; assignedNumber: string | undefined }>
  update: (resource: string, key: Record<string, string>, changes: Record<string, unknown>) => Promise<void>
  remove: (resource: string, key: Record<string, string>) => Promise<void>
  hasCodeRange: () => Promise<boolean>
  upload: (a: { fileName: string; description: string; content: string }) => Promise<Created>
  newVersion: (a: { number: string; version: string; fileName: string; content: string }) => Promise<Created>
  flagDeleted: (c: Created) => Promise<void>
  originalsOf: (numbers: readonly string[]) => Promise<Original[]>
  original: (c: Created) => Promise<OriginalContent>
  stamp: () => Promise<{ user: string; date: string; time: string }>
}

const key = (c: Created) => `${docApi}(DocumentNumber=${odataString(c.number)},DocumentVersion=${odataString(c.version)})`
const str = (v: unknown): string => String(v ?? '').trim()

export const defaultDeps: DmsDeps = {
  list: async (resource, filter = {}) => {
    if (resource !== RES.type) return fxList(resource, filter)
    const query = filter['ZDMS_CAT'] ? `?ZDMS_CAT=${encodeURIComponent(filter['ZDMS_CAT'])}` : ''
    const body = await apiFetch<{ value?: FxRow[] }>(`${dmsTypeApi}${query}`)
    return body?.value ?? []
  },
  create: fxCreate,
  update: fxUpdate,
  remove: fxDelete,
  hasCodeRange: () => fxHasNumberRange(RES.meta),
  upload: async ({ fileName, description, content }) => {
    const started = Date.now() - 60_000
    const res = await apiRequest<Record<string, unknown>>(`${docApi}/${NS}.Upload`, { method: 'POST', body: { FileName: fileName, Description: description, Content: content } })
    const body = res.data ?? {}
    if (str(body['DocumentNumber'])) return { number: str(body['DocumentNumber']), version: str(body['DocumentVersion']) || '00' }
    // The action returned no entity: find the document it just made (this user, this name, created since the call began).
    const filter = `FileName eq ${odataString(fileName)}`
    const found = await apiFetch<{ value?: Record<string, unknown>[] }>(`${docApi}?$filter=${encodeURIComponent(filter)}&$orderby=CreationDateTime desc&$top=5`)
    const mine = (found?.value ?? []).map(toOriginal).filter((o) => o.number && Date.parse(o.created) >= started)
    if (mine.length !== 1) throw new Error('SAP DMS accepted the file but did not say which document it made; check DMS before uploading again.')
    return { number: mine[0]!.number, version: mine[0]!.version }
  },
  newVersion: async ({ number, version, fileName, content }) => {
    const res = await apiRequest<Record<string, unknown>>(`${key({ number, version })}/${NS}.CreateNewVersion`, { method: 'POST', body: { FileName: fileName, Content: content } })
    const next = str((res.data ?? {})['DocumentVersion'])
    if (next) return { number, version: next }
    const versions = await defaultDeps.originalsOf([number])
    const latest = newestFirst(versions)[0]
    if (!latest || latest.version === version) throw new Error('SAP DMS did not create a new version.')
    return { number, version: latest.version }
  },
  flagDeleted: async (c) => {
    await apiRequest(`${key(c)}/${NS}.SetDeletionFlag`, { method: 'POST', body: {} })
  },
  originalsOf: async (numbers) => {
    if (!numbers.length) return []
    const filter = numbers.map((n) => `DocumentNumber eq ${odataString(n)}`).join(' or ')
    const body = await apiFetch<{ value?: Record<string, unknown>[] }>(`${docApi}?$filter=${encodeURIComponent(filter)}&$top=1000`)
    return (body?.value ?? []).map(toOriginal)
  },
  original: async (c) => {
    const body = await apiFetch<Record<string, unknown>>(`${key(c)}/${NS}.GetOriginal()`)
    return { fileName: str(body?.['FileName']), mimeType: str(body?.['MimeType']), description: str(body?.['Description']), content: str(body?.['Content']) }
  },
  stamp: async () => ({ user: await sapUser(), ...sapNow() }),
}

/* ------------------------------------------------------------------ reads */

export type Loaded = { types: DmsType[]; slots: DmsSlot[]; originalsNote: string }

/** The panel's data: configured types, the Deal ID's links, their metadata, and what SAP DMS holds. */
export async function loadDealDms(dealId: string, category: string, deps: DmsDeps = defaultDeps): Promise<Loaded> {
  const [typeRows, linkRows] = await Promise.all([deps.list(RES.type, { ZDMS_CAT: category }), deps.list(RES.link, { ZDEAL_ID: dealId, ZDMS_CAT: category })])
  const types = typesOf(typeRows, category)
  const links = linkRows.map(toLink)
  const codes = [...new Set(links.map((l) => l.code).filter(Boolean))]
  const metas = codes.length ? (await deps.list(RES.meta, { 'ZTSF_DMS_CODE[in]': codes.join(',') })).map(toMeta) : []
  let originals: Map<string, Original[]> | null = null
  let originalsNote = ''
  const numbers = [...new Set(links.map((l) => l.standardDoc).filter(Boolean))]
  if (numbers.length) {
    try {
      originals = new Map()
      for (const o of await deps.originalsOf(numbers)) originals.set(o.number, newestFirst([...(originals.get(o.number) ?? []), o]))
    } catch (error) {
      originals = null
      originalsNote = `SAP DMS could not be asked for the originals: ${messageOf(error)}`
    }
  } else originals = new Map()
  return { types, slots: buildSlots(types, links, metas, originals), originalsNote }
}

/* ------------------------------------------------------------------ writes */

export type Result = { ok: true; message: string } | { ok: false; message: string }

const stampCols = (st: { user: string; date: string; time: string }) => ({ ZCREATED_BY: st.user, ZCREATED_DATE: st.date, ZCREATED_TIME: st.time })

export type UploadArgs = { dealId: string; category: string; type: DmsType; date: string; comment: string; fileName: string; size: number; content: string; existing: readonly DmsSlot[] }

/**
 * A new document in an empty slot. The slot is re-read first, so a second submit (or the other module) cannot add a
 * second document of the type. TSF_DMS' code comes from the middleware's number range; without one nothing is created.
 */
export async function uploadDocument(a: UploadArgs, deps: DmsDeps = defaultDeps): Promise<Result> {
  const errors = validateForm({ type: a.type.type, date: a.date, comment: a.comment, file: { name: a.fileName, size: a.size } }, { fileRequired: true })
  if (Object.keys(errors).length) return { ok: false, message: Object.values(errors)[0]! }
  const iso = isoOfDmy(a.date)!
  const name = safeFileName(a.fileName)
  try {
    const current = (await deps.list(RES.link, { ZDEAL_ID: a.dealId, ZDMS_CAT: a.category, ZDMS_TYPE: a.type.type })).map(toLink)
    if (current.length) return { ok: false, message: `${a.type.description} already has a document (${current[0]!.standardDoc}); use Edit to change or replace it.` }
  } catch (error) {
    return { ok: false, message: `The Deal ID's documents could not be read before uploading: ${messageOf(error)}` }
  }
  if (!(await deps.hasCodeRange().catch(() => false))) {
    return { ok: false, message: 'The custom DMS code cannot be drawn: the middleware has no number range bound to ZSGTSFTR_TSF_DMS-ZTSF_DMS_CODE (ZDMS_OBJ / ZDMS_RANGE). Nothing was uploaded.' }
  }

  let created: Created
  try {
    created = await deps.upload({ fileName: name, description: name, content: a.content })
  } catch (error) {
    return { ok: false, message: `SAP DMS refused the upload: ${messageOf(error)}` }
  }

  const { base, extension } = splitFileName(name)
  const { size, unit } = sizeOf(a.size)
  const st = await deps.stamp()
  let metaKey: Record<string, string> | undefined
  try {
    const m = await deps.create(RES.meta, {
      ZSTND_DMS: created.number, ZDMS_CAT: a.category, ZDOC_NAME: base, ZDOC_EXTN: extension, ZDOC_TYPE: a.type.type, ZDOC_DESC: a.type.description,
      ZSOURCE_PATH: name, ZFILE_SIZE: size, ZSIZE_BYTE: unit, ZCOMMENT: a.comment.trim(),
      CREATED_BY: st.user, CREATED_DATE: st.date, CREATED_TIME: st.time,
    })
    metaKey = m.key
    const code = m.assignedNumber || m.key['ZTSF_DMS_CODE'] || ''
    if (!code) throw new Error('the middleware assigned no DMS code')
    await deps.create(RES.link, { ZDEAL_ID: a.dealId, ZDMS_CAT: a.category, ZDMS_TYPE: a.type.type, ZDDATE: iso, ZDMS_CODE: code, ZSTND_DMS: created.number, ...stampCols(st) })
    return { ok: true, message: `${a.type.description} uploaded: DMS code ${code}, SAP document ${created.number}.` }
  } catch (error) {
    const undone: string[] = []
    if (metaKey && Object.keys(metaKey).length) await deps.remove(RES.meta, metaKey).then(() => undone.push('the TSF_DMS row was removed'), () => undone.push('the TSF_DMS row could NOT be removed'))
    await deps.flagDeleted(created).then(() => undone.push(`SAP document ${created.number} was flagged for deletion`), () => undone.push(`SAP document ${created.number} could NOT be flagged for deletion`))
    return { ok: false, message: `The document reached SAP DMS but could not be recorded (${messageOf(error)}); ${undone.join(', ')}. It was not attached to the Deal ID.` }
  }
}

export type EditArgs = { slot: DmsSlot; date: string; comment: string; file: { name: string; size: number; content: string } | null }

/**
 * Edit an attached document. Date and comment are written only where they changed (DEALDMS-ZDDATE, TSF_DMS-ZCOMMENT);
 * a new file is a new version of the same SAP document, and ZSTND_DMS / ZTSF_DMS_CODE are left as they are.
 */
export async function editDocument(dealId: string, category: string, a: EditArgs, deps: DmsDeps = defaultDeps): Promise<Result> {
  const { slot } = a
  if (!slot.link || !slot.meta) return { ok: false, message: 'This slot has no document to edit; upload one instead.' }
  const errors = validateForm({ type: slot.type.type, date: a.date, comment: a.comment, file: a.file ? { name: a.file.name, size: a.file.size } : null }, { fileRequired: false })
  if (Object.keys(errors).length) return { ok: false, message: Object.values(errors)[0]! }
  const iso = isoOfDmy(a.date)!
  const done: string[] = []
  const st = await deps.stamp()
  try {
    if (a.file) {
      const latest = newestFirst(slot.originals)[0]
      if (!latest) return { ok: false, message: 'SAP DMS holds no original to make a new version of; the document cannot be replaced from here.' }
      const name = safeFileName(a.file.name)
      const version = await deps.newVersion({ number: slot.link.standardDoc, version: latest.version, fileName: name, content: a.file.content })
      const { base, extension } = splitFileName(name)
      const { size, unit } = sizeOf(a.file.size)
      await deps.update(RES.meta, { ZTSF_DMS_CODE: slot.meta.code, ZSTND_DMS: slot.meta.standardDoc }, { ZDOC_NAME: base, ZDOC_EXTN: extension, ZSOURCE_PATH: name, ZFILE_SIZE: size, ZSIZE_BYTE: unit })
      done.push(`new original (version ${version.version})`)
    }
    if (a.comment.trim() !== slot.meta.comment) {
      await deps.update(RES.meta, { ZTSF_DMS_CODE: slot.meta.code, ZSTND_DMS: slot.meta.standardDoc }, { ZCOMMENT: a.comment.trim(), CHANGED_BY: st.user, CHANGED_DATE: st.date, CHANGED_TIME: st.time })
      done.push('comment')
    }
    if (iso !== slot.link.date) {
      await deps.update(RES.link, { ZDEAL_ID: dealId, ZDMS_CAT: category, ZDMS_TYPE: slot.type.type }, { ZDDATE: iso })
      done.push('document date')
    }
  } catch (error) {
    return { ok: false, message: `${done.length ? `Saved: ${done.join(', ')}. ` : ''}The change was refused: ${messageOf(error)}` }
  }
  return { ok: true, message: done.length ? `Updated: ${done.join(', ')}.` : 'Nothing was changed.' }
}

/** One original's content for download or preview. SAP's answer is used as it comes: a blank content is an error, not an empty file. */
export async function fetchOriginal(o: Pick<Original, 'number' | 'version'>, deps: DmsDeps = defaultDeps): Promise<{ ok: true; blob: Blob; fileName: string; mimeType: string } | { ok: false; message: string }> {
  try {
    const r = await deps.original({ number: o.number, version: o.version })
    if (!r.content) return { ok: false, message: `SAP DMS returned no content for ${o.number} version ${o.version}.` }
    return { ok: true, blob: base64ToBlob(r.content, r.mimeType), fileName: safeFileName(r.fileName) || `${o.number}-${o.version}`, mimeType: r.mimeType }
  } catch (error) {
    return { ok: false, message: `The original could not be retrieved: ${messageOf(error)}` }
  }
}
