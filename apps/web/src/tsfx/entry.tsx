// The TSF_FX Trade Flows and Invoice screens, as this application's routes. Each is a lazy export; the frame supplies the
// TSF_FX stylesheet scope (.tsfx), the run-time, the toast and the transaction provider the screens use.
import { Suspense, useEffect, type ReactNode } from 'react'
import { BackButton, SignOutButton } from '@tsfx/ref/auth/index.ts'
import { PageHeader } from '@tsfx/components/ui/McKpi'
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
import './styles/mc-look.css'

startRuntime()


function Frame({ title, description, group = 'Trade Flows', ref: isRef = false, children }: { title: string; description?: string; group?: string; ref?: boolean; children: ReactNode }) {
  useEffect(() => { document.title = `${title} | TSF FX` }, [title])
  return (
    <div className="tsfx tsfx-frame">
      <PageHeader title={title} description={description ?? `TSF FX / ${group}`} before={<BackButton className="button secondary" />} after={<SignOutButton className="button secondary" />} />
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

export function UploadScreen() { return <Frame title="Tradeflows Upload" description="Upload the trade-flow Excel file: one trade flow and one Bill of Lading per row"><UploadWorkbench def={MODULES['tradeflow-upload'] as never} /></Frame> }
export function ListScreen() { return <Frame title="Tradeflows List" description="Every trade flow with its Bills of Lading, priced and valued"><ObjectWorkbench def={MODULES.tradeflow as never} /></Frame> }
export function UpdatePriceScreen() { return <Frame title="Update Price" description="Set the commodity prices for a day"><UpdatePricePage /></Frame> }
export function ManageScreen() { return <Frame title="Manage Tradeflows" description="Split a trade flow into BLs, add BLs or delete one"><ManageTradeflowsPage /></Frame> }
export function ProposeScreen() { return <Frame title="Propose Tradeflow" description="AI-ranked BL proposals for each Deal ID"><ProposeTradeflowsPage /></Frame> }
const Invoice = refPage(InvoiceFeature, { office: true })
export function InvoiceScreen() { return <Frame title="MO: Generate Invoices for Deal ID (Single Deal ID)" description="Generate and finalise the invoices of a Deal ID" group="FX Mid-Office / FX Trade Invoicing" ref><Invoice /></Frame> }
