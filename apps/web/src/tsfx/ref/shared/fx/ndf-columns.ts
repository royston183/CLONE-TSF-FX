import { list, service } from '@tsfx/ref/api-client'
import type { FxTransaction } from '../../features/mo-fx-deal-confirmation/api.ts'
import { keysFilter, type TxnKey } from './app-str.ts'
import { fxList, isAbort, type FxRow } from './mw.ts'
import { isNdfProduct } from './ndf.ts'
import { num } from './sap.ts'

/*
 * The NDF columns standard SAP shows next to a deal (ZSGTSFV_FX): NDF_DATE, NDF_REF, NDF_RATE, ZCASH_AMT,
 * CASH_CURR, NDF_FO_REM, NDF_MO_REM. Where each comes from in this app:
 *
 *   NDF_DATE / NDF_REF       ZSGTSFV_FX through the middleware ("tsfvFx"), as the NDF fixing screens read them
 *   NDF_RATE / ZCASH_AMT /   FxTransaction NdfFixingRate / CashSettlementAmount / CashSettlementCurrency —
 *   CASH_CURR                proposed in docs/abap/ZFS_SD_TRMFX-NdfSettlement.md; null / '' until the service serves them
 *   NDF_FO_REM / NDF_MO_REM  TrmFxApp NdfFoRem / NdfMoRem
 *
 * Nothing is invented: an unserved number is null (shown blank), never 0.
 */

export type NdfExtras = {
  /** NDF_DATE, ISO yyyy-mm-dd, or '' */
  ndfDate: string
  ndfRef: string
  /** null: not an NDF, or FxTransaction does not serve NdfFixingRate (or it is 0 = not fixed yet). */
  ndfRate: number | null
  cashAmount: number | null
  cashCurrency: string
  ndfFoRem: string
  ndfMoRem: string
}

export const NO_NDF_EXTRAS: NdfExtras = {
  ndfDate: '',
  ndfRef: '',
  ndfRate: null,
  cashAmount: null,
  cashCurrency: '',
  ndfFoRem: '',
  ndfMoRem: '',
}

const clean = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim())

/** A served decimal as a number; null when absent or blank (never 0). A served 0 is "not fixed yet" and also null. */
function served(v: number | string | null | undefined): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = num(v)
  return n === 0 ? null : n
}

/**
 * One deal's NDF columns from whichever sources the screen has. Rate / cash amount / cash currency are kept for
 * NDF products only (sgsart+2 = 'D'); when the product type is unknown (no FxTransaction) they stay empty.
 */
export function ndfExtras(
  fx: Pick<FxTransaction, 'ProductType' | 'NdfFixingRate' | 'CashSettlementAmount' | 'CashSettlementCurrency'> | undefined,
  app: { NdfFoRem?: string | null; NdfMoRem?: string | null } | undefined,
  view: FxRow | undefined,
): NdfExtras {
  const isNdf = !!fx && isNdfProduct(fx.ProductType)
  return {
    ndfDate: view ? clean(view['NDF_DATE']) : '',
    ndfRef: view ? clean(view['NDF_REF']) : '',
    ndfRate: isNdf ? served(fx.NdfFixingRate) : null,
    cashAmount: isNdf ? served(fx.CashSettlementAmount) : null,
    cashCurrency: isNdf ? clean(fx.CashSettlementCurrency) : '',
    ndfFoRem: clean(app?.NdfFoRem),
    ndfMoRem: clean(app?.NdfMoRem),
  }
}

/** BUKRS + RFHA as one map key. */
export const ndfKey = (bukrs: string, rfha: string): string => `${bukrs}|${rfha}`

const KEY_CHUNK = 25
const VIEW_CHUNK = 100

const chunks = <T>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * The NDF columns of the given deals, keyed by ndfKey. Display-only: a failed read leaves that source's columns
 * blank (and is logged) instead of blocking the screen; an abort is rethrown. `views` are ZSGTSFV_FX rows the
 * screen already holds — when given, tsfvFx is not read again.
 */
export async function loadNdfExtras(
  keys: readonly TxnKey[],
  options: { views?: readonly FxRow[]; signal?: AbortSignal } = {},
): Promise<Map<string, NdfExtras>> {
  const out = new Map<string, NdfExtras>()
  const unique = [...new Map(keys.filter((k) => k.CompanyCode && k.FinancialTransaction).map((k) => [ndfKey(k.CompanyCode, k.FinancialTransaction), k])).values()]
  if (!unique.length) return out
  const { signal } = options
  const opts = signal ? { signal } : undefined
  const guarded = async <T>(what: string, run: () => Promise<T[]>): Promise<T[]> => {
    try {
      return await run()
    } catch (error) {
      if (isAbort(error)) throw error
      console.warn(`[ndf-columns] ${what} unavailable`, error)
      return []
    }
  }
  const [fxRows, apps] = await Promise.all([
    guarded('FxTransaction', async () =>
      (await Promise.all(chunks(unique, KEY_CHUNK).map((c) => list<FxTransaction>(service('fx')('FxTransaction'), { filter: keysFilter(c), top: KEY_CHUNK }, opts)))).flat(),
    ),
    guarded('TrmFxApp', async () =>
      (await Promise.all(chunks(unique, KEY_CHUNK).map((c) => list<TrmFxAppNdf>(service('trmfxapp')('TrmFxApp'), { filter: keysFilter(c), top: KEY_CHUNK }, opts)))).flat(),
    ),
  ])
  const views = options.views ? [...options.views] : await loadNdfViews(fxRows, signal)
  const fxBy = new Map(fxRows.map((f) => [ndfKey(f.CompanyCode, f.FinancialTransaction), f]))
  const appBy = new Map(apps.map((a) => [ndfKey(a.CompanyCode, a.FinancialTransaction), a]))
  const viewBy = viewsByKey(views)
  for (const k of unique) {
    const key = ndfKey(k.CompanyCode, k.FinancialTransaction)
    out.set(key, ndfExtras(fxBy.get(key), appBy.get(key), viewBy.get(key)))
  }
  return out
}

/**
 * ZSGTSFV_FX rows (NDF_DATE, NDF_REF) of the NDF deals among the given FxTransactions. Only NDF products are
 * read; a failed read leaves the date / reference blank (logged), an abort is rethrown.
 */
export async function loadNdfViews(
  fxRows: ReadonlyArray<Pick<FxTransaction, 'CompanyCode' | 'FinancialTransaction' | 'ProductType'>>,
  signal?: AbortSignal,
): Promise<FxRow[]> {
  const ndf = fxRows.filter((f) => isNdfProduct(f.ProductType))
  if (!ndf.length) return []
  try {
    const pages = await Promise.all(
      chunks(ndf, VIEW_CHUNK).map((c) =>
        fxList(
          'tsfvFx',
          { 'BUKRS[in]': [...new Set(c.map((k) => k.CompanyCode))].join(','), 'RFHA[in]': c.map((k) => k.FinancialTransaction).join(',') },
          signal ? { signal } : {},
        ),
      ),
    )
    return pages.flat()
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[ndf-columns] ZSGTSFV_FX unavailable', error)
    return []
  }
}

/** The view rows by ndfKey, for ndfExtras. */
export const viewsByKey = (views: readonly FxRow[]): Map<string, FxRow> =>
  new Map(views.map((v) => [ndfKey(clean(v['BUKRS']), clean(v['RFHA'])), v]))

type TrmFxAppNdf = TxnKey & { NdfFoRem?: string | null; NdfMoRem?: string | null }

/** Blank for an unserved value (never 0), else `dp` decimals with en-US grouping. */
export function fmtNdfNumber(n: number | null | undefined, dp: number): string {
  if (n === null || n === undefined || Number.isNaN(n)) return ''
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
}

/** NDF Settlement Rate: FxTransaction's NdfFixingRate is Decimal(13,9); screens show 4 dp like the other rates. */
export const fmtNdfRate = (n: number | null | undefined): string => fmtNdfNumber(n, 4)
export const fmtNdfCash = (n: number | null | undefined): string => fmtNdfNumber(n, 2)

/** yyyy-mm-dd -> dd-mm-yyyy; '' stays blank. */
export function fmtNdfDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso
}
