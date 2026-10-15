import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './datalist-suggest.css'

/**
 * Replaces the browser's own <datalist> drop-down with the Deal ID suggestion list that
 * BO: Post Accounting Entries for Settlement uses, for every <input list="…"> in the product.
 *
 * The browser list is unstyled and cannot be themed, so while such an input has focus its
 * `list` attribute is lifted and this popup is drawn instead from the same <datalist>'s
 * options (value shown in bold, the option's text as the muted status). Picking writes the
 * value back the way a user typing would, so each screen's onChange keeps working. Nothing
 * is added to a screen: the <datalist> stays where it is and remains the source of options.
 */

type Item = { value: string; label: string }
type Open = { input: HTMLInputElement; items: Item[] }

const MAX_SHOWN = 200

function isSuggestInput(el: EventTarget | null): el is HTMLInputElement {
  return (
    el instanceof HTMLInputElement &&
    (el.type === 'text' || el.type === 'search' || el.type === '') &&
    !el.disabled &&
    !el.readOnly &&
    (el.hasAttribute('list') || el.dataset.dlList !== undefined)
  )
}

function listIdOf(input: HTMLInputElement): string {
  return input.getAttribute('list') ?? input.dataset.dlList ?? ''
}

function readItems(listId: string): Item[] {
  const list = document.getElementById(listId)
  if (!list) return []
  return Array.from(list.querySelectorAll('option')).map((o) => {
    const text = (o.label || o.textContent || '').trim()
    return { value: o.value, label: text === o.value ? '' : text }
  })
}

function setValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function restore(input: HTMLInputElement) {
  if (input.dataset.dlList !== undefined) {
    input.setAttribute('list', input.dataset.dlList)
    delete input.dataset.dlList
  }
}

export function DatalistSuggest() {
  const [open, setOpen] = useState<Open | null>(null)
  const [active, setActive] = useState(-1)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const openRef = useRef(open)
  openRef.current = open
  const activeRef = useRef(active)
  activeRef.current = active
  const shownRef = useRef<Item[]>([])

  let shown: Item[] = []
  if (open) {
    const q = open.input.value.trim().toLowerCase()
    const all = q ? open.items.filter((i) => i.value.toLowerCase().includes(q) || i.label.toLowerCase().includes(q)) : open.items
    shown = all.slice(0, MAX_SHOWN)
  }
  shownRef.current = shown

  useEffect(() => {
    const show = (input: HTMLInputElement) => {
      const id = listIdOf(input)
      if (!id) return
      // Lift the native list so the browser draws nothing of its own.
      if (input.hasAttribute('list')) {
        input.dataset.dlList = id
        input.removeAttribute('list')
      }
      setOpen({ input, items: readItems(id) })
      setActive(-1)
    }
    const close = () => {
      const cur = openRef.current
      if (cur) restore(cur.input)
      setOpen(null)
    }
    const onFocusIn = (e: FocusEvent) => {
      if (isSuggestInput(e.target)) show(e.target)
    }
    const onClick = (e: MouseEvent) => {
      if (isSuggestInput(e.target) && openRef.current?.input !== e.target) show(e.target)
    }
    const onInput = (e: Event) => {
      if (!isSuggestInput(e.target)) return
      if (openRef.current?.input === e.target) {
        setOpen({ input: e.target, items: readItems(listIdOf(e.target)) })
        setActive(-1)
      } else show(e.target)
    }
    const onFocusOut = (e: FocusEvent) => {
      if (openRef.current && e.target === openRef.current.input) close()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      const cur = openRef.current
      if (!cur || e.target !== cur.input) return
      const n = shownRef.current.length
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!n) return
        e.preventDefault()
        setActive((i) => (e.key === 'ArrowDown' ? (i + 1) % n : (i - 1 + n) % n))
      } else if (e.key === 'Enter') {
        const pick = shownRef.current[activeRef.current]
        if (pick) {
          // Capture phase: keep the screen's own Enter handler from running on the old value.
          e.preventDefault()
          e.stopPropagation()
          setValue(cur.input, pick.value)
          close()
        }
      } else if (e.key === 'Escape' || e.key === 'Tab') {
        close()
      }
    }
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('click', onClick)
    document.addEventListener('input', onInput)
    document.addEventListener('focusout', onFocusOut)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('click', onClick)
      document.removeEventListener('input', onInput)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('keydown', onKeyDown, true)
      const cur = openRef.current
      if (cur) restore(cur.input)
    }
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      setRect(null)
      return
    }
    const place = () => setRect(open.input.getBoundingClientRect())
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  if (!open || !rect || shown.length === 0) return null
  const width = Math.min(Math.max(rect.width, 380), window.innerWidth - 16)
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
  const maxHeight = Math.min(280, Math.max(120, window.innerHeight - rect.bottom - 16))

  return createPortal(
    <ul className="slc-dl-suggest" role="listbox" style={{ top: rect.bottom + 4, left, width, maxHeight }}>
      {shown.map((item, i) => (
        <li
          key={item.value}
          role="option"
          aria-selected={i === active}
          className={i === active ? 'active' : undefined}
          // mousedown, not click: the input's blur would close the list first.
          onMouseDown={(e) => {
            e.preventDefault()
            setValue(open.input, item.value)
            restore(open.input)
            setOpen(null)
          }}
          onMouseEnter={() => setActive(i)}
        >
          <span className="slc-dl-id">{item.value}</span>
          {item.label ? <span className="slc-dl-status">{item.label}</span> : null}
        </li>
      ))}
    </ul>,
    document.body,
  )
}
