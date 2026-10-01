import { DateField } from './DateField.tsx'
import { recalcAmounts } from './logic.ts'
import type { CodeLabel, CreateFormErrors, CreateFormValues, SpotRow, TxnTypeOption, ValueHelp } from './types.ts'

/** A drop-down read from SAP: "Loading…" until it arrives, SAP's reason when it cannot be read. */
function OptionSelect({
  id,
  help,
  value,
  onChange,
}: {
  id: string
  /** A transaction type shows its product type in front of the code: "12A 600 — Spot". */
  help: ValueHelp<CodeLabel> | ValueHelp<TxnTypeOption>
  value: string
  onChange: (v: string) => void
}) {
  const options: readonly (CodeLabel | TxnTypeOption)[] = help.state === 'ok' ? help.options : []
  const empty = help.state === 'loading' ? 'Loading from SAP…' : help.state === 'error' ? 'Not available' : 'Select ...'
  return (
    <>
    <select id={id} value={value} disabled={help.state !== 'ok'} onChange={(e) => onChange(e.target.value)}>
      <option value="">{empty}</option>
      {options.map((o) => (
        <option key={o.key} value={o.key}>
          {'productType' in o ? `${o.productType} ` : ''}
          {o.key} — {o.text}
        </option>
      ))}
    </select>
    {help.state === 'error' ? <div className="field-error">{help.message}</div> : null}
    </>
  )
}

/** "Create Spot": the legacy #createOverlay, company/partner/dates for the picked row and the buy/sell split its rate implies. */
export function CreateSpotModal({
  row,
  values,
  companies,
  txnTypes,
  partners,
  errors,
  sapErrors,
  busy,
  onChange,
  onClearErrors,
  onCancel,
  onConfirm,
}: {
  row: SpotRow
  values: CreateFormValues
  /** API_COMPANYCODE_SRV, limited to the TSF entities. */
  companies: ValueHelp<CodeLabel>
  /** ZFS_SB_TRMMASTER TransactionType under 12A / 12B. */
  txnTypes: ValueHelp<TxnTypeOption>
  /** SlcTsfBpBank for the picked company code. */
  partners: ValueHelp<CodeLabel>
  errors: CreateFormErrors
  /** Why SAP refused the last Create, one BAPI message per line. */
  sapErrors: readonly string[]
  busy: boolean
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
              <OptionSelect id="mCompany" help={companies} value={values.companyCode} onChange={(v) => onChange({ companyCode: v, partner: '' })} />
              <div className="field-error">{errors.company}</div>
            </div>
            <div className="field">
              <label>
                Transaction Type <span className="req">*</span>
              </label>
              <OptionSelect id="mTxnType" help={txnTypes} value={values.txnType} onChange={(v) => onChange({ txnType: v })} />
              <div className="field-error">{errors.txnType}</div>
            </div>
            <div className="field">
              <label>
                Business Partner <span className="req">*</span>
              </label>
              <OptionSelect id="mPartner" help={partners} value={values.partner} onChange={(v) => onChange({ partner: v })} />
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
          {sapErrors.length ? (
            <div className="field-error" role="alert">
              <strong>SAP did not create the spot:</strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {sapErrors.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <div className="modal-footer">
          <button className="btn" type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" type="button" onClick={onConfirm} disabled={busy}>
            {busy ? 'Creating in SAP…' : 'Create Spot'}
          </button>
        </div>
      </div>
    </div>
  )
}
