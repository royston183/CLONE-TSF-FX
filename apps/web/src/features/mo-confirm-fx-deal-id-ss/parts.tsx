import type { ReactNode } from 'react'
import { STATUS_BADGE, TXN_STATUS_META } from './data.ts'
import type { BadgeMeta, ToolbarCode } from './types.ts'

function Badge({ meta }: { meta: BadgeMeta }) {
  return (
    <span className={`badge ${meta.badge}`}>
      <span className="badge-dot" />
      {meta.text}
    </span>
  )
}

/** The Deal ID status: ZSGTSFTR_DEAL_ST's text, coloured by code. */
export function StatusBadge({ code, text }: { code: string; text: string }) {
  return <Badge meta={{ text: text || code, badge: STATUS_BADGE[code] ?? 'badge-gray' }} />
}

export function TxnStatusBadge({ code }: { code: string }) {
  return <Badge meta={(TXN_STATUS_META as Record<string, BadgeMeta | undefined>)[code] ?? { text: code, badge: 'badge-gray' }} />
}

export function Icon({ children }: { children: ReactNode }) {
  return (
    <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      {children}
    </svg>
  )
}

export const ICON_BACK = <Icon><path d="M15 18l-6-6 6-6" /></Icon>
export const ICON_REFRESH = <Icon><path d="M21 12a9 9 0 11-3-6.7M21 3v6h-6" /></Icon>
export const ICON_UPLOAD = <Icon><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" /></Icon>

type ToolbarDef = { label: string; variant: 'secondary' | 'danger' | 'success'; icon: ReactNode }

/** Label, colour and glyph of each toolbar function code, as the original's renderToolbar drew them. */
export const TOOLBAR: Record<ToolbarCode, ToolbarDef> = {
  UPD: {
    label: 'Change / Confirm',
    variant: 'secondary',
    icon: <Icon><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" /></Icon>,
  },
  PRE: {
    label: 'Premium Adjustment',
    variant: 'secondary',
    icon: <Icon><line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></Icon>,
  },
  DEAL_EDIT: {
    label: 'Edit Deal Pair',
    variant: 'secondary',
    icon: <Icon><path d="M7 7h11l-3-3M17 17H6l3 3" /></Icon>,
  },
  CAN: {
    label: 'Cancel Deal ID',
    variant: 'danger',
    icon: <Icon><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6" /></Icon>,
  },
  SS_DEALLOC: {
    label: 'SS Deallocation',
    variant: 'danger',
    icon: (
      <Icon>
        <path d="M18.84 12.25l1.72-1.71a4.5 4.5 0 00-6.36-6.37l-3.5 3.5" />
        <path d="M5.17 11.75l-1.72 1.71a4.5 4.5 0 006.36 6.37l3.5-3.5" />
        <line x1="8" y1="16" x2="16" y2="8" />
      </Icon>
    ),
  },
  SS_DEAL: {
    label: 'Save P&L Value',
    variant: 'success',
    icon: (
      <Icon>
        <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
        <polyline points="17 21 17 13 7 13 7 21" />
        <polyline points="7 3 7 8 15 8" />
      </Icon>
    ),
  },
  REV: {
    label: 'Reverse MO Confirmation',
    variant: 'secondary',
    icon: <Icon><path d="M3 7v6h6" /><path d="M21 17a9 9 0 00-15-6.7L3 13" /></Icon>,
  },
  DMS: {
    label: 'DMS',
    variant: 'secondary',
    icon: <Icon><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></Icon>,
  },
  REF: { label: 'Refresh', variant: 'secondary', icon: ICON_REFRESH },
}
