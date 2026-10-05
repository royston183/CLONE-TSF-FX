import type { DragEvent, KeyboardEvent } from 'react'
import { cellText, pagerItems, sortIndicator } from './logic.ts'
import type { Column, ColumnKey, Row, Sort } from './types.ts'

const GROUP_TIP = { ext: 'Transaction data - external', mtm: 'MTM data', '': '' } as const

function cellClass(c: Column, r?: Row): string {
  const cls: string[] = []
  if (c.type === 'num') cls.push('num')
  if (c.cls) cls.push(c.cls)
  if (c.group) cls.push(`g-${c.group}`)
  if (r && c.signed) {
    if (r.vGl < 0) cls.push('neg')
    else if (r.vGl > 0) cls.push('pos')
  }
  if (r && c.msgOk && cellText(c, r)) cls.push('msg-ok')
  return cls.join(' ')
}

/** The valuation grid: sortable headers, a row checkbox, draggable rows and the hotspot links. */
export function MtmTable({
  cols,
  rows,
  sort,
  selectedKey,
  draggingKey,
  hidden,
  onSort,
  onSelect,
  onToggle,
  onOpenLink,
  onDragStart,
  onDragEnd,
}: {
  cols: readonly Column[]
  rows: readonly Row[]
  sort: Sort
  selectedKey: string | null
  draggingKey: string | null
  hidden: boolean
  onSort: (key: ColumnKey) => void
  onSelect: (key: string) => void
  onToggle: (key: string) => void
  onOpenLink: (row: Row, link: 'rfha' | 'mtm' | 'rev') => void
  onDragStart: (e: DragEvent<HTMLTableRowElement>, row: Row) => void
  onDragEnd: () => void
}) {
  return (
    <div className="table-scroll" id="tableScroll" style={hidden ? { display: 'none' } : undefined}>
      <table className="mc-table" id="mtmTable">
        <thead id="tableHead">
          <tr>
            <th className="no-sort c-chk" aria-label="Select"></th>
            {cols.map((c) => {
              const cls = [cellClass(c)]
              if (sort.field === c.key) cls.push('sorted')
              const tip = GROUP_TIP[c.group]
              return (
                <th
                  key={c.key}
                  className={cls.filter(Boolean).join(' ')}
                  title={tip || undefined}
                  onClick={() => onSort(c.key)}
                >
                  {c.label}
                  <span className="sort-ind">{sortIndicator(sort, c.key)}</span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody id="tableBody">
          {rows.map((r) => (
            <tr
              key={r.key}
              data-key={r.key}
              draggable
              className={`${r.key === selectedKey ? 'selected' : ''}${r.key === draggingKey ? ' dragging' : ''}`.trim()}
              onClick={() => onSelect(r.key)}
              onDragStart={(e) => onDragStart(e, r)}
              onDragEnd={onDragEnd}
            >
              <td className="c-chk">
                <input
                  type="checkbox"
                  className="row-select-checkbox"
                  aria-label={`Select transaction ${r.rfha}`}
                  checked={r.key === selectedKey}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => onToggle(r.key)}
                />
              </td>
              {cols.map((c) => {
                const txt = cellText(c, r)
                const link = c.link
                return (
                  <td key={c.key} className={cellClass(c, r)}>
                    {link && txt ? (
                      <span
                        className="mc-link"
                        data-link={link}
                        role="link"
                        tabIndex={0}
                        onClick={() => onOpenLink(r, link)}
                        onKeyDown={(e: KeyboardEvent<HTMLSpanElement>) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            e.currentTarget.click()
                          }
                        }}
                      >
                        {txt}
                      </span>
                    ) : (
                      txt
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Pager({ current, count, onPage }: { current: number; count: number; onPage: (page: number) => void }) {
  return (
    <div className="pagination" id="pagination">
      <button type="button" disabled={current <= 1} onClick={() => onPage(current - 1)}>
        &lsaquo;
      </button>
      {pagerItems(current, count).map((p, i) =>
        p === '…' ? (
          <span key={`e${i}`} className="ellipsis">
            &hellip;
          </span>
        ) : (
          <button key={p} type="button" className={p === current ? 'active' : undefined} onClick={() => onPage(p)}>
            {p}
          </button>
        ),
      )}
      <button type="button" disabled={current >= count} onClick={() => onPage(current + 1)}>
        &rsaquo;
      </button>
    </div>
  )
}
