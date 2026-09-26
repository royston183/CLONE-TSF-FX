import { GROUPS } from './data.ts'
import { fmtDate, fmtNum } from './format.ts'
import { tradersOf, validateUploadRows } from './logic.ts'
import { ModalHeader, Overlay, type ModalStack } from './modal.tsx'
import type { UploadLevel, UploadResult, UploadRow } from './types.ts'

/** What the validation box shows instead of the row summary. */
export type UploadNotice = 'intro' | 'xls' | null

export type UploadState = {
  date: string
  group: string
  trader: string
  level: UploadLevel
  rows: UploadRow[]
  notice: UploadNotice
  /** False until rows were loaded once: the preview is then a bare placeholder without headers. */
  previewed: boolean
  results: UploadResult[] | null
  /** Set once processed; loading rows again clears it. */
  processed: boolean
  /** Bumped on open so the file box forgets its last file. */
  fileKey: number
}

const PREVIEW_COLS = [
  'Company',
  'Trade Date',
  'BP',
  'Profit Ctr',
  'Unit(BA)',
  'Txn Type',
  'Curr 1',
  'Amt 1',
  'Curr 2',
  'Buy/Sell',
  'Value Date',
  'All in Rate',
  'Swap',
  'Spot',
  'NDF Date',
  'NDF Ref',
  'Mode of Trade',
  'MC Ref',
  'Deal ID',
]
const RESULT_COLS = [
  'Sr. No.',
  'Signal',
  'Partner',
  'Curr 1',
  'Curr 2',
  'Amt 1',
  'Amt 2',
  'Value Date',
  'Trade Date',
  'Transaction No',
  'Message',
]
const LEVELS: Array<[UploadLevel, string]> = [
  ['ORDER', 'Order'],
  ['CONTRACT', 'Contract'],
  ['SETTLEMENT', 'Settlement'],
]

/** FX Blotter Upload (the P009 uploader), reading CSV / TSV / text instead of XLS. */
export function UploadModal({
  modals,
  s,
  onChange,
  onGroup,
  onFile,
  onSample,
  onProcess,
  onViewRfha,
}: {
  modals: ModalStack
  s: UploadState
  onChange: (patch: Partial<UploadState>) => void
  onGroup: (group: string) => void
  onFile: (file: File | undefined) => void
  onSample: () => void
  onProcess: () => void
  onViewRfha: (rfha: string) => void
}) {
  const close = () => modals.close('upload')
  const v = validateUploadRows(s.rows)
  const issues = [...v.errors, ...v.warnings]

  return (
    <Overlay id="upload" modals={modals}>
      <div className="modal-card" style={{ maxWidth: 1120 }}>
        <ModalHeader
          title="FX Blotter Upload"
          subtitle="Order / Contract / Settlement upload flow from the supplied SAP program"
          onClose={close}
        />
        <div className="modal-body">
          <div className="section-label">Upload Context</div>
          <div className="aux-form-grid" style={{ gridTemplateColumns: 'repeat(3,minmax(160px,1fr))' }}>
            <div className="form-field">
              <label>Blotter Date</label>
              <input
                id="upload-date"
                type="text"
                placeholder="dd-mm-yyyy"
                value={s.date}
                onChange={(e) => onChange({ date: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Group</label>
              <select id="upload-group" value={s.group} onChange={(e) => onGroup(e.target.value)}>
                {GROUPS.map((g) => (
                  <option key={g.code} value={g.code}>
                    {g.code} {g.desc}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Trader / Trade Code</label>
              <select id="upload-trader" value={s.trader} onChange={(e) => onChange({ trader: e.target.value })}>
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
                  name="upload-level"
                  value={value}
                  checked={s.level === value}
                  onChange={() => onChange({ level: value })}
                />{' '}
                {label}
              </label>
            ))}
            <span className="hint">
              Order = create transaction; Contract = Order + release to MO; Settlement = Order + Contract + settlement
              simulation.
            </span>
          </div>
          <div className="section-label">Upload File</div>
          <div className="upload-file-row">
            <div>
              <input
                key={s.fileKey}
                id="upload-file"
                type="file"
                accept=".csv,.tsv,.txt"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
              <div className="upload-hint">
                SAP reads XLS using TEXT_CONVERT_XLS_TO_SAP. To keep this standalone HTML dependency-free, this browser
                version accepts CSV/TSV/text with the same logical fields.
              </div>
            </div>
            <button type="button" className="tb-btn" onClick={onSample}>
              Load Sample Rows
            </button>
          </div>
          <div id="upload-validation">
            {s.notice === 'intro' ? (
              <div className="validation-box warn">
                Select a CSV/TSV/text file or load the sample rows. The SAP uploader reads XLS; this dependency-free
                standalone version uses text-delimited files.
              </div>
            ) : s.notice === 'xls' ? (
              <div className="validation-box bad">
                Binary XLS/XLSX parsing would require an embedded spreadsheet library. Save the same upload as CSV/TSV
                for this standalone file.
              </div>
            ) : s.rows.length ? (
              <div className={`validation-box ${v.errors.length ? 'bad' : v.warnings.length ? 'warn' : 'ok'}`}>
                <strong>{s.rows.length} row(s) loaded.</strong>{' '}
                {v.errors.length
                  ? `${v.errors.length} blocking validation issue(s).`
                  : v.warnings.length
                    ? `${v.warnings.length} warning(s).`
                    : 'Ready to process.'}
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
                    {PREVIEW_COLS.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
              ) : null}
              <tbody>
                {s.rows.length ? (
                  s.rows.slice(0, 20).map((r, i) => (
                    <tr key={i}>
                      <td>{r.companyCode}</td>
                      <td>{r.tradeDate}</td>
                      <td>{r.bp}</td>
                      <td>{r.profitCenter}</td>
                      <td>{r.businessArea}</td>
                      <td>{r.txnType}</td>
                      <td>{r.curr1}</td>
                      <td className="num">{r.amt1}</td>
                      <td>{r.curr2}</td>
                      <td>{r.buySell}</td>
                      <td>{r.valueDate}</td>
                      <td>{r.totalRate}</td>
                      <td>{r.swap}</td>
                      <td>{r.spot}</td>
                      <td>{r.ndfDate}</td>
                      <td>{r.ndfRef}</td>
                      <td>{r.assignment}</td>
                      <td>{r.mcRef}</td>
                      <td>{r.dealId}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={s.previewed ? 19 : undefined} className="upload-preview-empty">
                      No upload rows loaded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div id="upload-results-section" style={{ display: s.results ? 'block' : 'none' }}>
            <div className="section-label">Processing Results</div>
            <div className="aux-table-wrap" style={{ maxHeight: 260 }}>
              <table className="aux-table" id="upload-results-table">
                {s.results ? (
                  <>
                    <thead>
                      <tr>
                        {RESULT_COLS.map((c) => (
                          <th key={c}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {s.results.map((r) => (
                        <tr key={r.sr}>
                          <td>{r.sr}</td>
                          <td className={r.ok ? 'result-ok' : 'result-err'}>{r.ok ? 'Success' : 'Error'}</td>
                          <td>{r.bp}</td>
                          <td>{r.curr1}</td>
                          <td>{r.curr2}</td>
                          <td className="num">{fmtNum(r.amt1)}</td>
                          <td className="num">{fmtNum(r.amt2)}</td>
                          <td>{fmtDate(r.valueDate)}</td>
                          <td>{fmtDate(r.tradeDate)}</td>
                          <td>
                            <button type="button" className="rfha-link" onClick={() => onViewRfha(r.rfha)}>
                              {r.rfha}
                            </button>
                          </td>
                          <td>{r.msg}</td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                ) : null}
              </table>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-cancel" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-confirm"
            id="upload-process-btn"
            disabled={!s.rows.length || v.errors.length > 0 || s.processed}
            onClick={onProcess}
          >
            Process Upload
          </button>
        </div>
      </div>
    </Overlay>
  )
}
