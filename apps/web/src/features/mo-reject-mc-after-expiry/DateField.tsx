import { useCallback, useRef, useState } from 'react'
import { DatePopup } from '../../shared/ui/DatePopup.tsx'
import { formatDMY, parseDMY } from './format.ts'

/**
 * A mandatory DD-MM-YYYY box. It opens the shared calendar popup on focus and on the (CSS-hidden)
 * calendar icon.
 */
export function DateField({
  id,
  label,
  value,
  invalid,
  onChange,
}: {
  id: string
  label: string
  value: string
  invalid: boolean
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  // Escape closes the popup and refocuses the input, which would otherwise reopen it.
  const skipFocus = useRef(false)

  const close = useCallback(() => {
    skipFocus.current = true
    setTimeout(() => {
      skipFocus.current = false
    }, 0)
    setOpen(false)
  }, [])

  const openPop = () => {
    if (!skipFocus.current) setOpen(true)
  }

  return (
    <div ref={wrapRef} className="field date-field">
      <label htmlFor={id}>
        {label}
        <span className="req">*</span>
      </label>
      <input
        className={`control${invalid ? ' invalid' : ''}`}
        id={id}
        type="text"
        placeholder="DD-MM-YYYY"
        maxLength={10}
        autoComplete="off"
        value={value}
        onFocus={openPop}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        className="date-icon-btn"
        id={`${id}IconBtn`}
        type="button"
        aria-label="Open calendar"
        onClick={() => setOpen((o) => !o)}
      >
        📅
      </button>
      <DatePopup
        open={open}
        anchorRef={wrapRef}
        value={parseDMY(value)}
        title={label}
        onSelect={(d) => {
          onChange(formatDMY(d))
          setOpen(false)
        }}
        onClose={close}
      />
    </div>
  )
}
