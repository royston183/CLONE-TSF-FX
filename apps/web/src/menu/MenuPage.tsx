import { useCallback, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '@slc/api-client'
import { useAsync } from '@slc/api-client/react'
import { Sidebar } from './Sidebar.tsx'
import { ThemeToggle } from './ThemeToggle.tsx'
import { useTheme } from '../shared/ThemeContext.tsx'
import { AdminView } from './sections/AdminView.tsx'
import { FxStructureView } from './sections/FxStructureView.tsx'
import { IcfsStructureView } from './sections/IcfsStructureView.tsx'
import { MasterDataView } from './sections/MasterDataView.tsx'
import { OverviewView } from './sections/OverviewView.tsx'
import { ReportingStructureView } from './sections/ReportingStructureView.tsx'
import { ReportingView } from './sections/ReportingView.tsx'
import { SlcStructureView } from './sections/SlcStructureView.tsx'
import { TradeFlowsView } from './sections/TradeFlowsView.tsx'
import { XlcCrpStructureView } from './sections/XlcCrpStructureView.tsx'
import type { AppEntry, MenuNode, MenuTile } from './types.ts'
import './menu-path.css'
import './menu-path.overrides.css'
import './menu-shell.css'

/**
 * TSF hub shell: header, sign-out and the toast, hosting the menu path section below.
 *
 * Fetches the menu tree and the app registry, resolves tiles through config/apps.json to an
 * in-app route, and owns the toast shown when a tile launches or fails to. The tile browser
 * itself — the faithful reproduction of legacy/Menu Path.html — lives in SlcStructureView.
 *
 * The header and toast markup below is still legacy-governed: the brand, brand-logo, brand-text,
 * path-switch, ps-label, header-right and toast classes are all defined in the generated,
 * .mp-scoped menu-path.css. Anything here that looks simplifiable is most likely load-bearing
 * for the appearance — check the original before changing it.
 *
 * Sign-out and the connection dot used to sit in header-right. They now live at the foot of
 * the sidebar, beside the signed-in user, matching the DSA console's shell; the theme toggle
 * stays here because it is a display preference rather than part of the session.
 *
 * The brand below is the only one in the shell. DSA carries its lockup in the sidebar
 * instead, because its topbar has none — porting that here as well would have meant two.
 */

const BRAND_LOGO =
  'https://raw.githubusercontent.com/ryannayak/fs-assets/e82f35a83e28689167b22b4300d4994a249acee0/fs-short-logo.png'

export type HubSection =
  | 'master-data'
  | 'overview'
  | 'trade-flows'
  | 'fx-structure'
  | 'slc-structure'
  | 'xlc-crp-structure'
  | 'icfs-structure'
  | 'reporting'
  | 'reporting-fx-structure'
  | 'reporting-slc-structure'
  | 'reporting-xlc-crp-structure'
  | 'reporting-icfs-structure'
  | 'admin'

/**
 * Reporting's four child sections differ only in which structure they show, so they map to a
 * label in config/reporting-menu.json rather than to four components. The labels are the
 * ones in that file — ReportingStructureView looks the node up by label.
 */
const REPORTING_STRUCTURES: Partial<Record<HubSection, string>> = {
  'reporting-fx-structure': 'FX Structure',
  'reporting-slc-structure': 'SLC Structure',
  'reporting-xlc-crp-structure': 'XLC-CRP Structure',
  'reporting-icfs-structure': 'ICFS Structure',
}

export function MenuPage({ section }: { section: HubSection }) {
  const navigate = useNavigate()
  const [toast, setToast] = useState<string>()
  // menu-path.overrides.css makes <main>, not the document, the scroll container (.mp has
  // overflow: hidden and .mp main has overflow-y: auto), so scrolling the page back to the
  // top on navigation means scrolling this element, not window.scrollTo.
  const mainRef = useRef<HTMLElement | null>(null)
  const scrollToTop = useCallback(() => {
    mainRef.current?.scrollTo(0, 0)
  }, [])

  // Owned by ThemeProvider above the router, not here: the choice has to outlive this page so
  // that opening an application from a tile does not drop back to a light screen.
  const { theme, toggleTheme } = useTheme()

  const menu = useAsync<MenuNode[]>(() => apiFetch<MenuNode[]>('/config/menu.json'), [])
  const registry = useAsync<{ apps: AppEntry[] }>(() => apiFetch('/config/apps.json'), [])

  const appsByCode = useMemo(() => {
    const map = new Map<string, AppEntry>()
    for (const app of registry.data?.apps ?? []) map.set(app.code, app)
    return map
  }, [registry.data])

  const showToast = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(undefined), 2200)
  }, [])

  const groups = menu.data ?? []
  const reportingStructure = REPORTING_STRUCTURES[section]

  const launch = useCallback(
    (tile: MenuTile) => {
      const app = appsByCode.get(tile.code)
      if (!app || app.status === 'planned') {
        showToast(`${tile.title} is not wired up yet.`)
        return
      }
      showToast(`Opening ${tile.title}…`)
      navigate(app.route)
    },
    [appsByCode, navigate, showToast],
  )

  return (
    <div className="mp">
      <header>
        <div className="brand">
          <img className="brand-logo" alt="Fourth Signal" src={BRAND_LOGO} />
          <div className="brand-text">
            <h1>TSF</h1>
            <p>FS &bull; VISTA</p>
          </div>
        </div>
        <div className="header-right">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </header>

      <div className="mp-body">
        <Sidebar />
        <main ref={mainRef}>
          {section === 'master-data' ? (
            <MasterDataView onToast={showToast} />
          ) : section === 'overview' ? (
            <OverviewView />
          ) : section === 'trade-flows' ? (
            <TradeFlowsView groups={groups} onLaunch={launch} />
          ) : section === 'fx-structure' ? (
            <FxStructureView onLaunch={launch} onToast={showToast} scrollToTop={scrollToTop} />
          ) : section === 'xlc-crp-structure' ? (
            <XlcCrpStructureView />
          ) : section === 'icfs-structure' ? (
            <IcfsStructureView />
          ) : reportingStructure ? (
            <ReportingStructureView
              structure={reportingStructure}
              onLaunch={launch}
              onToast={showToast}
              scrollToTop={scrollToTop}
            />
          ) : section === 'reporting' ? (
            <ReportingView />
          ) : section === 'admin' ? (
            <AdminView />
          ) : (
            <SlcStructureView
              groups={groups}
              onLaunch={launch}
              onToast={showToast}
              scrollToTop={scrollToTop}
            />
          )}
        </main>
      </div>

      <div className={toast ? 'toast show' : 'toast'}>{toast}</div>
    </div>
  )
}
