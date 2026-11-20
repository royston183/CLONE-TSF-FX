import { useCallback, useEffect, useRef, useState } from 'react'
import { buildMcPdf } from '../../shared/pdf/mcPdf.ts'
import { fmtDate, fmtNum } from './format.ts'
import { McDialog } from './McDialog.tsx'
import { pdfInput } from './pdfInput.ts'
import type { MasterContract } from './types.ts'

/** What was just confirmed: the contracts (already marked Confirmed), who did it and when. */
export type ConfirmedBatch = { mcs: MasterContract[]; by: string; on: Date }

const pad = (n: number) => String(n).padStart(2, '0')
const stamp = (d: Date) => `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
const fileName = (mcs: MasterContract[]) => (mcs.length === 1 && mcs[0] ? `Master-Contract-${mcs[0].mcNumber}.pdf` : `Master-Contracts-${mcs.length}.pdf`)

/**
 * Shown after contracts are confirmed, like the invoice screens do after an invoice number is issued: the contracts, and
 * "Preview PDF" / "Download PDF" for the confirmation document (company logo, every detail of each Master Contract).
 */
export function ConfirmedDialog({ batch, open, onClose }: { batch: ConfirmedBatch | null; open: boolean; onClose: () => void }) {
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const blob = useRef<{ batch: ConfirmedBatch; file: Blob } | null>(null)

  const clearPreview = useCallback(() => {
    setPreview((url) => {
      if (url) URL.revokeObjectURL(url)
      return null
    })
  }, [])
  useEffect(() => { if (!open) { clearPreview(); setError('') } }, [open, clearPreview])
  useEffect(() => clearPreview, [clearPreview])

  const pdf = async (): Promise<Blob | null> => {
    if (!batch) return null
    if (blob.current?.batch === batch) return blob.current.file
    const file = await buildMcPdf(batch.mcs.map(pdfInput), { confirmedBy: batch.by, confirmedOn: stamp(batch.on) })
    blob.current = { batch, file }
    return file
  }
  const run = async (what: 'preview' | 'download') => {
    setBusy(true)
    setError('')
    try {
      const file = await pdf()
      if (!file || !batch) return
      if (what === 'preview') {
        clearPreview()
        setPreview(URL.createObjectURL(file))
      } else {
        const url = URL.createObjectURL(file)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName(batch.mcs)
        document.body.appendChild(a)
        a.click()
        a.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 2000)
      }
    } catch (e) {
      setError(`The PDF could not be created: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const mcs = batch?.mcs ?? []
  const title = preview ? 'Master Contract PDF Preview' : `Master Contract${mcs.length === 1 ? '' : 's'} Confirmed`
  return (
    <McDialog
      open={open}
      title={title}
      onClose={onClose}
      busy={busy}
      ids={{ overlay: 'confirmed-overlay', title: 'confirmed-title', body: 'confirmed-body', close: 'confirmed-close-btn' }}
      actions={
        <>
          {preview ? <button className="btn btn-secondary" type="button" onClick={clearPreview}>← Back</button> : null}
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void run('download')}>Download PDF</button>
          {!preview ? <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void run('preview')}>{busy ? 'Preparing…' : 'Preview PDF'}</button> : null}
          <button className="btn btn-primary" type="button" onClick={onClose}>Close</button>
        </>
      }
    >
      {preview ? (
        <iframe title="Master Contract PDF preview" src={preview} style={{ width: 'min(860px, 80vw)', height: '68vh', border: '1px solid var(--border)', borderRadius: 8, background: '#fff' }} />
      ) : (
        <>
          <p style={{ margin: '0 0 12px', color: 'var(--text-muted)', fontWeight: 600 }}>
            {mcs.length === 1 ? 'The Master Contract was' : `All ${mcs.length} Master Contracts were`} confirmed by <b>{batch?.by}</b> on {batch ? stamp(batch.on) : ''}. The confirmation PDF carries every detail.
          </p>
          <div className="popup-table-wrap">
            <table className="popup-table">
              <thead>
                <tr><th>MC Number</th><th>Reference</th><th>Origin</th><th>FX Model</th><th className="num">MC Amount (USD)</th><th>Status</th></tr>
              </thead>
              <tbody>
                {mcs.map((mc) => (
                  <tr key={mc.mcNumber}>
                    <td><b>{mc.mcNumber}</b></td><td>{mc.mcDescription}</td><td>{mc.originEntity}</td><td>{mc.fxModel}</td>
                    <td className="num">{fmtNum(mc.amtUSD)}</td><td>{mc.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {error ? <p role="alert" style={{ margin: '10px 0 0', color: 'var(--error)', fontWeight: 600 }}>{error}</p> : null}
        </>
      )}
    </McDialog>
  )
}
