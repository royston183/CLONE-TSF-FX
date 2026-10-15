import { useCallback, useRef, useState } from 'react'
import { DatePopup } from '../../shared/ui/DatePopup.tsx'
import { dateToISO, formatDMY, parseDMY } from './format.ts'
import { typedDateOnCommit, typedDateOnInput } from './logic.ts'

/**
 * The Key Date box (#field-keyDate): a dd-mm-yyyy text input with the shared calendar pop-up.
 * Typed text is applied as soon as it is a complete valid date; on blur / Enter an invalid
 * text shows the error state.
 */
export function DateField({
  text,
  error,
  onText,
  onError,
  onCommit,
}: {
  /** The input's text. */
  text: string
  error: boolean
  onText: (text: string) => void
  onError: (error: boolean) => void
  /** The applied Key Date as ISO, or '' when cleared. */
  onCommit: (iso: string) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])

  const onInput = (value: string) => {
    onText(value)
    const r = typedDateOnInput(value)
    if (r.kind === 'clear') {
      onError(false)
      onCommit('')
    } else if (r.kind === 'commit') {
      onError(false)
      onCommit(r.iso)
    }
  }

  const commitTyped = () => {
    const r = typedDateOnCommit(text)
    if (r.kind === 'clear') {
      onError(false)
      onCommit('')
    } else if (r.kind === 'commit') {
      onText(r.text)
      onError(false)
      onCommit(r.iso)
    } else if (r.kind === 'error') {
      onError(true)
    }
  }

  const pick = (picked: Date) => {
    onText(formatDMY(picked))
    onError(false)
    setOpen(false)
    onCommit(dateToISO(picked))
  }

  return (
    <div className={`tb-field${error ? ' has-error' : ''}`} id="field-keyDate">
      <div ref={wrapRef} className="date-field">
        <input
          className="control"
          id="input-keyDate"
          placeholder="Key Date"
          maxLength={10}
          autoComplete="off"
          aria-label="Key Date"
          title="Key Date (dd-mm-yyyy) — deals whose maturity date equals this date"
          value={text}
          onChange={(e) => onInput(e.target.value)}
          onClick={() => {
            if (!open) setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close()
            if (e.key === 'Enter') {
              commitTyped()
              close()
            }
          }}
          onBlur={commitTyped}
        />
        <button
          type="button"
          className="date-icon"
          data-target="keyDate"
          aria-label="Open calendar"
          onClick={(e) => {
            e.stopPropagation()
            setOpen((o) => !o)
          }}
        >
          &#128197;
        </button>
        <DatePopup open={open} anchorRef={wrapRef} value={parseDMY(text)} title="Key Date" onSelect={pick} onClose={close} />
      </div>
      <div className="tb-error" id="error-keyDate">
        Enter a valid date (dd-mm-yyyy)
      </div>
    </div>
  )
}
