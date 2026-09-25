import { PAYMENT_TERMS } from './data.ts'
import { commitAmount } from './format.ts'
import { editAccess, editModelCandidates, modelOf, statusLabel } from './logic.ts'
import { DetailCell, ModalHeader, Overlay } from './modal.tsx'
import type { EditForm, MasterContract } from './types.ts'

/** Edit Master Contract — dynpro 9001 (STATUS_9001 / MODEL_ID_EDIT / MODIFY_SCR_9001). */
export function EditMcModal({
  open,
  contract: mc,
  form,
  onChange,
  onClose,
  onSave,
}: {
  open: boolean
  contract: MasterContract | undefined
  form: EditForm
  onChange: (patch: Partial<EditForm>) => void
  onClose: () => void
  onSave: () => void
}) {
  const access = mc ? editAccess(mc) : { editable: false, locked: false, canSave: false }
  const disabled = access.locked || !access.editable
  const derived = modelOf(form.model)
  return (
    <Overlay id="edit-overlay" open={open} onClose={onClose}>
      <div className="modal-card" style={{ maxWidth: 640 }}>
        <ModalHeader title="Edit Master Contract" subtitle={mc ? `MC ${mc.mcRef} - ${mc.mcDesc}` : ''} onClose={onClose} />
        <div className="modal-body">
          <div>
            {mc && access.locked ? (
              <div
                className="note"
                style={{ borderColor: '#f5c99a', background: 'var(--amber-pale)', color: '#7a4b00', marginBottom: 14 }}
              >
                <strong>Read-only:</strong> this Master Contract is already status <b>{statusLabel(mc.mcStat)}</b>, so
                amount, model and payment terms are locked once confirmed — matching module <code>MODIFY_SCR_9001</code>{' '}
                (<code>IF zmc_stat &gt;= &apos;03&apos;</code>).
              </div>
            ) : null}
          </div>

          <div className="section-label">Editable Fields</div>
          <div className="filter-bar" style={{ marginBottom: 6 }}>
            <div className="filter-field" style={{ width: 180 }}>
              <label htmlFor="ssdid-edit-amount">MC Amount (USD)</label>
              <input
                id="ssdid-edit-amount"
                type="text"
                value={form.amount}
                disabled={disabled}
                onChange={(e) => onChange({ amount: e.target.value })}
                onBlur={(e) => onChange({ amount: commitAmount(e.target.value) })}
              />
            </div>
            <div className="filter-field" style={{ width: 220 }}>
              <label htmlFor="ssdid-edit-payterms">Payment Terms</label>
              <select
                id="ssdid-edit-payterms"
                value={form.payTerms}
                disabled={disabled}
                onChange={(e) => onChange({ payTerms: e.target.value })}
              >
                {PAYMENT_TERMS.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.code} - {p.desc}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-field" style={{ width: 220 }}>
              <label htmlFor="ssdid-edit-model">FX Model (Short Straddle, this origin)</label>
              <select
                id="ssdid-edit-model"
                value={form.model}
                disabled={disabled}
                onChange={(e) => onChange({ model: e.target.value })}
              >
                {(mc ? editModelCandidates(mc.origin) : []).map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.code} - {m.desc}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="hint" style={{ marginBottom: 14 }}>
            Tip: type a shorthand amount like <kbd>5M</kbd> (5 million) or <kbd>250T</kbd> (250 thousand) and it converts
            automatically — same behavior as module <code>AMT_CONVERT1</code> / <code>AMOUNT_STRING_CONVERT</code> in the
            ABAP screen.
          </div>

          <div className="section-label">Derived From FX Model (read-only)</div>
          <div className="detail-grid">
            {derived ? (
              <>
                <DetailCell label="Entity ID" value={derived.entityId} />
                <DetailCell label="Entity String" value={derived.entities.join('-')} />
                <DetailCell label="Currency ID" value={derived.currId} />
                <DetailCell label="Currency String" value={derived.curr.join('-')} />
                <DetailCell label="Model Description" value={derived.desc} />
              </>
            ) : null}
          </div>

          <div className="section-label">Status</div>
          <div className="detail-grid">
            {mc ? (
              <>
                <DetailCell label="MC Status" value={statusLabel(mc.mcStat)} accent />
                <DetailCell label="Origin Entity" value={mc.origin} />
              </>
            ) : null}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" type="button" onClick={onClose}>
            Cancel
          </button>
          {access.canSave ? (
            <button className="btn-confirm" type="button" onClick={onSave}>
              Update
            </button>
          ) : null}
        </div>
      </div>
    </Overlay>
  )
}
