import type { Deal, Outcome } from './types.ts'

export const DEMO_NOTE = 'Demo posting: dummy FI documents and status are saved in this browser. No SAP posting is performed.'
export const demoKey = (id: string) => `tsf:demo-accounting:v1:${id}`

/** The deal as the demo shows it. The banks are the stored / assigned ones, never made up. */
export function demoBase(deal: Deal): Deal {
  return { ...deal, fxWaiting: deal.top.length ? '' : deal.fxWaiting || '', invWaiting: deal.inv.length ? '' : deal.invWaiting || '' }
}

export function restoreDemo(deal: Deal, saved: string | null): Deal {
  const base = demoBase(deal)
  if (!saved) return base
  try {
    const old = JSON.parse(saved) as Deal
    if (old.dealId !== deal.dealId || !Array.isArray(old.inv) || !Array.isArray(old.top)) return base
    const inv = base.inv.map((r) => {
      const prior = old.inv.find((x) => x.seq === r.seq && x.tradeType === r.tradeType)
      return { ...r, fiDoc: r.fiDoc || prior?.fiDoc || '' }
    })
    const top = base.top.map((r) => {
      const prior = old.top.find((x) => x.entity === r.entity && x.rfha === r.rfha)
      return prior?.doc1 && prior.doc2 ? { ...r, doc1: r.doc1 || prior.doc1, doc2: r.doc2 || prior.doc2, status: 'Posted' as const } : r
    })
    return finishDemo({ ...base, inv, top })
  } catch { return base }
}

const invoicesDone = (deal: Deal) => deal.noInvoice || (deal.inv.length > 0 && deal.inv.every((r) => !r.postCheck || !!r.fiDoc))

export function finishDemo(deal: Deal): Deal {
  if (deal.status < 21 || !invoicesDone(deal) || !deal.top.length || !deal.top.every((r) => r.doc1 && r.doc2)) return deal
  return { ...deal, status: 22, statusCode: '22', statusText: 'Settlement Completed - Accounting (Demo)' }
}

/** Only demo state changes. The caller supplies a browser-persisted counter. */
export function postDemo(deal: Deal, kind: 'invoice' | 'fx', nextDoc: () => string, index?: number): Outcome {
  if (deal.status < 21) return { deal, toast: { message: 'Complete execution first (status 21) before demo posting.', kind: 'error' } }
  if (deal.status >= 22) return { deal, toast: { message: 'Demo accounting is already complete.', kind: '' } }
  if (kind === 'fx' && !invoicesDone(deal)) return { deal, toast: { message: 'Post the trade invoice legs first.', kind: 'error' } }
  if (kind === 'invoice' && !deal.inv.length) return { deal, toast: { message: 'No trade invoice legs are available to post.', kind: 'error' } }
  const inv = kind === 'invoice' ? deal.inv.map((r, i) =>
    r.postCheck && !r.fiDoc && (index === undefined || i === index) ? { ...r, fiDoc: nextDoc() } : r) : deal.inv
  let result = { ...deal, inv }
  // Once every required invoice has a document, generate both FI documents for every FX leg.
  if (invoicesDone(result)) result = { ...result, top: result.top.map((r) => ({
    ...r, doc1: r.doc1 || nextDoc(), doc2: r.doc2 || nextDoc(), status: 'Posted' as const,
  })) }
  result = finishDemo(result)
  return { deal: result, toast: { message: result.status === 22
    ? 'Dummy trade and FX documents generated. Demo status changed from 21 to 22.'
    : 'Dummy trade invoice document generated. Post the remaining invoice legs to complete demo accounting.', kind: 'success' } }
}

export function nextDemoDoc(): string {
  const key = 'tsf:demo-accounting:document-counter:v1'
  const stored = Number(localStorage.getItem(key))
  const counter = Number.isSafeInteger(stored) && stored >= 6800000000 ? stored + 1 : 6800000001
  localStorage.setItem(key, String(counter))
  return String(counter)
}
