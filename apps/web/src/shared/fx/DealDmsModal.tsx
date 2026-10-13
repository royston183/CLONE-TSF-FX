import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, Dialog, Spinner } from '@slc/ui'
import { dmyFromIso, sapNow } from './sap.ts'
import {
  DMS_CATEGORY, canPreview, defaultDeps, editDocument, fetchOriginal, fileToBase64, formatSize, isoOfDmy, loadDealDms, uploadDocument, validateForm,
  type DmsDeps, type DmsSlot, type Original,
} from './dms.ts'
import { messageOf } from './master-contract.ts'
import './deal-dms.css'

type Notice = { kind: 'ok' | 'error'; text: string } | null
type Form = { mode: 'upload' | 'edit'; slot: DmsSlot; date: string; comment: string; file: File | null; errors: Record<string, string>; failure?: string }
type Preview = { url: string; mimeType: string; name: string }

const STATUS_TEXT: Record<DmsSlot['status'], string> = {
  empty: 'Not uploaded',
  ok: 'Uploaded',
  'no-original': 'Original missing in SAP DMS',
  unchecked: 'SAP DMS not checked',
}

const todayDmy = (): string => dmyFromIso(sapNow().date)

/**
 * The Deal ID documents panel shared by MO: Execute Settlement and BO: Posting Accounting Entries (see shared/fx/dms.ts for
 * what it reads and writes). Every row is a configured document type; a document is uploaded into an empty one and edited
 * or replaced in an occupied one. Nothing is shown as uploaded unless the DMS link, its metadata and an original in SAP DMS
 * exist. It never touches the Deal ID's status.
 *
 * Rendered into document.body: the converted legacy screens that host it carry a scoped reset
 * (`.<screen> * { margin: 0; padding: 0 }`) that would otherwise strip the dialog's centring and padding. The Upload /
 * Edit form and the preview are dialogs of their own, stacked above the list in the browser's top layer.
 */
export function DealDmsModal({ open, onClose, dealId, category = DMS_CATEGORY, deps = defaultDeps }: { open: boolean; onClose: () => void; dealId: string; category?: string; deps?: DmsDeps }) {
  const [slots, setSlots] = useState<DmsSlot[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const busyRef = useRef(false)

  const clearPreview = useCallback(() => setPreview((p) => (p && URL.revokeObjectURL(p.url), null)), [])

  const reload = useCallback(async () => {
    if (!dealId) return
    setLoading(true)
    try {
      const loaded = await loadDealDms(dealId, category, deps)
      setSlots(loaded.slots)
      setNotice(loaded.originalsNote ? { kind: 'error', text: loaded.originalsNote } : null)
    } catch (error) {
      setSlots([])
      setNotice({ kind: 'error', text: `The documents could not be read: ${messageOf(error)}` })
    } finally {
      setLoading(false)
    }
  }, [dealId, category, deps])

  useEffect(() => {
    if (open) {
      setForm(null)
      void reload()
    } else {
      setForm(null)
      clearPreview()
    }
  }, [open, reload, clearPreview])

  const run = async (work: () => Promise<{ ok: boolean; message: string }>, after?: () => void) => {
    if (busyRef.current) return // a second click while the first is running must not make a second document
    busyRef.current = true
    setBusy(true)
    try {
      const r = await work()
      setNotice({ kind: r.ok ? 'ok' : 'error', text: r.message })
      if (r.ok) after?.()
      else setForm((f) => (f ? { ...f, failure: r.message } : f))
      await reload()
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const openForm = (mode: Form['mode'], slot: DmsSlot) =>
    setForm({ mode, slot, date: mode === 'edit' && slot.link?.date ? dmyFromIso(slot.link.date) : todayDmy(), comment: mode === 'edit' ? (slot.meta?.comment ?? '') : '', file: null, errors: {} })

  const submit = () => {
    if (!form) return
    const errors = validateForm(
      { type: form.slot.type.type, date: form.date, comment: form.comment, file: form.file ? { name: form.file.name, size: form.file.size } : null },
      { fileRequired: form.mode === 'upload' },
    )
    if (Object.keys(errors).length) return setForm({ ...form, errors })
    const f = form
    void run(
      async () => {
        const content = f.file ? await fileToBase64(f.file) : ''
        return f.mode === 'upload'
          ? uploadDocument({ dealId, category, type: f.slot.type, date: f.date, comment: f.comment, fileName: f.file!.name, size: f.file!.size, mimeType: f.file!.type, content, existing: slots }, deps)
          : editDocument(dealId, category, { slot: f.slot, date: f.date, comment: f.comment, file: f.file ? { name: f.file.name, size: f.file.size, content, mimeType: f.file.type } : null }, deps)
      },
      () => setForm(null),
    )
  }

  const download = async (o: Original, inline: boolean) => {
    setBusy(true)
    try {
      const r = await fetchOriginal(o, deps)
      if (!r.ok) return setNotice({ kind: 'error', text: r.message })
      const url = URL.createObjectURL(r.blob)
      if (inline && canPreview(r.mimeType)) {
        clearPreview()
        return setPreview({ url, mimeType: r.mimeType, name: r.fileName })
      }
      const a = document.createElement('a')
      a.href = url
      a.download = r.fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } finally {
      setBusy(false)
    }
  }

  if (typeof document === 'undefined') return null
  return createPortal(
    <Dialog
      open={open}
      onClose={() => {
        clearPreview()
        onClose()
      }}
      title={`Documents · Deal ID ${dealId}`}
      width={1040}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      <div className="dms">
        {notice ? <div className={`dms__notice dms__notice--${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text}</div> : null}
        {loading ? (
          <div className="dms__loading"><Spinner /> Reading documents from SAP…</div>
        ) : (
          <div className="dms__tablewrap">
            <table className="dms__table">
              <thead>
                <tr>
                  <th>Document type</th><th>Status</th><th>Document date</th><th>File</th><th>DMS code</th><th>SAP DMS no.</th><th>Comment</th><th className="dms__actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {slots.length === 0 ? (
                  <tr><td colSpan={8} className="dms__empty">No document types are configured for category {category} in ZSGTSFTR_DMS_TYP.</td></tr>
                ) : (
                  slots.map((slot) => {
                    const latest = slot.originals[0]
                    return (
                      <tr key={slot.type.type}>
                        <td><strong>{slot.type.description}</strong><div className="dms__sub">{slot.type.type}</div></td>
                        <td><span className={`dms__pill dms__pill--${slot.status}`}>{STATUS_TEXT[slot.status]}</span></td>
                        <td>{slot.link?.date ? dmyFromIso(slot.link.date) : '—'}</td>
                        <td className="dms__file" title={latest?.fileName || slot.meta?.name}>
                          {slot.meta ? `${slot.meta.name}${slot.meta.extension ? `.${slot.meta.extension.toLowerCase()}` : ''}` : '—'}
                          {slot.meta?.size ? <div className="dms__sub">{slot.meta.size} {slot.meta.unit}</div> : null}
                          {slot.originals.length > 1 ? <div className="dms__sub">{slot.originals.length} originals</div> : null}
                        </td>
                        <td>{slot.link?.code || '—'}</td>
                        <td>{slot.link?.standardDoc || '—'}</td>
                        <td className="dms__comment" title={slot.meta?.comment}>{slot.meta?.comment || '—'}</td>
                        <td className="dms__actions">
                          {slot.link ? (
                            <>
                              <Button disabled={busy || !latest} onClick={() => latest && void download(latest, true)}>{latest && canPreview(latest.mimeType) ? 'Preview' : 'Open'}</Button>
                              <Button disabled={busy || !slot.meta} onClick={() => openForm('edit', slot)}>Edit</Button>
                            </>
                          ) : (
                            <Button variant="primary" disabled={busy} onClick={() => openForm('upload', slot)}>Upload</Button>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
            {slots.filter((s) => s.originals.length > 1).map((slot) => (
              <div key={`o-${slot.type.type}`} className="dms__originals">
                <strong>{slot.type.description}: originals</strong>
                {slot.originals.map((o) => (
                  <span key={o.version} className="dms__orig">
                    v{o.version} {o.fileName} {o.size ? `(${formatSize(o.size)})` : ''}
                    <Button disabled={busy} onClick={() => void download(o, false)}>Download</Button>
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}

        <Dialog
          open={!!form}
          onClose={() => setForm(null)}
          title={form ? `${form.mode === 'upload' ? 'Upload' : 'Edit'} · ${form.slot.type.description}` : ''}
          width={560}
          footer={form ? (
            <>
              <Button onClick={() => setForm(null)} disabled={busy}>Cancel</Button>
              <Button variant="primary" loading={busy} onClick={submit} disabled={form.mode === 'edit' && !isoOfDmy(form.date)}>{form.mode === 'upload' ? 'Upload' : 'Save'}</Button>
            </>
          ) : null}
        >
          {form ? (
            <form className="dms dms__form" onSubmit={(e) => { e.preventDefault(); submit() }} noValidate>
              {form.failure ? <div className="dms__notice dms__notice--error" role="alert">{form.failure}</div> : null}
              <label>Document type<input value={`${form.slot.type.type} · ${form.slot.type.description}`} readOnly /></label>
              <label>Document date<span className="dms__req">*</span>
                <input value={form.date} placeholder="dd-mm-yyyy" maxLength={10} aria-invalid={!!form.errors['date']} onChange={(e) => setForm({ ...form, date: e.target.value, errors: { ...form.errors, date: '' } })} />
                {form.errors['date'] ? <span className="dms__err">{form.errors['date']}</span> : null}
              </label>
              <label className="dms__wide">Comment
                <input value={form.comment} maxLength={255} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
                {form.errors['comment'] ? <span className="dms__err">{form.errors['comment']}</span> : null}
              </label>
              <label className="dms__wide">{form.mode === 'upload' ? 'File' : 'Replace the file (optional)'}{form.mode === 'upload' ? <span className="dms__req">*</span> : null}
                <input type="file" onChange={(e) => setForm({ ...form, file: e.target.files?.[0] ?? null, errors: { ...form.errors, file: '' } })} />
                {form.file ? <span className="dms__sub">{form.file.name} · {formatSize(form.file.size)}</span> : null}
                {form.errors['file'] ? <span className="dms__err">{form.errors['file']}</span> : null}
              </label>
              {/* Enter in a field submits; the visible buttons are in the dialog footer. */}
              <button type="submit" hidden />
            </form>
          ) : null}
        </Dialog>

        <Dialog
          open={!!preview}
          onClose={clearPreview}
          title={preview?.name ?? ''}
          width={960}
          footer={<Button onClick={clearPreview}>Close preview</Button>}
        >
          {preview ? (
            <div className="dms__preview">
              {preview.mimeType.startsWith('image/') ? <img src={preview.url} alt={preview.name} /> : <iframe src={preview.url} title={preview.name} />}
            </div>
          ) : null}
        </Dialog>
      </div>
    </Dialog>,
    document.body,
  )
}
