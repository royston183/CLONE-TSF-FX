// Every screen is about something with a number: a master contract, a Deal ID, a trade flow's BL, an invoice. The column
// that holds that number is drawn bold in the accent colour (like the MC Number on Create Master Contract), so the eye
// finds it first. It is found by its header: the screen's own identifier first, otherwise the first identifier-like column.
// Cells only get an attribute (`data-key`), which React never touches, so tables render and update as before.
import { screenInfo } from './screenInfo.ts'

/** [the screen's title, the header of its key column]: the first rule whose title matches decides. */
const BY_SCREEN: [RegExp, RegExp][] = [
  [/master contract/i, /^(mc (number|no|ref no)|master contract( no| number)?)$/],
  [/trade ?flow|\bbl\b/i, /^(bl no|bl number)$/],
  [/ottk/i, /^ottk( no| number| ticket)?$/],
  [/dttk/i, /^dttk( no| number| ticket)?$/],
  [/invoice/i, /^(invoice (no|number|ref)|invoice)$/],
  [/sblc/i, /^sblc( no| number| id| ref)?$/],
  [/\bicl\b|deposit/i, /^(icl|deposit|request)( no| number| id| ref)?$/],
  [/limit/i, /^limit( no| number| id)?$/],
  [/deal id|deal-id/i, /^deal id$/]
]
/** Otherwise: a Deal ID, a transaction number, or any first column that reads like an identifier. */
const FALLBACK = /^(deal id|transaction( no| number)?|[a-z ]+ (no|number|id))$/

const SCOPES = ['#alm-fx-ui', '.tsfx-frame', '.tsfx-portal']

const clean = (text: string): string => text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

function screenTitle(): string {
  const id = /^\/apps\/([^/]+)/.exec(window.location.pathname)?.[1] ?? ''
  return screenInfo(id).title
}

function keyColumn(table: HTMLTableElement, title: string): number {
  const head = table.tHead?.rows[table.tHead.rows.length - 1]
  if (!head) return -1
  const labels = [...head.cells].map((th) => clean(th.textContent ?? ''))
  for (const [screen, header] of BY_SCREEN) {
    if (!screen.test(title)) continue
    const at = labels.findIndex((l) => header.test(l))
    if (at >= 0) return at
  }
  return labels.findIndex((l) => FALLBACK.test(l))
}

/** Marks the key column's cells of every table on the screen (new rows too); safe to call again and again. */
export function sweepKeyColumns(): void {
  const title = screenTitle()
  document.querySelectorAll<HTMLTableElement>(SCOPES.map((s) => `${s} table`).join(', ')).forEach((table) => {
    const at = keyColumn(table, title)
    const was = table.getAttribute('data-keycol')
    if (String(at) !== was) {
      table.querySelectorAll('[data-key]').forEach((td) => td.removeAttribute('data-key'))
      table.querySelectorAll('tr[data-k]').forEach((tr) => tr.removeAttribute('data-k'))
      table.setAttribute('data-keycol', String(at))
    }
    if (at < 0) return
    table.querySelectorAll<HTMLTableRowElement>('tbody > tr:not([data-k])').forEach((tr) => {
      tr.setAttribute('data-k', '')
      const cell = tr.cells[at]
      if (cell) cell.setAttribute('data-key', '')
    })
  })
}
