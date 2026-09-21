import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext.tsx'

export type SignOutButtonProps = {
  /**
   * The host application's own button class, so the control looks native in whichever
   * console it sits in — "btn" in the OTTK/DTTK/Deal ID consoles, "path-switch" on the menu.
   * This component deliberately carries no styling of its own.
   */
  className?: string
  label?: string
  showIcon?: boolean
  /**
   * An icon to draw instead of the built-in glyph. The converted consoles all want the
   * Material arrow below, which matches their legacy chrome; the hub sidebar is drawn in
   * Inter and lucide, and passes its own so the rail keeps one icon family.
   */
  icon?: ReactNode
}

/**
 * Sign out, for the top right of every application header.
 *
 * The legacy consoles had no user session at all, so there is no original to match here.
 * It therefore borrows the host page's own button class rather than introducing a look of
 * its own, which would be the one element on screen that did not belong.
 */
export function SignOutButton({
  className = 'btn',
  label = 'Sign out',
  showIcon = true,
  icon,
}: SignOutButtonProps) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  const onClick = async () => {
    setBusy(true)
    try {
      await signOut()
      navigate('/login', { replace: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      // The signed-in user is in the tooltip rather than on screen: the headers are
      // reproductions of pages that had no room reserved for it.
      title={user ? `Signed in as ${user.displayName} — sign out` : 'Sign out'}
      onClick={() => void onClick()}
    >
      {icon ??
        (showIcon ? (
          <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
            <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.59L17 17l5-5-5-5zM4 5h8V3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8v-2H4V5z" />
          </svg>
        ) : null)}
      <span className="label">{label}</span>
    </button>
  )
}
