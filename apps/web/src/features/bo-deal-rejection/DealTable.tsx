import { useEffect, useRef, type DragEvent } from 'react'
import { StatusText } from './Modals.tsx'
import { cellText, columnsFor, dealKey, isNumeric, str } from './logic.ts'
import type { Deal, Flags, SortState, TxnType } from './types.ts'

type Props = {
  type: TxnType
  /** The rows of the current page. */
  rows: Deal[]
  /** Hidden (display:none) when the result is empty; the empty state shows instead. */
  hidden: boolean
  sort: SortState
  marks: Flags
  remarks: Record<string, string>
  draggingKey: string | null
  onSort: (field: string) => void
  onToggleMark: (key: string) => void
  onMarkAll: (on: boolean) => void
  onRemark: (key: string, text: string) => void
  onOpenDeal: (key: string) => void
  onDragStart: (key: string, e: DragEvent<HTMLTableRowElement>) => void
  onDragEnd: () => void
}

/** Columns whose long text is clipped with an ellipsis and a tooltip. */
const CLIPPED = ['fo_remark', 'bp_name', 'xtext']

/** The deal list: header with select-all, one row per deal with mark checkbox and Remarks input. */
export function DealTable(props: Props) {
  const { type, rows, hidden, sort, marks, remarks, draggingKey } = props
  const cols = columnsFor(type)
  const keys = rows.map((d) => dealKey(type, d))
  const markedOnPage = keys.filter((k) => marks[k]).length

  const allRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = markedOnPage > 0 && markedOnPage < rows.length
  }, [markedOnPage, rows.length])

  return (
    <table className="mc-table" id="dealTable" style={{ display: hidden ? 'none' : 'table' }}>
      <thead id="tableHead">
        <tr>
          <th className="no-sort mark-col">
            <input
              type="checkbox"
              className="row-select-checkbox"
              id="chkAll"
              title="Mark all rows on this page"
              aria-label="Mark all rows on this page"
              ref={allRef}
              checked={rows.length > 0 && markedOnPage === rows.length}
              onChange={(e) => props.onMarkAll(e.target.checked)}
            />
          </th>
          {cols.map((c) => {
            const noSort = c.key === 'bo_rem'
            const on = !noSort && c.key === sort.field
            const cls = [isNumeric(c) ? 'num' : '', noSort ? 'no-sort' : '', on ? 'sorted' : ''].filter(Boolean).join(' ')
            return (
              <th key={c.key} className={cls || undefined} onClick={noSort ? undefined : () => props.onSort(c.key)}>
                {c.label}
                {!noSort && <span className="sort-ind">{on ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>}
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody id="tableBody">
        {rows.map((d) => {
          const key = dealKey(type, d)
          const marked = !!marks[key]
          const rfha = str(d, 'rfha')
          return (
            <tr
              key={key}
              className={`${marked ? 'selected' : ''}${draggingKey === key ? ' dragging' : ''}`.trim() || undefined}
              draggable={marked}
              title="Click to mark / unmark"
              onClick={() => props.onToggleMark(key)}
              onDragStart={(e) => props.onDragStart(key, e)}
              onDragEnd={props.onDragEnd}
            >
              <td className="mark-col">
                <input
                  type="checkbox"
                  className="row-select-checkbox row-mark"
                  aria-label={`Mark deal ${rfha}`}
                  checked={marked}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => props.onToggleMark(key)}
                />
              </td>
              {cols.map((c) => {
                const num = isNumeric(c)
                const mono = c.type === 'date' || num || c.key === 'rfha' ? ' mono' : ''
                const txt = cellText(d, c, type, remarks)
                if (c.key === 'bo_rem') {
                  return (
                    <td className="remark-col" key={c.key}>
                      <input
                        className="remark-input"
                        maxLength={80}
                        placeholder="Add remarks"
                        value={txt}
                        aria-label={`Remarks for deal ${rfha}`}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => props.onRemark(key, e.target.value)}
                      />
                    </td>
                  )
                }
                if (c.key === 'rfha') {
                  return (
                    <td key={c.key}>
                      <span
                        className="mc-link mono deal-link"
                        title="View transaction details"
                        onClick={(e) => {
                          e.stopPropagation()
                          props.onOpenDeal(key)
                        }}
                      >
                        {rfha}
                      </span>
                    </td>
                  )
                }
                if (c.key === 'txn_status') {
                  return (
                    <td key={c.key}>
                      <StatusText status={str(d, 'txn_status')} />
                    </td>
                  )
                }
                const clip = CLIPPED.includes(c.key)
                return (
                  <td
                    key={c.key}
                    className={`${num ? 'num' : ''}${mono}${clip ? ' clip' : ''}`.trim() || undefined}
                    title={clip ? txt : undefined}
                  >
                    {txt}
                  </td>
                )
              })}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
