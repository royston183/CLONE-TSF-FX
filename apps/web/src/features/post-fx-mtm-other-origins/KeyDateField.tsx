import { useRef } from 'react'
import { DatePopup } from '../../shared/ui/DatePopup.tsx'
import { dateToDmy, isoToDate } from '../../shared/ui/DateInput.tsx'
import { dmyToISO } from './format.ts'

/**
 * The Key Date box with the shared calendar popup. The page owns whether the popup is open so that
 * other panels close when it opens.
 */
export function KeyDateField({
  text,
  error,
  open,
  onOpenChange,
  onType,
  onBlur,
  onEnter,
  onPick,
}: {
  text: string
  error: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onType: (text: string) => void
  onBlur: () => void
  onEnter: () => void
  /** A day was chosen; the argument is its DD-MM-YYYY text. */
  onPick: (text: string) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)

  return (
    <div className={`tb-field f-date${error ? ' has-error' : ''}`} id="field-keyDate">
      <label htmlFor="input-keyDate">
        Key Date<span className="req">*</span>
      </label>
      <div className="date-field" ref={wrapRef}>
        <input
          className="control"
          id="input-keyDate"
          placeholder="DD-MM-YYYY"
          autoComplete="off"
          maxLength={10}
          title="Key Date must be the month end date"
          value={text}
          onChange={(e) => onType(e.target.value)}
          onBlur={(e) => {
            // Moving into the calendar popup is not leaving the field; picking a day commits it.
            const to = e.relatedTarget
            if (to instanceof Element && to.closest('.sdp')) return
            onBlur()
          }}
          onClick={() => {
            if (!open) onOpenChange(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onEnter()
          }}
        />
        <button
          type="button"
          className="date-icon"
          id="btnKeyDateIcon"
          aria-label="Open calendar"
          onClick={() => onOpenChange(!open)}
        >
          &#128197;
        </button>
        {/* The page closes panels on any document click outside `.date-field`; the portal is outside it. */}
        <span style={{ display: 'contents' }} onClick={(e) => e.stopPropagation()}>
          <DatePopup
            open={open}
            anchorRef={wrapRef}
            value={isoToDate(dmyToISO(text) ?? '')}
            title="Key Date"
            onSelect={(d) => onPick(dateToDmy(d))}
            onClose={() => onOpenChange(false)}
          />
        </span>
      </div>
      <div className="tb-error" id="err-keyDate">
        {error}
      </div>
    </div>
  )
}
