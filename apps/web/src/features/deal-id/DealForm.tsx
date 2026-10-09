import { formatAmount, formatAmountWhileTyping, fmtNum, parseAmount, toNum, codeText } from '@slc/api-client'
import type { DttkRow, OttkRow } from './types.ts'

export type TicketSummary = {
  tradeValue: number
  currency: string
  assigned: number
  balance: number
}

export function summarise(
  tradeValue: unknown,
  currency: string | undefined,
  assigned: number | undefined,
): TicketSummary {
  const trade = toNum(tradeValue)
  const alreadyAssigned = assigned ?? 0
  return { tradeValue: trade, currency: currency ?? '', assigned: alreadyAssigned, balance: trade - alreadyAssigned }
}

export type DealFormProps = {
  ottkNo: string
  dttkNo: string
  onOttkNoChange: (value: string) => void
  onDttkNoChange: (value: string) => void
  onOttkNoCommit: () => void
  onDttkNoCommit: () => void
  selectedOttk: OttkRow | undefined
  ottkSummary: TicketSummary | undefined
  dttkSummary: TicketSummary | undefined
  amount: string
  onAmountChange: (value: string) => void
  amountInvalid: boolean
  onAmountInvalidChange: (invalid: boolean) => void
  description: string
  onDescriptionChange: (value: string) => void
  status: string
  onStatusChange: (value: string) => void
  onOpenOttkSearch: () => void
  onCreate: () => void
  creating: boolean
}

/**
 * The sidebar, reproducing legacy/Deal ID.html's <aside class="sidebar"> exactly.
 *
 * Derived values stay as real `<input readonly>` elements rather than becoming text: the
 * original's `.field` grid puts a 120px label beside a full-width control, and `.field
 * input[readonly]` gives them their grey fill. Rendering them as spans changes the layout
 * of the whole rail.
 */
export function DealForm(props: DealFormProps) {
  const {
    ottkNo,
    dttkNo,
    onOttkNoChange,
    onDttkNoChange,
    onOttkNoCommit,
    onDttkNoCommit,
    selectedOttk,
    ottkSummary,
    dttkSummary,
    amount,
    onAmountChange,
    amountInvalid,
    onAmountInvalidChange,
    description,
    onDescriptionChange,
    status,
    onStatusChange,
    onOpenOttkSearch,
    onCreate,
    creating,
  } = props

  // Normalised on blur, never on keystroke, so a half-typed "1." or "2.5M" is not rewritten
  // underneath the caret.
  const commitAmount = () => {
    if (!amount.trim()) {
      onAmountInvalidChange(false)
      return
    }
    const parsed = parseAmount(amount)
    if (parsed === null) {
      onAmountInvalidChange(true)
      return
    }
    onAmountInvalidChange(false)
    onAmountChange(formatAmount(parsed))
  }

  const ticketKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      event.currentTarget.blur()
    }
  }

  return (
    <aside className="sidebar">
      <div className="section-title">DTTK Details</div>
      <div className="field">
        <label htmlFor="dttkNo">DTTK No<span className="req">*</span></label>
        <input
          id="dttkNo"
          value={dttkNo}
          placeholder="Type or pick from the grid"
          onChange={(event) => onDttkNoChange(event.target.value)}
          onBlur={onDttkNoCommit}
          onKeyDown={ticketKeyDown}
        />
      </div>
      <div className="field two">
        <label>DTTK Trade Value</label>
        <input className="amount" readOnly value={dttkSummary ? fmtNum(dttkSummary.tradeValue) : ''} />
        <input readOnly value={dttkSummary?.currency ?? ''} />
      </div>
      <div className="field">
        <label>DTTK Assigned</label>
        <input className="amount" readOnly value={dttkSummary ? fmtNum(dttkSummary.assigned) : ''} />
      </div>
      <div className="field">
        <label>DTTK Balance</label>
        <input className="amount" readOnly value={dttkSummary ? fmtNum(dttkSummary.balance) : ''} />
      </div>

      <div className="section-title">OTTK Details</div>
      <div className="field">
        <label htmlFor="ottkNo">OTTK No<span className="req">*</span></label>
        <div className="compound">
          <input
            id="ottkNo"
            value={ottkNo}
            placeholder="Type or search"
            onChange={(event) => onOttkNoChange(event.target.value)}
            onBlur={onOttkNoCommit}
            onKeyDown={ticketKeyDown}
          />
          <button type="button" className="icon-btn" title="Search OTTK" onClick={onOpenOttkSearch}>
            &#128269;
          </button>
        </div>
      </div>
      <div className="field two">
        <label>OTTK Trade Value</label>
        <input className="amount" readOnly value={ottkSummary ? fmtNum(ottkSummary.tradeValue) : ''} />
        <input readOnly value={ottkSummary?.currency ?? ''} />
      </div>
      <div className="field">
        <label>OTTK Assigned</label>
        <input className="amount" readOnly value={ottkSummary ? fmtNum(ottkSummary.assigned) : ''} />
      </div>
      <div className="field">
        <label>OTTK Balance</label>
        <input className="amount" readOnly value={ottkSummary ? fmtNum(ottkSummary.balance) : ''} />
      </div>
      {/* Code and description together for readability; the bare code is taken from the
          loaded row when the Deal ID is submitted, never parsed back out of this text. */}
      <div className="field">
        <label>Entity ID</label>
        <input readOnly value={codeText(selectedOttk?.ZentId, selectedOttk?.ZentDesc)} />
      </div>
      <div className="field">
        <label>Structure</label>
        <input readOnly value={codeText(selectedOttk?.Zstr, selectedOttk?.ZstrText)} />
      </div>

      <div className="section-title">Deal ID Details</div>
      <div className="field two">
        <label htmlFor="dealAmt">Deal ID Amt<span className="req">*</span></label>
        <input
          id="dealAmt"
          className={`amount fs-amount-input${amountInvalid ? ' field-error' : ''}`}
          inputMode="decimal"
          placeholder="e.g. 1.5M"
          title="Type K/M/B/T for thousand/million/billion/trillion, e.g. 2.5M"
          value={amount}
          onChange={(event) => onAmountChange(formatAmountWhileTyping(event.target.value))}
          onBlur={commitAmount}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              event.currentTarget.blur()
            }
          }}
        />
        <input readOnly title="Defaults to the selected OTTK's currency" value={ottkSummary?.currency ?? ''} />
      </div>
      <div className="field">
        <label htmlFor="dealDesc">Deal ID Desc</label>
        <input
          id="dealDesc"
          maxLength={40}
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="dealStat">Status</label>
        <input
          id="dealStat"
          placeholder="e.g. 01"
          maxLength={2}
          value={status}
          onChange={(event) => onStatusChange(event.target.value)}
        />
      </div>

      <button type="button" className="btn primary create-btn" disabled={creating} onClick={onCreate}>
        Create Deal ID
      </button>
    </aside>
  )
}
