import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { AS_OF, CALENDAR_FIRST_YEAR, CALENDAR_LAST_YEAR, MONTHS, WEEKDAYS } from './data.ts'
import { useFloatingPanel } from './floating.ts'
import { allCompanies, calendarCells, companyLabel, calendarYears, companySummary, shiftMonth, toggleCompany, viewForDate } from './logic.ts'
import type { CalendarView, CompanyOption, DropdownItem } from './types.ts'

/** Closes a popup panel on any click outside its wrapper. */
function useOutsideClose(wrapRef: RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node | null
      // A click that re-rendered its own target has detached it by the time it reaches the document.
      if (!target || !target.isConnected) return
      if (wrapRef.current && !wrapRef.current.contains(target)) close()
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [wrapRef, close])
}

/**
 * Company Code multi-select (S_BUKRS): a trigger summarising the choice and a panel of checkboxes.
 * The entries are T001 (A_CompanyCode); `notice` explains an empty panel (loading / not readable).
 */
export function CompanySelect({
  companies,
  notice,
  selected,
  onChange,
}: {
  companies: readonly CompanyOption[]
  notice: string | null
  selected: string[]
  onChange: (list: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [alignRight, setAlignRight] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useOutsideClose(wrapRef, close)

  const summary = companySummary(selected, companies)

  return (
    <div className={`ms${open ? ' open' : ''}`} id="ms-bukrs" ref={wrapRef}>
      <button
        type="button"
        className="ms-trigger"
        id="msTrigger"
        aria-haspopup="listbox"
        onClick={(e) => {
          if (!open) setAlignRight(e.currentTarget.getBoundingClientRect().left + 270 > window.innerWidth)
          setOpen(!open)
        }}
      >
        <span className={`ms-text${summary === null ? ' placeholder' : ''}`} id="msText">
          {summary ?? 'Select ...'}
        </span>
        <span className="caret"></span>
      </button>
      <div className={`ms-panel${alignRight ? ' align-right' : ''}`} id="msPanel" role="listbox">
        {notice ? <div className="ms-item">{notice}</div> : null}
        {companies.map((c) => (
          <label key={c.code} className="ms-item" title={companyLabel(c)}>
            <input
              type="checkbox"
              value={c.code}
              checked={selected.includes(c.code)}
              onChange={(e) => onChange(toggleCompany(selected, c.code, e.target.checked, companies))}
            />
            <span className="ms-code">{c.code}</span>
            <span className="ms-name">{c.name}</span>
          </label>
        ))}
        <div className="ms-foot">
          <button type="button" className="btn btn-ghost" onClick={() => onChange(allCompanies(companies))}>
            Select all
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => onChange([])}>
            Clear
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * A value-date field: typed dd-mm-yyyy text plus a calendar. The parent owns the text and
 * decides what committing it means; the calendar's month is only initialised when it opens.
 */
export function DateField({
  fieldKey,
  label,
  text,
  selectedIso,
  onText,
  onCommit,
  onPick,
}: {
  fieldKey: 'dateFrom' | 'dateTo'
  label: string
  text: string
  selectedIso: string
  onText: (text: string) => void
  /** Blur or Enter: the text is final. */
  onCommit: () => void
  onPick: (iso: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<CalendarView>({ y: 2026, m: 9 })
  const wrapRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])

  useFloatingPanel({
    open,
    wrapRef,
    panelRef: popupRef,
    options: {},
    onOutside: close,
    onScrollAway: close,
    contentKey: view,
  })

  const toggle = () => {
    if (open) {
      setOpen(false)
      return
    }
    setView(viewForDate(selectedIso)) // initialise the month ONLY on open
    setOpen(true)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onCommit()
      setOpen(false)
    }
    if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div className="date-field" ref={wrapRef}>
      <input
        className="control"
        id={`input-${fieldKey}`}
        placeholder="dd-mm-yyyy"
        maxLength={10}
        autoComplete="off"
        value={text}
        onChange={(e) => onText(e.target.value)}
        onBlur={onCommit}
        onKeyDown={onKeyDown}
      />
      <button type="button" className="date-icon" data-target={fieldKey} aria-label={`Pick ${label} date`} onClick={toggle}>
        📅
      </button>
      <div className={`date-popup${open ? ' open' : ''}`} id={`popup-${fieldKey}`} ref={popupRef}>
        {open ? (
          <Calendar
            view={view}
            selectedIso={selectedIso}
            onView={setView}
            onPick={(iso) => {
              onPick(iso)
              setOpen(false)
            }}
          />
        ) : null}
      </div>
    </div>
  )
}

function Calendar({
  view,
  selectedIso,
  onView,
  onPick,
}: {
  view: CalendarView
  selectedIso: string
  onView: (v: CalendarView) => void
  onPick: (iso: string) => void
}) {
  const years = calendarYears(CALENDAR_FIRST_YEAR, CALENDAR_LAST_YEAR, view.y)
  return (
    <>
      <div className="cal-head">
        <button type="button" aria-label="Previous month" onClick={() => onView(shiftMonth(view, -1))}>
          ‹
        </button>
        <div className="cal-sel">
          <select
            className="cal-month"
            aria-label="Month"
            value={view.m}
            onChange={(e) => onView({ ...view, m: parseInt(e.target.value, 10) })}
          >
            {MONTHS.map((n, i) => (
              <option key={n} value={i}>
                {n}
              </option>
            ))}
          </select>
          <select
            className="cal-year"
            aria-label="Year"
            value={view.y}
            onChange={(e) => onView({ ...view, y: parseInt(e.target.value, 10) })}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <button type="button" aria-label="Next month" onClick={() => onView(shiftMonth(view, 1))}>
          ›
        </button>
      </div>
      <div className="cal-grid">
        {WEEKDAYS.map((d) => (
          <div key={d} className="dow">
            {d}
          </div>
        ))}
        {calendarCells(view, selectedIso, AS_OF).map((c) => (
          <div
            key={`${c.iso}${c.muted ? 'm' : ''}`}
            className={`day${c.muted ? ' muted' : ''}${c.selected ? ' selected' : ''}${c.today ? ' today' : ''}`}
            data-iso={c.iso}
            onClick={() => onPick(c.iso)}
          >
            {c.day}
          </div>
        ))}
      </div>
    </>
  )
}

/**
 * A searchable drop-down (.dd): Transaction No filters as you type, Layout is read-only. The
 * parent owns the text; picking an entry replaces it and closes the list.
 */
export function SearchDropdown({
  fieldKey,
  value,
  typing,
  items,
  onSelect,
  onType,
}: {
  fieldKey: 'rfha' | 'layout'
  value: string
  typing: boolean
  items: (filter: string) => DropdownItem[]
  onSelect: (value: string) => void
  onType?: (text: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [alignRight, setAlignRight] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  /** Whether the field already had focus when the press started, so a click that only focused it keeps the list open. */
  const hadFocus = useRef(false)
  const close = useCallback(() => setOpen(false), [])
  useOutsideClose(wrapRef, close)

  const openList = (f: string) => {
    if (inputRef.current) setAlignRight(inputRef.current.getBoundingClientRect().left + 260 > window.innerWidth)
    setFilter(f)
    setOpen(true)
  }
  const list = open ? items(filter) : []

  return (
    <div className={`dd${open ? ' open' : ''}`} id={`dd-${fieldKey}`} ref={wrapRef}>
      <input
        className="dd-input"
        id={`input-${fieldKey}`}
        placeholder="Select ..."
        autoComplete="off"
        readOnly={!typing}
        ref={inputRef}
        value={value}
        onMouseDown={() => {
          hadFocus.current = document.activeElement === inputRef.current
        }}
        onClick={() => {
          if (open && (!typing || hadFocus.current)) setOpen(false)
          else openList('')
        }}
        onFocus={() => {
          if (typing && !open) openList('')
        }}
        onChange={(e) => {
          if (!typing) return
          setFilter(e.target.value)
          setOpen(true)
          onType?.(e.target.value)
        }}
        onKeyDown={(e) => {
          if (typing && e.key === 'Escape') setOpen(false)
        }}
      />
      <div className={`dd-panel tb-panel${alignRight ? ' align-right' : ''}`} id={`panel-${fieldKey}`}>
        {list.length === 0 ? (
          <div className="dd-empty">No matches</div>
        ) : (
          list.map((it) => (
            <div
              key={it.value}
              className={`dd-item${it.selected ? ' selected-item active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setOpen(false)
                onSelect(it.value)
              }}
            >
              <span className="primary-line">{it.primary}</span>
              {it.secondary ? <span className="secondary-line">{it.secondary}</span> : null}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
