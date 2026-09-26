import { useEffect, useRef, useState } from 'react'
import { filterComboOptions } from './logic.ts'
import type { ComboOption } from './types.ts'

/**
 * The page's combobox (setupCombo). It holds free text: focusing or typing opens the list
 * filtered on that text, and typing clears the picked code (onPick(null)); picking an option
 * writes its display text and code. A click anywhere outside closes it.
 */
export function ComboBox({
  id,
  inputId,
  panelId,
  text,
  options,
  showSub,
  onText,
  onPick,
}: {
  id: string
  inputId: string
  panelId: string
  text: string
  options: readonly ComboOption[]
  /** Company codes show their name under the code; traders show only the display text. */
  showSub: boolean
  onText: (text: string) => void
  onPick: (option: ComboOption | null) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (!target || !target.isConnected) return
      if (!rootRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [open])

  const visible = filterComboOptions(options, text)

  return (
    <div className={`combo${open ? ' open' : ''}`} id={id} ref={rootRef}>
      <input
        className="input"
        id={inputId}
        placeholder="Select ..."
        autoComplete="off"
        value={text}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setOpen(true)
          onText(e.target.value)
          onPick(null)
        }}
      />
      <span className="combo-caret">&#9662;</span>
      <div className="combo-panel" id={panelId}>
        {visible.length === 0 ? (
          <div className="combo-empty">No matches found</div>
        ) : (
          visible.map((o) => (
            <div
              key={o.code}
              className="combo-option"
              onClick={() => {
                onText(o.display)
                setOpen(false)
                onPick(o)
              }}
            >
              {showSub ? (
                <>
                  <div>{o.code}</div>
                  <div className="opt-sub">{o.sub}</div>
                </>
              ) : (
                <div>{o.display}</div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
