import { useEffect, useLayoutEffect, type RefObject } from 'react'

type PanelOptions = { gap?: number | undefined }

export function positionFloatingPanel(trigger: HTMLElement, panel: HTMLElement, opts: PanelOptions = {}) {
  const margin = 8
  const gap = opts.gap ?? 5
  const r = trigger.getBoundingClientRect()
  const vw = document.documentElement.clientWidth || window.innerWidth
  const vh = document.documentElement.clientHeight || window.innerHeight
  const pw = panel.offsetWidth || 288
  const ph = panel.offsetHeight || 310
  let left = r.left
  if (left + pw > vw - margin) left = Math.max(margin, vw - pw - margin)
  let top = r.bottom + gap
  if (top + ph > vh - margin && r.top - ph - gap >= margin) top = r.top - ph - gap
  panel.style.position = 'fixed'
  panel.style.left = `${Math.max(margin, left)}px`
  panel.style.top = `${Math.max(margin, top)}px`
}

export function useFloatingPanel({
  open,
  wrapRef,
  panelRef,
  onOutside,
  contentKey,
}: {
  open: boolean
  wrapRef: RefObject<HTMLElement | null>
  panelRef: RefObject<HTMLElement | null>
  onOutside: () => void
  contentKey?: unknown
}) {
  useLayoutEffect(() => {
    if (!open || !wrapRef.current || !panelRef.current) return
    positionFloatingPanel(wrapRef.current, panelRef.current)
  }, [open, contentKey, wrapRef, panelRef])

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
      if (wrapRef.current && panelRef.current) positionFloatingPanel(wrapRef.current, panelRef.current)
    }
    document.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      document.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open, wrapRef, panelRef])
}
