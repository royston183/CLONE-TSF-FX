import type { ReactNode } from 'react'

/**
 * The top of a page: a slim band on a soft blue wash with a blue bar down its left edge —
 * the page's icon in a blue tile, the breadcrumb over the title, then the page's actions.
 */
export function PageHeader({
  title,
  breadcrumb,
  icon,
  actions,
}: {
  title: string
  breadcrumb?: readonly string[]
  icon?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="slc-pageheader">
      {icon ? (
        <span className="slc-pageheader__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <div className="slc-pageheader__text">
        {breadcrumb?.length ? (
          <nav aria-label="Breadcrumb">
            <ol className="slc-pageheader__crumbs">
              {breadcrumb.map((crumb, i) => (
                <li key={`${crumb}-${i}`} aria-current={i === breadcrumb.length - 1 ? 'page' : undefined}>
                  {crumb}
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        <h1 className="slc-pageheader__title">{title}</h1>
      </div>
      {actions ? <div className="slc-pageheader__actions">{actions}</div> : null}
    </div>
  )
}
