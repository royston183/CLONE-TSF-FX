import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from '@tsfx/lib/client/nav'
import { OPEN_POPUP_SELECTOR, isPlainF3, pickBackTarget, type BackEntry } from './back-shortcut.ts'
import './BackButton.css'

/** The Back buttons on the page, in mount order. One window listener serves them all, so F3 never fires twice. */
const mounted: BackEntry[] = []

function onKeyDown(e: KeyboardEvent) {
  if (!isPlainF3(e)) return
  // A popup that is up has its own way out; F3 must not take the page from under it.
  if (document.querySelector(OPEN_POPUP_SELECTOR)) return
  const target = pickBackTarget(mounted)
  if (!target) return
  e.preventDefault() // not the browser's "find next"
  target.run()
}

export type BackButtonProps = {
  /** The host application's own button class, so the control looks native in its header. */
  className?: string
  label?: string
  /** Replaces the default action, for screens whose Back first leaves an in-page state. */
  onClick?: (() => void) | undefined
}

/**
 * Goes back: to the previous page in this tab, or, when this screen is the first thing the tab opened (a deep link or a
 * refresh), to its parent catalogue folder. F3 does the same as a click (as in SAP GUI) and leaves an open popup alone.
 */
export function BackButton({ className = 'btn', label = 'Back', onClick }: BackButtonProps) {
  const router = useRouter()
  const pathname = usePathname()

  const goBack = () => {
    if (history.length > 1) {
      router.back()
      return
    }
    const parent = pathname.split('/').filter(Boolean).slice(0, -1)
    router.push(parent.length ? `/${parent.join('/')}` : '/fx-structure')
  }

  // The latest action, so F3 does what a click would do right now.
  const run = useRef(onClick ?? goBack)
  useEffect(() => {
    run.current = onClick ?? goBack
  })
  useEffect(() => {
    const entry: BackEntry = { label, run: () => run.current() }
    mounted.push(entry)
    if (mounted.length === 1) window.addEventListener('keydown', onKeyDown)
    return () => {
      mounted.splice(mounted.indexOf(entry), 1)
      if (mounted.length === 0) window.removeEventListener('keydown', onKeyDown)
    }
  }, [label])

  return (
    <button type="button" className={className} title="Back to the previous page (F3)" onClick={onClick ?? goBack}>
      <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
      </svg>
      <span className="label">{label}</span>
    </button>
  )
}
