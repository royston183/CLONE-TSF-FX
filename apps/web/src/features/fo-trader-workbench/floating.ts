import { useEffect, useLayoutEffect, type RefObject } from 'react'

type PanelOptions = { gap?: number | undefined; matchWidth?: boolean | undefined; alignRight?: boolean | undefined }

/**
 * The original's positionFloatingPanel: keeps a dropdown panel or calendar inside the
 * viewport, flipping above the field when there is no room below and sliding sideways
 * rather than running off an edge. Unlike Create Master Contract it is bounded by the
 * viewport, not the enclosing modal — as this page's original is.
 */
export function positionFloatingPanel(trigger: HTMLElement, panel: HTMLElement, opts: PanelOptions = {}) {
  const margin = 8
  const gap = opts.gap ?? 6
  const tr = trigger.getBoundingClientRect()
  if (opts.matchWidth) panel.style.width = `${Math.max(tr.width, 200)}px`
  const pr = panel.getBoundingClientRect()

  const bl = margin
  const br = window.innerWidth - margin
  const bt = margin
  const bb = window.innerHeight - margin

  let left = opts.alignRight ? tr.right - pr.width : tr.left
  const maxLeft = br - pr.width
  if (maxLeft < bl) left = bl
  else left = Math.min(Math.max(left, bl), maxLeft)

  const desired = tr.bottom + gap
  let top: number
  if (desired + pr.height <= bb) top = desired
  else {
    const above = tr.top - gap - pr.height
    top = above >= bt ? above : Math.max(bt, bb - pr.height)
  }

  panel.style.position = 'fixed'
  panel.style.left = `${left}px`
  panel.style.top = `${top}px`
  panel.style.right = 'auto'
  panel.style.bottom = 'auto'
}

/**
 * Positions a floating panel whenever it opens or its content changes; closes it on a
 * mousedown outside `wrap`, on page scroll (not the panel's own) and, for dropdowns, on resize.
 */
export function useFloatingPanel({
  open,
  wrapRef,
  panelRef,
  options,
  onOutside,
  onScrollAway,
  closeOnResize = false,
  contentKey,
}: {
  open: boolean
  wrapRef: RefObject<HTMLElement | null>
  panelRef: RefObject<HTMLElement | null>
  options: PanelOptions
  onOutside: () => void
  onScrollAway: () => void
  closeOnResize?: boolean
  contentKey?: unknown
}) {
  const { gap, matchWidth, alignRight } = options

  useLayoutEffect(() => {
    if (!open || !wrapRef.current || !panelRef.current) return
    positionFloatingPanel(wrapRef.current, panelRef.current, { gap, matchWidth, alignRight })
  }, [open, contentKey, gap, matchWidth, alignRight, wrapRef, panelRef])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && e.target instanceof Node && !wrapRef.current.contains(e.target)) onOutside()
    }
    const onScroll = (e: Event) => {
      if (panelRef.current && e.target instanceof Node && panelRef.current.contains(e.target)) return
      onScrollAway()
    }
    const onResize = () => {
      if (closeOnResize) onOutside()
      else if (wrapRef.current && panelRef.current)
        positionFloatingPanel(wrapRef.current, panelRef.current, { gap, matchWidth, alignRight })
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open, onOutside, onScrollAway, closeOnResize, gap, matchWidth, alignRight, wrapRef, panelRef])
}
