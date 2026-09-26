import type { Toast } from './types.ts'

/** The bottom-right toast stack; each toast fades for .25s before it is removed. */
export function Toasts({ toasts }: { toasts: readonly Toast[] }) {
  return (
    <div className="toast-container" id="toastContainer">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast${t.type === 'error' ? ' error' : ''}`}
          style={t.fading ? { transition: 'opacity .25s ease', opacity: 0 } : undefined}
        >
          <span className="toast-icon">{t.type === 'error' ? '⚠' : '✓'}</span>
          <div className="toast-text">
            <b>{t.title}</b>
            {t.message}
          </div>
        </div>
      ))}
    </div>
  )
}
