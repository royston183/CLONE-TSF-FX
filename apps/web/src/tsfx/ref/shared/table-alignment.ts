/** Keep imported table headings aligned with their value cells after async reads or layout changes. */
export function watchReferenceTables(root: HTMLElement | null): () => void {
  if (!root) return () => undefined
  let frame = 0
  const align = () => {
    frame = 0
    for (const table of root.querySelectorAll<HTMLTableElement>('table')) {
      const headings = [...(table.tHead?.rows.item((table.tHead?.rows.length ?? 1) - 1)?.cells ?? [])]
      const row = [...table.tBodies].flatMap(body => [...body.rows]).find(candidate =>
        candidate.cells.length === headings.length && [...candidate.cells].every(cell => cell.colSpan === 1))
      if (!row) continue
      headings.forEach((heading, index) => {
        const cell = row.cells[index]
        const control = cell.querySelector<HTMLInputElement>('input:not([type=checkbox]):not([type=radio]),textarea')
        const value = getComputedStyle(control ?? cell).textAlign
        const alignment = cell.querySelector('input[type=checkbox]') ? 'center' : value === 'right' || value === 'end' ? 'right' : value === 'center' ? 'center' : 'left'
        heading.dataset.refAlign = alignment
      })
    }
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(align) }
  const observer = new MutationObserver(schedule)
  // Header attributes are deliberately excluded, so applying alignment cannot retrigger the observer.
  observer.observe(root, { childList: true, subtree: true, characterData: true })
  align()
  return () => { observer.disconnect(); cancelAnimationFrame(frame) }
}
