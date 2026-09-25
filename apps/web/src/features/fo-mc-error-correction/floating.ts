import { useEffect, useLayoutEffect, type RefObject } from 'react'

type PanelOptions = { gap?: number | undefined; matchWidth?: boolean | undefined; alignRight?: boolean | undefined }

/**
 * Shared positioning for dropdown panels and date pickers, from the original: keeps the
 * panel inside the nearest .modal — or, for the toolbar's date filters, the .card — flipping
 * above the field when there is no room below and sliding sideways rather than running off
 * an edge.
 */
export function positionFloatingPanel(trigger: HTMLElement, panel: HTMLElement, opts: PanelOptions = {}) {
  const margin = 8
  const gap = opts.gap ?? 6
  const triggerRect = trigger.getBoundingClientRect()
  const boundsEl = trigger.closest('.modal') ?? trigger.closest('.card')
  const bound = boundsEl
    ? boundsEl.getBoundingClientRect()
    : { left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight }

  if (opts.matchWidth) panel.style.width = `${triggerRect.width}px`
  const panelRect = panel.getBoundingClientRect()

  const boundLeft = bound.left + margin
  const boundRight = bound.right - margin
  const boundTop = bound.top + margin
  const boundBottom = bound.bottom - margin

  const maxLeft = boundRight - panelRect.width
  let left = opts.alignRight ? triggerRect.right - panelRect.width : triggerRect.left
  if (maxLeft < boundLeft) left = boundLeft
  else left = Math.min(Math.max(left, boundLeft), maxLeft)

  const desiredTop = triggerRect.bottom + gap
  let top: number
  if (desiredTop + panelRect.height <= boundBottom) top = desiredTop
  else {
    const aboveTop = triggerRect.top - gap - panelRect.height
    top = aboveTop >= boundTop ? aboveTop : Math.max(boundTop, boundBottom - panelRect.height)
  }

  panel.style.position = 'fixed'
  panel.style.left = `${left}px`
  panel.style.top = `${top}px`
  panel.style.right = 'auto'
  panel.style.bottom = 'auto'
}

/**
 * Wires a floating panel's lifecycle: positions it whenever it opens or its content
 * changes, follows window resizes and closes on any click outside `wrap`.
 */
export function useFloatingPanel({
  open,
  wrapRef,
  panelRef,
  options,
  onOutside,
  contentKey,
}: {
  open: boolean
  wrapRef: RefObject<HTMLElement | null>
  panelRef: RefObject<HTMLElement | null>
  options: PanelOptions
  onOutside: () => void
  contentKey?: unknown
}) {
  const { gap, matchWidth, alignRight } = options

  useLayoutEffect(() => {
    if (!open || !wrapRef.current || !panelRef.current) return
    positionFloatingPanel(wrapRef.current, panelRef.current, { gap, matchWidth, alignRight })
  }, [open, contentKey, gap, matchWidth, alignRight, wrapRef, panelRef])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node | null
      // A click that re-rendered its own target (a calendar day, a list item) has detached
      // it by the time it reaches the document; it happened inside, not outside.
      if (!target || !target.isConnected) return
      if (wrapRef.current && !wrapRef.current.contains(target)) onOutside()
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [onOutside, wrapRef])

  useEffect(() => {
    if (!open) return
    const onResize = () => {
      if (wrapRef.current && panelRef.current)
        positionFloatingPanel(wrapRef.current, panelRef.current, { gap, matchWidth, alignRight })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open, gap, matchWidth, alignRight, wrapRef, panelRef])
}
