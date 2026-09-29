import { DMS_DOCS } from './data.ts'
import type { DealRow, DmsDocState } from './types.ts'

function fileSizeText(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

/** "DMS": one row per fixed document type, a fake file picker (nothing uploads to SAP) and a comment box. */
export function DmsPanel({
  row,
  state,
  feedback,
  onFileChange,
  onClear,
  onCommentChange,
}: {
  row: DealRow
  state: Record<string, DmsDocState>
  feedback: string
  onFileChange: (docCode: string, file: File) => void
  onClear: (docCode: string) => void
  onCommentChange: (docCode: string, value: string) => void
}) {
  return (
    <div>
      {feedback ? <div className="dms-feedback">{feedback}</div> : null}
      <div className="detail-grid">
        <div className="detail-item">
          <div className="detail-label">Deal ID</div>
          <div className="detail-value">{row.dealId}</div>
        </div>
        <div className="detail-item">
          <div className="detail-label">Deal Status</div>
          <div className="detail-value">
            {row.dealStatus} - {row.dealStatusDesc}
          </div>
        </div>
      </div>
      <div style={{ height: 10 }} />
      <div className="analysis-table-wrap">
        <table className="analysis-table">
          <thead>
            <tr>
              <th>Doc Type</th>
              <th>Doc Type Desc</th>
              <th>Doc Date</th>
              <th>File Path</th>
              <th>DMS Code</th>
              <th>Comment</th>
            </tr>
          </thead>
          <tbody>
            {DMS_DOCS.map(([code, desc]) => {
              const item = state[code] ?? { fileName: '', filePath: '', fileSize: 0, dmsCode: '', comment: '' }
              const inputId = `dmsFile_${row.dealId}_${code}`
              return (
                <tr key={code}>
                  <td>{code}</td>
                  <td>{desc}</td>
                  <td>28.09.2026</td>
                  <td>
                    <div className="dms-file-box">
                      <input
                        className="dms-file-input"
                        id={inputId}
                        type="file"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) onFileChange(code, file)
                        }}
                      />
                      <label className="dms-choose-btn" htmlFor={inputId}>
                        {item.fileName ? 'Replace' : 'Choose file'}
                      </label>
                      <span className={item.filePath ? 'dms-file-text' : 'dms-file-text empty'} title={item.filePath || 'No file selected'}>
                        {item.filePath || 'No file selected'}
                      </span>
                      <button className="dms-clear-btn" type="button" disabled={!item.fileName} onClick={() => onClear(code)}>
                        Clear
                      </button>
                    </div>
                    {item.fileName ? (
                      <div className="dms-file-meta">
                        Selected: {item.fileName}
                        {item.fileSize ? ` · ${fileSizeText(item.fileSize)}` : ''}
                      </div>
                    ) : null}
                  </td>
                  <td className="dms-code">{item.dmsCode || '-'}</td>
                  <td>
                    <input className="dms-comment" value={item.comment} placeholder="Add comment" onChange={(e) => onCommentChange(code, e.target.value)} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="sap-popup-note">Demo only: files remain in the browser session and are not uploaded to SAP or DMS.</div>
    </div>
  )
}
