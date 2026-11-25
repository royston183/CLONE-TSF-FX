import { useEffect, useRef, useState } from 'react'

export type NotificationItem = {
  id: string
  title: string
  detail?: string
  /** Shown at the right, e.g. "2h" or "Mon". */
  time?: string
  tone?: 'pending' | 'rejected' | 'approved'
  onSelect?: () => void
}

/**
 * The bell in the top bar: what needs the user's action, with the amber count chip on its
 * corner and a panel listing it. With nothing to act on the chip is hidden and the panel says
 * so. The items come from the caller — the bell invents none.
 */
export function NotificationBell({ items }: { items: readonly NotificationItem[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onMouse = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onMouse)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouse)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="slc-bell" ref={ref}>
      <button
        type="button"
        className="slc-icon-btn"
        aria-label={items.length ? `Notifications, ${items.length} need action` : 'Notifications'}
        aria-expanded={open}
        title="Notifications"
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {items.length ? <span className="slc-bell__count">{items.length > 99 ? '99+' : items.length}</span> : null}
      </button>
      {open ? (
        <div className="slc-bell__panel" role="dialog" aria-label="Notifications">
          <div className="slc-bell__head">
            <h3>Notifications</h3>
          </div>
          <div className="slc-bell__body">
            {items.length === 0 ? (
              <p className="slc-bell__empty">You are all caught up. Nothing needs your action.</p>
            ) : (
              <>
                <h4>
                  Needs action <span>{items.length}</span>
                </h4>
                <ul>
                  {items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="slc-bell__item"
                        onClick={() => {
                          item.onSelect?.()
                          setOpen(false)
                        }}
                      >
                        <i className={`slc-bell__icon slc-bell__icon--${item.tone ?? 'pending'}`} aria-hidden="true">
                          !
                        </i>
                        <span>
                          <b>{item.title}</b>
                          {item.detail ? <small>{item.detail}</small> : null}
                        </span>
                        {item.time ? <time>{item.time}</time> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
