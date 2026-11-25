import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogOut, RefreshCw } from 'lucide-react'
import { ConnectionIndicator, FS_LOGO, NotificationBell } from '@slc/ui'
import { useAuth } from '../auth/AuthContext.tsx'
import type { Theme } from '../shared/theme.ts'
import { ThemeToggle } from './ThemeToggle.tsx'

/**
 * The top bar (LAS Central): brand lockup at the left; at the right, in order — system
 * connection, a divider, refresh, day/night, then the signed-in user with sign-out.
 * White surface, 52px, hairline underneath.
 */
export function HubHeader({
  theme,
  onToggleTheme,
  onRefresh,
}: {
  theme: Theme
  onToggleTheme: () => void
  onRefresh: () => Promise<unknown> | void
}) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [refreshing, setRefreshing] = useState(false)
  const name = user?.displayName?.trim() || user?.username || ''
  const initial = name.charAt(0).toUpperCase() || '?'

  const refresh = () => {
    if (refreshing) return
    setRefreshing(true)
    // The reload is fire-and-forget, so the icon turns for a beat to show it was heard.
    Promise.all([Promise.resolve(onRefresh()), new Promise((r) => setTimeout(r, 700))]).finally(() =>
      setRefreshing(false),
    )
  }

  const leave = async () => {
    try {
      await signOut()
    } finally {
      navigate('/login', { replace: true })
    }
  }

  return (
    <header className="topbar">
      <Link className="brand" to="/overview">
        <span className="brand-mark">
          <img className="brand-logo" alt="Fourth Signal" src={FS_LOGO} />
        </span>
        <div className="brand-text">
          <h1>TSF</h1>
          <p>FS &bull; VISTA</p>
        </div>
      </Link>

      <div className="topbar-tools">
        <span className="topbar-company" title="Connection to SAP TRM through the gateway">
          <ConnectionIndicator />
          SAP TRM
        </span>
        <i className="topbar-divider" aria-hidden="true" />
        <button
          type="button"
          className="slc-icon-btn"
          aria-label="Refresh workspace"
          title="Reload the latest data"
          aria-busy={refreshing || undefined}
          onClick={refresh}
        >
          <RefreshCw size={17} className={refreshing ? 'slc-spin' : ''} aria-hidden="true" />
        </button>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        {/* Nothing in TSF raises notifications yet; the bell is wired to take a list. */}
        <NotificationBell items={[]} />
        <div className="topbar-user">
          <span className="avatar" aria-hidden="true">
            {initial}
          </span>
          <div>
            <b>{name || 'Signed out'}</b>
            <small>{user?.username ? `Operations · ${user.username}` : ''}</small>
          </div>
          <button
            type="button"
            className="slc-icon-btn"
            aria-label="Sign out"
            title="Sign out"
            onClick={() => void leave()}
          >
            <LogOut size={17} aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  )
}
