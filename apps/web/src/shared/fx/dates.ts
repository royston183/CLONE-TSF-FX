/** The same calendar day one month earlier, clamped to that month's last day (31-03 → 28/29-02). */
export function oneMonthBefore(date: Date): Date {
  let y = date.getFullYear()
  let prevMonth = date.getMonth() - 1
  if (prevMonth < 0) {
    prevMonth = 11
    y--
  }
  const lastDay = new Date(y, prevMonth + 1, 0).getDate()
  return new Date(y, prevMonth, Math.min(date.getDate(), lastDay))
}

/** The earliest date an MC Date may take: one calendar month before `today` (midnight). */
export function earliestMcDate(today: Date = new Date()): Date {
  return oneMonthBefore(new Date(today.getFullYear(), today.getMonth(), today.getDate()))
}
