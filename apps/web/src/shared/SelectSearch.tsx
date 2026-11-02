import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { rankOptions, type SelectOption } from './select-search.ts'
import './select-search.css'

/**
 * Gives every native <select> in the product a search box, without touching the ~300 of them.
 *
 * A mouse press on a select (or Enter, Space, Alt+Down, F4 or a typed character while it has
 * focus) opens this popup in place of the browser's list. Picking an option writes it back to
 * the real <select> and fires its 'change' event, so each screen's own onChange, validation
 * and controlled state keep working exactly as before. A select can opt out with
 * data-no-search; multi-selects and list boxes (size > 1) are left native.
 */

type Open = { select: HTMLSelectElement; options: SelectOption[]; query: string; seq: number }

let openSeq = 0

const POPUP_MAX_HEIGHT = 300
/** The popup grows to fit its longest option up to this width; a longer one is cut with "…" and shows in full on hover. */
const POPUP_MAX_WIDTH = 460

let canvas: HTMLCanvasElement | null = null
/** The width the text takes in the given font, or 0 where the browser cannot measure it. */
function textWidth(text: string, font: string): number {
  canvas ??= document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return 0
  ctx.font = font
  return ctx.measureText(text).width
}

/** The font a control is drawn in, written out as the canvas wants it (the font shorthand is empty in some browsers). */
function fontOf(el: Element): string {
  const cs = getComputedStyle(el)
  return `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
}

function isSearchable(el: EventTarget | null): el is HTMLSelectElement {
  return (
    el instanceof HTMLSelectElement &&
    !el.multiple &&
    el.size <= 1 &&
    !el.disabled &&
    !el.hasAttribute('data-no-search')
  )
}

function readOptions(select: HTMLSelectElement): SelectOption[] {
  return Array.from(select.options)
    .filter((o) => !o.hidden)
    .map((o) => ({ value: o.value, label: o.text.trim() || o.value, disabled: o.disabled }))
}

/** Sets the value the way a user would, so React's onChange sees it. */
function commit(select: HTMLSelectElement, value: string) {
  if (select.value !== value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
    setter?.call(select, value)
    select.dispatchEvent(new Event('input', { bubbles: true }))
    select.dispatchEvent(new Event('change', { bubbles: true }))
  }
  select.focus()
}

export function SelectSearch() {
  const [open, setOpen] = useState<Open | null>(null)
  const openRef = useRef(open)
  openRef.current = open

  const show = useCallback((select: HTMLSelectElement, query = '') => {
    setOpen({ select, options: readOptions(select), query, seq: ++openSeq })
  }, [])

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0 || !isSearchable(e.target)) return
      e.preventDefault()
      const select = e.target
      if (openRef.current?.select === select) {
        setOpen(null)
        return
      }
      select.focus()
      show(select)
    }
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      const select = e.target
      if (openRef.current || !isSearchable(select) || e.ctrlKey || e.metaKey) return
      const opens =
        e.key === 'Enter' || e.key === ' ' || e.key === 'F4' || (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp'))
      const typed = !e.altKey && e.key.length === 1 && e.key !== ' '
      if (!opens && !typed) return
      e.preventDefault()
      e.stopPropagation()
      show(select, typed ? e.key : '')
    }
    // A select too narrow for what it shows (a long company name in a grid column) says it in full on hover. Only a title
    // this code set is ever changed, so a screen's own tooltip is left alone.
    const onOver = (e: MouseEvent) => {
      const el = e.target
      if (!(el instanceof HTMLSelectElement) || el.multiple || el.size > 1) return
      const text = el.selectedOptions[0]?.text.trim() ?? ''
      const cs = getComputedStyle(el)
      const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      const cutOff = !!text && textWidth(text, fontOf(el)) > room
      if (cutOff && (!el.title || el.dataset['slcTitle'])) {
        el.title = text
        el.dataset['slcTitle'] = '1'
      } else if (!cutOff && el.dataset['slcTitle']) {
        el.removeAttribute('title')
        delete el.dataset['slcTitle']
      }
    }
    window.addEventListener('mousedown', onMouseDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('mouseover', onOver, true)
    return () => {
      window.removeEventListener('mousedown', onMouseDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('mouseover', onOver, true)
    }
  }, [show])

  if (!open) return null
  return createPortal(
    <SearchPopup
      key={open.seq}
      state={open}
      onQuery={(query) => setOpen({ ...open, query })}
      onPick={(value) => {
        setOpen(null)
        commit(open.select, value)
      }}
      onClose={(refocus) => {
        setOpen(null)
        if (refocus) open.select.focus()
      }}
    />,
    document.body,
  )
}

function SearchPopup({
  state,
  onQuery,
  onPick,
  onClose,
}: {
  state: Open
  onQuery: (query: string) => void
  onPick: (value: string) => void
  onClose: (refocus: boolean) => void
}) {
  const { select, options, query } = state
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const matches = useMemo(() => rankOptions(options, query), [options, query])
  const [active, setActive] = useState(() => Math.max(0, matches.findIndex((o) => o.value === select.value)))
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number; maxHeight: number }>()

  // Keep the highlight on a real row as the list narrows.
  useEffect(() => {
    setActive((i) => (query ? 0 : Math.min(i, Math.max(0, matches.length - 1))))
  }, [query, matches.length])

  useLayoutEffect(() => {
    const r = select.getBoundingClientRect()
    const below = window.innerHeight - r.bottom - 8
    const above = r.top - 8
    // Wide enough for the longest option when that fits under the cap, so names read in full; the select's own width is the floor.
    const font = rootRef.current ? fontOf(rootRef.current) : fontOf(select)
    const longest = Math.max(0, ...options.map((o) => textWidth(o.label, font)))
    const width = Math.min(window.innerWidth - 16, Math.max(r.width, 220, Math.min(POPUP_MAX_WIDTH, Math.ceil(longest) + 44)))
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
    setPos(
      below >= Math.min(POPUP_MAX_HEIGHT, 160) || below >= above
        ? { left, top: r.bottom + 2, width, maxHeight: Math.min(POPUP_MAX_HEIGHT, below) }
        : { left, bottom: window.innerHeight - r.top + 2, width, maxHeight: Math.min(POPUP_MAX_HEIGHT, above) },
    )
    inputRef.current?.focus()
  }, [select, options])

  useEffect(() => {
    listRef.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' })
  }, [active, matches])

  // A press anywhere else, or the page scrolling the select away, closes it.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!rootRef.current?.contains(t) && t !== select) onClose(false)
    }
    const onScroll = (e: Event) => {
      if (!rootRef.current?.contains(e.target as Node)) onClose(false)
    }
    const onResize = () => onClose(false)
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [select, onClose])

  const move = (step: number) => {
    if (matches.length === 0) return
    let i = active
    for (let n = 0; n < matches.length; n++) {
      i = (i + step + matches.length) % matches.length
      if (!matches[i]?.disabled) break
    }
    setActive(i)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Screens close their own popups on Escape from document listeners; this one goes first.
    e.stopPropagation()
    e.nativeEvent.stopImmediatePropagation()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      move(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      move(-1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const pick = matches[active]
      if (pick && !pick.disabled) onPick(pick.value)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose(true)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      onClose(true)
    }
  }

  return (
    <div
      ref={rootRef}
      className="slc-select-search"
      role="dialog"
      aria-label="Search options"
      style={{ ...pos, visibility: pos ? 'visible' : 'hidden' }}
    >
      <input
        ref={inputRef}
        className="slc-select-search__input"
        type="text"
        placeholder="Search…"
        value={query}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded="true"
        aria-controls="slc-select-search-list"
        aria-activedescendant={matches.length ? `slc-select-search-opt-${active}` : undefined}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <ul ref={listRef} id="slc-select-search-list" className="slc-select-search__list" role="listbox" style={{ maxHeight: pos ? pos.maxHeight - 44 : undefined }}>
        {matches.length === 0 ? (
          <li className="slc-select-search__empty">No matches</li>
        ) : (
          matches.map((o, i) => (
            <li
              key={`${o.value}\u0000${i}`}
              id={`slc-select-search-opt-${i}`}
              role="option"
              aria-selected={o.value === select.value}
              aria-disabled={o.disabled || undefined}
              className={[
                'slc-select-search__opt',
                i === active ? 'is-active' : '',
                o.value === select.value ? 'is-selected' : '',
                o.disabled ? 'is-disabled' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onMouseEnter={(e) => {
                setActive(i)
                const li = e.currentTarget
                li.title = li.scrollWidth > li.clientWidth ? o.label : ''
              }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (!o.disabled) onPick(o.value)
              }}
            >
              {o.label}
            </li>
          ))
        )}
      </ul>
    </div>
  )
}
