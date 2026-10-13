import { DateField, SapDropdown } from './controls.tsx'
import { Overlay, type Modal } from './modal.tsx'
import type { Avail, DdOption, Leg, UnwindForm } from './types.ts'

/**
 * Unwinding (screen 9002): one reversing txn. The Buy/Sell labels are the original leg's
 * sides swapped (leg side 2 first), as the legacy set them.
 */
export function UnwindModal({
  modal,
  leg,
  form,
  bodyKey,
  bpOptions,
  onChange,
  onSubmit,
}: {
  modal: Modal
  leg: Leg | null
  form: UnwindForm
  bodyKey: number
  /** ZSGTRMTR_BP_GRP ⋈ ZSGTRMTR_BPEXT for the leg's trader group (FORM drop_down_9002). */
  bpOptions: Avail<readonly DdOption[]>
  onChange: (form: UnwindForm) => void
  onSubmit: () => void
}) {
  const set = (p: Partial<UnwindForm>) => onChange({ ...form, ...p })
  return (
    <Overlay modal={modal} onBackdrop={modal.close}>
      <div className="modal modal-left modal-scrollable pm-modal-mid">
        <div className="modal-head-row">
          <h2>Unwinding</h2>
          <button type="button" className="modal-close-btn" aria-label="Close" onClick={modal.close}>
            ×
          </button>
        </div>
        <div className="modal-body-scroll" key={bodyKey}>
          <div className="summary-box">
            <div>
              <div className="label">Transaction</div>
              <div className="value">{leg ? leg.rfha : '-'}</div>
            </div>
            <div>
              <div className="label">Currency Pair</div>
              <div className="value">{leg ? leg.cpair : '-'}</div>
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label>Remarks</label>
              <textarea
                className="control"
                rows={2}
                placeholder="Optional remarks..."
                value={form.remark}
                onChange={(e) => set({ remark: e.target.value })}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="field w-date">
              <label>
                Trade Date<span className="req">*</span>
              </label>
              <div className="ctrl-slot">
                <DateField value={form.tdate} onChange={(tdate) => set({ tdate })} />
              </div>
            </div>
            <div className="field w-date">
              <label>
                Value Date<span className="req">*</span>
              </label>
              <div className="ctrl-slot">
                <DateField value={form.vdate} onChange={(vdate) => set({ vdate })} />
              </div>
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label>
                Bank BP<span className="req">*</span>
              </label>
              <div className="ctrl-slot">
                <SapDropdown avail={bpOptions} value={form.bp} placeholder="Select BP..." onChange={(bp) => set({ bp })} />
              </div>
            </div>
          </div>
          <div className="form-row">
            <div className="field w-md">
              <label>
                Rate<span className="req">*</span>
              </label>
              <input className="control" placeholder="0.0000" value={form.rate} onChange={(e) => { if (!/\.\d{5,}/.test(e.target.value)) set({ rate: e.target.value }) }} />
            </div>
          </div>
          <div className="form-row no-wrap">
            <div className="field w-sm-md">
              <label>{leg ? leg.bs2 : 'Buy'}</label>
              <input className="control" readOnly value={leg ? leg.curr2 : ''} />
            </div>
            <div className="field fx-field">
              <label>Amount</label>
              <input className="control" placeholder="0.00" value={form.buyAmt} onChange={(e) => set({ buyAmt: e.target.value })} />
            </div>
          </div>
          <div className="form-row no-wrap">
            <div className="field w-sm-md">
              <label>{leg ? leg.bs1 : 'Sell'}</label>
              <input className="control" readOnly value={leg ? leg.curr1 : ''} />
            </div>
            <div className="field fx-field">
              <label>Amount</label>
              <input className="control" placeholder="0.00" value={form.sellAmt} onChange={(e) => set({ sellAmt: e.target.value })} />
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" type="button" onClick={modal.close}>
            Cancel
          </button>
          <button className="btn btn-danger" type="button" onClick={onSubmit}>
            Create Unwinding Txn
          </button>
        </div>
      </div>
    </Overlay>
  )
}
