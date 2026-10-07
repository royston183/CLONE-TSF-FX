/*
 * The services behind Early Delivery / Unwinding / Rollover (see premature.ts for the sequence).
 *
 *   FxTransaction        ZFS_SB_TRMFX_O4_API        POST creates the transaction and returns BUKRS + RFHA
 *   TrmFxApp             ZFS_SB_TRMFXAPP_O4_API     ZSGTSFTR_APP_STR, by CompanyCode + FinancialTransaction
 *   TransactionType      ZFS_SB_TRMMASTER           product type of a transaction type
 *   catrParam            ZGTCATR_PARAM              the status a cancellation starts on
 *   tsfDealId            ZSGTSFTR_DEALID            ZBUKRS1/ZRFHA1 and ZBUKRS2/ZRFHA2
 */
import { apiFetch, createEntity, odataString, service } from '@slc/api-client'
import { sapMessage } from '../fx-blotter/api.ts'
import { saveAppStr, updateAppStrRecord, type AppStrFields } from '../fx-blotter/appStr.ts'
import { loadFxFor, loadTrmFxAppFor } from '../../shared/fx/app-str.ts'
import { dealKey, listDealIds } from '../../shared/fx/deal-id.ts'
import { fxList, fxUpdate, type FxRow } from '../../shared/fx/mw.ts'
import { changedStamp, isoFromDate } from '../../shared/fx/sap.ts'
import type { FxTransaction } from '../mo-fx-deal-confirmation/api.ts'
import { cancellationStatusFromParam, STATUS_PARAM_PROGRAM, type DealSlot } from './rules.ts'
import { slotChange, type OriginalTxn, type PrematureDeps, type TxnRef } from './premature.ts'

const fxApi = service('fx')
const masterApi = service('trmmaster')

/** The FX product types a transaction type may belong to: 12A spot / cash / TOM, 12B forward, 12D NDF. */
export const FX_PRODUCT_TYPES = ['12A', '12B', '12D'] as const

type V4<T> = { value?: T[] }

/** One product type per transaction type, or an explanation. Several: the original's own product type decides. */
export function pickProductType(rows: readonly { ProductType?: string }[], originalProduct: string, txnType: string): string {
  const products = [...new Set(rows.map((r) => String(r.ProductType ?? '')).filter(Boolean))]
  if (products.length === 1) return products[0] as string
  if (products.length > 1 && products.includes(originalProduct)) return originalProduct
  throw new Error(
    products.length
      ? `Transaction type ${txnType} exists under several product types (${products.join(', ')}); none is the original's, so the product type cannot be chosen.`
      : `Transaction type ${txnType} has no FX product type (12A / 12B / 12D) in the transaction-type master.`,
  )
}

export const realDeps: PrematureDeps = {
  async readOriginal(key: TxnRef): Promise<OriginalTxn> {
    const k = { CompanyCode: key.companyCode, FinancialTransaction: key.transaction }
    const [[fx], [app]] = await Promise.all([loadFxFor([k]), loadTrmFxAppFor([k])])
    if (!fx) throw new Error(`${key.companyCode}/${key.transaction} is not served by the FX service.`)
    return { fx: fx as FxTransaction & Record<string, unknown>, app: app ?? { CompanyCode: key.companyCode, FinancialTransaction: key.transaction } }
  },

  async productTypeOf(txnType, original) {
    const filter = `TransactionType eq ${odataString(txnType)} and (${FX_PRODUCT_TYPES.map((p) => `ProductType eq ${odataString(p)}`).join(' or ')})`
    const v4 = await apiFetch<V4<{ ProductType?: string; TransactionType?: string }>>(`${masterApi('TransactionType')}?${new URLSearchParams({ $filter: filter })}`)
    return pickProductType(v4?.value ?? [], String(original.fx.ProductType ?? ''), txnType)
  },

  async cancellationStatusConfig() {
    return cancellationStatusFromParam(await fxList('catrParam', { PROGNAM: STATUS_PARAM_PROGRAM }))
  },

  async createFx(body) {
    try {
      const { key } = await createEntity<FxTransaction & Record<string, unknown>>(fxApi('FxTransaction'), body, 'FinancialTransaction')
      if (!key) throw new Error('SAP accepted the transaction but returned no transaction number.')
      return { companyCode: String(body['CompanyCode']), transaction: key }
    } catch (e) {
      throw new Error(sapMessage(e))
    }
  },

  saveNewAppStr: (ref: TxnRef, fields: AppStrFields, status: string) => saveAppStr(ref.companyCode, ref.transaction, fields, 'create', status),

  updateOriginalAppStr: (ref: TxnRef, fields: AppStrFields) => updateAppStrRecord(ref.companyCode, ref.transaction, fields),

  readDealRows: (dealId: string): Promise<FxRow[]> => listDealIds({ ZDEAL_ID: dealId }),

  async writeDealSlot(rows: readonly FxRow[], slot: DealSlot, ref: TxnRef) {
    const stamp = await changedStamp()
    for (const row of rows) await fxUpdate('tsfDealId', dealKey(row), { ...slotChange(slot, ref), ...stamp })
  },

  today: () => isoFromDate(new Date()) ?? '',
}

