import { useCallback, useRef } from 'react'
import { DatePopup } from '../../shared/ui/DatePopup.tsx'
import { formatDMY, parseDMY } from './format.ts'

/**
 * The Key Date box with the shared pop-up calendar. It opens on focus or from the calendar
 * button and closes on an outside click or Escape; the parent owns `open`.
 */
export function KeyDateField({
  value,
  invalid,
  error,
  open,
  onOpenChange,
  onType,
  onBlur,
  onEnter,
  onPick,
}: {
  value: string
  invalid: boolean
  error: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onType: (raw: string) => void
  onBlur: () => void
  onEnter: () => void
  /** A day was chosen from the calendar; the text is DD-MM-YYYY. */
  onPick: (dmy: string) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  // Escape closes the popup and refocuses the input, which would otherwise reopen it.
  const skipFocus = useRef(false)

  const close = useCallback(() => {
    skipFocus.current = true
    setTimeout(() => {
      skipFocus.current = false
    }, 0)
    onOpenChange(false)
  }, [onOpenChange])

  return (
    <div ref={wrapRef} className="field date-field">
      <label htmlFor="keyDateInput">
        Key Date<span className="req">*</span>
      </label>
      <input
        className={`control${invalid ? ' invalid' : ''}`}
        id="keyDateInput"
        type="text"
        placeholder="DD-MM-YYYY"
        maxLength={10}
        autoComplete="off"
        value={value}
        onChange={(e) => onType(e.target.value)}
        onFocus={() => {
          if (!skipFocus.current) onOpenChange(true)
        }}
        onBlur={(e) => {
          // Moving into the calendar popup is not leaving the field; picking a day commits it.
          const to = e.relatedTarget
          if (to instanceof Element && to.closest('.sdp')) return
          onBlur()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter()
        }}
      />
      <button className="date-icon-btn" type="button" aria-label="Open calendar" onClick={() => onOpenChange(!open)}>
        📅
      </button>
      <DatePopup
        open={open}
        anchorRef={wrapRef}
        value={parseDMY(value)}
        title="Key Date"
        onSelect={(d) => {
          onOpenChange(false)
          onPick(formatDMY(d))
        }}
        onClose={close}
      />
      <span className={`field-error${invalid ? ' show' : ''}`} id="keyDateError">
        {error}
      </span>
    </div>
  )
}
