import { DateInput } from '../../shared/ui/DateInput.tsx'
import { toDisplayDate } from './dates.ts'

export type DateFieldProps = {
  id: string
  /** The draft value, always ISO. */
  iso: string
  disabled?: boolean | undefined
  readOnly?: boolean | undefined
  title?: string | undefined
  onChange: (iso: string) => void
}

/**
 * The date control: a DD-MM-YYYY text box with a calendar button beside it, inside
 * `.date-field-wrap`. Editable fields use the shared DateInput (typed DD-MM-YYYY committed on
 * blur / Enter, or picked on the shared calendar); the value stays ISO. A read-only field just
 * shows the date with a disabled button.
 */
export function DateField({ id, iso, disabled, readOnly, title, onChange }: DateFieldProps) {
  if (readOnly) {
    return (
      <div className="date-field-wrap">
        <input type="text" id={id} placeholder="DD-MM-YYYY" value={toDisplayDate(iso)} disabled={disabled} readOnly title={title} />
        <button type="button" className="date-cal-btn" aria-label="Open calendar" disabled>
          {'\u{1F4C5}'}
        </button>
      </div>
    )
  }
  return (
    <div className="date-field-wrap">
      <DateInput id={id} value={iso} disabled={disabled ?? false} title={title} aria-label={title ?? 'Date'} onChange={onChange} />
    </div>
  )
}
