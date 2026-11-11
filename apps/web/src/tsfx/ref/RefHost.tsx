// Hosts the ported reference screen (the invoice screen) inside the TSF_FX scope: the `#tsfx-alm-ui` wrapper the screen's
// stylesheets are written against, the backdrop guard and the table alignment. The toast provider, the select search
// and the datalist search come from this application's own root.
import { useEffect, useRef, type ComponentType } from 'react'
import './host.css'
import { installBackdropGuard } from './shared/ui/backdrop-guard.ts'
import { watchReferenceTables } from './shared/table-alignment'
import './shared/fx/alm-theme.css'
import './shared/fx/office-theme.css'
import './shared/fx/tf-theme.css'
import './shared/master-contract/design.css'

export type RefHostOptions = { office?: boolean; alm?: boolean }

export function RefHost({ children, office = false, alm = true }: RefHostOptions & { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    document.body.classList.add('tsfx-ref-active')
    const uninstall = installBackdropGuard()
    const stopAlignment = watchReferenceTables(root.current)
    return () => {
      document.body.classList.remove('tsfx-ref-active')
      uninstall()
      stopAlignment()
    }
  }, [])
  return (
    <div ref={root} className="tsfx-ref" id={alm ? 'tsfx-alm-ui' : undefined} data-office={office ? 'true' : undefined}>
      {children}
    </div>
  )
}

export function refPage(Feature: ComponentType, options: RefHostOptions = {}): ComponentType {
  return function RefPage() {
    return (
      <RefHost {...options}>
        <Feature />
      </RefHost>
    )
  }
}
