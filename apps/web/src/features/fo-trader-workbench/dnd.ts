import { useCallback, useRef, useState, type DragEvent, type RefObject } from 'react'

export type DragKind = 'deal' | 'txn'

/** The handlers a drop target button spreads, plus its extra class while hovered. */
export type DropProps = {
  'data-drop': DragKind
  onDragOver: (e: DragEvent<HTMLButtonElement>) => void
  onDragLeave: () => void
  onDrop: (e: DragEvent<HTMLButtonElement>) => void
}

export type Dnd = {
  /** The kind being dragged, or null — rows render `.dragging`, targets `.drop-ready`. */
  dragging: { kind: DragKind; id: string } | null
  over: string | null
  start: (e: DragEvent<HTMLElement>, kind: DragKind, id: string, label: string) => void
  end: () => void
  /** `target` names the button so only it lights up; `onWrongKind` reports a deal dropped on a txn action. */
  drop: (target: string, kind: DragKind, disabled: boolean, onDrop: () => void, onWrongKind: (kind: DragKind) => void) => DropProps
}

/**
 * The original's startRowDrag / wireDropTarget: a selected row drags onto an action button,
 * which then runs the same handler as a click. The ghost label is appended inside the scope
 * root so the scoped stylesheet reaches it.
 */
export function useDnd(rootRef: RefObject<HTMLElement | null>): Dnd {
  const payload = useRef<{ kind: DragKind; id: string } | null>(null)
  const [dragging, setDragging] = useState<{ kind: DragKind; id: string } | null>(null)
  const [over, setOver] = useState<string | null>(null)

  const start = useCallback(
    (e: DragEvent<HTMLElement>, kind: DragKind, id: string, label: string) => {
      payload.current = { kind, id }
      setDragging({ kind, id })
      const ghost = document.createElement('div')
      ghost.className = 'drag-ghost'
      ghost.textContent = label
      ;(rootRef.current ?? document.body).appendChild(ghost)
      e.dataTransfer.effectAllowed = 'copy'
      try {
        e.dataTransfer.setData('text/plain', id)
      } catch {
        // Some browsers refuse custom data; the drag still works through the ref.
      }
      e.dataTransfer.setDragImage(ghost, 12, 14)
      setTimeout(() => ghost.remove(), 0)
    },
    [rootRef],
  )
  const end = useCallback(() => {
    payload.current = null
    setDragging(null)
    setOver(null)
  }, [])

  const drop: Dnd['drop'] = (target, kind, disabled, onDrop, onWrongKind) => ({
    'data-drop': kind,
    onDragOver: (e) => {
      if (!payload.current) return
      e.preventDefault()
      e.dataTransfer.dropEffect = payload.current.kind === kind ? 'copy' : 'none'
      if (payload.current.kind === kind) setOver(target)
    },
    onDragLeave: () => setOver((cur) => (cur === target ? null : cur)),
    onDrop: (e) => {
      e.preventDefault()
      setOver(null)
      const p = payload.current
      if (!p) return
      if (p.kind !== kind) {
        onWrongKind(kind)
        return
      }
      if (!disabled) onDrop()
    },
  })

  return { dragging, over, start, end, drop }
}

/** The class a drop target adds: drag-over while hovered, drop-ready while a matching row is dragged. */
export function dropCls(dnd: Dnd, target: string, kind: DragKind, disabled: boolean): string {
  if (dnd.over === target) return ' drag-over'
  if (dnd.dragging && dnd.dragging.kind === kind && !disabled) return ' drop-ready'
  return ''
}
