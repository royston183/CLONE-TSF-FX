import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, Dialog } from '@slc/ui'
import { fileToBase64, formatSize, MAX_BYTES } from '../../shared/fx/dms.ts'
import { messageOf } from '../../shared/fx/master-contract.ts'
import { uploadBlDocument, type BlDmsResult, type BlDocumentKind } from './bl-dms.ts'
import type { BlRow } from './types.ts'
import '../../shared/fx/deal-dms.css'

/** Uses the shared SAP DMS transport with BL links, not Deal ID document slots. */
export function BlDmsUploadModal({ rows, kind, onCancel, onUploaded }: {
  rows: readonly BlRow[]; kind: BlDocumentKind; onCancel: () => void; onUploaded: (result: BlDmsResult) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [retained, setRetained] = useState(false)
  const busyRef = useRef(false)
  const blNumbers = [...new Set(rows.map((row) => row.ZblNo))].join(', ')
  const close = () => { if (!busyRef.current) onCancel() }
  const submit = async () => {
    if (busyRef.current || retained) return
    if (!file || !file.size || file.size > MAX_BYTES) { setError('Choose a non-empty file of at most 20 MB.'); return }
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      const result = await uploadBlDocument({ rows, kind, fileName: file.name, size: file.size, mimeType: file.type, content: await fileToBase64(file), comment })
      if (result.ok) onUploaded(result)
      else { setError(result.message); setRetained(!!result.retained) }
    } catch (failure) { setError(messageOf(failure)) }
    finally { busyRef.current = false; setBusy(false) }
  }
  return createPortal(<Dialog open title={kind === 'D02' ? 'Upload Exception Approval' : 'Upload BL Copy'} width={680} closeDisabled={busy} onClose={close}
    footer={<><Button onClick={close} disabled={busy}>Cancel</Button><Button variant="primary" disabled={busy || retained || !file} onClick={() => void submit()}>{busy ? 'Uploading…' : 'Upload'}</Button></>}>
    <div className="dms">
      <p>{kind === 'D02' ? 'Attach the approval for the selected BL compliance exception.' : 'Attach one copy to the selected BL line items.'}</p>
      <div className="dms__sub">BL ID(s): {blNumbers} · {rows.length} line item(s)</div>
      {error ? <div className="dms__notice dms__notice--error" role="alert">{error}</div> : null}
      <form className="dms__form" onSubmit={(event) => { event.preventDefault(); void submit() }}>
        <label className="dms__wide">Document Type<input readOnly value={kind === 'D02' ? '01 / D02 · BL Compliance — Exception Approval' : '01 / D01 · BL Document'} /></label>
        <label className="dms__wide">File <input type="file" disabled={busy || retained} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError('') }} />
          <span className="dms__sub">{file ? `${file.name} · ${formatSize(file.size)}` : 'Maximum file size: 20 MB'}</span>
        </label>
        <label className="dms__wide">Comment (optional)<input value={comment} maxLength={255} disabled={busy || retained} onChange={(event) => setComment(event.target.value)} /></label>
        <button type="submit" hidden disabled={busy || retained} />
      </form>
    </div>
  </Dialog>, document.body)
}
