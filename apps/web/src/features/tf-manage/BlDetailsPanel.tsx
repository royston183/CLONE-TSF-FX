import { useEffect, useRef, useState } from 'react'
import { codeText, fmtNum } from '@slc/api-client'
import { useAsync } from '@slc/api-client/react'
import { BL_ASSIGNED_STATUS, loadBlDocuments, loadBlStatusText, loadBls, saveBlChanges } from './api.ts'
import { AssignDealModal } from './AssignDealModal.tsx'
import {
  BL_PAGE_SIZE,
  blAmount,
  blFromTradeFlow,
  blGradeCommodity,
  blPage,
  blRowId,
  blTotals,
  dealAssignmentKey,
  nextBlSplitId,
  planBlSave,
  withPendingDeals,
} from './bl.ts'
import { BlSplitModal } from './BlSplitModal.tsx'
import { ComplianceModal } from './ComplianceModal.tsx'
import { BlDmsUploadModal } from './BlDmsUploadModal.tsx'
import { blUploadSelectionError, type BlDocumentKind } from './bl-dms.ts'
import type { BlInvoiceDetails, BlRow, PendingBlAssignment, TrdFlowKey } from './types.ts'

/** ZSGTSFTR_BL_STAT '01': BL Created — what a brand-new local row starts as. */
const BL_CREATED_STATUS = '01'

/** The BL Details fields a line item keeps editable up until a Deal ID is assigned to it. */
type EditableTextField = 'Zblno' | 'ZblVsslName' | 'Zgrade'
type EditableNumField = 'Zquantity' | 'Zcprice'

/**
 * BL Data 1: the BLs of the selected trade flow split, read from ZSGTSFTR_BL.
 *
 * The grid, its Total row and the five-row pager follow the legacy page. Create BL, BL Split and
 * the editable cells change this component's row state first, and Update writes them to
 * ZSGTSFTR_BL (see planBlSave / saveBlChanges): a created BL gets its BL ID from the SNRO range on
 * insert — it shows as New until then — and a split row is inserted under its source's BL ID. Document upload
 * links the file to the selected saved BLs. Insert/Delete Row remain unavailable. BLs are
 * otherwise created today by the Excel upload. Assign Deal ID & Release for Invoicing picks a
 * live Deal ID (see dealMaster.ts); Update writes it to the BL (see assignBlDeal) — the moment a
 * line item's Deal ID is committed, BL Number/Vessel Name/Grade-Commodity/Quantity/CPMT lock on
 * that row alone, decided per row by committedDealId() below.
 */
export function BlDetailsPanel({
  tfKey,
  tfQuantity,
  tfCommodity,
  tfBlNumber,
  tradeFlow,
  dealAssignments,
  pendingAssignment,
  onPendingAssignmentChange,
  reloadToken,
  registerSave,
}: {
  tfKey: TrdFlowKey
  tfQuantity: unknown
  tfCommodity: unknown
  /**
   * The trade flow's own BL Number (ZSGTSFTR_TRDFLOW.ZBLNO). A BL copies it when the upload
   * creates it; one entered later on Shipping Data reaches only the trade flow, so a BL with
   * none of its own shows the trade flow's.
   */
  tfBlNumber?: unknown
  /** The trade flow row itself, so Create BL with no line item selected can build from it. */
  tradeFlow?: Readonly<Record<string, unknown>>
  dealAssignments: Readonly<Record<string, string>>
  pendingAssignment: PendingBlAssignment | null
  onPendingAssignmentChange: (next: PendingBlAssignment | null) => void
  /** Bumped after a save, so the grid re-reads what was written. */
  reloadToken?: number
  /**
   * Hands the popup's Update the function that writes this grid's pending BL work (created and
   * split rows, edited cells) to ZSGTSFTR_BL. Called with the Deal IDs this Update assigns to
   * rows not yet stored (BL ID -> Deal ID), which go into those rows' inserts — see
   * withPendingDeals in bl.ts. Returns each created row's own id alongside the BL number the
   * range issued it (so a caller can match one back to the other), or null when there was
   * nothing to write.
   */
  registerSave?: (
    save: ((dealsForUnsaved: ReadonlyMap<string, string>, details?: BlInvoiceDetails) => Promise<Array<{ localId: string; blNo: string }> | null>) | null,
  ) => void
}) {
  const [requestedPage, setRequestedPage] = useState(0)
  const [selectedRows, setSelectedRows] = useState<ReadonlySet<string>>(new Set())
  const [complianceOpen, setComplianceOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [splitOpen, setSplitOpen] = useState(false)
  const [blRowsInput, setBlRowsInput] = useState('')
  const [actionError, setActionError] = useState('')
  const [documentNotice, setDocumentNotice] = useState('')
  const [documentReload, setDocumentReload] = useState(0)
  const [assignmentTargets, setAssignmentTargets] = useState<BlRow[]>([])
  const [withException, setWithException] = useState(false)
  const [documentSession, setDocumentSession] = useState<{ kind: BlDocumentKind; targets: BlRow[]; continueAssignment: boolean } | null>(null)
  // Local-only text for a row's own Quantity/CPMT input (keyed by "<row id>:<field>"), so a
  // half-typed number ("12.") is never forced back to "12" mid-keystroke — the same reason
  // DateField keeps its own typed text.
  const [numDrafts, setNumDrafts] = useState<Record<string, string>>({})
  const bls = useAsync((signal) => loadBls(tfKey, signal), [tfKey.ZtfNo, tfKey.ZtfSplit, reloadToken])
  // Status text is decoration: without it the Status column shows the bare code.
  const statusText = useAsync((signal) => loadBlStatusText(signal).catch(() => new Map<string, string>()), [])

  // What ZSGTSFTR_BL last answered, plus whatever Create BL / BL Split have added locally since.
  // Reset whenever the read behind it changes, so a reselect or an Update's reload token always
  // starts from the real data rather than compounding a stale local row onto a fresh read.
  const [rows, setRows] = useState<BlRow[]>([])
  const localSeq = useRef(0)
  useEffect(() => {
    if (bls.data) setRows(bls.data)
  }, [bls.data])

  // BL DMS details: the documents filed against these BLs (ZSGTSFTR_BL_DMS, TSF_DMS, DMS_TYP).
  const blNos = rows.map((row) => String(row.ZblNo ?? '')).join(',')
  const documentRefs = JSON.stringify(rows.map((r) => [r.ZblNo, r.ZtsfDmsCode, r.ZdmsCodeExc]))
  const documents = useAsync((signal) => loadBlDocuments(blNos ? blNos.split(',') : [], signal, rows), [blNos, documentRefs, documentReload, reloadToken])
  const docRows = documents.data ?? []
  // Read through a ref by the registered callback below: it is registered once (the effect's
  // deps never change), while the ref is reassigned fresh on every render.
  const latest = useRef({ original: [] as BlRow[], rows: [] as BlRow[] })
  latest.current = { original: bls.data ?? [], rows }
  useEffect(() => {
    if (!registerSave) return
    registerSave(async (dealsForUnsaved, details) => {
      // Every Create BL row is inserted, with or without a Deal ID: its BL ID is drawn from the
      // SNRO range by that insert. A Deal ID assigned to it in this same Update rides along.
      const rowsToSave = withPendingDeals(latest.current.rows, dealsForUnsaved, BL_ASSIGNED_STATUS, details)
      const plan = planBlSave(latest.current.original, rowsToSave)
      if (plan.updates.length === 0 && plan.inserts.length === 0) return null
      return saveBlChanges(plan)
    })
    return () => registerSave(null)
  }, [registerSave])

  const { page, pageCount } = blPage(rows.length, requestedPage)
  const visible = rows.slice(page * BL_PAGE_SIZE, page * BL_PAGE_SIZE + BL_PAGE_SIZE)
  const totals = blTotals(rows)
  const notBuilt = 'Not available yet: this BL process has no backend.'
  const anySelected = selectedRows.size > 0
  // BL Split acts on one BL; with several rows checked, the first checked row (in grid order)
  // is the one it acts on. Assign Deal ID & Release for Invoicing acts on every checked row.
  const targetRow = rows.find((row) => selectedRows.has(blRowId(row)))
  const selectedRowsList = rows.filter((row) => selectedRows.has(blRowId(row)))
  const uploadSelectionError = blUploadSelectionError(selectedRowsList)
  // Once every checked row already carries a Deal ID, there is nothing left to assign; with at
  // least one still unassigned among the checked rows, the button stays enabled for it.
  const allSelectedAssigned =
    selectedRowsList.length > 0 && selectedRowsList.every((row) => committedDealId(row).trim() !== '')
  const targetDealId = targetRow ? committedDealId(targetRow) : ''
  const canSplit = targetRow !== undefined && targetDealId.trim() === ''

  function toggleRow(id: string) {
    setSelectedRows((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleCreateBl() {
    setActionError('')
    const count = Number.parseInt(blRowsInput, 10)
    if (!Number.isFinite(count) || count <= 0) {
      setActionError('Enter a valid number of BL Rows to create.')
      return
    }
    // With a line item selected, the new rows copy it (vessel name, grade/commodity, CPMT, ...)
    // and land right below it. With none selected, Create BL still works — the rows are built
    // from the trade flow itself, as the upload builds a BL, and land at the end of the grid.
    const source = targetRow
    const sourceIndex = source ? rows.findIndex((row) => blRowId(row) === blRowId(source)) : rows.length - 1
    // The default split of the TF Quantity shown beside BL Split, not the selected row's own
    // Quantity — the new rows' Quantity must sum back to that displayed figure.
    const perRowQty = (Number(tfQuantity) || 0) / count
    const created: BlRow[] = []
    const drafts: Record<string, string> = {}
    for (let i = 0; i < count; i++) {
      const localId = `new-${++localSeq.current}`
      // Only the identity, quantity and the two fields the spec calls out (Deal ID, Status) are
      // reset; everything else copied through from source as-is.
      const newRow: BlRow = source
        ? { ...source }
        : tradeFlow
          ? blFromTradeFlow(tradeFlow, tfKey)
          : { ZtfNo: tfKey.ZtfNo, ZtfSplit: tfKey.ZtfSplit, Zblno: String(tfBlNumber ?? ''), Zcmmd: String(tfCommodity ?? '') }
      // Amt is never stored on a created row — blAmount() derives it from Quantity x CPMT, so
      // it stays correct as the user edits the (editable) Quantity.
      delete newRow.ZcpmAmt
      delete newRow.ZblStat
      // Left blank: the middleware issues the BL ID from the SNRO range when Update inserts it.
      newRow.ZblNo = ''
      newRow.localId = localId
      newRow.ZblSplit = '01'
      newRow.ZblReuse = ''
      newRow.Zquantity = perRowQty
      newRow.ZdealId = ''
      newRow.ZblStatId = BL_CREATED_STATUS
      // A newly numbered BL does not inherit another BL's attachments or exception approval.
      delete newRow.ZtsfDmsCode
      delete newRow.ZdmsCodeExc
      delete newRow.ZblExc
      created.push(newRow)
      drafts[numDraftKey(blRowId(newRow), 'Zquantity')] = String(perRowQty)
    }
    setRows((current) => {
      const next = [...current]
      next.splice(source ? sourceIndex + 1 : next.length, 0, ...created)
      return next
    })
    setNumDrafts((current) => ({ ...current, ...drafts }))
    setBlRowsInput('')
  }

  function numDraftKey(id: string, field: EditableNumField): string {
    return `${id}:${field}`
  }

  function onTextInput(id: string, field: EditableTextField, raw: string) {
    setRows((current) => current.map((row) => (blRowId(row) === id ? { ...row, [field]: raw } : row)))
  }

  function onNumberInput(id: string, field: EditableNumField, raw: string) {
    setNumDrafts((current) => ({ ...current, [numDraftKey(id, field)]: raw }))
    const parsed = Number(raw)
    if (raw.trim() !== '' && Number.isFinite(parsed) && parsed >= 0) {
      setRows((current) => current.map((row) => (blRowId(row) === id ? { ...row, [field]: parsed } : row)))
    }
  }

  function applySplit(source: BlRow, splitQty: number) {
    const id = blRowId(source)
    const totalQty = Number(source.Zquantity) || 0
    const balanceQty = totalQty - splitQty
    const newSplitId = nextBlSplitId(rows, String(source.ZblNo ?? ''))
    // A new row until Update inserts it, under the source's BL ID with the next split.
    const splitLocalId = `split-${++localSeq.current}`
    setRows((current) => {
      const index = current.findIndex((row) => blRowId(row) === id)
      if (index === -1) return current
      const remainder: BlRow = { ...current[index]!, Zquantity: balanceQty }
      const split: BlRow = { ...current[index]!, ZblSplit: newSplitId, Zquantity: splitQty, localId: splitLocalId }
      const next = [...current]
      next[index] = remainder
      next.splice(index + 1, 0, split)
      return next
    })
    // The original line's Quantity input may still hold typed draft text from before the split;
    // without resetting it here, the cell would keep showing that instead of the Balance
    // Quantity the split just produced. The new split row starts with its own draft the same
    // way Create BL seeds one, so its input reads exactly the entered Qty for BL Split.
    setNumDrafts((current) => ({
      ...current,
      [numDraftKey(id, 'Zquantity')]: String(balanceQty),
      [numDraftKey(splitLocalId, 'Zquantity')]: String(splitQty),
    }))
  }

  // The BL Details grid must not reflect an assignment until Update commits it — only what's
  // already been committed (or the row's own value) ever shows in the Deal ID column.
  function committedDealId(row: (typeof rows)[number]): string {
    const id = blRowId(row)
    return dealAssignments[dealAssignmentKey(tfKey, id)] ?? row.ZdealId ?? ''
  }

  return (
    <div className="tab-content" id="tabPanel-blData1">
      <div className="section-box" style={{ maxWidth: 700 }}>
        <div className="section-head">Create BL For Trade Flow</div>
        <div className="section-body toolstrip">
          <div className="ws-field">
            <label htmlFor="blRowsInput">
              BL Rows<span className="req">*</span>
            </label>
            <input
              type="text"
              id="blRowsInput"
              inputMode="numeric"
              placeholder="e.g. 1"
              value={blRowsInput}
              onChange={(event) => setBlRowsInput(event.target.value)}
            />
          </div>
          <button type="button" className="hdr-btn" onClick={handleCreateBl}>
            Create BL
          </button>
          <button
            type="button"
            className="hdr-btn primary"
            disabled={!anySelected || allSelectedAssigned}
            title={
              !anySelected
                ? 'Select at least one BL line item first.'
                : allSelectedAssigned
                  ? 'The selected line item(s) already have a Deal ID assigned.'
                  : undefined
            }
            onClick={() => {
              setAssignmentTargets(selectedRowsList.map((row) => ({ ...row })))
              setWithException(false)
              setActionError('')
              setComplianceOpen(true)
            }}
          >
            Assign Deal ID &amp; Release for Invoicing
          </button>
          <button
            type="button"
            className="hdr-btn"
            disabled={!canSplit}
            title={
              !targetRow
                ? 'Select a BL line item first.'
                : canSplit
                  ? undefined
                  : 'This BL is already assigned to a Deal ID.'
            }
            onClick={() => setSplitOpen(true)}
          >
            BL Split
          </button>
          <div className="ws-field tf-qty-field">
            <label htmlFor="blTfQtyDisplay">TF Quantity</label>
            <div className="tf-qty-value-row">
              <input type="text" id="blTfQtyDisplay" className="amt-input" readOnly value={fmtNum(tfQuantity, 3)} />
              <span className="field-hint">(MT)</span>
            </div>
          </div>
        </div>
        {actionError ? (
          <div className="section-body" style={{ paddingTop: 0 }}>
            <span className="field-hint">{actionError}</span>
          </div>
        ) : null}
      </div>

      <div className="section-box">
        <div className="section-head">BL Details</div>
        <div className="section-body" style={{ padding: 0 }}>
          <div className="table-scroll">
            <table className="data-table" id="blDetailsTable" style={{ minWidth: 1000 }}>
              <thead>
                <tr>
                  <th aria-label="Select" />
                  <th>BL ID</th>
                  <th>Split</th>
                  <th>BL Number</th>
                  <th>Vessel Name</th>
                  <th>Grade/Commodity</th>
                  <th className="num">Quantity</th>
                  <th className="num">CPMT</th>
                  <th className="num">Amt</th>
                  <th>Deal ID</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody id="blDetailsTableBody">
                {bls.loading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={11}>Loading BLs…</td>
                  </tr>
                ) : bls.error ? (
                  <tr>
                    <td colSpan={11}>Could not read the BLs: {bls.error.message}</td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={11}>No BL records created yet.</td>
                  </tr>
                ) : (
                  <>
                    {visible.map((row) => {
                      const id = blRowId(row)
                      // Editable until a Deal ID is assigned to this specific line item — once
                      // it is, this row alone locks; every other still-unassigned row is
                      // unaffected.
                      const editable = committedDealId(row).trim() === ''
                      const blNumber =
                        String(row.Zblno ?? '').trim() || String(tfBlNumber ?? '').trim() || String(row.ZblNo ?? '').trim()
                      return (
                        <tr key={id} data-blid={row.ZblNo}>
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`Select BL ${row.ZblNo}`}
                              checked={selectedRows.has(id)}
                              onChange={() => toggleRow(id)}
                            />
                          </td>
                          <td>{row.ZblNo || <span className="field-hint">New</span>}</td>
                          <td>{row.ZblSplit}</td>
                          <td>
                            {editable ? (
                              <input
                                type="text"
                                className="bl-inline-input bl-inline-text"
                                aria-label={`BL Number for BL ${row.ZblNo}`}
                                value={blNumber}
                                onChange={(event) => onTextInput(id, 'Zblno', event.target.value)}
                              />
                            ) : (
                              blNumber
                            )}
                          </td>
                          <td>
                            {editable ? (
                              <input
                                type="text"
                                className="bl-inline-input bl-inline-text"
                                aria-label={`Vessel Name for BL ${row.ZblNo}`}
                                value={row.ZblVsslName ?? ''}
                                onChange={(event) => onTextInput(id, 'ZblVsslName', event.target.value)}
                              />
                            ) : (
                              row.ZblVsslName
                            )}
                          </td>
                          <td>
                            {editable ? (
                              <input
                                type="text"
                                className="bl-inline-input bl-inline-text"
                                aria-label={`Grade/Commodity for BL ${row.ZblNo}`}
                                value={blGradeCommodity(row)}
                                onChange={(event) => onTextInput(id, 'Zgrade', event.target.value)}
                              />
                            ) : (
                              blGradeCommodity(row)
                            )}
                          </td>
                          <td className="num">
                            {editable ? (
                              <input
                                type="text"
                                className="bl-inline-input"
                                inputMode="decimal"
                                aria-label={`Quantity for BL ${row.ZblNo}`}
                                value={numDrafts[numDraftKey(id, 'Zquantity')] ?? String(row.Zquantity ?? '')}
                                onChange={(event) => onNumberInput(id, 'Zquantity', event.target.value)}
                              />
                            ) : (
                              fmtNum(row.Zquantity, 3)
                            )}
                          </td>
                          <td className="num">
                            {editable ? (
                              <input
                                type="text"
                                className="bl-inline-input"
                                inputMode="decimal"
                                aria-label={`CPMT for BL ${row.ZblNo}`}
                                value={numDrafts[numDraftKey(id, 'Zcprice')] ?? String(row.Zcprice ?? '')}
                                onChange={(event) => onNumberInput(id, 'Zcprice', event.target.value)}
                              />
                            ) : (
                              fmtNum(row.Zcprice)
                            )}
                          </td>
                          <td className="num">{fmtNum(blAmount(row))}</td>
                          <td>{committedDealId(row)}</td>
                          <td>
                            {codeText(row.ZblStatId, statusText.data?.get(String(row.ZblStatId ?? '').trim()) || row.ZblStat)}
                          </td>
                        </tr>
                      )
                    })}
                    <tr>
                      <td />
                      <td colSpan={5}>Total</td>
                      <td className="num" id="blData1TotalQty">{fmtNum(totals.quantity, 3)}</td>
                      <td className="num" id="blData1TotalCpmt">{fmtNum(totals.cpmt)}</td>
                      <td className="num" id="blData1TotalAmt">{fmtNum(totals.amount)}</td>
                      <td />
                      <td />
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="section-body bl-pager-row">
          <button type="button" className="hdr-btn icon-btn" title="First Page" disabled={page === 0} onClick={() => setRequestedPage(0)}>
            ⇤
          </button>
          <button type="button" className="hdr-btn icon-btn" title="Previous Page" disabled={page === 0} onClick={() => setRequestedPage(page - 1)}>
            ◀
          </button>
          <span id="blData1PageLabel" className="field-hint">
            Page {page + 1} of {pageCount}
          </span>
          <button type="button" className="hdr-btn icon-btn" title="Next Page" disabled={page >= pageCount - 1} onClick={() => setRequestedPage(page + 1)}>
            ▶
          </button>
          <button type="button" className="hdr-btn icon-btn" title="Last Page" disabled={page >= pageCount - 1} onClick={() => setRequestedPage(pageCount - 1)}>
            ⇥
          </button>
        </div>
      </div>

      <div className="section-box">
        <div className="section-head">BL Documents</div>
        <div className="section-body" style={{ padding: 0 }}>
          <div className="table-scroll">
            <table className="data-table" id="blDocumentsTable" style={{ minWidth: 800 }}>
              <thead>
                <tr>
                  <th>BL ID</th>
                  <th>DMS Code</th>
                  <th>Standard DMS</th>
                  <th>Document</th>
                  <th>Type</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody id="blDocumentsTableBody">
                {documents.loading && docRows.length === 0 && rows.length > 0 ? (
                  <tr>
                    <td colSpan={6}>Loading documents…</td>
                  </tr>
                ) : documents.error ? (
                  <tr>
                    <td colSpan={6}>Could not read the BL documents: {documents.error.message}</td>
                  </tr>
                ) : docRows.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No documents are filed against these BLs.</td>
                  </tr>
                ) : (
                  docRows.map((doc, i) => (
                    <tr key={`${doc.blNo}-${doc.dmsCode}-${doc.name}-${i}`}>
                      <td>{doc.blNo}</td>
                      <td>{doc.dmsCode}</td>
                      <td>{doc.standardDms}</td>
                      <td>{doc.extension ? `${doc.name}.${doc.extension}` : doc.name}</td>
                      <td>{doc.typeText}</td>
                      <td>{doc.description}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="toolstrip">
        <button type="button" className="hdr-btn" disabled={!!uploadSelectionError} title={uploadSelectionError || undefined}
          onClick={() => {
            setDocumentNotice('')
            setDocumentSession({ kind: 'D01', targets: selectedRowsList.map((row) => ({ ...row })), continueAssignment: false })
          }}>
          Upload BL Document
        </button>
        <span className="field-hint">
          {rows.length} BL(s) for {tfKey.ZtfNo} / {tfKey.ZtfSplit}
          {pendingAssignment ? ' — Deal ID ready; click Update to save it.' : ''}
        </span>
      </div>
      {documentNotice ? <div className="section-body" role="status">{documentNotice}</div> : null}

      {documentSession ? <BlDmsUploadModal rows={documentSession.targets} kind={documentSession.kind}
        onCancel={() => {
          const resume = documentSession.continueAssignment
          setDocumentSession(null)
          if (resume) setComplianceOpen(true)
        }}
        onUploaded={(result) => {
          const session = documentSession
          const ids = new Set(session.targets.map(blRowId))
          const field = session.kind === 'D02' ? 'ZdmsCodeExc' : 'ZtsfDmsCode'
          setRows((current) => current.map((row) => ids.has(blRowId(row)) ? { ...row, [field]: result.code } : row))
          setDocumentNotice(result.message)
          setDocumentReload((token) => token + 1)
          setDocumentSession(null)
          if (session.continueAssignment) setAssignOpen(true)
        }} /> : null}

      <ComplianceModal
        open={complianceOpen}
        onCancel={() => setComplianceOpen(false)}
        onProceed={(exception) => {
          setComplianceOpen(false)
          setWithException(exception)
          if (exception) {
            const error = blUploadSelectionError(assignmentTargets)
            if (error) { setActionError(error); return }
            setDocumentSession({ kind: 'D02', targets: assignmentTargets, continueAssignment: true })
            return
          }
          setAssignOpen(true)
        }}
      />

      {assignmentTargets.length > 0 ? (
        <AssignDealModal
          key={`assign-${assignmentTargets.map((row) => blRowId(row)).join(',')}`}
          open={assignOpen}
          selectedBlAmount={assignmentTargets.reduce((sum, row) => sum + blAmount(row), 0)}
          // Only a still-pending choice for this exact trade flow is offered back; once it's
          // committed, dealAssignments (not this) is what the grid itself reads from.
          initialDealId={
            pendingAssignment &&
            pendingAssignment.tfKey.ZtfNo === tfKey.ZtfNo &&
            pendingAssignment.tfKey.ZtfSplit === tfKey.ZtfSplit
              ? pendingAssignment.dealId
              : ''
          }
          gtCommodity={String(tradeFlow?.['ZtrmComId'] ?? '').trim()}
          onCancel={() => setAssignOpen(false)}
          onAssign={(dealId, details) => {
            onPendingAssignmentChange({
              // GT Commodity (ZTRM_COM_ID) is the trade flow's own commodity code; the BL carries it
              // to the invoice lines (ZSGTSFTR_BIL_ADJ-ZGT_COMM).
              details: { ...details, ZtrmComId: String(tradeFlow?.['ZtrmComId'] ?? '').trim(), ZblExc: withException ? 'X' : '' },
              tfKey,
              targets: assignmentTargets.map((row) => ({
                blId: blRowId(row),
                bl: {
                  ZblNo: String(row.ZblNo ?? ''),
                  ZblSplit: String(row.ZblSplit ?? ''),
                  ZblReuse: String(row.ZblReuse ?? ''),
                },
              })),
              dealId,
              totalQuantity: assignmentTargets.reduce((sum, row) => sum + (Number(row.Zquantity) || 0), 0),
            })
            setAssignOpen(false)
          }}
        />
      ) : null}

      {targetRow ? (
        <BlSplitModal
          key={`split-${blRowId(targetRow)}`}
          open={splitOpen}
          blId={String(targetRow.ZblNo ?? '')}
          nextSplitId={nextBlSplitId(rows, String(targetRow.ZblNo ?? ''))}
          totalQty={Number(targetRow.Zquantity) || 0}
          onCancel={() => setSplitOpen(false)}
          onConfirm={(splitQty) => {
            applySplit(targetRow, splitQty)
            setSplitOpen(false)
          }}
        />
      ) : null}
    </div>
  )
}
