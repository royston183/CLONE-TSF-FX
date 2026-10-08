import { useNavigate } from 'react-router-dom'
import './BackButton.css'

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
 */
export function BackButton({ className = 'btn', label = 'Back', onClick }: BackButtonProps) {
  const navigate = useNavigate()

  const goBack = () => {
    const index = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (index > 0) navigate(-1)
    else navigate('/')
  }

  return (
    <button type="button" className={className} title="Back to the previous page" onClick={onClick ?? goBack}>
      <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
      </svg>
      <span className="label">{label}</span>
    </button>
  )
}
