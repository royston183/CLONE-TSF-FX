import { lazy } from 'react'
import type { ComponentType, LazyExoticComponent } from 'react'

/**
 * Route id -> application component. The import paths are static strings so Vite can split
 * each application into its own chunk: opening the launcher does not download Invoice.
 *
 * Adding an application means adding a folder, an entry here, and an entry in
 * config/apps.json. Nothing else in the shell changes.
 */
export const FEATURES: Record<string, LazyExoticComponent<ComponentType>> = {
  'ottk': lazy(() => import('./ottk/index.tsx')),
  'dttk': lazy(() => import('./dttk/index.tsx')),
  'deal-id': lazy(() => import('./deal-id/index.tsx')),
  'tf-upload': lazy(() => import('./tf-upload/index.tsx')),
  'tf-manage': lazy(() => import('./tf-manage/index.tsx')),
  'invoice': lazy(() => import('./invoice/index.tsx')),
  'icl-request': lazy(() => import('./icl-request/index.tsx')),
  'icl-deposit': lazy(() => import('./icl-deposit/index.tsx')),
  'icl-approve-request': lazy(() => import('./icl-approve-request/index.tsx')),
  'icl-create-received': lazy(() => import('./icl-create-received/index.tsx')),
  'icl-allocate-bank': lazy(() => import('./icl-allocate-bank/index.tsx')),
  'check-confirm-deposit': lazy(() => import('./check-confirm-deposit/index.tsx')),
  'check-confirm-discounting-loans': lazy(() => import('./check-confirm-discounting-loans/index.tsx')),
  'discounting-loans-irs': lazy(() => import('./discounting-loans-irs/index.tsx')),
  'check-confirm-prepayment': lazy(() => import('./check-confirm-prepayment/index.tsx')),
  'check-confirm-irs': lazy(() => import('./check-confirm-irs/index.tsx')),
  'check-confirm-lc-issued': lazy(() => import('./check-confirm-lc-issued/index.tsx')),
  'maintain-limits': lazy(() => import('./maintain-limits/index.tsx')),
  'sblc-create-request': lazy(() => import('./sblc-create-request/index.tsx')),
  'sblc-terminate': lazy(() => import('./sblc-terminate/index.tsx')),
  'sblc-allocate-bank': lazy(() => import('./sblc-allocate-bank/index.tsx')),
  'fo-create-master-contract': lazy(() => import('./fo-create-master-contract/index.tsx')),
}
