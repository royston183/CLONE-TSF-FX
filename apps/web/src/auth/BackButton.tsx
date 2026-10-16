import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
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
  /** Replaces the history navigation, for screens whose Back first leaves an in-page state. */
  onClick?: (() => void) | undefined
}

/**
 * Goes back to the previous page.
 *
 * Real history, not a hardcoded link to the menu: opening DTTK from an OTTK ticket number
 * and pressing Back should return to OTTK, which a fixed destination would get wrong.
 *
 * React Router stamps every entry it pushes with an index. Index 0 means this route is the
 * first thing this tab visited — a deep link, a refresh, or a fresh sign-in — so there is no
 * in-app page behind it and going "back" would leave the application. In that case it falls
 * back to the menu, which is the only sensible destination.
 *
 * className="fx-back-btn" gives the uniform look (BackButton.css) used across the FX screens.
 *
 * F3 does the same as clicking it, as in SAP GUI: it uses the button's own onClick when it has one, and is left to an open popup.
 * A screen that also has an Exit button keeps F3 on the one labelled "Back".
 */
export function BackButton({ className = 'btn', label = 'Back', onClick }: BackButtonProps) {
  const navigate = useNavigate()

  const goBack = () => {
    const index = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (index > 0) navigate(-1)
    else navigate('/')
  }

  // The latest action, so F3 does what a click would do right now (the screen's own onClick may change between renders).
  const run = useRef(onClick ?? goBack)
  run.current = onClick ?? goBack
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
