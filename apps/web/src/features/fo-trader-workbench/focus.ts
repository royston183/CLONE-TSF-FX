import { useLayoutEffect, useRef, type RefObject } from 'react'

type FocusFrame = { active?: boolean; closing: boolean; opener?: HTMLElement | null }

function topDialog(): HTMLElement | undefined {
  const all = [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')].filter((el) => el.getClientRects().length && !el.closest('.closing,[inert]'))
  return all.filter((el) => el.classList.contains('std-pop')).at(-1) ?? all.at(-1)
}

function tabStops(dialog: HTMLElement): HTMLElement[] {
  return [...dialog.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],[tabindex]')].filter((el) => el.tabIndex >= 0 && !el.matches(':disabled') && !el.closest('[inert]') && el.getClientRects().length)
}

/** Shared popups are portaled; this adapter keeps their focus behaviour local to this feature. */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, frame: FocusFrame) {
  const opener = useRef(frame.opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null))
  const active = frame.active !== false && !frame.closing
  useLayoutEffect(() => {
    const dialog = ref.current
    if (!active || !dialog) return
    const focusFirst = () => {
      const preferred = dialog.querySelector<HTMLElement>('[autofocus],.field input:not([readonly]):not(:disabled),.field select:not(:disabled),.row-select-checkbox')
      ;(preferred ?? tabStops(dialog)[0] ?? dialog).focus({ preventScroll: true })
    }
    if (!dialog.contains(document.activeElement) && topDialog() === dialog) focusFirst()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || topDialog() !== dialog) return
      const stops = tabStops(dialog), first = stops[0], last = stops.at(-1)
      if (!first || !last) { e.preventDefault(); dialog.focus(); return }
      if (e.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { e.preventDefault(); first.focus() }
    }
    const onFocus = (e: FocusEvent) => {
      if (topDialog() === dialog && e.target instanceof Node && !dialog.contains(e.target)) focusFirst()
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('focusin', onFocus)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('focusin', onFocus)
    }
  }, [active, ref])
  useLayoutEffect(() => () => {
    queueMicrotask(() => {
      const target = opener.current, top = topDialog()
      if (target?.isConnected && !target.closest('[inert]') && (!top || top.contains(target))) target.focus({ preventScroll: true })
    })
  }, [])
}

export function usePortalFocus(frame: FocusFrame) {
  const ref = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => { ref.current = [...document.querySelectorAll<HTMLElement>('.std-pop[role="dialog"]')].at(-1) ?? null }, [])
  useDialogFocus(ref, frame)
}
