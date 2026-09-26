import { apiFetch } from '@slc/api-client'
import { useAsync } from '@slc/api-client/react'
import { MenuBrowser } from './MenuBrowser.tsx'
import type { MenuNode, MenuTile } from '../types.ts'

/**
 * FX Structure: the SAP FX menu tree, browsed with the same tiles and folders as SLC
 * Structure.
 *
 * The tree is config/fx-menu.json — the transactions as the SAP menu lists them, codes and
 * all — and it is fetched here rather than in MenuPage because this is the only section that
 * reads it; the hub's other five pages should not pull it down.
 *
 * Only some of these transactions have a converted screen behind them. A tile whose code has
 * an entry in config/apps.json launches it; for the rest the launcher says so in a toast.
 */
export function FxStructureView({ onLaunch, onToast, scrollToTop }: {
  onLaunch: (tile: MenuTile) => void
  onToast: (message: string) => void
  scrollToTop: () => void
}) {
  const menu = useAsync<MenuNode[]>(() => apiFetch<MenuNode[]>('/config/fx-menu.json'), [])

  return (
    <MenuBrowser
      title="FX Structure"
      sub="Master contract, front office, mid office and settlement transactions from the SAP FX menu. Tiles with a converted screen open it; the rest are not built yet."
      groups={menu.data ?? []}
      onLaunch={onLaunch}
      onToast={onToast}
      scrollToTop={scrollToTop}
    />
  )
}
