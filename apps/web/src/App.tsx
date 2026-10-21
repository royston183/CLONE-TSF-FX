import { Suspense } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AppShell, Button, EmptyState, Spinner, ToastProvider } from '@slc/ui'
import { AuthProvider } from './auth/AuthContext.tsx'
import { ThemeProvider } from './shared/ThemeContext.tsx'
import { SelectSearch } from './shared/SelectSearch.tsx'
import { DatalistSuggest } from './shared/DatalistSuggest.tsx'
import { LoginPage } from './auth/LoginPage.tsx'
import { RequireAuth } from './auth/RequireAuth.tsx'
import { MenuPage } from './menu/MenuPage.tsx'
import { FEATURES } from './features/registry.ts'
import './app.css'
import './shared/fx/alm-theme.css'
import './shared/fx/office-theme.css'
import './shared/fx/tf-theme.css'
import './shared/master-contract/design.css'

// First ALM styling pass: the implemented FX Master Contract / Front Office routes.
const ALM_FX_FEATURES = new Set([
  'view-tsf-deals',
  'fo-deal-id-details',
  'fo-create-master-contract', 'mo-confirm-master-contract', 'mo-update-mc-expiry',
  'fo-mc-error-correction', 'mo-reject-mc-after-expiry', 'short-straddle-deal-id',
  'fx-blotter', 'fo-fx-error-correction', 'fo-change-deal-id', 'fo-create-deal-id-manually',
  'fo-early-delivery-unwind-rollover', 'fo-additional-spot-booking', 'fo-trader-workbench',
  'tsf-ndf-fixing', 'fo-ndf-fixing-error-correction',
])

// Additional implemented routes in the FX Mid Office and Back Office menu groups.
const ALM_FX_OFFICE_FEATURES = new Set([
  'mo-fx-deal-confirmation',
  'mo-confirm-ndf-fixing',
  'mo-update-bank-reference',
  'mo-view-deal-ids-for-confirmation',
  'mo-confirm-fx-deal-id',
  'mo-confirm-fx-deal-id-ss',
  'mo-deal-id-invoice-status',
  'mo-deal-id-invoice-mark',
  'mo-deal-id-invoicing',
  'mo-generate-invoices-deal-id',
  'inr-heads-up-reminder',
  'mo-view-deal-id-settlement-list',
  'mo-execute-settlement-deal-id',
  'mo-bank-settlement-fx-non-flow',
  'bo-post-accounting-settlement',
  'bo-bank-settlement-fx-non-flow',
  'view-spot-forward-settlement',
  'tbb1-post-flows',
  'bo-deal-rejection',
  'fx-ndf-settlement',
  'post-fx-mtm-oil-dmcc',
  'post-fx-mtm-other-origins',
  'fx-mtm-external-tsf-deals',
  'bo-reverse-fx-mtm-oil-dmcc',
  'bo-reverse-fx-mtm-other-origins',
  'bo-reverse-fx-mtm-india',
  'tf-upload',
  'tf-manage',
])

/**
 * One SPA on one origin, replacing seven pages served by seven proxy.py processes on
 * ports 8765-8775. Each application is a lazy route, so the browser downloads only the
 * one that was opened.
 */
export function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        {/* Adds a search box to every native <select> in every screen. */}
        <SelectSearch />
        <DatalistSuggest />
        <AuthProvider>
          <ToastProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              {/* The hub opens on Overview; `/` is a redirect so the sidebar highlights it. */}
              <Route path="/" element={<Navigate to="/overview" replace />} />
              <Route path="/master-data" element={<RequireAuth><MenuPage section="master-data" /></RequireAuth>} />
              <Route path="/overview" element={<RequireAuth><MenuPage section="overview" /></RequireAuth>} />
              <Route path="/trade-flows" element={<RequireAuth><MenuPage section="trade-flows" /></RequireAuth>} />
              <Route path="/fx-structure" element={<RequireAuth><MenuPage section="fx-structure" /></RequireAuth>} />
              <Route path="/slc-structure" element={<RequireAuth><MenuPage section="slc-structure" /></RequireAuth>} />
              <Route path="/xlc-crp-structure" element={<RequireAuth><MenuPage section="xlc-crp-structure" /></RequireAuth>} />
              <Route path="/icfs-structure" element={<RequireAuth><MenuPage section="icfs-structure" /></RequireAuth>} />
              <Route path="/reporting" element={<RequireAuth><MenuPage section="reporting" /></RequireAuth>} />
              <Route path="/reporting/fx-structure" element={<RequireAuth><MenuPage section="reporting-fx-structure" /></RequireAuth>} />
              <Route path="/reporting/slc-structure" element={<RequireAuth><MenuPage section="reporting-slc-structure" /></RequireAuth>} />
              <Route path="/reporting/xlc-crp-structure" element={<RequireAuth><MenuPage section="reporting-xlc-crp-structure" /></RequireAuth>} />
              <Route path="/reporting/icfs-structure" element={<RequireAuth><MenuPage section="reporting-icfs-structure" /></RequireAuth>} />
              <Route path="/admin" element={<RequireAuth><MenuPage section="admin" /></RequireAuth>} />
              <Route
                path="/apps/:appId"
                element={
                  <RequireAuth>
                    <FeatureRoute />
                  </RequireAuth>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}

function FeatureRoute() {
  const { appId } = useParams()
  const Feature = appId ? FEATURES[appId] : undefined

  if (!Feature) {
    return (
      <NotFound detail={`No application is registered at /apps/${appId ?? ''}.`} />
    )
  }

  return (
    <Suspense
      fallback={
        <div className="slc-page-center">
          <Spinner label="Opening application" />
        </div>
      }
    >
      <div
        id={ALM_FX_FEATURES.has(appId ?? '') || ALM_FX_OFFICE_FEATURES.has(appId ?? '') ? 'alm-fx-ui' : undefined}
        data-office={ALM_FX_OFFICE_FEATURES.has(appId ?? '') ? 'true' : undefined}
      >
        <Feature />
      </div>
    </Suspense>
  )
}

function NotFound({ detail }: { detail?: string }) {
  return (
    <AppShell title="TSF" subtitle="FS • VISTA">
      <div className="app-notfound">
        <EmptyState
          title="Page not found"
          detail={detail ?? 'That address does not match anything in this application.'}
          action={
            <Link to="/">
              <Button variant="primary">Back to menu</Button>
            </Link>
          }
        />
      </div>
    </AppShell>
  )
}
