import { useMemo } from 'react'
import { apiFetch } from '@slc/api-client'
import { useAsync } from '@slc/api-client/react'
import { MenuBrowser } from './MenuBrowser.tsx'
import type { MenuNode, MenuTile } from '../types.ts'

/**
 * One structure's reports: the folders held under that structure in
 * config/reporting-menu.json, browsed with the same tiles as everywhere else in the hub.
 *
 * The four structures are four routes off Reporting and four entries in the sidebar, but
 * they differ only in which top-level node of the tree they show, so they share this one
 * component rather than four near-identical files.
 *
 * The node is found by label, not by position, so reordering reporting-menu.json can never
 * quietly point a page at another structure's reports; a label that is not in the file at
 * all leaves the section empty, which is what MenuBrowser already renders while the fetch
 * is in flight.
 */
export function ReportingStructureView({ structure, onLaunch, onToast, scrollToTop }: {
  structure: string
  onLaunch: (tile: MenuTile) => void
  onToast: (message: string) => void
  scrollToTop: () => void
}) {
  const menu = useAsync<MenuNode[]>(() => apiFetch<MenuNode[]>('/config/reporting-menu.json'), [])

  // Keep each report area as a browsable folder, including areas with no reports yet.
  const groups = useMemo(() => {
    const areas = menu.data?.find((node) => node.label === structure)?.subgroups ?? []
    return areas.length ? [{ label: 'Report areas', subgroups: areas }] : []
  }, [menu.data, structure])

  return (
    <MenuBrowser
      title={`${structure} Reports`}
      sub={
        groups.length
          ? `Browse ${structure} reports by business area.`
          : `No reporting areas have been identified for ${structure} yet.`
      }
      groups={groups}
      onLaunch={onLaunch}
      onToast={onToast}
      scrollToTop={scrollToTop}
    />
  )
}
