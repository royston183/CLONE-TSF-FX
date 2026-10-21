import { useState } from 'react'
import { dmyFromIso, isoFromDmy } from '../../shared/fx/sap.ts'
import { DateField } from './DateField.tsx'
import { formatAmount, limitOverlaps, parseLimitAmount } from './logic.ts'
import type { Limit, RawLimit } from './types.ts'

export type SetLimitRequest =
  | { mode: 'initial'; pair: string; startDt: string; endDt: string; year: number; amount: number }
  | { mode: 'additional'; row: Limit; amount: number }

/** Lead currency of a pair (ZSGTRMFM_LEAD_CURR). Every offered pair has a USD leg and limits are in USD. */
export const leadCurrency = (pair: string): string => (pair ? 'USD' : '')

type Errors = { amount?: string | undefined; pair?: string | undefined; dates?: string | undefined }

/** Popup of screen 9001: Set Initial Limit / Set Additional Limit. */
export function SetLimitModal({
  mode,
  row,
  pairs,
  limits,
  busy,
  onClose,
  onSubmit,
}: {
  mode: 'initial' | 'additional'
  row: Limit | null
  pairs: readonly string[]
  limits: readonly RawLimit[]
  busy: boolean
  onClose: () => void
  onSubmit: (request: SetLimitRequest) => void
}) {
  const isAdd = mode === 'additional' && !!row
  const [amount, setAmount] = useState('')
  const [pair, setPair] = useState(isAdd ? row.pair : '')
  const [start, setStart] = useState(isAdd ? dmyFromIso(row.startDt) : '')
  const [end, setEnd] = useState(isAdd ? dmyFromIso(row.endDt) : '')
  const [errors, setErrors] = useState<Errors>({})

  const startIso = isoFromDmy(start)
  const endIso = isoFromDmy(end)
  const year = isAdd ? String(row.year) : startIso && endIso ? startIso.slice(0, 4) : ''

  const submit = () => {
    const next: Errors = {}
    const value = parseLimitAmount(amount)
    if (amount.trim() === '') next.amount = 'Limit amount is required.'
    else if (Number.isNaN(value) || value <= 0) next.amount = 'Enter a valid amount, e.g. 5,000,000 or 5M.'
    if (!isAdd) {
      if (!pair) next.pair = 'Select a currency pair.'
      if (!start.trim() || !end.trim()) next.dates = 'Start and end date are required.'
      else if (!startIso || !endIso) next.dates = 'Enter valid dates in the format dd-mm-yyyy.'
      else if (startIso.slice(0, 4) !== endIso.slice(0, 4)) next.dates = 'Start and end date must be in the same year.'
      else if (endIso < startIso) next.dates = 'End date cannot be before the start date.'
      else if (pair && limitOverlaps(limits, leadCurrency(pair), Number(startIso.slice(0, 4)), startIso, endIso)) next.dates = 'A limit already exists for an overlapping period of this year.'
    }
    setErrors(next)
    if (next.amount || next.pair || next.dates) return
    if (isAdd) onSubmit({ mode: 'additional', row, amount: value })
    else onSubmit({ mode: 'initial', pair, startDt: startIso ?? '', endDt: endIso ?? '', year: Number((startIso ?? '').slice(0, 4)), amount: value })
  }

  const currency = isAdd ? row.curr : pair ? leadCurrency(pair) : '—'

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal m-set" role="dialog" aria-modal="true" aria-labelledby="setLimitTitle">
        <div className="modal-head-row">
          <h2 id="setLimitTitle">{isAdd ? 'Set Additional Limit' : 'Set Initial Limit'}</h2>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="modal-body-scroll">
          {isAdd && (
            <div className="ctx-box">
              <span>Initial approved limit</span>
              <b>
                {formatAmount(row.zini)} {row.curr}
              </b>
              <span>Total approved limit</span>
              <b>
                {formatAmount(row.zad)} {row.curr}
              </b>
            </div>
          )}
          <div className="form-stack">
            <div className={`field${errors.amount ? ' has-error' : ''}`}>
              <label htmlFor="slAmount">
                Limit Amount<span className="req">*</span>
              </label>
              <div className="input-with-suffix">
                <input
                  className="control"
                  id="slAmount"
                  placeholder="e.g. 5,000,000 or 5M"
                  autoComplete="off"
                  autoFocus={isAdd}
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value)
                    setErrors((x) => ({ ...x, amount: undefined }))
                  }}
                  onBlur={() => {
                    const v = parseLimitAmount(amount)
                    if (!Number.isNaN(v) && amount.trim() !== '') setAmount(formatAmount(v))
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                />
                <span className="suffix">{currency}</span>
              </div>
              <span className="error-msg">{errors.amount}</span>
            </div>
            <div className="form-two">
              <div className={`field${errors.pair ? ' has-error' : ''}`}>
                <label htmlFor="slPair">
                  Currency Pair<span className="req">*</span>
                </label>
                <select
                  className="control"
                  id="slPair"
                  value={pair}
                  disabled={isAdd}
                  autoFocus={!isAdd}
                  onChange={(e) => {
                    setPair(e.target.value)
                    setErrors((x) => ({ ...x, pair: undefined }))
                  }}
                >
                  <option value="">{pairs.length ? 'Select pair ...' : 'No currency pairs available'}</option>
                  {pairs.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <span className="error-msg">{errors.pair}</span>
              </div>
              <div className="field">
                <label htmlFor="slYear">Limit Year</label>
                <input className="control" id="slYear" readOnly placeholder="Auto" value={year} />
              </div>
            </div>
            <div>
              <div className="range-row">
                <div className={`field${errors.dates ? ' has-error' : ''}`}>
                  <label>
                    Validity Period<span className="req">*</span>
                  </label>
                  <DateField
                    label="Start date"
                    value={start}
                    readOnly={isAdd}
                    onChange={(v) => {
                      setStart(v)
                      setErrors((x) => ({ ...x, dates: undefined }))
                    }}
                  />
                </div>
                <span className="to">To</span>
                <div className={`field${errors.dates ? ' has-error' : ''}`}>
                  <label style={{ visibility: 'hidden' }}>End</label>
                  <DateField
                    label="End date"
                    value={end}
                    readOnly={isAdd}
                    onChange={(v) => {
                      setEnd(v)
                      setErrors((x) => ({ ...x, dates: undefined }))
                    }}
                  />
                </div>
              </div>
              {errors.dates && (
                <div className="field has-error" style={{ marginTop: 4 }}>
                  <span className="error-msg">{errors.dates}</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" type="button" disabled={busy} onClick={submit}>
            {busy ? 'Saving…' : 'Set'}
          </button>
        </div>
      </div>
    </div>
  )
}
