import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export type ModalState = 'open' | 'closing' | 'closed'

export type Modal = {
  state: ModalState
  open: () => void
  /** Plays the original's 160 ms pop-out before hiding. */
  close: () => void
  /** Hides at once, as Refresh does with every popup. */
  hide: () => void
}

export function useModal(): Modal {
  const [state, setState] = useState<ModalState>('closed')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const open = useCallback(() => {
    clearTimeout(timer.current)
    setState('open')
  }, [])
  const close = useCallback(() => {
    setState((s) => {
      if (s !== 'open') return s
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setState((cur) => (cur === 'closing' ? 'closed' : cur)), 160)
      return 'closing'
    })
  }, [])
  const hide = useCallback(() => {
    clearTimeout(timer.current)
    setState('closed')
  }, [])

  return useMemo(() => ({ state, open, close, hide }), [state, open, close, hide])
}

/**
 * The original's .modal-overlay. Opening it focuses the Close (x) button, like the original;
 * there is no click-on-backdrop dismissal, only Close, the x and Escape.
 */
export function Overlay({
  modal,
  stacked = false,
  labelledBy,
  children,
}: {
  modal: Modal
  /** The stack-2 overlays (document, transaction) sit above the Message Log. */
  stacked?: boolean
  labelledBy: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (modal.state === 'open') ref.current?.querySelector<HTMLElement>('.modal-close-btn')?.focus()
  }, [modal.state])

  const cls = ['modal-overlay', stacked ? 'stack-2' : '', modal.state === 'open' ? 'open' : '', modal.state === 'closing' ? 'open closing' : '']
    .filter(Boolean)
    .join(' ')
  return (
    <div ref={ref} className={cls} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
      {children}
    </div>
  )
}
