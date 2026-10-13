/**
 * The Create Spot value helps, read from SAP. A list that cannot be read stays empty and says
 * why — it is never refilled with made-up entries.
 *
 *   Company Code      API_COMPANYCODE_SRV A_CompanyCode, limited to the TSF entities
 *                     (ZSGTSFTR_COMP-ZBUKRS, SLC middleware "comp")
 *   Transaction Type  ZFS_SB_TRMMASTER TransactionType for the FX spot / forward product types
 *   Business Partner  ZFS_SB_SLCTSFBPBANK SlcTsfBpBank for the picked company code; the names
 *                     come from API_BUSINESS_PARTNER for those partners only
 */
import { ApiError, apiFetch, service } from '@slc/api-client'
import { txt } from '../../shared/fx/masters.ts'
import { fxList, isAbort, type FxRow } from '../../shared/fx/mw.ts'
import type { CodeLabel, TxnTypeOption, ValueHelp } from './types.ts'

const companyApi = service('companycode')
const masterApi = service('trmmaster')
const bpBankApi = service('slctsfbpbank')
const partnerApi = service('businesspartner')

/** The product types a spot may book under: 12A spot / cash / TOM, 12B forward. */
export const SPOT_PRODUCT_TYPES = ['12A', '12B'] as const

type V2<T> = { d?: { results?: T[] } }
type V4<T> = { value?: T[] }

const byKey = <T extends CodeLabel>(a: T, b: T) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
const quote = (v: string) => `'${v.replace(/'/g, "''")}'`
const anyOf = (field: string, values: readonly string[]) => values.map((v) => `${field} eq ${quote(v)}`).join(' or ')
const qs = (params: Record<string, string>) => new URLSearchParams(params).toString()

/* ---------------- Pure mappings (tested) ---------------- */

/** A_CompanyCode rows that are TSF entities, by code. */
export function companyOptions(
  companies: readonly { CompanyCode?: string; CompanyCodeName?: string }[],
  tsfEntities: readonly FxRow[],
): CodeLabel[] {
  const tsf = new Set(tsfEntities.map((r) => txt(r, 'ZBUKRS')).filter(Boolean))
  return companies
    .filter((c) => c.CompanyCode && tsf.has(c.CompanyCode))
    .map((c) => ({ key: String(c.CompanyCode), text: String(c.CompanyCodeName ?? '').trim() || String(c.CompanyCode) }))
    .sort(byKey)
}

export function txnTypeOptions(
  rows: readonly { ProductType?: string; TransactionType?: string; TransactionTypeName?: string }[],
): TxnTypeOption[] {
  const seen = new Set<string>()
  const out: TxnTypeOption[] = []
  for (const r of rows) {
    const key = String(r.TransactionType ?? '')
    const productType = String(r.ProductType ?? '')
    if (!key || !(SPOT_PRODUCT_TYPES as readonly string[]).includes(productType) || seen.has(key)) continue
    seen.add(key)
    out.push({ productType, key, text: String(r.TransactionTypeName ?? '').trim() || key })
  }
  return out.sort((a, b) => (a.productType + a.key < b.productType + b.key ? -1 : 1))
}

/** The distinct partners SlcTsfBpBank holds for one company code, named where the BP master knows them. */
export function partnerOptions(
  banks: readonly { BusinessPartner?: string; CompanyCode?: string }[],
  companyCode: string,
  names: ReadonlyMap<string, string>,
): CodeLabel[] {
  const bps = [...new Set(banks.filter((b) => b.CompanyCode === companyCode).map((b) => String(b.BusinessPartner ?? '')).filter(Boolean))]
  return bps.map((key) => ({ key, text: names.get(key) || key })).sort(byKey)
}

/* ---------------- Reads ---------------- */

const fail = <T extends CodeLabel>(what: string, error: unknown): ValueHelp<T> => {
  if (isAbort(error)) throw error
  console.warn(`[spot] ${what} unavailable`, error)
  // The gateway's own reason (e.g. no SAP password configured) beats a generic one.
  const reason = error instanceof ApiError && error.message ? ` HTTP ${error.status}: ${error.message}` : ''
  return { state: 'error', message: `${what} could not be read from SAP.${reason}` }
}

export async function loadCompanies(signal?: AbortSignal): Promise<ValueHelp<CodeLabel>> {
  try {
    const opts = signal ? { signal } : undefined
    const [v2, tsf] = await Promise.all([
      apiFetch<V2<{ CompanyCode?: string; CompanyCodeName?: string }>>(
        `${companyApi('A_CompanyCode')}?${qs({ $select: 'CompanyCode,CompanyCodeName', $top: '5000', $format: 'json' })}`,
        opts,
      ),
      fxList('comp', {}, { signal }),
    ])
    const options = companyOptions(v2?.d?.results ?? [], tsf)
    return options.length ? { state: 'ok', options } : { state: 'error', message: 'No TSF company code (ZSGTSFTR_COMP) exists in A_CompanyCode.' }
  } catch (error) {
    return fail('Company codes', error)
  }
}

export async function loadTxnTypes(signal?: AbortSignal): Promise<ValueHelp<TxnTypeOption>> {
  try {
    const v4 = await apiFetch<V4<{ ProductType?: string; TransactionType?: string; TransactionTypeName?: string }>>(
      `${masterApi('TransactionType')}?${qs({ $filter: anyOf('ProductType', SPOT_PRODUCT_TYPES) })}`,
      signal ? { signal } : undefined,
    )
    const options = txnTypeOptions(v4?.value ?? [])
    return options.length ? { state: 'ok', options } : { state: 'error', message: 'FTR has no transaction type under 12A / 12B.' }
  } catch (error) {
    return fail('Transaction types', error)
  }
}

export async function loadPartners(companyCode: string, signal?: AbortSignal): Promise<ValueHelp<CodeLabel>> {
  if (!companyCode) return { state: 'error', message: 'Select a Company Code first.' }
  try {
    const opts = signal ? { signal } : undefined
    const v4 = await apiFetch<V4<{ BusinessPartner?: string; CompanyCode?: string }>>(
      `${bpBankApi('SlcTsfBpBank')}?${qs({ $filter: `CompanyCode eq ${quote(companyCode)}`, $select: 'BusinessPartner,CompanyCode', $top: '5000' })}`,
      opts,
    )
    const banks = v4?.value ?? []
    const bps = [...new Set(banks.map((b) => String(b.BusinessPartner ?? '')).filter(Boolean))]
    const names = new Map<string, string>()
    if (bps.length) {
      try {
        const v2 = await apiFetch<V2<{ BusinessPartner?: string; BusinessPartnerFullName?: string }>>(
          `${partnerApi('A_BusinessPartner')}?${qs({ $filter: anyOf('BusinessPartner', bps), $select: 'BusinessPartner,BusinessPartnerFullName', $format: 'json' })}`,
          opts,
        )
        for (const p of v2?.d?.results ?? []) names.set(String(p.BusinessPartner), String(p.BusinessPartnerFullName ?? '').trim())
      } catch (error) {
        // Names are a nicety: the partner numbers alone are still the real list.
        if (isAbort(error)) throw error
        console.warn('[spot] business partner names unavailable', error)
      }
    }
    const options = partnerOptions(banks, companyCode, names)
    return options.length
      ? { state: 'ok', options }
      : { state: 'error', message: `SlcTsfBpBank holds no business partner for company code ${companyCode}.` }
  } catch (error) {
    return fail('Business partners', error)
  }
}
