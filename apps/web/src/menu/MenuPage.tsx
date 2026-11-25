import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeftRight,
  ArrowUpDown,
  BarChart3,
  Database,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  Network,
  Settings,
} from 'lucide-react'
import { PageHeader } from '@slc/ui'
import { apiFetch } from '@slc/api-client'
import { useAsync } from '@slc/api-client/react'
import { Sidebar } from './Sidebar.tsx'
import { HubHeader } from './HubHeader.tsx'
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

/**
 * What the page-header strip says for each section: its icon, and its path under "Workspace".
 * `flat` sections have no title of their own inside the page, so the strip carries it; the
 * others (the tile browsers) keep their own drill-down heading under the strip.
 */
const SECTION_HEAD: Record<HubSection, { icon: ReactNode; path: string[]; flat: boolean }> = {
  overview: { icon: <LayoutDashboard />, path: ['Overview'], flat: true },
  'master-data': { icon: <Database />, path: ['Master Data'], flat: true },
  'trade-flows': { icon: <ArrowLeftRight />, path: ['Trade Flows'], flat: true },
  'fx-structure': { icon: <ArrowUpDown />, path: ['FX Structure'], flat: false },
  'slc-structure': { icon: <LayoutGrid />, path: ['SLC Structure'], flat: false },
  'xlc-crp-structure': { icon: <Network />, path: ['XLC-CRP Structure'], flat: true },
  'icfs-structure': { icon: <Layers />, path: ['ICFS Structure'], flat: true },
  reporting: { icon: <BarChart3 />, path: ['Reporting'], flat: true },
  'reporting-fx-structure': { icon: <BarChart3 />, path: ['Reporting', 'FX Structure'], flat: false },
  'reporting-slc-structure': { icon: <BarChart3 />, path: ['Reporting', 'SLC Structure'], flat: false },
  'reporting-xlc-crp-structure': { icon: <BarChart3 />, path: ['Reporting', 'XLC-CRP Structure'], flat: false },
  'reporting-icfs-structure': { icon: <BarChart3 />, path: ['Reporting', 'ICFS Structure'], flat: false },
  admin: { icon: <Settings />, path: ['Admin'], flat: true },
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
      <HubHeader
        theme={theme}
        onToggleTheme={toggleTheme}
        onRefresh={() => {
          menu.reload()
          registry.reload()
        }}
      />

      <div className="mp-body">
        <Sidebar />
        <main ref={mainRef} data-flat={SECTION_HEAD[section].flat || undefined}>
          <PageHeader
            icon={SECTION_HEAD[section].icon}
            breadcrumb={['Workspace', ...SECTION_HEAD[section].path]}
            title={SECTION_HEAD[section].path[SECTION_HEAD[section].path.length - 1] ?? ''}
          />
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
