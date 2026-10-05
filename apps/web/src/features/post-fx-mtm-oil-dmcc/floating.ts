import { useCallback, useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'
import { floatingPosition } from './logic.ts'

type Options = {
  /** Make the panel as wide as the trigger (at least minWidth). */
  matchWidth?: boolean
  minWidth?: number
  alignRight?: boolean
  gap?: number
}

/**
 * Fixed-position placement shared by the Company Code list and the calendar (the original's
 * positionFloatingPanel): under the trigger, flipped above when it does not fit, kept inside the
 * window. The panel is measured and placed before paint. Returns the style to put on the panel and
 * a reposition callback for window resizes; `deps` re-place it when its content changes size.
 */
export function useFloatingPanel(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
  opts: Options,
  deps: readonly unknown[],
): { style: CSSProperties; reposition: () => void } {
  const [style, setStyle] = useState<CSSProperties>({ position: 'fixed' })
  const { matchWidth, minWidth, alignRight, gap } = opts

  const reposition = useCallback(() => {
    const trigger = triggerRef.current
    const panel = panelRef.current
    if (!trigger || !panel) return
    const tr = trigger.getBoundingClientRect()
    let width: number | undefined
    if (matchWidth) {
      width = Math.max(tr.width, minWidth ?? 0)
      panel.style.width = `${width}px`
    }
    const pr = panel.getBoundingClientRect()
    const { left, top } = floatingPosition(
      tr,
      { width: pr.width, height: pr.height },
      { width: window.innerWidth, height: window.innerHeight },
      { alignRight, gap },
    )
    setStyle({ position: 'fixed', left, top, right: 'auto', bottom: 'auto', ...(width === undefined ? {} : { width }) })
  }, [triggerRef, panelRef, matchWidth, minWidth, alignRight, gap])

  useLayoutEffect(() => {
    if (open) reposition()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reposition, ...deps])

  return { style, reposition }
}
