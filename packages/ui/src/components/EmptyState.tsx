import type { ReactNode } from 'react'
import { Illustration } from './Illustration.tsx'

export function EmptyState({
  title,
  detail,
  action,
  tone = 'neutral',
}: {
  title: string
  detail?: ReactNode
  action?: ReactNode
  tone?: 'neutral' | 'error'
}) {
  return (
    <div className={`slc-empty slc-empty--${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      <Illustration />
      <p className="slc-empty__title">{title}</p>
      {detail ? <p className="slc-empty__detail">{detail}</p> : null}
      {action ? <div className="slc-empty__action">{action}</div> : null}
    </div>
  )
}
