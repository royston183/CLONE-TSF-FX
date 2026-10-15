import { DateField } from './DateField.tsx'
import { fmtDate, parseUiDate } from './format.ts'

/** Blotter date uses the same month/year calendar as the creation forms. */
export function ContextDatePicker({ date, onPick }: { date: Date; onPick: (d: Date) => void }) {
  return <div className="context-field tight">
    <label htmlFor="ctx-date">Blotter Date (Today)</label>
    <DateField id="ctx-date" label="Blotter Date" value={fmtDate(date)} onCommit={(text) => {
      const picked = parseUiDate(text)
      if (picked) onPick(picked)
    }} />
  </div>
}
