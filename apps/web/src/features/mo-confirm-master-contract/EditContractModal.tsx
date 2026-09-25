import { PAYMENT_TERMS, STATUS_SHORT, modelOf } from './data.ts'
import { fmtNum, parseAmountShorthand } from './format.ts'
import { candidateModelsForOrigin, isActionable, type EditValues } from './logic.ts'
import { Overlay, type Modal } from './modal.tsx'
import type { MasterContract } from './types.ts'

/**
 * Edit Master Contract. Mirrors the ABAP screen ZSGTSF_RMC_DETAIL_EDIT (dynpro 9001):
 * - Amount, Payment Terms and FX Model are editable; FX Model is offered only from models
 *   configured for this MC's origin entity (WHERE zorigin = ...).
 * - Entity ID/String, Currency ID/String and Model Description are re-derived read-only the
 *   moment a model is picked (the SELECT SINGLE against zsgtsftr_rule_bt in STATUS_9001).
 * - Outside the MO review queue every field is locked (module MODIFY_SCR_9001:
 *   "IF gs_data-zmc_stat >= '03' ... screen-input = 0").
 * - The amount accepts an "M"/"T" shorthand (module AMT_CONVERT1, via AMOUNT_STRING_CONVERT)
 *   and reformats with thousands separators on blur.
 */
export function EditContractModal({
  modal,
  mc,
  values,
  onChange,
  onSave,
}: {
  modal: Modal
  /** The contract as it was when the modal opened. */
  mc: MasterContract | null
  values: EditValues
  onChange: (patch: Partial<EditValues>) => void
  onSave: () => void
}) {
  // Release to MO and Error Correction are both MO-review states. Error Correction means
  // Front Office has corrected the contract and returned it to MO, so the same fields must
  // remain editable.
  const editable = mc ? isActionable(mc) : false
  const candidates = mc ? candidateModelsForOrigin(mc.originEntity) : []
  const model = modelOf(values.fxModel)

  return (
    <Overlay id="edit-overlay" modal={modal}>
      <div className="modal-card" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <div className="modal-icon">✎</div>
          <div className="modal-header-text">
            <div className="modal-title">Edit Master Contract</div>
            <div className="modal-subtitle" id="edit-subtitle">
              {mc ? `MC ${mc.mcNumber} – ${mc.mcDescription}` : null}
            </div>
          </div>
          <button className="modal-close" type="button" onClick={modal.close} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div id="edit-locked-note">
            {mc && !editable ? (
              <div className="note" style={{ borderColor: '#f5c99a', background: 'var(--amber-pale)', color: '#7a4b00', marginBottom: 14 }}>
                <strong>Read-only:</strong> this Master Contract is already <strong>{STATUS_SHORT[mc.status]}</strong>, so its fields
                can no longer be changed here - the SAP screen locks inputs once the contract is outside the MO review queue.
              </div>
            ) : null}
          </div>

          <div className="section-label">Editable Fields</div>
          <div className="filter-bar" style={{ marginBottom: 6 }}>
            <div className="filter-field" style={{ width: 180 }}>
              <label htmlFor="edit-amount">MC Amount (USD)</label>
              <input
                id="edit-amount"
                type="text"
                value={values.amount}
                disabled={!editable}
                onChange={(e) => onChange({ amount: e.target.value })}
                onBlur={() => onChange({ amount: fmtNum(parseAmountShorthand(values.amount)) })}
              />
            </div>
            <div className="filter-field" style={{ width: 220 }}>
              <label htmlFor="edit-payterms">Payment Terms</label>
              <select
                id="edit-payterms"
                value={values.paymentTerms}
                disabled={!editable}
                onChange={(e) => onChange({ paymentTerms: e.target.value })}
              >
                {PAYMENT_TERMS.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.code} – {p.desc}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-field" style={{ width: 220 }}>
              <label htmlFor="edit-model">FX Model</label>
              <select id="edit-model" value={values.fxModel} disabled={!editable} onChange={(e) => onChange({ fxModel: e.target.value })}>
                {candidates.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.code} – {m.desc}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="hint" style={{ marginBottom: 14 }}>
            Tip: type a shorthand amount like <kbd>5M</kbd> (5 million) or <kbd>250T</kbd> (250 thousand) and it will be converted
            automatically, just like the SAP amount field.
          </div>

          <div className="section-label">Derived From FX Model (read-only)</div>
          <div className="detail-grid" id="edit-detail-grid">
            {model ? (
              <>
                <Derived label="Entity ID" value={model.entityId} />
                <Derived label="Entity String" value={model.entities.join('-')} />
                <Derived label="Currency ID" value={model.currId} />
                <Derived label="Currency String" value={model.curr.join('-')} />
                <Derived label="Model Description" value={model.desc} />
              </>
            ) : null}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" type="button" onClick={modal.close}>
            Cancel
          </button>
          <button
            className="btn-confirm"
            id="edit-update-btn"
            type="button"
            style={editable ? undefined : { display: 'none' }}
            onClick={onSave}
          >
            Update
          </button>
        </div>
      </div>
    </Overlay>
  )
}

function Derived({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-cell">
      <div className="detail-lbl">{label}</div>
      <div className="detail-val">{value}</div>
    </div>
  )
}
