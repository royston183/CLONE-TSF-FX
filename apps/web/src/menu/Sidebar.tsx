import { Fragment } from 'react'
import { NavLink } from 'react-router-dom'
import {
  ArrowLeftRight,
  ArrowUpDown,
  BarChart3,
  Database,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Network,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext.tsx'
import { SignOutButton } from '../auth/SignOutButton.tsx'

type SidebarChild = { to: string; label: string }

type SidebarItem = {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  /** Sub-entries shown indented under the item; only Reporting has any. */
  children?: SidebarChild[]
}

/**
 * Display order is independent of the routes; `/` redirects to Overview.
 *
 * The glyphs are lucide's, at the 19px the sibling DSA app draws its rail at, so the two
 * consoles share one icon family. They are stroked rather than filled: a filled set at this
 * size reads much heavier than the Inter text beside it.
 */
const ITEMS: SidebarItem[] = [
  { to: '/overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/master-data', label: 'Master Data', icon: Database },
  { to: '/trade-flows', label: 'Trade Flows', icon: ArrowLeftRight },
  { to: '/fx-structure', label: 'FX Structure', icon: ArrowUpDown },
  { to: '/slc-structure', label: 'SLC Structure', icon: LayoutGrid },
  { to: '/xlc-crp-structure', label: 'XLC-CRP Structure', icon: Network },
  { to: '/icfs-structure', label: 'ICFS Structure', icon: Layers },
  {
    to: '/reporting',
    label: 'Reporting',
    icon: BarChart3,
    // Reports are held one subtree per structure, so the structures are the navigation and
    // each has a page of its own. The parent route stays matched while a child is open —
    // `end` is left off here — so Reporting still reads as the section you are in.
    children: [
      { to: '/reporting/fx-structure', label: 'FX Structure' },
      { to: '/reporting/slc-structure', label: 'SLC Structure' },
      { to: '/reporting/xlc-crp-structure', label: 'XLC-CRP Structure' },
      { to: '/reporting/icfs-structure', label: 'ICFS Structure' },
    ],
  },
  { to: '/admin', label: 'Admin', icon: Settings },
]

/**
 * The hub's section navigation: an icon rail that widens to show its labels while the
 * pointer is over it, or while something inside it has keyboard focus.
 *
 * There is no state here on purpose. The rail expands through :hover and :focus-within in
 * menu-shell.css and overlays the content rather than displacing it, so nothing reflows and
 * React never re-renders on a mouse move. The labels stay in the DOM at every width — they
 * are revealed with opacity, not display — so a screen reader always reads them.
 *
 * The nested children follow the same rule: they are always rendered and always focusable,
 * and the rail collapses their height rather than removing them, so tabbing into one opens
 * the rail around it.
 *
 * Above and below the navigation sit the "Workspace" eyebrow and the session footer, from
 * the DSA console's sidebar. Both are built from .mp-side-label spans and so reveal on
 * exactly the same hover/focus rule as the nav labels — the status dot and the avatar are
 * the only things that survive at rail width, which is all 64px has room for.
 *
 * DSA's sidebar also carries the brand lockup, because its topbar has none. Ours is not
 * ported: this header already shows the logo and wordmark, and repeating them here put two
 * identical lockups within 50px of each other.
 */
export function Sidebar() {
  const { user } = useAuth()
  const initial = user?.displayName.trim().charAt(0).toUpperCase() || '?'

  return (
    <nav className="mp-side" aria-label="TSF sections">
      <div className="mp-side-eyebrow mp-side-label">Workspace</div>

      <div className="mp-side-items">
        {ITEMS.map((item) => {
          const Icon = item.icon
          return (
            <Fragment key={item.to}>
              <NavLink
                to={item.to}
                end={item.end ?? false}
                className={({ isActive }) => (isActive ? 'mp-side-item active' : 'mp-side-item')}
              >
                <Icon size={19} aria-hidden="true" />
                <span className="mp-side-label">{item.label}</span>
              </NavLink>
              {item.children ? (
                <div className="mp-side-children">
                  {item.children.map((child) => (
                    <NavLink
                      key={child.to}
                      to={child.to}
                      className={({ isActive }) =>
                        isActive
                          ? 'mp-side-item mp-side-child active'
                          : 'mp-side-item mp-side-child'
                      }
                    >
                      <span className="mp-side-label">{child.label}</span>
                    </NavLink>
                  ))}
                </div>
              ) : null}
            </Fragment>
          )
        })}
      </div>

      <div className="mp-side-foot">
        {/* .status-dot is the generated stylesheet's own pulsing teal dot, moved here out of
            the header so the connection state sits with the session it belongs to. */}
        <div className="mp-side-status">
          <span className="status-dot" />
          <span className="mp-side-label">SAP TRM connected</span>
        </div>
        <p className="mp-side-blurb mp-side-label">
          Trade &amp; Structured Finance operations on SAP TRM.
        </p>
        <div className="mp-side-user">
          <span className="mp-side-avatar">{initial}</span>
          <span className="mp-side-identity mp-side-label">
            <b>{user?.displayName ?? 'Signed out'}</b>
            <small>{user?.username ?? ''}</small>
          </span>
          {/* Icon-only by CSS rather than by dropping the label: the text stays in the
              accessibility tree, so the control is still named for a screen reader. */}
          <SignOutButton
            className="mp-side-signout mp-side-label"
            icon={<LogOut size={18} aria-hidden="true" />}
          />
        </div>
      </div>
    </nav>
  )
}
