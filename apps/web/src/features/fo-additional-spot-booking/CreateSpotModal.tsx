import { DateField } from './DateField.tsx'
import { COMPANY_OPTIONS, PARTNER_OPTIONS, TXN_TYPE_OPTIONS } from './data.ts'
import { recalcAmounts } from './logic.ts'
import type { CodeLabel, CreateFormErrors, CreateFormValues, SpotRow } from './types.ts'

function OptionSelect({ id, options, value, onChange }: { id: string; options: readonly CodeLabel[]; value: string; onChange: (v: string) => void }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select ...</option>
      {options.map((o) => (
        <option key={o.key} value={o.key}>
          {o.key} — {o.text}
        </option>
      ))}
    </select>
  )
}

/** "Create Spot": the legacy #createOverlay, company/partner/dates for the picked row and the buy/sell split its rate implies. */
export function CreateSpotModal({
  row,
  values,
  errors,
  onChange,
  onClearErrors,
  onCancel,
  onConfirm,
}: {
  row: SpotRow
  values: CreateFormValues
  errors: CreateFormErrors
  onChange: (patch: Partial<CreateFormValues>) => void
  onClearErrors: () => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const rate = Number(String(values.rate).replace(/,/g, ''))
  const amounts = recalcAmounts(row, rate)

  return (
    <div className="overlay" style={{ display: 'block' }} onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal">
        <div className="modal-head">
          <div className="modal-title">Create Spot</div>
          <button className="modal-close" type="button" onClick={onCancel}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="section-label">Deal Context</div>
          <div className="grid">
            <div className="field">
              <label>Deal ID</label>
              <input value={row.dealId} type="text" readOnly />
            </div>
            <div className="field">
              <label>FX Deal Type</label>
              <input value={row.dealType} type="text" readOnly />
            </div>
            <div className="field">
              <label>DSS Deal Type</label>
              <input value={row.dssType} type="text" readOnly />
            </div>
          </div>

          <div className="section-label">Spot Transaction</div>
          <div className="grid">
            <div className="field">
              <label>
                Company Code <span className="req">*</span>
              </label>
              <OptionSelect id="mCompany" options={COMPANY_OPTIONS} value={values.companyCode} onChange={(v) => onChange({ companyCode: v })} />
              <div className="field-error">{errors.company}</div>
            </div>
            <div className="field">
              <label>
                Transaction Type <span className="req">*</span>
              </label>
              <OptionSelect id="mTxnType" options={TXN_TYPE_OPTIONS} value={values.txnType} onChange={(v) => onChange({ txnType: v })} />
              <div className="field-error">{errors.txnType}</div>
            </div>
            <div className="field">
              <label>
                Business Partner <span className="req">*</span>
              </label>
              <OptionSelect id="mPartner" options={PARTNER_OPTIONS} value={values.partner} onChange={(v) => onChange({ partner: v })} />
              <div className="field-error">{errors.partner}</div>
            </div>
            <div className="field date-shell">
              <label>
                Trade Date <span className="req">*</span>
              </label>
              <DateField id="mTradeDate" className="date-field" value={values.tradeDate} onChange={(v) => onChange({ tradeDate: v })} onPicked={onClearErrors} />
              <div className="field-error">{errors.tradeDate}</div>
            </div>
            <div className="field date-shell">
              <label>
                Value Date <span className="req">*</span>
              </label>
              <DateField id="mValueDate" className="date-field" value={values.valueDate} onChange={(v) => onChange({ valueDate: v })} onPicked={onClearErrors} />
              <div className="field-error">{errors.valueDate}</div>
            </div>
            <div className="field">
              <label>
                Spot Rate <span className="req">*</span>
              </label>
              <input
                id="mRate"
                type="text"
                inputMode="decimal"
                placeholder="Enter spot rate"
                value={values.rate}
                onChange={(e) => {
                  onClearErrors()
                  onChange({ rate: e.target.value })
                }}
              />
              <div className="field-error">{errors.rate}</div>
            </div>
          </div>

          <div className="section-label">Currency Amounts</div>
          <div className="amount-panel">
            <div className="amount-row">
              <div className="amount-side side-buy">Buy</div>
              <div className="amount-curr">{amounts.buyCurr}</div>
              <div className="amount-value">{amounts.buyAmt}</div>
            </div>
            <div className="amount-row">
              <div className="amount-side side-sell">Sell</div>
              <div className="amount-curr">{amounts.sellCurr}</div>
              <div className="amount-value">{amounts.sellAmt}</div>
            </div>
          </div>
          <div className="meta-note">Amounts are derived from the selected difference amount and the entered spot rate.</div>
        </div>
        <div className="modal-footer">
          <button className="btn" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" type="button" onClick={onConfirm}>
            Create Spot
          </button>
        </div>
      </div>
    </div>
  )
}
