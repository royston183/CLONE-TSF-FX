import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Loader } from './Spinner.tsx'
import { EmptyState } from './EmptyState.tsx'

export type Column<Row> = {
  key: string
  header: ReactNode
  /** Cell content. Omit to render `String(row[key])`. */
  render?: (row: Row) => ReactNode
  align?: 'start' | 'end' | 'center'
  width?: string
  /** What the column sorts by. Defaults to `row[key]`; set it when `render` shows something else. */
  sortValue?: (row: Row) => string | number
  /** Plain-text name for the Columns list when `header` is not a string. */
  label?: string
}

export type DataTableProps<Row> = {
  columns: Array<Column<Row>>
  rows: readonly Row[]
  /** Stable identity per row — required, because index keys break selection on re-sort. */
  rowKey: (row: Row) => string
  loading?: boolean
  error?: Error | undefined
  emptyMessage?: string
  selectedKey?: string | undefined
  onRowClick?: (row: Row) => void
  /**
   * Turns on the LAS table toolbar for this table: a Columns picker (show / hide / reorder),
   * click-to-sort headers, and named saved views with a default. Views are kept in this
   * browser's localStorage under this key, so give each table its own.
   */
  layoutKey?: string
}

type Sort = { key: string; dir: 'asc' | 'desc' }
type View = { name: string; order: string[]; hidden: string[]; sort: Sort | null }
type Saved = { views: View[]; defaultView: string }

const EMPTY_SAVED: Saved = { views: [], defaultView: '' }
const storeKey = (layoutKey: string) => `slc.table.layout.${layoutKey}`

function readSaved(layoutKey: string): Saved {
  try {
    const raw = window.localStorage.getItem(storeKey(layoutKey))
    if (raw) {
      const parsed = JSON.parse(raw) as Saved
      if (Array.isArray(parsed.views)) return parsed
    }
  } catch {
    // A blocked or corrupt store just means no saved views.
  }
  return EMPTY_SAVED
}

function writeSaved(layoutKey: string, saved: Saved) {
  try {
    window.localStorage.setItem(storeKey(layoutKey), JSON.stringify(saved))
  } catch {
    // The view simply will not survive a reload.
  }
}

function cellValue<Row>(column: Column<Row>, row: Row): string | number {
  if (column.sortValue) return column.sortValue(row)
  const raw = (row as Record<string, unknown>)[column.key]
  return typeof raw === 'number' ? raw : String(raw ?? '')
}

function compare(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  const na = Number(String(a).replace(/,/g, ''))
  const nb = Number(String(b).replace(/,/g, ''))
  if (String(a).trim() !== '' && String(b).trim() !== '' && !Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

function nameOf<Row>(column: Column<Row>): string {
  return column.label ?? (typeof column.header === 'string' ? column.header : column.key)
}

/**
 * The table every console needs. Replaces the per-page innerHTML string builders, which
 * is also what removes the need for the hand-rolled HTML escaper each page carried:
 * React escapes cell values, so a bank name containing `&` or `<` can no longer break
 * the markup or inject anything.
 */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  loading = false,
  error,
  emptyMessage = 'Nothing to show.',
  selectedKey,
  onRowClick,
  layoutKey,
}: DataTableProps<Row>) {
  const allKeys = useMemo(() => columns.map((c) => c.key), [columns])
  const keySignature = allKeys.join('|')
  const [order, setOrder] = useState<string[]>(allKeys)
  const [hidden, setHidden] = useState<string[]>([])
  const [sort, setSort] = useState<Sort | null>(null)
  const [saved, setSaved] = useState<Saved>(() => (layoutKey ? readSaved(layoutKey) : EMPTY_SAVED))
  const [active, setActive] = useState('')
  const [picker, setPicker] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  const apply = (view: View | undefined) => {
    const known = new Set(allKeys)
    const ordered = (view?.order ?? []).filter((k) => known.has(k))
    setOrder([...ordered, ...allKeys.filter((k) => !ordered.includes(k))])
    setHidden((view?.hidden ?? []).filter((k) => known.has(k)))
    setSort(view?.sort ?? null)
    setActive(view?.name ?? '')
  }

  // The default view opens with the table.
  useEffect(() => {
    if (!layoutKey) return
    apply(saved.views.find((v) => v.name === saved.defaultView))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey, keySignature])

  // Closes the Columns list on an outside click or Escape.
  useEffect(() => {
    if (!picker) return
    const onMouse = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) setPicker(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPicker(false)
    }
    document.addEventListener('mousedown', onMouse)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouse)
      document.removeEventListener('keydown', onKey)
    }
  }, [picker])

  const byKey = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns])
  const shown = useMemo(
    () =>
      (layoutKey ? order : allKeys)
        .filter((k) => !hidden.includes(k))
        .map((k) => byKey.get(k))
        .filter((c): c is Column<Row> => Boolean(c)),
    [layoutKey, order, allKeys, hidden, byKey],
  )
  const sorted = useMemo(() => {
    const column = sort ? byKey.get(sort.key) : undefined
    if (!sort || !column) return rows
    const factor = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => factor * compare(cellValue(column, a), cellValue(column, b)))
  }, [rows, sort, byKey])

  const persist = (next: Saved) => {
    setSaved(next)
    if (layoutKey) writeSaved(layoutKey, next)
  }
  const saveView = () => {
    const name = window.prompt('Name this view', active)?.trim()
    if (!name) return
    const view: View = { name, order, hidden, sort }
    persist({ ...saved, views: [...saved.views.filter((v) => v.name !== name), view] })
    setActive(name)
  }
  const deleteView = () => {
    if (!active) return
    persist({
      views: saved.views.filter((v) => v.name !== active),
      defaultView: saved.defaultView === active ? '' : saved.defaultView,
    })
    apply(undefined)
  }
  const makeDefault = () => persist({ ...saved, defaultView: active })
  const move = (key: string, by: -1 | 1) =>
    setOrder((prev) => {
      const i = prev.indexOf(key)
      const j = i + by
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      const a = next[i] as string
      next[i] = next[j] as string
      next[j] = a
      return next
    })
  const toggleSort = (key: string) =>
    setSort((prev) => (prev?.key !== key ? { key, dir: 'asc' } : prev.dir === 'asc' ? { key, dir: 'desc' } : null))

  if (error) {
    return <EmptyState tone="error" title="Could not load this list" detail={error.message} />
  }
  if (loading) {
    return (
      <div className="slc-table__status">
        <Loader label="Loading" large />
      </div>
    )
  }
  if (rows.length === 0) {
    return <EmptyState title={emptyMessage} />
  }

  const interactive = Boolean(onRowClick)

  return (
    <div className="slc-tablebox">
      {layoutKey ? (
        <div className="slc-table__tools">
          <label className="slc-table__view">
            <span>View</span>
            <select value={active} onChange={(e) => apply(saved.views.find((v) => v.name === e.target.value))}>
              <option value="">Standard</option>
              {saved.views.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name === saved.defaultView ? `${v.name} (default)` : v.name}
                </option>
              ))}
            </select>
          </label>
          <div className="slc-table__columns" ref={pickerRef}>
            <button type="button" className="slc-btn slc-btn--sm" aria-expanded={picker} onClick={() => setPicker((o) => !o)}>
              Columns
            </button>
            {picker ? (
              <div className="slc-table__picker" role="dialog" aria-label="Choose columns">
                <ul>
                  {order.map((key, i) => {
                    const column = byKey.get(key)
                    if (!column) return null
                    return (
                      <li key={key}>
                        <label>
                          <input
                            type="checkbox"
                            checked={!hidden.includes(key)}
                            onChange={() => setHidden((h) => (h.includes(key) ? h.filter((k) => k !== key) : [...h, key]))}
                          />
                          {nameOf(column)}
                        </label>
                        <span>
                          <button type="button" aria-label={`Move ${nameOf(column)} up`} disabled={i === 0} onClick={() => move(key, -1)}>
                            ↑
                          </button>
                          <button
                            type="button"
                            aria-label={`Move ${nameOf(column)} down`}
                            disabled={i === order.length - 1}
                            onClick={() => move(key, 1)}
                          >
                            ↓
                          </button>
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}
          </div>
          <button type="button" className="slc-btn slc-btn--sm slc-btn--primary" onClick={saveView}>
            Save view
          </button>
          {active ? (
            <>
              <button type="button" className="slc-btn slc-btn--sm" onClick={makeDefault} disabled={saved.defaultView === active}>
                Make default
              </button>
              <button type="button" className="slc-btn slc-btn--sm slc-btn--danger" onClick={deleteView}>
                Delete view
              </button>
            </>
          ) : null}
          <span className="slc-table__count">
            {rows.length} {rows.length === 1 ? 'row' : 'rows'}
          </span>
        </div>
      ) : null}
      <div className="slc-table__scroll">
        <table className="slc-table">
          <thead>
            <tr>
              {shown.map((column) => {
                const dir = sort?.key === column.key ? sort.dir : undefined
                return (
                  <th
                    key={column.key}
                    style={column.width ? { width: column.width } : undefined}
                    data-align={column.align}
                    aria-sort={dir ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    {layoutKey ? (
                      <button type="button" className="slc-table__sort" onClick={() => toggleSort(column.key)}>
                        {column.header}
                        <span aria-hidden="true">{dir === 'asc' ? '↑' : dir === 'desc' ? '↓' : '↕'}</span>
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const key = rowKey(row)
              return (
                <tr
                  key={key}
                  className={key === selectedKey ? 'is-selected' : undefined}
                  aria-selected={selectedKey !== undefined ? key === selectedKey : undefined}
                  // Rows are reachable and activatable by keyboard when they are clickable;
                  // a click handler on a <tr> alone is invisible to keyboard and screen-reader users.
                  tabIndex={interactive ? 0 : undefined}
                  onClick={interactive ? () => onRowClick?.(row) : undefined}
                  onKeyDown={
                    interactive
                      ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            onRowClick?.(row)
                          }
                        }
                      : undefined
                  }
                >
                  {shown.map((column) => (
                    <td key={column.key} data-align={column.align}>
                      {column.render ? column.render(row) : String((row as Record<string, unknown>)[column.key] ?? '')}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
