import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface TickerItem { label: string; value: string; /** Drawn in the accent colour: the values the eye should find first. */ key?: boolean }

const SPEED = 32 // pixels per second: a steady, readable crawl
const HOLD_AFTER_TOUCH = 3000
// The strip moves to the right: its scroll position runs down from one copy's width to 0 and starts again.

/**
 * The deal information as a stock-market style ticker: label/value blocks with thin separators that crawl slowly from
 * left to right and come round again without a gap. The blocks are repeated as often as the width needs, so it moves even when one
 * copy would fit. It pauses on hover and keyboard focus, can always be scrolled by hand, and stays still (one copy,
 * scrollable) when the user asks for reduced motion.
 */
export function InfoTicker({ items, label }: { items: TickerItem[]; label: string }) {
  const box = useRef<HTMLDivElement>(null)
  const first = useRef<HTMLUListElement>(null)
  const pos = useRef(0)
  const holdUntil = useRef(0)
  const hovering = useRef(false)
  const started = useRef(false)
  const [copies, setCopies] = useState(2)
  const [reduced] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  const key = items.map((i) => `${i.label}=${i.value}`).join('|')

  // Enough copies that the strip is always wider than its box, so the loop has no gap.
  useLayoutEffect(() => {
    const el = box.current, list = first.current
    if (!el || !list) return
    const measure = () => {
      const one = list.offsetWidth
      if (one > 0) setCopies(Math.max(2, Math.ceil(el.clientWidth / one) + 1))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el); ro.observe(list)
    return () => ro.disconnect()
  }, [key])

  useEffect(() => {
    const el = box.current, list = first.current
    if (reduced || !el || !list) return
    let raf = 0, last = performance.now()
    started.current = false
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const width = list.offsetWidth
      if (!started.current && width > 0) { pos.current = width; el.scrollLeft = width; started.current = true }
      if (!hovering.current && now >= holdUntil.current && !el.contains(document.activeElement)) {
        // A hand scroll moved the strip: carry on from where it is.
        if (Math.abs(el.scrollLeft - pos.current) > 1.5) pos.current = el.scrollLeft
        pos.current -= SPEED * dt
        if (width > 0 && pos.current <= 0) pos.current += width
        el.scrollLeft = pos.current
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [reduced, key, copies])

  const hold = () => { holdUntil.current = performance.now() + HOLD_AFTER_TOUCH }
  const blocks = (n: number) => (
    <ul className="mc-ticker__list" ref={n === 0 ? first : undefined} aria-hidden={n > 0 || undefined}>
      {items.map((i) => (
        <li key={i.label} className="mc-ticker__item">
          <span className="mc-ticker__label">{i.label}</span>
          <span className={`mc-ticker__value${i.key ? ' key' : ''}`} title={i.value || undefined}>{i.value || '—'}</span>
        </li>
      ))}
    </ul>
  )

  return (
    <div className="mc-ticker" ref={box} role="group" aria-label={label} tabIndex={0}
      onMouseEnter={() => { hovering.current = true }} onMouseLeave={() => { hovering.current = false }}
      onWheel={hold} onTouchStart={hold} onTouchMove={hold} onKeyDown={hold}>
      {Array.from({ length: reduced ? 1 : copies }, (_, n) => <div key={n} style={{ display: 'contents' }}>{blocks(n)}</div>)}
    </div>
  )
}
