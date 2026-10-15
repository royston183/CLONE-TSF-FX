import { GROUPS } from './data.ts'
import { Download } from 'lucide-react'
import { Fragment } from 'react'
import { fmtDate, fmtNum, fmtRateText } from './format.ts'
import { tradersOf, validateUploadRows } from './logic.ts'
import { ModalHeader, Overlay, type ModalStack } from './modal.tsx'
import type { BlotterRow, UploadLevel, UploadRow } from './types.ts'
import { UPLOAD_COLUMNS, UPLOAD_LEVEL_LABELS } from './upload-schema.ts'
import type { PreparedUpload, UploadCapabilities, UploadOutcome } from './upload-workflow.ts'

/** What the validation box shows instead of the row summary. */
export type UploadNotice = 'intro' | null

export type UploadState = {
  date: string
  group: string
  trader: string
  level: UploadLevel
  rows: UploadRow[]
  notice: UploadNotice
  /** False until rows were loaded once: the preview is then a bare placeholder without headers. */
  previewed: boolean
  /** Bumped on open so the file box forgets its last file. */
  fileKey: number
  reading: boolean
  fileError: string
  processing: boolean
  processed: boolean
  results: UploadOutcome[]
}

const LEVELS: Array<[UploadLevel, string]> = [
  ['CREATE', UPLOAD_LEVEL_LABELS.CREATE],
  ['CONTRACT', UPLOAD_LEVEL_LABELS.CONTRACT],
  ['SETTLEMENT', UPLOAD_LEVEL_LABELS.SETTLEMENT],
]

/** FX Blotter Upload (P009), with the original 30-column spreadsheet layout. */
export function UploadModal({
  modals,
  s,
  onChange,
  onGroup,
  onFile,
  onDownloadTemplate,
  onProcess,
  onViewRow,
  caps,
  serviceError,
  onRetryConnection,
  prepared,
  planError,
  unsupportedFields,
}: {
  modals: ModalStack
  s: UploadState
  onChange: (patch: Partial<UploadState>) => void
  onGroup: (group: string) => void
  onFile: (file: File | undefined) => void
  onDownloadTemplate: () => void
  onProcess: () => void
  onViewRow: (row: BlotterRow) => void
  caps: UploadCapabilities | null
  serviceError: string
  onRetryConnection: () => void
  prepared: PreparedUpload[]
  planError: string
  unsupportedFields: string[]
}) {
  const close = () => { if (!s.processing) modals.close('upload') }
  const busyModals = s.processing ? { ...modals, close: () => {} } : modals
  const v = validateUploadRows(s.rows)
  const errors = v.errors.length ? v.errors : planError ? [planError] : []
  const issues = [...errors, ...v.warnings]

  return (
    <Overlay id="upload" modals={busyModals}>
      <div className="modal-card" style={{ maxWidth: 'min(1200px, 96vw, calc(100vw - 40px))' }}>
        <ModalHeader
          title="FX Blotter Upload"
          subtitle="Upload FX transactions from a spreadsheet"
          onClose={close}
        />
        <div className="modal-body">
          <div className="section-label">Upload Context</div>
          <div className="aux-form-grid" style={{ gridTemplateColumns: 'repeat(3,minmax(160px,1fr))' }}>
            <div className="form-field">
              <label>Blotter Date</label>
              <input
                disabled={s.processing || s.processed}
                id="upload-date"
                type="text"
                placeholder="dd-mm-yyyy"
                value={s.date}
                onChange={(e) => onChange({ date: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Group</label>
              <select disabled={s.processing || s.processed} id="upload-group" value={s.group} onChange={(e) => onGroup(e.target.value)}>
                {GROUPS.map((g) => (
                  <option key={g.code} value={g.code}>
                    {g.code} {g.desc}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Trader / Trade Code</label>
              <select disabled={s.processing || s.processed} id="upload-trader" value={s.trader} onChange={(e) => onChange({ trader: e.target.value })}>
                {tradersOf(s.group).map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="section-label">Processing Level</div>
          <div className="upload-process">
            {LEVELS.map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  disabled={s.processing || s.processed || (value === 'SETTLEMENT' && (!caps || !caps.settle))}
                  name="upload-level"
                  value={value}
                  checked={s.level === value}
                  onChange={() => onChange({ level: value })}
                />{' '}
                {label}
              </label>
            ))}
            <span className="hint">
              Create Deal books a contract; Contract also releases it to MO; Settlement also settles it in SAP.
            </span>
          </div>
          <div className="section-label">Upload File</div>
          <div className="upload-file-row">
            <input
              key={s.fileKey}
              id="upload-file"
              type="file"
              accept=".xls,.xlsx,.csv,.tsv,.txt"
              disabled={s.reading || s.processing}
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <button type="button" className="tb-btn" onClick={onDownloadTemplate}>
              <Download size={14} aria-hidden="true" /> Download Template
            </button>
          </div>
          <div className="upload-hint">
            XLS, XLSX, CSV or TSV. Use the first sheet with column headers in row 1. Dates: DD-MM-YYYY.
          </div>
          <div id="upload-validation">
            {s.reading ? (
              <div className="validation-box" role="status">Reading upload file…</div>
            ) : s.fileError ? (
              <div className="validation-box bad" role="alert">{s.fileError}</div>
            ) : s.notice === 'intro' ? (
              <div className="validation-box warn">
                Download the template, enter your transactions, then select the completed file to review it.
              </div>
            ) : s.rows.length ? (
              <div className={`validation-box ${errors.length ? 'bad' : v.warnings.length ? 'warn' : 'ok'}`}>
                <strong>{s.rows.length} row(s) loaded.</strong>{' '}
                {errors.length
                  ? `${errors.length} blocking validation issue(s).`
                  : v.warnings.length
                    ? `${v.warnings.length} warning(s).`
                    : 'File validation passed.'}
                {issues.length ? (
                  <ul>
                    {issues.slice(0, 8).map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <div className="validation-box warn">No upload rows loaded.</div>
            )}
          </div>
          <div className="section-label">Preview</div>
          <div className="aux-table-wrap" style={{ maxHeight: 260 }}>
            <table className="aux-table" id="upload-preview-table">
              {s.previewed ? (
                <thead>
                  <tr>
                    {UPLOAD_COLUMNS.map((c) => (
                      <Fragment key={c.header}>
                        <th title={c.label}>{c.header}</th>
                        {c.field === 'curr2' ? <th>Calculated Amount 2</th> : null}
                      </Fragment>
                    ))}
                  </tr>
                </thead>
              ) : null}
              <tbody>
                {s.rows.length ? (
                  s.rows.slice(0, 20).map((r, i) => (
                    <tr key={i}>
                      {UPLOAD_COLUMNS.map((c) => (
                        <Fragment key={c.header}>
                          <td>{c.field === 'totalRate' || c.field === 'spot' || c.field === 'swap'
                            ? fmtRateText(r[c.field]) : r[c.field]}</td>
                          {c.field === 'curr2' ? <td className="num">{prepared[i] ? `${fmtNum(prepared[i]!.row.amt2, 4)} ${prepared[i]!.row.curr2}` : '—'}</td> : null}
                        </Fragment>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={s.previewed ? UPLOAD_COLUMNS.length + 1 : undefined} className="upload-preview-empty">
                      No upload rows loaded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {s.rows.length > 20 ? <div className="upload-hint">Showing the first 20 of {s.rows.length} rows. All rows are validated.</div> : null}
          {!caps ? <div className={`validation-box ${serviceError ? 'bad' : 'warn'}`} role="status">
            {serviceError || 'Checking the SAP upload connection…'}
            {serviceError ? <button type="button" className="tb-btn" onClick={onRetryConnection}>Retry Connection</button> : null}
          </div> : null}
          {caps && !caps.settle ? <div className="validation-box warn">Settlement is unavailable on the connected service. Create Deal and Contract are available.</div> : null}
          {unsupportedFields.length ? <div className="validation-box warn">These fields cannot be saved by the connected services and will remain in the preview: {unsupportedFields.join(', ')}.</div> : null}
          {s.results.length ? <>
            <div className="section-label">Processing Results</div>
            <div className="aux-table-wrap" style={{ maxHeight: 260 }}>
              <table className="aux-table">
                <thead><tr>{['Row', 'Result', 'Stage', 'Company', 'Partner', 'Amount 1', 'Amount 2', 'Value Date', 'Transaction', 'Message'].map((label) => <th key={label}>{label}</th>)}</tr></thead>
                <tbody>{s.results.map((result) => <tr key={result.sr}>
                  <td>{result.sr}</td><td className={result.state === 'success' ? 'result-ok' : result.state === 'skipped' ? undefined : 'result-err'}>{result.state === 'partial' ? 'Partly completed' : result.state === 'skipped' ? 'Not processed' : result.state === 'success' ? 'Success' : 'Error'}</td>
                  <td>{result.stage}</td><td>{result.row.companyCode}</td><td>{result.row.bp}</td>
                  <td>{fmtNum(result.row.amt1)} {result.row.curr1}</td><td>{fmtNum(result.row.amt2)} {result.row.curr2}</td><td>{fmtDate(result.row.valueDate)}</td>
                  <td>{result.row.transactionNumber ? <button type="button" className="rfha-link" disabled={s.processing} onClick={() => onViewRow(result.row)}>{result.row.transactionNumber}</button> : '—'}</td>
                  <td style={{ whiteSpace: 'normal', minWidth: 260 }}>{result.message}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </> : null}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-cancel" disabled={s.processing} onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-confirm"
            id="upload-process-btn"
            disabled={s.reading || s.processing || s.processed || !caps || !prepared.length || !!planError || (s.level === 'SETTLEMENT' && !caps.settle)}
            onClick={onProcess}
          >
            {s.processing ? `Processing ${s.results.length} / ${s.rows.length}…` : s.processed ? 'Upload Processed' : 'Process Upload'}
          </button>
        </div>
      </div>
    </Overlay>
  )
}
