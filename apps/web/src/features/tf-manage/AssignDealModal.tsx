import { useEffect, useState } from 'react'
import { formatAmount } from '@slc/api-client'
import { useAsync } from '@slc/api-client/react'
import { loadDealAssignedTotals } from './api.ts'
import { DateField } from './DateField.tsx'
import { findDeal, loadDealMaster } from './dealMaster.ts'
import { assignmentCommodityError } from './assignmentCommodity.ts'
import type { BlInvoiceDetails } from './types.ts'

/** legacy/Manage TF.html's #assignDealOverlay Inco Terms list, verbatim. */
const INCO_TERMS: ReadonlyArray<{ key: string; text: string }> = [
  { key: 'CFR', text: 'Costs and freight' },
  { key: 'CIF', text: 'Costs, insurance & freight' },
  { key: 'CIP', text: 'Carriage and insurance paid to' },
  { key: 'CPT', text: 'Carriage paid to' },
  { key: 'DAP', text: 'Delivered at Place' },
  { key: 'DAT', text: 'Delivered at Terminal' },
  { key: 'DDP', text: 'Delivered Duty Paid' },
  { key: 'DPU', text: 'Delivery at Place Unloaded' },
  { key: 'EXW', text: 'Ex Works' },
  { key: 'FAS', text: 'Free Alongside Ship' },
  { key: 'FCA', text: 'Free Carrier' },
  { key: 'FOB', text: 'Free on board' },
]

export type AssignDealModalProps = {
  open: boolean
  selectedBlAmount: number
  initialDealId: string
  /** Trade flow ZTRM_COM_ID, not its grade/description or the free-text invoice commodity. */
  gtCommodity: string
  onCancel: () => void
  /** The Deal ID with the Invoice Details entered here (ZTRM_COM_ID is added by the caller). */
  onAssign: (dealId: string, details: Omit<BlInvoiceDetails, 'ZtrmComId'>) => void
}

/**
 * BL Data 1's "Assign Deal ID" popup. The Deal Master behind it is read live — Deal IDs from
 * MySQL with SAP's DealId set behind them, structures from ZSGTSFTR_TSF_STR (see dealMaster.ts).
 * Assignment Details and MC Details are read-only and fetched from that lookup; only Deal ID
 * (and, unrelated to the fetch, Deal Structure and Invoice Details) stay editable.
 */
export function AssignDealModal({
  open,
  selectedBlAmount,
  initialDealId,
  gtCommodity,
  onCancel,
  onAssign,
}: AssignDealModalProps) {
  const [dealStructure, setDealStructure] = useState('')
  const [dealId, setDealId] = useState('')
  const [fetchedDealId, setFetchedDealId] = useState('')
  const [soPoDate, setSoPoDate] = useState('')
  const [proposedInvDate, setProposedInvDate] = useState('')
  const [invCommodity, setInvCommodity] = useState('')
  const [incoTerms, setIncoTerms] = useState('')
  const [exceptionNotes, setExceptionNotes] = useState('')
  const [formError, setFormError] = useState('')
  // Read once per open, so a Deal ID created since the page loaded is offered.
  const master = useAsync((signal) => (open ? loadDealMaster(signal) : Promise.resolve(undefined)), [open])
  const deals = master.data?.deals ?? []
  const structures = master.data?.structures ?? []
  // Assigned totals across every BL in the system, so the Deal ID suggestions can drop a Deal
  // ID with no remaining value. Read alongside the deal master rather than gating it: a slow or
  // failed read only widens the suggestion list back to every deal, it never blocks the popup.
  const assignedTotals = useAsync(
    (signal) => (open ? loadDealAssignedTotals(signal) : Promise.resolve(new Map<string, number>())),
    [open],
  )
  // Not assigned, or assigned but with value still remaining — a Deal ID already fully assigned
  // to other BLs has nothing left to give this one, so it drops out of the suggestions (though
  // typing it, or an initialDealId the caller already assigned, still resolves via findDeal).
  const availableDeals = deals.filter((option) => (assignedTotals.data?.get(option.dealId) ?? 0) < option.dealAmount)

  // Re-populate from scratch every time the popup opens, the way the legacy's
  // openAssignDealModal() did, rather than carrying over whatever the last BL left behind.
  useEffect(() => {
    if (!open) return
    setDealStructure('')
    setDealId(initialDealId)
    setFetchedDealId(initialDealId.trim())
    setSoPoDate('')
    setProposedInvDate('')
    // Not auto-populated from the trade flow's own commodity: the user types the one this
    // invoice actually needs.
    setInvCommodity('')
    setIncoTerms('')
    setExceptionNotes('')
    setFormError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const deal = findDeal(deals, fetchedDealId)

  function fetchDeal(rawId: string) {
    const id = rawId.trim()
    setFetchedDealId(id)
    const match = findDeal(deals, id)
    if (match && !dealStructure) setDealStructure(match.dealStructure)
  }

  const dealAmount = deal?.dealAmount ?? 0
  const targetAssignAmt = dealAmount
  // The real total already assigned to this Deal ID across every BL in the system, not just
  // this trade flow — the same figure the suggestions and the Assign-time check are read from.
  const assignedEarlier = deal ? assignedTotals.data?.get(deal.dealId) ?? 0 : 0
  const totalAssigned = assignedEarlier + (dealId.trim() ? selectedBlAmount : 0)
  const balToAssign = targetAssignAmt - totalAssigned
  // Surfaced as soon as the Deal ID resolves, not only once Assign is clicked — so a fully
  // assigned Deal ID (picked from the list, typed by hand, or left over from before this
  // popup filtered its suggestions) never just sits there looking selectable.
  const dealFullyAssigned = !!deal && assignedEarlier >= dealAmount
  const commodityError = deal ? assignmentCommodityError(deal, gtCommodity) : ''

  function handleAssign() {
    if (!dealStructure) {
      setFormError('Select a Deal Structure before assigning.')
      return
    }
    const trimmed = dealId.trim()
    if (!trimmed) {
      setFormError('Enter a Deal ID before assigning.')
      return
    }
    if (!soPoDate) {
      setFormError('Enter the SO/PO Date before assigning.')
      return
    }
    if (!proposedInvDate) {
      setFormError('Enter the Proposed Inv Date before assigning.')
      return
    }
    if (!invCommodity.trim()) {
      setFormError('Enter an Inv Commodity before assigning.')
      return
    }
    if (!incoTerms) {
      setFormError('Select Inco Terms before assigning.')
      return
    }
    if (!exceptionNotes.trim()) {
      setFormError('Enter the Exception Notes before assigning.')
      return
    }
    const target = findDeal(deals, trimmed)
    if (!target) {
      setFormError(master.loading ? 'Deal IDs are still loading.' : `Deal ID ${trimmed} does not exist.`)
      return
    }
    const commodityError = assignmentCommodityError(target, gtCommodity)
    if (commodityError) {
      setFormError(commodityError)
      return
    }
    // Same rule the Deal ID suggestions are filtered by: a Deal ID with no remaining value
    // cannot take on more BLs, whether it was picked from the list or typed in by hand.
    const assignedSoFar = assignedTotals.data?.get(trimmed) ?? 0
    if (assignedSoFar >= target.dealAmount) {
      setFormError(`Deal ID ${trimmed} is already fully assigned and cannot take on more BLs.`)
      return
    }
    // The amount this BL would add is checked against what the Deal ID has left, not just its
    // total, so a partially-assigned Deal ID cannot be pushed past its own amount either.
    if (assignedSoFar + selectedBlAmount > target.dealAmount) {
      setFormError(
        `Selected BL Amount exceeds Deal ID ${trimmed}'s remaining amount (${formatAmount(target.dealAmount - assignedSoFar)} available).`,
      )
      return
    }
    setFormError('')
    onAssign(trimmed, {
      ZsoDate: soPoDate,
      // The invoice's Proposed Inv Date is the BL's invoice date (ZINV_DATE) in INVOICE_PLAN.
      ZinvDate: proposedInvDate,
      ZinvComm: invCommodity.trim(),
      Zinco: incoTerms,
      ZexcNotes: exceptionNotes.trim(),
    })
  }

  return (
    <div
      className="modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div className="modal-dialog wide" role="dialog" aria-modal="true" aria-labelledby="assignDealModalTitle">
        <div className="modal-head">
          <div className="modal-title" id="assignDealModalTitle">
            Assign Deal ID
          </div>
          <button type="button" className="modal-close-btn" aria-label="Close" onClick={onCancel}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="section-box">
            <div className="section-head">Assignment Details</div>
            <div className="section-body field-grid grid4">
              <div className="field">
                <label htmlFor="adDealStructure">
                  Deal Structure<span className="req">*</span>
                </label>
                <select
                  id="adDealStructure"
                  value={dealStructure}
                  onChange={(event) => setDealStructure(event.target.value)}
                >
                  <option value="">Select...</option>
                  {structures.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.text}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="adDealId">
                  Deal ID<span className="req">*</span>
                </label>
                <input
                  type="text"
                  id="adDealId"
                  list="adDealIdOptions"
                  placeholder="Select or type a Deal ID"
                  value={dealId}
                  onChange={(event) => setDealId(event.target.value)}
                  onBlur={(event) => fetchDeal(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return
                    event.preventDefault()
                    fetchDeal(dealId)
                  }}
                />
                <datalist id="adDealIdOptions">
                  {availableDeals.map((option) => (
                    <option key={option.dealId} value={option.dealId} />
                  ))}
                </datalist>
              </div>
              <div className="field">
                <label htmlFor="adDealStatus">Deal Status</label>
                <input
                  type="text"
                  id="adDealStatus"
                  readOnly
                  value={deal ? (deal.dealStatusText ? `${deal.dealStatus} ${deal.dealStatusText}` : deal.dealStatus) : ''}
                />
              </div>
              <div className="field">
                <label htmlFor="adDealAmount">Deal Amount</label>
                <input type="text" id="adDealAmount" className="amt-input" readOnly value={formatAmount(dealAmount)} />
              </div>
              <div className="field">
                <label htmlFor="adPartiallyInvoiced">Partially Invoiced</label>
                <input
                  type="text"
                  id="adPartiallyInvoiced"
                  className="amt-input"
                  readOnly
                  value={formatAmount(0)}
                />
              </div>
              <div className="field">
                <label htmlFor="adTargetAssignAmt">Target Assignment Amt</label>
                <input
                  type="text"
                  id="adTargetAssignAmt"
                  className="amt-input"
                  readOnly
                  value={formatAmount(targetAssignAmt)}
                />
              </div>
              <div className="field">
                <label htmlFor="adSelectedBlAmt">Selected BL Amount</label>
                <input
                  type="text"
                  id="adSelectedBlAmt"
                  className="amt-input"
                  readOnly
                  value={formatAmount(selectedBlAmount)}
                />
              </div>
              <div className="field">
                <label htmlFor="adAssignedEarlier">Assigned Earlier</label>
                <input
                  type="text"
                  id="adAssignedEarlier"
                  className="amt-input"
                  readOnly
                  value={formatAmount(assignedEarlier)}
                />
              </div>
              <div className="field">
                <label htmlFor="adTotalAssigned">Total Assigned</label>
                <input
                  type="text"
                  id="adTotalAssigned"
                  className="amt-input"
                  readOnly
                  value={formatAmount(totalAssigned)}
                />
              </div>
              <div className="field">
                <label htmlFor="adBalToAssign">Bal to be assigned</label>
                <input
                  type="text"
                  id="adBalToAssign"
                  className="amt-input"
                  readOnly
                  value={formatAmount(balToAssign)}
                />
              </div>
            </div>
          </div>

          <div className="mc-invoice-row">
            <div className="section-box mc-details-box">
              <div className="section-head">MC Details</div>
              <div className="section-body field-grid single">
                <div className="field">
                  <label htmlFor="adMcRefNo">MC Ref No</label>
                  <input type="text" id="adMcRefNo" readOnly value={deal?.mcRefNo ?? ''} />
                </div>
                <div className="field">
                  <label htmlFor="adMcCommodity">MC Commodity</label>
                  <input type="text" id="adMcCommodity" readOnly value={deal?.mcCommodity ? [deal.mcCommodity, deal.mcCommodityDescription].filter(Boolean).join(' — ') : ''} />
                </div>
              </div>
            </div>
            <div className="section-box invoice-details-box">
              <div className="section-head">Invoice Details</div>
              <div className="section-body field-grid">
                <div className="field">
                  <label htmlFor="adSoPoDate">
                    SO/PO Date<span className="req">*</span>
                  </label>
                  <DateField id="adSoPoDate" iso={soPoDate} onChange={setSoPoDate} />
                </div>
                <div className="field">
                  <label htmlFor="adProposedInvDate">
                    Proposed Inv Date<span className="req">*</span>
                  </label>
                  <DateField id="adProposedInvDate" iso={proposedInvDate} onChange={setProposedInvDate} />
                </div>
                <div className="field">
                  <label htmlFor="adInvCommodity">
                    Inv Commodity<span className="req">*</span>
                  </label>
                  <input
                    type="text"
                    id="adInvCommodity"
                    value={invCommodity}
                    onChange={(event) => setInvCommodity(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="adIncoTerms">
                    Inco Terms<span className="req">*</span>
                  </label>
                  <select id="adIncoTerms" value={incoTerms} onChange={(event) => setIncoTerms(event.target.value)}>
                    <option value="">Select...</option>
                    {INCO_TERMS.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.text}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="section-box">
            <div className="section-head">Exception Notes</div>
            <div className="section-body field-grid single">
              <div className="field">
                <label htmlFor="adExceptionNotes">
                  Notes<span className="req">*</span>
                </label>
                <input
                  type="text"
                  id="adExceptionNotes"
                  placeholder="e.g. Approved by Trade Ops on exception basis"
                  value={exceptionNotes}
                  onChange={(event) => setExceptionNotes(event.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <span className="field-hint">
            {formError ||
              (master.error ? `Could not read the Deal IDs: ${master.error.message}` : '') ||
              commodityError ||
              (dealFullyAssigned
                ? `Deal ID ${deal?.dealId} is already fully assigned and cannot take on more BLs.`
                : '')}
          </span>
          <div className="modal-actions">
            <button type="button" className="hdr-btn primary" onClick={handleAssign}>
              Assign
            </button>
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
