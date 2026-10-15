const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * The month and year drop-downs of a calendar header. Native selects, so SelectSearch gives
 * the month list its search box. `onChange` receives the new year and zero-based month.
 */
export function CalendarSelects({
  year,
  month,
  onChange,
}: {
  year: number
  month: number
  onChange: (year: number, month: number) => void
}) {
  const years = Array.from({ length: 21 }, (_, i) => year - 10 + i)
  return (
    <span className="oc-selects">
      <select className="oc-select oc-month" aria-label="Month" value={month} onChange={(e) => onChange(year, Number(e.target.value))}>
        {MONTHS.map((m, i) => (
          <option key={m} value={i}>
            {m}
          </option>
        ))}
      </select>
      <select className="oc-select oc-year" aria-label="Year" value={year} onChange={(e) => onChange(Number(e.target.value), month)}>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </span>
  )
}
