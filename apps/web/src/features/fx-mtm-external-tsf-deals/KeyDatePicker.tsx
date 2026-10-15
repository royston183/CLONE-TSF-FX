import { useCallback, useRef, useState } from 'react'
import { DatePopup } from '../../shared/ui/DatePopup.tsx'
import { formatDMY, parseDMY } from './format.ts'

/**
 * The Key Date box with its pop-up calendar (the shared DatePopup).
 */
export function KeyDatePicker({
  value,
  onInput,
  onCommit,
  onPick,
}: {
  value: string
  /** Every keystroke. */
  onInput: (value: string) => void
  /** The typed text was committed (blur after an edit, or Enter): normalise and validate it. */
  onCommit: () => void
  /** A day was chosen in the calendar. */
  onPick: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const dirty = useRef(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])

  return (
    <div ref={wrapRef} className="date-field">
      <input
        id="input-keyDate"
        className="control"
        placeholder="DD-MM-YYYY"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          dirty.current = true
          onInput(e.target.value)
        }}
        onBlur={() => {
          if (!dirty.current) return
          dirty.current = false
          onCommit()
        }}
        onClick={() => {
          if (!open) setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          dirty.current = false
          onCommit()
          setOpen(false)
        }}
      />
      <button type="button" className="date-icon" aria-label="Open calendar" onClick={() => setOpen((o) => !o)}>
        &#128197;
      </button>
      <DatePopup
        open={open}
        anchorRef={wrapRef}
        value={parseDMY(value)}
        title="Key Date"
        onSelect={(d) => {
          dirty.current = false
          setOpen(false)
          onPick(formatDMY(d))
        }}
        onClose={close}
      />
    </div>
  )
}
