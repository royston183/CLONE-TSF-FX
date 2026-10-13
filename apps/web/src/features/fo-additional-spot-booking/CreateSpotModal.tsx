import { DateField } from './DateField.tsx'
import { fmtAmount, formatDate } from './format.ts'
import { amountsView } from './logic.ts'
import { SPOT_PRODUCT_TYPE, type PersistState, type SpotContext } from './spotCreate.ts'
import type { CodeLabel, CreateFormErrors, CreateFormValues, SpotRow, ValueHelp } from './types.ts'

/** The configuration a Create Spot is built from, read when the popup opens. */
export type ContextState = { state: 'loading' } | { state: 'ok'; ctx: SpotContext } | { state: 'error'; messages: string[] }

/** A Spot SAP has booked whose APP_STR and/or IN_SPOT write is still outstanding: only a retry is offered. */
export type PendingSpot = { transaction: string; companyCode: string; persist: PersistState }

/** The Business Partner drop-down: "Loading…" until it arrives, the reason when it cannot be read. */
function PartnerSelect({
  help,
  value,
  disabled,
  onChange,
}: {
  help: ValueHelp<CodeLabel>
  value: string
  disabled: boolean
  onChange: (v: string) => void
}) {
  const options = help.state === 'ok' ? help.options : []
  const empty = help.state === 'loading' ? 'Loading from SAP…' : help.state === 'error' ? 'Not available' : 'Select ...'
  return (
    <>
      <select id="mPartner" value={value} disabled={disabled || help.state !== 'ok'} onChange={(e) => onChange(e.target.value)}>
        <option value="">{empty}</option>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.key} — {o.text}
          </option>
        ))}
      </select>
      {help.state === 'error' ? <div className="field-error">{help.message}</div> : null}
    </>
  )
}

const stepText = (label: string, state: string): string => (state === 'done' ? `${label}: done` : `${label}: ${state}`)

/**
 * "Create Spot": the legacy #createOverlay. Company Code, Transaction Type and Value Date are shown, not
 * edited: they are derived (SET_SPT / COMP, ZGTCATR_PARAM-PARAM3, the original deal) and are exactly what
 * is sent. Only the Business Partner, Trade Date and Spot Rate change the create.
 */
export function CreateSpotModal({
  row,
  context,
  values,
  partners,
  errors,
  sapErrors,
  pending,
  busy,
  onChange,
  onClearErrors,
  onCancel,
  onConfirm,
  onRetry,
}: {
  row: SpotRow
  context: ContextState
  values: CreateFormValues
  /** SlcTsfBpBank for the Spot's company code. */
  partners: ValueHelp<CodeLabel>
  errors: CreateFormErrors
  /** Why the last Create was refused, one message per line. */
  sapErrors: readonly string[]
  pending: PendingSpot | null
  busy: boolean
  onChange: (patch: Partial<CreateFormValues>) => void
  onClearErrors: () => void
  onCancel: () => void
  onConfirm: () => void
  onRetry: () => void
}) {
  const ctx = context.state === 'ok' ? context.ctx : null
  const rate = Number(String(values.rate).replace(/,/g, ''))
  const amounts = ctx ? amountsView(row, ctx, rate) : null
  const locked = !!pending

  return (
    <div className="overlay" style={{ display: 'flex' }} onClick={(e) => e.target === e.currentTarget && onCancel()}>
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

          {context.state === 'loading' ? <div className="meta-note">Loading the Spot configuration from SAP…</div> : null}
          {context.state === 'error' ? (
            <div className="field-error" role="alert">
              <strong>Spot cannot be created:</strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {context.messages.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {ctx && amounts ? (
            <>
              <div className="section-label">Spot Transaction</div>
              <div className="grid">
                <div className="field">
                  <label>Company Code</label>
                  <input value={ctx.companyCode} type="text" readOnly />
                </div>
                <div className="field">
                  <label>Transaction Type</label>
                  <input value={`${SPOT_PRODUCT_TYPE} ${ctx.txnType}`} type="text" readOnly />
                </div>
                <div className="field">
                  <label>
                    Business Partner <span className="req">*</span>
                  </label>
                  <PartnerSelect help={partners} value={values.partner} disabled={locked} onChange={(v) => onChange({ partner: v })} />
                  <div className="field-error">{errors.partner}</div>
                </div>
                <div className="field date-shell">
                  <label>
                    Trade Date <span className="req">*</span>
                  </label>
                  <DateField id="mTradeDate" className="date-field" value={values.tradeDate} onChange={(v) => onChange({ tradeDate: v })} onPicked={onClearErrors} />
                  <div className="field-error">{errors.tradeDate}</div>
                </div>
                <div className="field">
                  <label>Value Date</label>
                  <input value={formatDate(ctx.valueDate)} type="text" readOnly />
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
                    readOnly={locked}
                    onChange={(e) => {
                      // Rates carry at most four decimals: a keystroke that would add a fifth is ignored.
                      if (!/^[\d,]*\.?\d{0,4}$/.test(e.target.value)) return
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
              <div className="meta-note">
                Difference {fmtAmount(Math.abs(row.diffAmt))} {row.currency}. The other side is derived from the entered spot rate.
              </div>
            </>
          ) : null}

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

          {pending ? (
            <div className="field-error" role="alert">
              <strong>
                Spot {pending.transaction} is booked in SAP (company code {pending.companyCode}) but not fully recorded. Do not create it again — retry.
              </strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                <li>{stepText('APP_STR (status 03)', pending.persist.appStr)}</li>
                <li>{stepText('IN_SPOT (ZSPOT_TXN)', pending.persist.inSpot)}</li>
              </ul>
            </div>
          ) : null}
        </div>
        <div className="modal-footer">
          <button className="btn" type="button" onClick={onCancel} disabled={busy}>
            {pending ? 'Close' : 'Cancel'}
          </button>
          {pending ? (
            <button className="btn btn-primary" type="button" onClick={onRetry} disabled={busy}>
              {busy ? 'Retrying…' : 'Retry saving'}
            </button>
          ) : (
            <button className="btn btn-primary" type="button" onClick={onConfirm} disabled={busy || !ctx}>
              {busy ? 'Creating in SAP…' : 'Create Spot'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
