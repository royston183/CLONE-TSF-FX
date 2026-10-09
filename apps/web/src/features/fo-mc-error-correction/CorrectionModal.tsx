import { PAYMENT_TERMS, PORT_REGION_GROUPS, findEntity, findPaymentTerm, findRegion } from './data.ts'
import { DateField } from './DateField.tsx'
import { Overlay, type Modal } from './modal.tsx'
import { SearchDropdown } from './SearchDropdown.tsx'
import type { CodeLabel, CorrectionForm, ErrorRow, FieldErrors, FieldKey, PaymentTerm, Picks } from './types.ts'

const fieldCls = (base: string, error: boolean | undefined) => ['field', base, error ? 'has-error' : ''].filter(Boolean).join(' ')

const portDisplay = (r: CodeLabel) => `${r.code} - ${r.label}`

/**
 * Error Correction: Mid-Office's remarks, the correctable fields (amended date, amount,
 * rate, shipment window, payment terms, ports) with the rest locked, and the FO response.
 */
export function CorrectionModal({
  modal,
  row,
  form,
  errors,
  onChange,
  onPick,
  onClearError,
  onAmendedDateCommit,
  onClose,
  onUpdate,
  onReverse,
}: {
  modal: Modal
  row: ErrorRow | undefined
  form: CorrectionForm
  errors: FieldErrors
  onChange: (patch: Partial<CorrectionForm>) => void
  onPick: (patch: Partial<Picks>) => void
  onClearError: (key: FieldKey) => void
  /** The Amended Date box "changed" (picked, or edited and left): re-check it and show the result. */
  onAmendedDateCommit: (value: string) => void
  onClose: () => void
  onUpdate: () => void
  onReverse: () => void
}) {
  const entity = row ? findEntity(row.origin) : undefined

  const pickPaymentTerm = (p: PaymentTerm) => {
    onChange({ paymentTerms: p.code })
    onPick({ paymentTerms: p.code })
  }

  return (
    <Overlay modal={modal} id="correctionModal" onBackdrop={onClose}>
      <div className="modal modal-left modal-scrollable correction-modal">
        <div className="modal-head-row">
          <div>
            <h2>Error Correction</h2>
          </div>
          <button type="button" className="modal-close-btn" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body-scroll">
          <div className="remarks-box">
            <div className="rb-label">Mid-Office Remarks</div>
            <div>{row ? row.moRemarks : '—'}</div>
          </div>

          <div className="form-section">
            <div className="section-title">
              <span className="dot" />
              Basic Details
            </div>
            <div className="section-body">
              <div className="form-grid-12 basic-details-grid">
                <div className="field gc-4">
                  <label>MC Reference No</label>
                  <input className="control mono" readOnly value={row ? String(row.mcRef) : ''} />
                </div>
                <div className="field gc-4">
                  <label>MC Date</label>
                  <input className="control mono" readOnly value={row?.mcDate ?? ''} />
                </div>
                <div className={fieldCls('gc-4', errors.amendedDate)}>
                  <label>
                    MC Amended Date<span className="req">*</span>
                  </label>
                  <DateField
                    inputClassName="control mono"
                    value={form.amendedDate}
                    onInput={(v) => {
                      onChange({ amendedDate: v })
                      onClearError('amendedDate')
                    }}
                    onCommit={onAmendedDateCommit}
                  />
                  <div className="error-msg">Enter a valid date. Amended Date cannot be older than one month from today.</div>
                </div>

                <div className="field gc-3">
                  <label>Origin Entity</label>
                  <input className="control" readOnly value={row ? `${row.origin} - ${entity?.name ?? ''}` : ''} />
                </div>
                <div className="field gc-6">
                  <label>MC Description</label>
                  <input className="control" readOnly value={row?.mcDescription ?? ''} />
                </div>
                <div className="field gc-3">
                  <label>Commodity</label>
                  <input className="control" readOnly value={row?.commodityText ?? ''} />
                </div>

                <div className={fieldCls('gc-4', errors.amountUsd)}>
                  <label>
                    MC Amount (USD)<span className="req">*</span>
                  </label>
                  <input
                    className="control text-right"
                    inputMode="decimal"
                    value={form.amountUsd}
                    onChange={(e) => {
                      onChange({ amountUsd: e.target.value })
                      onClearError('amountUsd')
                    }}
                  />
                  <div className="error-msg">Enter a valid amount greater than 0.</div>
                </div>
                <div className={fieldCls('gc-4', errors.exRate)}>
                  <label>
                    Exchange Rate<span className="req">*</span>
                  </label>
                  <input
                    className="control text-right"
                    inputMode="decimal"
                    value={form.exRate}
                    onChange={(e) => {
                      // At most four decimal places.
                      if (/\.\d{5,}/.test(e.target.value)) return
                      onChange({ exRate: e.target.value })
                      onClearError('exRate')
                    }}
                  />
                  <div className="error-msg">Must be greater than 0.</div>
                </div>
                <div className="field gc-4">
                  <label>MC Amount (Origin)</label>
                  <input className="control text-right" readOnly value={form.amountOrigin} />
                  <div className="hint">Auto-calculated: USD × rate</div>
                </div>
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="section-title">
              <span className="dot" />
              Shipment Details
            </div>
            <div className="section-body">
              <div className="form-grid-12 shipment-grid">
                <div className={fieldCls('gc-2', errors.shipStart)}>
                  <label>
                    Shipment Start Date<span className="req">*</span>
                  </label>
                  <DateField
                    value={form.shipStart}
                    onInput={(v) => onChange({ shipStart: v })}
                    onCommit={() => onClearError('shipStart')}
                  />
                  <div className="error-msg">Required.</div>
                </div>
                <div className={fieldCls('gc-2', errors.shipEnd)}>
                  <label>
                    Shipment End Date<span className="req">*</span>
                  </label>
                  <DateField
                    value={form.shipEnd}
                    onInput={(v) => onChange({ shipEnd: v })}
                    onCommit={() => onClearError('shipEnd')}
                  />
                  <div className="error-msg">Must be ≥ start date.</div>
                </div>
                <div className="field gc-4">
                  <label>Payment Terms</label>
                  <SearchDropdown
                    items={PAYMENT_TERMS}
                    selected={findPaymentTerm(form.paymentTerms)}
                    keyOf={(p) => p.code}
                    searchText={(p) => `${p.code} ${p.label}`}
                    primaryText={(p) => `${p.code} - ${p.label}`}
                    displayText={(p) => `${p.code} - ${p.label}`}
                    placeholder="Select payment terms"
                    onSelect={pickPaymentTerm}
                    onClear={() => onChange({ paymentTerms: '' })}
                  />
                </div>

                <div className="field gc-2">
                  <label>Port of Shipment</label>
                  <SearchDropdown
                    items={PORT_REGION_GROUPS}
                    selected={findRegion(form.portShipment)}
                    keyOf={(r) => r.code}
                    searchText={(r) => `${r.code} ${r.label}`}
                    primaryText={(r) => `${r.code} — ${r.label}`}
                    displayText={portDisplay}
                    // A stored ZPOS no port group matches stays visible (and is kept on Update).
                    placeholder={row?.shipPortText || 'Select region'}
                    onSelect={(r) => {
                      onChange({ portShipment: r.code })
                      onPick({ portShipment: r.code })
                    }}
                    onClear={() => onChange({ portShipment: '' })}
                  />
                </div>
                <div className="field gc-2">
                  <label>Port of Destination</label>
                  <SearchDropdown
                    items={PORT_REGION_GROUPS}
                    selected={findRegion(form.portDestination)}
                    keyOf={(r) => r.code}
                    searchText={(r) => `${r.code} ${r.label}`}
                    primaryText={(r) => `${r.code} — ${r.label}`}
                    displayText={portDisplay}
                    placeholder={row?.destPortText || 'Select region'}
                    onSelect={(r) => {
                      onChange({ portDestination: r.code })
                      onPick({ portDestination: r.code })
                    }}
                    onClear={() => onChange({ portDestination: '' })}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* FX Model Details are locked: changing the model would change the entity/currency string. */}
          <div className="form-section">
            <div className="section-title">
              <span className="dot" />
              FX Model Details
            </div>
            <div className="section-body">
              <div className="form-grid-12">
                <div className="field gc-4">
                  <label>FX Model</label>
                  <input className="control" readOnly value={row ? `${row.fxCode} - ${row.modelDesc}` : ''} />
                </div>
                <div className="field gc-4">
                  <label>Entity String</label>
                  <input className="control" readOnly value={row ? `${row.entityId} ${row.entityString}` : ''} />
                </div>
                <div className="field gc-4">
                  <label>Currency String</label>
                  <input className="control" readOnly value={row ? `${row.currencyI} ${row.currencyS}` : ''} />
                </div>
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="section-title">
              <span className="dot" />
              FO Response
            </div>
            <div className="section-body">
              <div className={fieldCls('', errors.foRemarks)}>
                <label>
                  FO Remarks<span className="req">*</span>
                </label>
                <textarea
                  className="control"
                  placeholder="Explain the correction made, for Mid-Office's review..."
                  // ZSGTSFTR_MAS_CON.ZFO_REMARKS is CHAR 80.
                  maxLength={80}
                  value={form.foRemarks}
                  onChange={(e) => {
                    onChange({ foRemarks: e.target.value })
                    onClearError('foRemarks')
                  }}
                />
                <div className="error-msg">FO Remarks are required before resubmitting.</div>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" id="btnCorrectionUpdate" onClick={onUpdate}>
            Update &amp; Resubmit to MO
          </button>
          <button type="button" className="btn btn-warn" id="btnCorrectionReverse" onClick={onReverse}>
            ↩ Reverse
          </button>
        </div>
      </div>
    </Overlay>
  )
}
