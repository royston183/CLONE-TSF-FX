import { useEffect, useLayoutEffect, type RefObject } from 'react'

type PanelOptions = { gap?: number | undefined; matchWidth?: boolean | undefined; alignRight?: boolean | undefined }

/**
 * Shared positioning for dropdown panels and date pickers, from the original: keeps the
 * panel inside the viewport, flipping above the field when there is no room below and
 * sliding sideways rather than running off an edge.
 */
export function positionFloatingPanel(trigger: HTMLElement, panel: HTMLElement, opts: PanelOptions = {}) {
  const margin = 8
  const gap = opts.gap ?? 5
  const triggerRect = trigger.getBoundingClientRect()
  const vw = document.documentElement.clientWidth || window.innerWidth
  const vh = document.documentElement.clientHeight || window.innerHeight

  if (opts.matchWidth) panel.style.width = `${triggerRect.width}px`
  const panelRect = panel.getBoundingClientRect()
  const pw = panelRect.width || 264
  const ph = panelRect.height || 310

  let left = triggerRect.left
  if (left + pw > vw - margin) left = Math.max(margin, vw - pw - margin)

  let top = triggerRect.bottom + gap
  if (top + ph > vh - margin && triggerRect.top - ph - gap >= margin) top = triggerRect.top - ph - gap

  panel.style.position = 'fixed'
  panel.style.left = `${Math.max(margin, left)}px`
  panel.style.top = `${Math.max(margin, top)}px`
}

/**
 * Wires a floating panel's lifecycle: positions it whenever it opens or its content
 * changes, follows window resizes and scroll, and closes on any click outside `wrap`.
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
      if (!target || !target.isConnected) return
      if (wrapRef.current && !wrapRef.current.contains(target)) onOutside()
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [onOutside, wrapRef])

  useEffect(() => {
    if (!open) return
    const reposition = () => {
      if (wrapRef.current && panelRef.current) positionFloatingPanel(wrapRef.current, panelRef.current, { gap, matchWidth, alignRight })
    }
    document.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      document.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open, gap, matchWidth, alignRight, wrapRef, panelRef])
}
