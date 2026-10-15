import { useCallback, useRef, useState } from 'react'
import { DatePopup } from '../../shared/ui/DatePopup.tsx'
import { formatDMY, parseDMY } from './format.ts'
import { ERR_KEY_REQUIRED } from './logic.ts'

type Props = {
  text: string
  /** The inline error text, or null; any text turns the field red. */
  error: string | null
  onTyping: (text: string) => void
  /** Validate the text: on leaving the box with something in it, and after a calendar pick. */
  onCommit: (text: string) => void
  onEnter: () => void
}

/**
 * Key Date field: a dd-mm-yyyy box with the shared calendar popup. The popup closes on an outside
 * click or Escape.
 */
export function KeyDateField({ text, error, onTyping, onCommit, onEnter }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])

  return (
    <div className={`field f-date${error ? ' has-error' : ''}`} id="field-keyDate">
      <label htmlFor="input-keyDate">
        Key Date<span className="req">*</span>
      </label>
      <div className="date-field" ref={wrapRef}>
        <input
          className="control"
          id="input-keyDate"
          placeholder="DD-MM-YYYY"
          autoComplete="off"
          value={text}
          onChange={(e) => onTyping(e.target.value)}
          onClick={() => setOpen(true)}
          onBlur={(e) => {
            // Moving into the calendar popup is not leaving the field; picking a day commits it.
            const to = e.relatedTarget
            if (to instanceof Element && to.closest('.sdp')) return
            if (text.trim()) onCommit(text)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onEnter()
          }}
        />
        <button type="button" className="date-icon" aria-label="Open calendar" onClick={() => setOpen((o) => !o)}>
          📅
        </button>
        <DatePopup
          open={open}
          anchorRef={wrapRef}
          value={parseDMY(text)}
          title="Key Date"
          onSelect={(d) => {
            const picked = formatDMY(d)
            setOpen(false)
            onTyping(picked)
            onCommit(picked)
          }}
          onClose={close}
        />
      </div>
      <div className="hint" id="hint-keyDate">
        Key Date is the Month End Date
      </div>
      <div className="error-msg" id="err-keyDate">
        {error ?? ERR_KEY_REQUIRED}
      </div>
    </div>
  )
}
