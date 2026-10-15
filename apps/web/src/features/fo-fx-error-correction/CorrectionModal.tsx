import { ACCOUNT_CATS, BUSINESS_AREAS, MODE_OF_TRADE, PARTNERS, STATUS, STATUS_SHORT, acctCatDesc } from './data.ts'
import { DatePicker } from './DatePicker.tsx'
import { fmtDate, fmtNum, fmtRate, parseAmountShorthand, parseRate } from './format.ts'
import { isActionable } from './logic.ts'
import { Overlay, type Modal } from './modal.tsx'
import type { CorrectionForm, PickerId, Txn } from './types.ts'

/** The popup's pickers carry the emoji glyph and stretch across the New Details column. */
const DP_ICON = '📅'
const DP_INPUT_STYLE = { width: '100%' }

/**
 * FX Error Correction. Mirrors the SAP "Old Details / New Details" popup: Business Partner,
 * All-in/Swap/Spot Rate, Amount 1/2, Value Date, Business Area, Profit Center, Account Cat,
 * Mode Of Trade, Master Contract, Deal ID, Trade Date and Blotter Date. Old Details are the
 * values as booked; New Details start from them. A transaction that is no longer Correction
 * Required opens read-only ("View FX Transaction").
 */
export function CorrectionModal({
  modal,
  txn,
  form,
  openPicker,
  onPickerChange,
  onChange,
  onAmountBlur,
  onRateBlur,
  onBusinessAreaChange,
  onUpdate,
  onReverseInstead,
}: {
  modal: Modal
  /** The transaction as it was when the popup opened. */
  txn: Txn | null
  form: CorrectionForm
  openPicker: PickerId | null
  onPickerChange: (id: PickerId | null) => void
  onChange: (patch: Partial<CorrectionForm>) => void
  onAmountBlur: () => void
  onRateBlur: (key: 'allInRate' | 'swapRate' | 'spotRate') => void
  onBusinessAreaChange: (busArea: string) => void
  onUpdate: () => void
  onReverseInstead: () => void
}) {
  const editable = txn ? isActionable(txn) : false
  /** A live row: the fields SAP has no home for are shown, never editable. */
  const live = !!txn?.live
  /** SAP only takes Amount 1 when it is the amount bought. */
  const amountEditable = editable && (!live || !!txn?.buysLead)
  const amount2Editable = editable && live && !txn?.buysLead
  const notInSap = (v: string) => (live && !v ? 'Not held in SAP' : v)

  const picker = (id: PickerId, key: 'valueDate' | 'tradeDate' | 'blotterDate') => (
    <DatePicker
      id={id}
      value={form[key]}
      open={openPicker === id}
      onOpenChange={(o) => onPickerChange(o ? id : null)}
      onPick={(v) => onChange({ [key]: v })}
      icon={DP_ICON}
      inputStyle={DP_INPUT_STYLE}
      disabled={!editable}
    />
  )

  const rate = (id: string, key: 'allInRate' | 'swapRate' | 'spotRate') => (
    <input
      id={id}
      type="text"
      value={form[key]}
      disabled={!editable}
      // Rates take at most four decimal places; a fifth is simply not accepted.
      onChange={(e) => {
        if (!/\.\d{5,}/.test(e.target.value)) onChange({ [key]: e.target.value })
      }}
      onBlur={() => onRateBlur(key)}
    />
  )

  return (
    <Overlay id="correct-overlay" modal={modal}>
      <div className="modal-card" style={{ maxWidth: 'min(880px, calc(100vw - 40px))' }}>
        <div className="modal-header">
          <div className="modal-header-text">
            <div className="modal-title" id="correct-title">
              {editable ? 'FX Error Correction' : 'View FX Transaction'}
            </div>
            <div className="modal-subtitle" id="correct-subtitle">
              {txn ? `Deal ${txn.dealId} – ${txn.dealIdDesc}` : null}
            </div>
          </div>
          <button className="modal-close" onClick={modal.close} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div id="correct-remark-banner">{txn ? <RemarkBanner txn={txn} /> : null}</div>

          <div className="field-grid" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))', marginBottom: 10 }}>
            <div className="filter-field">
              <label>Company Code</label>
              <input
                id="ec-cocode-display"
                type="text"
                className="readonly-input"
                disabled
                readOnly
                value={txn ? `${txn.coCode} - ${txn.companyName}` : ''}
              />
            </div>
            <div className="filter-field">
              <label>Transaction No</label>
              <input id="ec-txn-display" type="text" className="readonly-input" disabled readOnly value={txn?.rfha ?? ''} />
            </div>
          </div>

          <div className="section-label">FX Structure</div>
          <div className="oldnew-grid">
            <div className="oldnew-col">
              <div className="oldnew-head">Old Details</div>
              <Old id="old-partner" label="Business Partner" value={txn ? (txn.partnerName ? `${txn.partnerCode} - ${txn.partnerName}` : txn.partnerCode) : ''} />
              <Old id="old-allinrate" label="All in Rate" value={txn ? fmtRate(txn.allInRate) : ''} />
              <Old id="old-swaprate" label="Swap Rate" value={txn ? fmtRate(txn.swapRate) : ''} />
              <Old id="old-spotrate" label="Spot Rate" value={txn ? fmtRate(txn.spotRate) : ''} />
              <Old id="old-amount1" label={`Amount 1 (${txn?.buySell1 ?? ''})`} value={txn ? `${txn.ccy1} ${fmtNum(txn.amt1)}` : ''} />
              <Old id="old-amount2" label={`Amount 2 (${txn?.buySell2 ?? ''})`} value={txn ? `${txn.ccy2} ${fmtNum(txn.amt2)}` : ''} />
              <Old id="old-valuedate" label="Value Date" value={txn ? fmtDate(txn.valueDate) : ''} />
              <Old id="old-busarea" label="Business Area" value={txn ? notInSap(txn.busArea ? `${txn.busArea} - ${txn.busAreaDesc}` : '') : ''} />
              <Old id="old-profitcenter" label="Profit Center" value={notInSap(txn?.profitCenterDesc ?? '')} />
              <Old id="old-acctcat" label="Account Cat" value={txn ? notInSap(txn.acctCat ? `${txn.acctCat} - ${acctCatDesc(txn.acctCat) ?? ''}` : '') : ''} />
              <Old id="old-modeoftrade" label="Mode Of Trade" value={notInSap(txn?.modeOfTrade ?? '')} />
              <Old id="old-mc" label="Master Contract" value={notInSap(txn?.mc ?? '')} />
              <Old id="old-dealid" label="Deal ID" value={notInSap(txn?.dealId ?? '')} />
              <Old id="old-tradedate" label="Trade Date" value={txn ? fmtDate(txn.tradeDate) : ''} />
              <Old id="old-blotterdate" label="Blotter Date" value={txn?.blotterDate ? fmtDate(txn.blotterDate) : notInSap('')} />
            </div>
            <div className="oldnew-col">
              <div className="oldnew-head new">New Details</div>
              <div className="oldnew-row">
                <label>Business Partner</label>
                {live ? (
                  <input id="new-partner" className="readonly-input" disabled readOnly value={txn?.partnerName ? `${txn.partnerCode} - ${txn.partnerName}` : (txn?.partnerCode ?? '')} />
                ) : (
                  <select id="new-partner" value={form.partner} disabled={!editable} onChange={(e) => onChange({ partner: e.target.value })}>
                    {PARTNERS.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.code} - {p.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="oldnew-row">
                <label htmlFor="new-allinrate">All in Rate</label>
                {rate('new-allinrate', 'allInRate')}
              </div>
              <div className="oldnew-row">
                <label htmlFor="new-swaprate">Swap Rate</label>
                {rate('new-swaprate', 'swapRate')}
              </div>
              <div className="oldnew-row">
                <label htmlFor="new-spotrate">Spot Rate</label>
                {rate('new-spotrate', 'spotRate')}
              </div>
              <div className="oldnew-row">
                <label htmlFor="new-amount1">Amount 1 ({txn?.ccy1})</label>
                <input
                  id="new-amount1"
                  type="text"
                  value={form.amount1}
                  disabled={!amountEditable}
                  onChange={(e) => onChange({ amount1: e.target.value })}
                  onBlur={onAmountBlur}
                />
              </div>
              <div className="oldnew-row">
                <label htmlFor="new-amount2">
                  Amount 2 ({txn?.ccy2}){' '}
                  <span className="hint" style={{ fontWeight: 400 }}>
                    {amount2Editable ? '' : '(derived)'}
                  </span>
                </label>
                <input id="new-amount2" className={amount2Editable ? undefined : 'readonly-input'} disabled={!amount2Editable} readOnly={!amount2Editable} value={form.amount2}
                  onChange={(e) => onChange({ amount2: e.target.value })}
                  onBlur={() => {
                    if (!amount2Editable) return
                    const amount = parseAmountShorthand(form.amount2)
                    const exchangeRate = parseRate(form.allInRate)
                    onChange({ amount2: fmtNum(amount), ...(exchangeRate > 0 ? { amount1: fmtNum(amount / exchangeRate) } : {}) })
                  }} />
              </div>
              <div className="oldnew-row">
                <label>Value Date</label>
                {picker('new-valuedate', 'valueDate')}
              </div>
              <div className="oldnew-row">
                <label>Business Area</label>
                {live ? (
                  <input id="new-busarea" className="readonly-input" disabled readOnly value={notInSap('')} />
                ) : (
                  <select id="new-busarea" value={form.busArea} disabled={!editable} onChange={(e) => onBusinessAreaChange(e.target.value)}>
                    {BUSINESS_AREAS.map((b) => (
                      <option key={b.code} value={b.code}>
                        {b.code} - {b.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="oldnew-row">
                <label>
                  Profit Center{' '}
                  <span className="hint" style={{ fontWeight: 400 }}>
                    (derived)
                  </span>
                </label>
                <input id="new-profitcenter" className="readonly-input" disabled readOnly value={live ? notInSap('') : form.profitCenter} />
              </div>
              <div className="oldnew-row">
                <label>Account Cat</label>
                {live ? (
                  <input id="new-acctcat" className="readonly-input" disabled readOnly value={notInSap('')} />
                ) : (
                  <select id="new-acctcat" value={form.acctCat} disabled={!editable} onChange={(e) => onChange({ acctCat: e.target.value })}>
                    {ACCOUNT_CATS.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.code} - {a.desc}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="oldnew-row">
                <label>Mode Of Trade</label>
                {live ? (
                  <input id="new-modeoftrade" className="readonly-input" disabled readOnly value={notInSap('')} />
                ) : (
                  <select
                    id="new-modeoftrade"
                    value={form.modeOfTrade}
                    disabled={!editable}
                    onChange={(e) => onChange({ modeOfTrade: e.target.value })}
                  >
                    {MODE_OF_TRADE.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="oldnew-row">
                <label>Master Contract</label>
                <input
                  id="new-mc"
                  type="text"
                  className={live ? 'readonly-input' : undefined}
                  value={live ? notInSap(form.mc) : form.mc}
                  disabled={!editable || live}
                  onChange={(e) => onChange({ mc: e.target.value })}
                />
              </div>
              <div className="oldnew-row">
                <label>Deal ID</label>
                <input
                  id="new-dealid"
                  type="text"
                  className={live ? 'readonly-input' : undefined}
                  value={live ? notInSap(form.dealId) : form.dealId}
                  disabled={!editable || live}
                  onChange={(e) => onChange({ dealId: e.target.value })}
                />
              </div>
              <div className="oldnew-row">
                <label>Trade Date</label>
                {picker('new-tradedate', 'tradeDate')}
              </div>
              <div className="oldnew-row">
                <label>Blotter Date</label>
                {picker('new-blotterdate', 'blotterDate')}
              </div>
            </div>
          </div>
          {live ? (
            <div className="hint" style={{ marginTop: 10 }}>
              Edit the rates, bought amount ({txn?.buysLead ? 'Amount 1' : 'Amount 2'}), Value Date, Trade Date and Blotter Date.
              SAP calculates the opposite amount when saved. Other transaction attributes remain read-only.
            </div>
          ) : null}
          <div className="hint" style={{ marginTop: 10 }}>
            Tip: type a shorthand amount like <kbd>5M</kbd> (5 million) or <kbd>250T</kbd> (250 thousand) in the editable amount field.
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel" onClick={modal.close} id="ec-cancel-btn">
            {editable ? 'Cancel' : 'Close'}
          </button>
          <button
            className="btn-confirm is-reject"
            id="ec-reverse-btn"
            style={editable ? undefined : { display: 'none' }}
            onClick={onReverseInstead}
          >
            Reverse Instead
          </button>
          <button className="btn-confirm" id="ec-submit-btn" style={editable ? undefined : { display: 'none' }} onClick={onUpdate}>
            Update
          </button>
        </div>
      </div>
    </Overlay>
  )
}

/** Why the transaction is here (Correction Required), or why it can no longer be changed. */
function RemarkBanner({ txn }: { txn: Txn }) {
  if (isActionable(txn)) {
    return (
      <div className="mo-remark-banner">
        <strong>MO Remark:</strong> {txn.moRemark}
      </div>
    )
  }
  if (txn.status === STATUS.REVERSED) {
    return (
      <div className="reversed-banner">
        <strong>Reversed.</strong> Original MO Remark: {txn.moRemark}
      </div>
    )
  }
  return (
    <div className="locked-banner">
      <strong>Read-only:</strong> this transaction is already <strong>{STATUS_SHORT[txn.status]}</strong>.
      <br />
      <strong>Original MO Remark:</strong> {txn.moRemark}
    </div>
  )
}

/** One read-only Old Details row. */
function Old({ id, label, value }: { id: string; label: string; value: string }) {
  return (
    <div className="oldnew-row">
      <label>{label}</label>
      <input id={id} className="readonly-input" disabled readOnly value={value} />
    </div>
  )
}
