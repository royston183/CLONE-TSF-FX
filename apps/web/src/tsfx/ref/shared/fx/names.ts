import { apiFetch, odataString, service } from '@tsfx/ref/api-client'
import type { FxTransaction } from '../../features/mo-fx-deal-confirmation/api.ts'

const masterApi = service('trmmaster')
const partnerApi = service('businesspartner')

type V2<T> = { d?: { results?: T[] } }
type V4<T> = { value?: T[] }

export const typeKey = (productType: string, transactionType: string) => `${productType}/${transactionType}`

export type Names = { partners: ReadonlyMap<string, string>; txnTypes: ReadonlyMap<string, string> }
export const NO_NAMES: Names = { partners: new Map(), txnTypes: new Map() }

/** Partner and transaction-type names. A lookup that fails leaves its codes unnamed; it never stops the list. */
export async function loadNames(rows: readonly FxTransaction[], signal?: AbortSignal): Promise<Names> {
  const opts = signal ? { signal } : undefined
  const partners = new Map<string, string>()
  const txnTypes = new Map<string, string>()
  const types = [...new Set(rows.map((r) => r.ProductType ?? '').filter(Boolean))]
  const bps = [...new Set(rows.map((r) => r.Partner).filter(Boolean))]
  const soft = async (what: string, run: () => Promise<void>) => {
    try {
      await run()
    } catch (error) {
      if ((error as { name?: string } | null)?.name === 'AbortError') throw error
      console.warn(`[fx-names] ${what} unavailable`, error)
    }
  }
  await Promise.all([
    soft('transaction type names', async () => {
      if (!types.length) return
      const filter = types.map((t) => `ProductType eq ${odataString(t)}`).join(' or ')
      const v4 = await apiFetch<V4<{ ProductType?: string; TransactionType?: string; TransactionTypeName?: string }>>(
        `${masterApi('TransactionType')}?${new URLSearchParams({ $filter: filter })}`,
        opts,
      )
      for (const t of v4?.value ?? [])
        if (t.TransactionType) txnTypes.set(typeKey(t.ProductType ?? '', t.TransactionType), (t.TransactionTypeName ?? '').trim())
    }),
    soft('partner names', async () => {
      if (!bps.length) return
      const filter = bps.map((b) => `BusinessPartner eq ${odataString(b)}`).join(' or ')
      const v2 = await apiFetch<V2<{ BusinessPartner?: string; BusinessPartnerFullName?: string }>>(
        `${partnerApi('A_BusinessPartner')}?${new URLSearchParams({ $filter: filter, $select: 'BusinessPartner,BusinessPartnerFullName', $format: 'json' })}`,
        opts,
      )
      for (const p of v2?.d?.results ?? []) if (p.BusinessPartner) partners.set(p.BusinessPartner, (p.BusinessPartnerFullName ?? '').trim())
    }),
  ])
  return { partners, txnTypes }
}

