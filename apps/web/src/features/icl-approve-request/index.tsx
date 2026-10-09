import { useMemo, useState } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { COLUMNS, COLUMN_COUNT } from './columns.ts'
import { ICL_PAGE_SIZE, ICL_REQ_STATUSES, makeIclRequests } from './data.ts'
import { DateField } from './DateField.tsx'
import { parseDateMs } from './dates.ts'
import { lookupText, statusColorForRow } from './format.ts'
import { matchesFilters, sortRows, uniqueEntityIds } from './grid.ts'
import type { DmsDoc, Filters, IclRequest, SortDirection, SortKey, Toast, ToastKind } from './types.ts'
import './icl-approve-request.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './icl-approve-request.dark.css'

const EMPTY_FILTERS: Filters = {
  requestNo: '',
  entityId: '',
  ottkNo: '',
  iclReqStatus: '',
  plannedEndDate: '',
}

let toastSeq = 0

export default function IclApproveRequestApp() {
  const [requests, setRequests] = useState<IclRequest[]>(() => makeIclRequests())
  const [uptoRequestDate, setUptoRequestDate] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [sortColumn, setSortColumn] = useState<SortKey | ''>('')
  const [sortDir, setSortDir] = useState<SortDirection>('asc')
  const [currentPage, setCurrentPage] = useState(0)
  const [selectedRequestNo, setSelectedRequestNo] = useState('')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [dmsOpenForReqNo, setDmsOpenForReqNo] = useState<string | null>(null)
  const [dmsStatusDraft, setDmsStatusDraft] = useState('')
  const [dmsRowsDraft, setDmsRowsDraft] = useState<DmsDoc[]>([])
  // Selected file per doc type, staged until "Upload" confirms it — mirrors the original's
  // click-to-pick-then-click-to-confirm flow.
  const [pendingFiles, setPendingFiles] = useState<Record<string, File>>({})
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, File>>({})

  function pushToast(message: string, kind: ToastKind) {
    toastSeq += 1
    const id = toastSeq
    setToasts((current) => [...current, { id, message, kind }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, kind === 'success' ? 5000 : 4000)
  }

  const entityIds = useMemo(() => uniqueEntityIds(requests), [requests])
  const uptoMs = uptoRequestDate ? parseDateMs(uptoRequestDate) : null

  const filtered = useMemo(() => {
    if (uptoMs === null) return []
    return requests.filter((row) => {
      const reqMs = parseDateMs(row.requestDate)
      return reqMs !== null && reqMs <= uptoMs && matchesFilters(row, filters)
    })
  }, [requests, uptoMs, filters])

  const sorted = useMemo(
    () => (sortColumn ? sortRows(filtered, sortColumn, sortDir, ICL_REQ_STATUSES) : filtered),
    [filtered, sortColumn, sortDir],
  )

  const totalPages = Math.max(1, Math.ceil(sorted.length / ICL_PAGE_SIZE))
  const pageIndex = Math.min(Math.max(currentPage, 0), totalPages - 1)
  const pageRows = sorted.slice(pageIndex * ICL_PAGE_SIZE, pageIndex * ICL_PAGE_SIZE + ICL_PAGE_SIZE)
  const showTable = uptoMs !== null

  function handleHeaderSort(col: SortKey) {
    if (sortColumn === col) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(col)
      setSortDir('asc')
    }
    setCurrentPage(0)
  }

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }))
    setCurrentPage(0)
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS)
    setCurrentPage(0)
  }

  function requireSelectedRow(): IclRequest | null {
    if (!selectedRequestNo) {
      pushToast('Select an ICL Request row.', 'error')
      return null
    }
    const row = requests.find((r) => r.iclRequestNo === selectedRequestNo)
    if (!row) {
      pushToast('Selected ICL Request was not found.', 'error')
      return null
    }
    return row
  }

  function handleApproveClick() {
    const row = requireSelectedRow()
    if (!row) return
    setDmsOpenForReqNo(row.iclRequestNo)
    setDmsStatusDraft(row.iclReqStatus)
    setDmsRowsDraft(row.dmsData.map((doc) => ({ ...doc })))
  }

  function handleRejectClick() {
    const row = requireSelectedRow()
    if (!row) return
    setRequests((current) =>
      current.map((r) =>
        r.iclRequestNo === row.iclRequestNo
          ? { ...r, iclReqStatus: '11', rejected: true, approved: false }
          : r,
      ),
    )
    pushToast(`ICL Request ${row.iclRequestNo} rejected.`, 'warning')
  }

  function closeDmsModal() {
    setDmsOpenForReqNo(null)
    setPendingFiles({})
  }

  const dmsRow = dmsOpenForReqNo ? requests.find((r) => r.iclRequestNo === dmsOpenForReqNo) ?? null : null

  function updateDmsDraftRow(docType: string, patch: Partial<DmsDoc>) {
    setDmsRowsDraft((current) => current.map((doc) => (doc.docType === docType ? { ...doc, ...patch } : doc)))
  }

  function handlePickFile(docType: string) {
    if (dmsRow?.approved) {
      pushToast('This ICL Request is already approved. Upload is disabled.', 'error')
      return
    }
    const input = document.createElement('input')
    input.type = 'file'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      setPendingFiles((current) => ({ ...current, [docType]: file }))
      updateDmsDraftRow(docType, { filePath: file.name })
      pushToast(`File selected for ${docType}. Click Upload to confirm.`, 'success')
    }
    input.click()
  }

  function generateDmsCode(docType: string): string {
    return `DMS${docType}${Math.floor(1000 + Math.random() * 9000)}`
  }

  function handleUploadDoc(docType: string) {
    if (!dmsRow) return
    if (dmsRow.approved) {
      pushToast('This ICL Request is already approved. Upload is disabled.', 'error')
      return
    }
    const file = pendingFiles[docType]
    if (!file) {
      pushToast('Click the File Path field to select a file before uploading.', 'error')
      return
    }
    const newCode = generateDmsCode(docType)
    updateDmsDraftRow(docType, { filePath: file.name, dmsCode: newCode })
    setUploadedFiles((current) => ({ ...current, [`${dmsRow.iclRequestNo}_${docType}`]: file }))
    setPendingFiles((current) => {
      const next = { ...current }
      delete next[docType]
      return next
    })
    pushToast(`File uploaded for ${docType}.`, 'success')
  }

  function handleDownloadDoc(docType: string) {
    if (!dmsRow) return
    const doc = dmsRowsDraft.find((d) => d.docType === docType)
    if (!doc || !doc.dmsCode) {
      pushToast(`No file available to download for ${doc ? doc.docTypeDesc : docType}.`, 'error')
      return
    }
    const file = uploadedFiles[`${dmsRow.iclRequestNo}_${docType}`]
    if (!file) {
      pushToast('Uploaded file is unavailable for download.', 'error')
      return
    }
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = file.name
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    pushToast(`Downloading ${file.name}.`, 'success')
  }

  function handleDmsApprove() {
    if (!dmsRow) {
      closeDmsModal()
      return
    }
    if (dmsRow.approved) {
      pushToast('This ICL Request has already been approved.', 'error')
      return
    }
    if (!dmsStatusDraft) {
      pushToast('Select an ICL Request Status before approving.', 'error')
      return
    }
    const reqNo = dmsRow.iclRequestNo
    const rowsToSave = dmsRowsDraft
    setRequests((current) =>
      current.map((r) =>
        r.iclRequestNo === reqNo
          ? { ...r, iclReqStatus: dmsStatusDraft, approved: true, rejected: false, dmsData: rowsToSave }
          : r,
      ),
    )
    closeDmsModal()
    pushToast(`ICL Request ${reqNo} approved successfully.`, 'success')
  }

  function handleRefresh() {
    setRequests(makeIclRequests())
    setSelectedRequestNo('')
    setCurrentPage(0)
  }

  function pageButtons(): (number | 'prev' | 'next')[] {
    const listPage = pageIndex + 1
    const start = Math.max(1, Math.min(listPage - 1, totalPages - 2))
    const end = Math.min(totalPages, start + 2)
    const clampedStart = Math.max(1, end - 2)
    const pages: (number | 'prev' | 'next')[] = ['prev']
    for (let p = clampedStart; p <= end; p += 1) pages.push(p)
    pages.push('next')
    return pages
  }

  return (
    <div className="iclapprove">
      <div className="app-shell">
        <header className="app-header">
          <div className="app-title">View &amp; Approve ICL Request</div>
          <div>
            <BackButton className="hdr-btn" />
            <button type="button" className="hdr-btn" onClick={handleRefresh}>
              {'↻'} Refresh
            </button>
            <SignOutButton className="hdr-btn" />
          </div>
        </header>

        <main className="screen">
          <div className="toolbar">
            <div className="toolbar-field">
              <label htmlFor="uptoRequestDate">Upto Request Date<span className="req">*</span></label>
              <DateField
                id="uptoRequestDate"
                value={uptoRequestDate}
                onChange={(value) => {
                  setUptoRequestDate(value)
                  setCurrentPage(0)
                }}
              />
            </div>
            <button
              type="button"
              className="hdr-btn icon-btn"
              title="Filters"
              onClick={() => setFiltersOpen((current) => !current)}
            >
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.3}>
                <path d="M2 3h12l-4.5 5.2v3.6l-3 1.4V8.2z" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
            </button>
            <span className={filtersOpen ? '' : 'hidden'}>
              <div className="toolbar-field">
                <input
                  type="text"
                  className="filter-text"
                  placeholder="Request No."
                  value={filters.requestNo}
                  onChange={(event) => updateFilter('requestNo', event.target.value)}
                />
              </div>
              <div className="toolbar-field">
                <select
                  className={filters.entityId === '' ? 'placeholder-active' : ''}
                  value={filters.entityId}
                  onChange={(event) => updateFilter('entityId', event.target.value)}
                >
                  <option value="">Entity ID</option>
                  {entityIds.map((id) => (
                    <option key={id} value={id}>{id}</option>
                  ))}
                </select>
              </div>
              <div className="toolbar-field">
                <input
                  type="text"
                  className="filter-text"
                  placeholder="OTTK No."
                  value={filters.ottkNo}
                  onChange={(event) => updateFilter('ottkNo', event.target.value)}
                />
              </div>
              <div className="toolbar-field">
                <select
                  className={filters.iclReqStatus === '' ? 'placeholder-active' : ''}
                  value={filters.iclReqStatus}
                  onChange={(event) => updateFilter('iclReqStatus', event.target.value)}
                >
                  <option value="">ICL Request Status</option>
                  {ICL_REQ_STATUSES.map((item) => (
                    <option key={item.key} value={item.key}>{item.key} - {item.text}</option>
                  ))}
                </select>
              </div>
              <div className="toolbar-field">
                <DateField
                  placeholder="Planned End Date"
                  value={filters.plannedEndDate}
                  onChange={(value) => updateFilter('plannedEndDate', value)}
                />
              </div>
              <button type="button" className="hdr-btn" onClick={clearFilters}>Clear filters</button>
            </span>
          </div>

          <div className={`action-bar${showTable ? '' : ' hidden'}`}>
            <button type="button" className="hdr-btn primary" onClick={handleApproveClick}>
              {'✓'} Approve ICL Request
            </button>
            <button type="button" className="hdr-btn danger" onClick={handleRejectClick}>
              {'✕'} Reject ICL Request
            </button>
          </div>

          <div className={`table-card${showTable ? '' : ' hidden'}`}>
            <div className="table-card-head">ICL Requests</div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="th-select">Select</th>
                    {COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        className={`${col.num ? 'num ' : ''}${sortColumn === col.key ? (sortDir === 'asc' ? 'sort-asc' : 'sort-desc') : ''}`.trim()}
                        onClick={() => handleHeaderSort(col.key)}
                      >
                        {col.label}
                        <span className="sort-arrows">
                          <span className="sort-up" />
                          <span className="sort-down" />
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.length === 0 && showTable ? (
                    <tr>
                      <td colSpan={COLUMN_COUNT}>
                        No ICL requests found for the selected Upto Request Date/filters.
                      </td>
                    </tr>
                  ) : null}
                  {pageRows.map((row) => {
                    const isSelected = row.iclRequestNo === selectedRequestNo
                    const statusDesc = lookupText(ICL_REQ_STATUSES, row.iclReqStatus)
                    return (
                      <tr
                        key={row.iclRequestNo}
                        className={isSelected ? 'selected-row' : ''}
                        onClick={() => setSelectedRequestNo(row.iclRequestNo)}
                      >
                        <td className="td-select">
                          <input
                            type="radio"
                            name="iclSelectRadio"
                            className="icl-select-radio"
                            checked={isSelected}
                            onChange={() => setSelectedRequestNo(row.iclRequestNo)}
                          />
                        </td>
                        {COLUMNS.map((col) => (
                          <td key={col.key} className={col.num ? 'num' : ''}>
                            {col.key === 'status' ? (
                              <span className={`status-dot ${statusColorForRow(row)}`} />
                            ) : (
                              col.text?.(row, statusDesc) ?? ''
                            )}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="pagination-bar">
              {pageButtons().map((entry) => {
                if (entry === 'prev') {
                  return (
                    <button
                      key="prev"
                      type="button"
                      className="page-btn"
                      disabled={pageIndex + 1 === 1}
                      onClick={() => setCurrentPage((current) => current - 1)}
                    >
                      Previous
                    </button>
                  )
                }
                if (entry === 'next') {
                  return (
                    <button
                      key="next"
                      type="button"
                      className="page-btn"
                      disabled={pageIndex + 1 === totalPages}
                      onClick={() => setCurrentPage((current) => current + 1)}
                    >
                      Next
                    </button>
                  )
                }
                return (
                  <button
                    key={entry}
                    type="button"
                    className={`page-btn${entry === pageIndex + 1 ? ' active' : ''}`}
                    onClick={() => setCurrentPage(entry - 1)}
                  >
                    {entry}
                  </button>
                )
              })}
            </div>
          </div>
        </main>
      </div>

      <div
        className={`modal-overlay${dmsRow ? '' : ' hidden'}`}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDmsModal()
        }}
      >
        <div className="modal-dialog wide" role="dialog" aria-modal="true">
          <div className="modal-head">
            <div className="modal-title">DMS for ICL Request</div>
            <button type="button" className="modal-close-btn" onClick={closeDmsModal}>{'✕'}</button>
          </div>
          <div className="modal-body">
            <div className="section-box">
              <div className="section-head">ICL Request Details</div>
              <div className="section-body stacked-field-row">
                <div className="stacked-field">
                  <label htmlFor="dmsReqNo">ICL Request No.</label>
                  <input type="text" id="dmsReqNo" value={dmsRow?.iclRequestNo ?? ''} readOnly />
                </div>
                <div className="stacked-field">
                  <label htmlFor="dmsReqStatus">ICL Request Status<span className="req">*</span></label>
                  <select
                    id="dmsReqStatus"
                    value={dmsStatusDraft}
                    onChange={(event) => setDmsStatusDraft(event.target.value)}
                  >
                    <option value="">Select...</option>
                    {ICL_REQ_STATUSES.map((item) => (
                      <option key={item.key} value={item.key}>{item.key} - {item.text}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="section-box">
              <div className="section-head">DMS Data</div>
              <div className="section-body" style={{ padding: 0 }}>
                <div className="table-scroll">
                  <table className="dms-table">
                    <thead>
                      <tr>
                        <th>Doc Type</th><th>Doc Type Desc</th><th>Doc Date</th><th>File Path</th>
                        <th>DMS Code</th><th>Upload</th><th>Download</th><th>Edit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dmsRowsDraft.map((doc) => {
                        const uploaded = !!doc.dmsCode
                        const locked = !!dmsRow?.approved
                        return (
                          <tr key={doc.docType}>
                            <td>{doc.docType}</td>
                            <td>{doc.docTypeDesc}</td>
                            <td>
                              <DateField
                                className="dms-doc-date"
                                placeholder="DD-MM-YYYY"
                                value={doc.docDate}
                                readOnly={locked}
                                onChange={(value) => updateDmsDraftRow(doc.docType, { docDate: value })}
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                className="dms-file-path"
                                value={doc.filePath}
                                readOnly
                                onClick={() => handlePickFile(doc.docType)}
                              />
                            </td>
                            <td>
                              <input type="text" className="dms-code" value={doc.dmsCode} readOnly />
                            </td>
                            <td>
                              <button
                                type="button"
                                className="dms-btn dms-upload-btn"
                                disabled={locked}
                                onClick={() => handleUploadDoc(doc.docType)}
                              >
                                {'⬆'} Upload
                              </button>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="dms-btn dms-download-btn"
                                disabled={!uploaded}
                                onClick={() => handleDownloadDoc(doc.docType)}
                              >
                                {'⬇'} Download
                              </button>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="dms-btn dms-edit-btn"
                                disabled={!uploaded || locked}
                                onClick={() => handlePickFile(doc.docType)}
                              >
                                {'✎'} Edit
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button
              type="button"
              className="hdr-btn primary"
              disabled={!!dmsRow?.approved}
              onClick={handleDmsApprove}
            >
              {'✓'} Approve
            </button>
            <button type="button" className="btn-secondary" onClick={closeDmsModal}>{'✕'} Cancel</button>
          </div>
        </div>
      </div>

      <div id="toastRegion" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast${toast.kind ? ` ${toast.kind}` : ''}`}>
            <div>
              <div className="toast-title">
                {toast.kind === 'success'
                  ? 'Success'
                  : toast.kind === 'error'
                    ? 'Unable to complete'
                    : toast.kind === 'warning'
                      ? 'Attention'
                      : 'Information'}
              </div>
              <div className="toast-message">{toast.message}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
