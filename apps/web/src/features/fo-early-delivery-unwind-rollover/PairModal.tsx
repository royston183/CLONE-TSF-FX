import { DateField, SapDropdown } from './controls.tsx'
import { pairCurrencies } from './logic.ts'
import { Overlay, type Modal } from './modal.tsx'
import type { Avail, BookingForm, DdOption, Leg, PairForm } from './types.ts'

function BookingSection({
  title,
  cancel,
  requiredMsg,
  form,
  buyCcy,
  sellCcy,
  typeOptions,
  bpOptions,
  onChange,
}: {
  title: string
  cancel: boolean
  /** The legacy Early Delivery New Booking type field carries a (never shown) "Required." note. */
  requiredMsg: boolean
  form: BookingForm
  buyCcy: string
  sellCcy: string
  typeOptions: Avail<readonly DdOption[]>
  bpOptions: Avail<readonly DdOption[]>
  onChange: (patch: Partial<BookingForm>) => void
}) {
  return (
    <div className={`form-section${cancel ? ' cancel' : ''}`}>
      <div className="section-title">
        <span className="dot" style={cancel ? { background: 'var(--error)' } : undefined}></span>
        {title}
      </div>
      <div className="form-row">
        <div className="field">
          <label>
            Txn Type<span className="req">*</span>
          </label>
          <div className="ctrl-slot">
            <SapDropdown avail={typeOptions} value={form.type} placeholder="Select txn type..." onChange={(type) => onChange({ type })} />
          </div>
          {requiredMsg ? <div className="error-msg">Required.</div> : null}
        </div>
      </div>
      <div className="form-row">
        <div className="field w-date">
          <label>
            Trade Date<span className="req">*</span>
          </label>
          <div className="ctrl-slot">
            <DateField value={form.tdate} onChange={(tdate) => onChange({ tdate })} />
          </div>
        </div>
        <div className="field w-date">
          <label>
            Value Date<span className="req">*</span>
          </label>
          <div className="ctrl-slot">
            <DateField value={form.vdate} onChange={(vdate) => onChange({ vdate })} />
          </div>
        </div>
      </div>
      <div className="form-row">
        <div className="field">
          <label>Bank BP</label>
          <div className="ctrl-slot">
            <SapDropdown avail={bpOptions} value={form.bp} placeholder="Select BP..." onChange={(bp) => onChange({ bp })} />
          </div>
        </div>
      </div>
      <div className="form-row">
        <div className="field w-md">
          <label>
            Rate<span className="req">*</span>
          </label>
          <input className="control" placeholder="0.0000" value={form.rate} onChange={(e) => { if (!/\.\d{5,}/.test(e.target.value)) onChange({ rate: e.target.value }) }} />
        </div>
      </div>
      <div className="form-row no-wrap">
        <div className="field w-sm-md">
          <label>Buy</label>
          <input className="control" readOnly value={buyCcy} />
        </div>
        <div className="field fx-field">
          <label>Amount</label>
          <input className="control" placeholder="0.00" value={form.buyAmt} onChange={(e) => onChange({ buyAmt: e.target.value })} />
        </div>
      </div>
      <div className="form-row no-wrap">
        <div className="field w-sm-md">
          <label>Sell</label>
          <input className="control" readOnly value={sellCcy} />
        </div>
        <div className="field fx-field">
          <label>Amount</label>
          <input className="control" placeholder="0.00" value={form.sellAmt} onChange={(e) => onChange({ sellAmt: e.target.value })} />
        </div>
      </div>
    </div>
  )
}

/**
 * Early Delivery (screen 9001) and Rollover (screen 9003): identical two-sided forms, a New
 * Booking Txn next to a Cancellation Txn. `bodyKey` changes on every open so the calendars
 * start on their prefilled month, as the legacy reset them.
 */
export function PairModal({
  modal,
  title,
  submitLabel,
  requiredMsg,
  leg,
  form,
  bodyKey,
  typeOptions,
  bpOptions,
  onChange,
  onSubmit,
}: {
  modal: Modal
  title: string
  submitLabel: string
  requiredMsg: boolean
  leg: Leg | null
  form: PairForm
  bodyKey: number
  /** TVARVC ZSGTSFP_PRE_MATURE_EARLY_DDOWN (FORM txn_type). */
  typeOptions: Avail<readonly DdOption[]>
  /** ZSGTRMTR_BP_GRP ⋈ ZSGTRMTR_BPEXT for the leg's trader group (FORM bp). */
  bpOptions: Avail<readonly DdOption[]>
  onChange: (form: PairForm) => void
  onSubmit: () => void
}) {
  const ccy = pairCurrencies(leg)
  return (
    <Overlay modal={modal} onBackdrop={modal.close}>
      <div className="modal modal-left modal-scrollable pm-modal-wide">
        <div className="modal-head-row">
          <h2>{title}</h2>
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
          <div className="form-section">
            <div className="section-title">
              <span className="dot"></span>Remarks
            </div>
            <textarea
              className="control"
              rows={2}
              placeholder="Optional remarks..."
              value={form.remark}
              onChange={(e) => onChange({ ...form, remark: e.target.value })}
            />
          </div>
          <div className="two-col-forms">
            <BookingSection
              title="New Booking Txn"
              cancel={false}
              requiredMsg={requiredMsg}
              form={form.newTxn}
              buyCcy={ccy.newBuy}
              sellCcy={ccy.newSell}
              typeOptions={typeOptions}
              bpOptions={bpOptions}
              onChange={(p) => onChange({ ...form, newTxn: { ...form.newTxn, ...p } })}
            />
            <BookingSection
              title="Cancellation Txn"
              cancel
              requiredMsg={false}
              form={form.cancel}
              buyCcy={ccy.cancelBuy}
              sellCcy={ccy.cancelSell}
              typeOptions={typeOptions}
              bpOptions={bpOptions}
              onChange={(p) => onChange({ ...form, cancel: { ...form.cancel, ...p } })}
            />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" type="button" onClick={modal.close}>
            Cancel
          </button>
          <button className="btn btn-primary" type="button" onClick={onSubmit}>
            {submitLabel}
          </button>
        </div>
      </div>
    </Overlay>
  )
}
