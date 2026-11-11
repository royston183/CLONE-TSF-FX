// The Deal ID box of the Invoice Finalisation Blotter: type to filter (Deal ID, entity, status, MC, trader), pick with
// the mouse or the keyboard (↑ ↓ Enter, Esc closes). Replaces the browser's datalist, whose popup drew the Deal ID over
// its description. One row per deal on one line: Deal ID, then entity · status, cut with … (full text in the tooltip).
import { useId, useMemo, useRef, useState } from 'react'
import type { DealListRow } from './types.ts'

/** The deals whose ID, entity, status, MC or trader contain what was typed (all of them for an empty box). */
export function filterDeals(deals: DealListRow[], typed: string, limit = 50): DealListRow[] {
  const q = typed.trim().toLowerCase()
  const hit = q ? deals.filter((d) => [d.dealId, d.entityString, d.statusLabel, d.mcRef, d.trader, d.dealRef].some((v) => v?.toLowerCase().includes(q))) : deals
  // An ID that starts with what was typed comes first.
  return [...hit].sort((a, b) => Number(!a.dealId.startsWith(q)) - Number(!b.dealId.startsWith(q))).slice(0, limit)
}

export function DealPicker({ deals, value, onChange, onPick, onEnter, disabled }: {
  deals: DealListRow[]; value: string; onChange: (v: string) => void; onPick: (id: string) => void; onEnter: (v: string) => void; disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const list = useMemo(() => filterDeals(deals, value), [deals, value])
  const id = useId()
  const box = useRef<HTMLInputElement>(null)
  const pick = (deal: string) => { setOpen(false); onChange(deal); onPick(deal); box.current?.blur() }
  const shown = open && list.length > 0
  return (
    <div className="inv-picker">
      <input
        ref={box}
        id="invDealId"
        className="control"
        role="combobox"
        aria-expanded={shown}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={shown ? `${id}-${active}` : undefined}
        placeholder="Type or pick a Deal ID"
        autoComplete="off"
        disabled={disabled}
        value={value}
        onChange={(e) => { onChange(e.target.value); setActive(0); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(list.length - 1, a + 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
          else if (e.key === 'Escape') setOpen(false)
          else if (e.key === 'Enter') {
            e.preventDefault()
            const exact = list.find((d) => d.dealId === value.trim())
            if (exact || !shown) { setOpen(false); box.current?.blur(); onEnter(value) }
            else pick(list[Math.min(active, list.length - 1)].dealId)
          }
        }}
      />
      {shown && (
        <ul className="inv-picker__list" role="listbox" id={`${id}-list`} aria-label="Deal IDs">
          {list.map((d, i) => (
            <li
              key={d.dealId}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'on' : ''}
              title={`${d.dealId} · ${d.entityString} · ${d.statusLabel}`}
              // mousedown, not click: it lands before the box loses focus and closes the list.
              onMouseDown={(e) => { e.preventDefault(); pick(d.dealId) }}
              onMouseEnter={() => setActive(i)}
            >
              <b className="mono">{d.dealId}</b>
              <span>{[d.entityString, d.statusLabel].filter(Boolean).join(' · ')}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
