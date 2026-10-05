import { Fragment, useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { FOLDER_SVG, Tile } from '../Tile.tsx'
import { loadMemory, saveMemory, withScroll, withoutScroll, levelKey, type NavMemory } from '../navMemory.ts'
import { childrenOf } from '../types.ts'
import type { MenuNode, MenuTile } from '../types.ts'
import type { ReactNode } from 'react'

/** Exactly the wording renderFolderTile() produced, plus the mixed case the FX tree needs. */
function folderDesc(node: MenuNode): string {
  const screens = node.items?.length ?? 0
  const folders = node.subgroups?.length ?? 0
  if (!screens && !folders) return 'Not set up yet.'
  if (screens && folders) {
    return `${screens} screen${screens !== 1 ? 's' : ''} and ${folders} folder${folders !== 1 ? 's' : ''}.`
  }
  if (folders) return `${folders} folder${folders !== 1 ? 's' : ''} in this area.`
  return `${screens} screen${screens !== 1 ? 's' : ''} in this sub-process.`
}

/**
 * The hub's tile browser: a grid of groups at the top level, folder drill-down below it, and
 * a launcher for the screens inside.
 *
 * This is legacy/Menu Path.html's tile browser, element for element and class for class —
 * menu-path.css is that page's own stylesheet, so the markup is what gives it its
 * appearance. It was SLC Structure's alone until FX Structure arrived with a second tree of
 * the same shape; the only things either section supplies are its title, its lead-in and its
 * groups, so those are the props and nothing else here is per-section.
 */
export function MenuBrowser({ title, sub, groups, onLaunch, onToast, scrollToTop }: {
  title: string
  sub: ReactNode
  groups: MenuNode[]
  onLaunch: (tile: MenuTile) => void
  onToast: (message: string) => void
  // <main>, not the document, is the scroll container here (see MenuPage), so drilling in or
  // going up must scroll that element back to the top, not call window.scrollTo.
  scrollToTop: () => void
}) {
  // Where the user is, remembered for the tab: opening a screen unmounts this page and Back
  // remounts it, and without this it came back at the top of the main menu.
  const { pathname } = useLocation()
  const memoryKey = `${pathname}|${title}`
  const [memory, setMemory] = useState<NavMemory>(() => loadMemory(memoryKey))
  const memoryRef = useRef(memory)
  const remember = useCallback(
    (next: NavMemory) => {
      memoryRef.current = next
      saveMemory(memoryKey, next)
      setMemory(next)
    },
    [memoryKey],
  )
  const path = memory.path

  // <main> is the scroll container (see MenuPage); this component renders into it.
  const mainEl = () => document.querySelector<HTMLElement>('.mp main')
  const currentScroll = () => mainEl()?.scrollTop ?? 0

  const nodeAt = useCallback(
    (target: number[]): MenuNode | undefined => {
      let node: MenuNode | undefined = groups[target[0] ?? -1]
      for (let i = 1; i < target.length; i++) node = node?.subgroups?.[target[i] ?? -1]
      return node
    },
    [groups],
  )

  const trailAt = useCallback(
    (target: number[]): string[] => {
      const out: string[] = []
      let node: MenuNode | undefined = groups[target[0] ?? -1]
      if (node) out.push(node.label)
      for (let i = 1; i < target.length; i++) {
        node = node?.subgroups?.[target[i] ?? -1]
        if (node) out.push(node.label)
      }
      return out
    },
    [groups],
  )

  const openFolder = useCallback(
    (target: number[]) => {
      const node = nodeAt(target)
      if (!node) return
      if (!childrenOf(node).length) {
        onToast(`${node.label} has nothing in it yet.`)
        return
      }
      // Leave a note of where this level was scrolled to, and open the folder at its top.
      const left = withScroll(memoryRef.current, memoryRef.current.path, currentScroll())
      remember({ ...withoutScroll(left, target), path: target })
      scrollToTop()
    },
    [nodeAt, onToast, scrollToTop, remember],
  )

  const goUp = () => {
    const from = memoryRef.current.path
    const parent = from.length > 2 ? from.slice(0, -1) : []
    // The parent level keeps the scroll it was left at; the level being closed forgets its own.
    remember({ ...withoutScroll(memoryRef.current, from), path: parent })
  }

  /** Opening a screen leaves this page, so note the scroll first: Back returns to the same spot. */
  const launch = (tile: MenuTile) => {
    remember(withScroll(memoryRef.current, memoryRef.current.path, currentScroll()))
    onLaunch(tile)
  }

  // Put the page back where it was: after Back from a screen, and when going up a folder. Waits
  // for the tree, which loads after mount, and ignores a remembered folder that no longer exists.
  const pathKey = levelKey(path)
  const loaded = groups.length > 0
  useLayoutEffect(() => {
    if (!loaded) return
    if (path.length && !nodeAt(path)) {
      remember({ ...memoryRef.current, path: [] })
      return
    }
    const el = mainEl()
    if (el) el.scrollTop = memoryRef.current.scroll[pathKey] ?? 0
  }, [loaded, pathKey])

  /** Screens first, then the folders beside them — a node may hold both. */
  const contentsOf = (node: MenuNode, at: number[]) => (
    <>
      {(node.items ?? []).map((tile) => (
        <Tile
          key={tile.code}
          icon={tile.icon}
          title={tile.title}
          desc={tile.desc}
          tag={tile.tag}
          onClick={() => launch(tile)}
        />
      ))}
      {(node.subgroups ?? []).map((sub_, si) => (
        <Tile
          key={sub_.label}
          icon={FOLDER_SVG}
          title={sub_.label}
          desc={folderDesc(sub_)}
          tag="Folder"
          folder
          onClick={() => openFolder([...at, si])}
        />
      ))}
    </>
  )

  const current = path.length ? nodeAt(path) : undefined
  const trail = path.length ? trailAt(path) : []
  // Back goes up exactly one level: to the parent folder, or home from the top.
  const backLabel = path.length > 2 ? (trail[trail.length - 2] ?? title) : title

  if (path.length === 0) {
    return (
      <>
        <div className="hub-title">{title}</div>
        <div className="hub-sub">{sub}</div>
        {/* A Fragment, not a wrapper div: .group-label:first-of-type{margin-top:0} would
            match inside every wrapper and flatten the 24px gap between sections. */}
        {groups.map((group, gi) => (
          <Fragment key={group.label}>
            <div className="group-label">{group.label}</div>
            <div className="tile-grid">{contentsOf(group, [gi])}</div>
          </Fragment>
        ))}
      </>
    )
  }

  if (!current) return null

  return (
    <>
      <div className="back-btn" onClick={goUp}>
        &#8592; Back to {backLabel}
      </div>
      <div className="hub-title">{current.label}</div>
      <div className="hub-sub">
        {trail.slice(0, -1).join(' › ')}. Pick a {current.subgroups ? 'folder' : 'screen'} below.
      </div>
      <div className="tile-grid">{contentsOf(current, path)}</div>
    </>
  )
}
