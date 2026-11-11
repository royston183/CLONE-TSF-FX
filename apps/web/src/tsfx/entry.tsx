// The TSF_FX Trade Flows and Invoice screens, as this application's routes. Each is a lazy export; the frame supplies the
// TSF_FX stylesheet scope (.tsfx), the run-time, the toast and the transaction provider the screens use.
import { Suspense, useEffect, type ReactNode } from 'react'
import { BackButton, SignOutButton } from '@tsfx/ref/auth/index.ts'
import { startRuntime } from '@tsfx/runtime'
import { ToastProvider as SlcToastProvider } from '@tsfx/ref/ui/index.ts'
import { MODULES } from '@tsfx/modules/registry'
import { refPage } from '@tsfx/ref/RefHost'
import ObjectWorkbench from '@tsfx/components/object/ObjectWorkbench'
import UploadWorkbench from '@tsfx/components/upload/UploadWorkbench'
import UpdatePricePage from '@tsfx/pages/update-price/UpdatePricePage'
import ManageTradeflowsPage from '@tsfx/pages/manage-tradeflows/ManageTradeflowsPage'
import ProposeTradeflowsPage from '@tsfx/pages/propose-tradeflows/ProposeTradeflowsPage'
import InvoiceFeature from '@tsfx/ref/features/mo-generate-invoices-deal-id/index'
import './styles/index'
import './styles/tsfx-host.css'

startRuntime()


function Frame({ title, group = 'Trade Flows', ref: isRef = false, children }: { title: string; group?: string; ref?: boolean; children: ReactNode }) {
  useEffect(() => { document.title = `${title} | TSF FX` }, [title])
  return (
    <div className="tsfx tsfx-frame">
      <div className="tsfx-bar">
        <BackButton className="button" />
        <span className="tsfx-crumb">TSF FX / {group} / <b>{title}</b></span>
        <span className="tsfx-grow" />
        <SignOutButton className="button" />
      </div>
      <SlcToastProvider>
        <div className={isRef ? 'tsfx-frame--ref' : undefined}>
          <div className="app"><div className="main"><main className={`content${isRef ? ' tsfx-body' : ''}`}>
            <Suspense fallback={<p role="status">Loading…</p>}>{children}</Suspense>
          </main></div></div>
        </div>
      </SlcToastProvider>
    </div>
  )
}

export function UploadScreen() { return <Frame title="Tradeflows Upload"><UploadWorkbench def={MODULES['tradeflow-upload'] as never} /></Frame> }
export function ListScreen() { return <Frame title="Tradeflows List"><ObjectWorkbench def={MODULES.tradeflow as never} /></Frame> }
export function UpdatePriceScreen() { return <Frame title="Update Price"><UpdatePricePage /></Frame> }
export function ManageScreen() { return <Frame title="Manage Tradeflows"><ManageTradeflowsPage /></Frame> }
export function ProposeScreen() { return <Frame title="Propose Tradeflow"><ProposeTradeflowsPage /></Frame> }
const Invoice = refPage(InvoiceFeature, { office: true })
export function InvoiceScreen() { return <Frame title="MO: Generate Invoices for Deal ID (Single Deal ID)" group="FX Mid-Office / FX Trade Invoicing" ref><Invoice /></Frame> }
