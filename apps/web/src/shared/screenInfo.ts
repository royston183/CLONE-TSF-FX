// What the shared screen bar says about a screen: its title and its description, from the same configuration that
// builds the menu (config/apps.json for the screens, the menu files for each tile's description).
import apps from '../../../../config/apps.json'
import menu from '../../../../config/menu.json'
import fxMenu from '../../../../config/fx-menu.json'
import reportingMenu from '../../../../config/reporting-menu.json'

interface Tile { code?: string; title?: string; desc?: string }

const tiles = new Map<string, Tile>()
const walk = (node: unknown): void => {
  if (Array.isArray(node)) node.forEach(walk)
  else if (node && typeof node === 'object') {
    const t = node as Tile
    if (typeof t.code === 'string' && typeof t.title === 'string') tiles.set(t.code, t)
    Object.values(node).forEach(walk)
  }
}
;[menu, fxMenu, reportingMenu].forEach(walk)

const byId = new Map((apps as { apps: { id: string; code: string; title: string }[] }).apps.map((a) => [a.id, a]))

export interface ScreenInfo { title: string; description: string }

/** The title and description of the screen opened at /apps/<appId>; empty strings for an unknown one. */
export function screenInfo(appId: string): ScreenInfo {
  const app = byId.get(appId)
  const tile = app ? tiles.get(app.code) : undefined
  return { title: app?.title ?? tile?.title ?? '', description: tile?.desc ?? '' }
}
