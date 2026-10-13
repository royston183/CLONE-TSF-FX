/*
 * Create Spot for an NDF / DNDF settlement (ZSGTSFR_SET_WSPACE screens 9011 / 9012, FORM create_spot_ndf):
 *
 *   get_details          BAPI_FTR_FXT_GETDETAIL of the NDF           -> the FxTransaction + TrmFxApp read (loadFxFor / loadTrmFxAppFor)
 *   get_ndf_data         the spot's general + forex data             -> buildSpotBody
 *   update_vtbfha_fields ZSGTRMFM_VTBFHA_EXPORT (TSF append)         -> TrmFxApp row (saveAppStr), status 03
 *   create_bapi_fwd      BAPI_FTR_FXT_CREATE                         -> FxTransaction POST
 *   update_vtbfha_tsfdata is commented out in the ABAP: nothing to do.
 *
 * Not done here, because no service takes them: the e-mail (FORM email), the business area / profit centre of the
 * company (the FxTransaction POST has no such fields), the ZSGTSFTR_IN_SPOT "spot created" flag, and ZTSF_CODE / ZGRP
 * when the TrmFxApp entity does not declare them. The Deal Type is the spot's own slot: D1 -> DS1, D2 -> DS2.
 */
import { createEntity, service } from '@slc/api-client'
import { VALUATION_CLASS, sapMessage } from '../fx-blotter/api.ts'
import { saveAppStr, type AppStrFields } from '../fx-blotter/appStr.ts'
import { realDeps } from '../fo-early-delivery-unwind-rollover/deps.ts'
import type { FxTransaction } from '../mo-fx-deal-confirmation/api.ts'
import { loadFxFor, loadTrmFxAppFor } from '../../shared/fx/app-str.ts'
import { invalidCurrencyMessage, roundToCurrency } from '../../shared/fx/currency-decimals.ts'

const fxApi = service('fx')

/** ZSGTSFTR_TXNSTAT 03: MO - the spot goes straight to the MO queue. */
export const SPOT_TXN_STATUS = '03'
/** The spot's SAP transaction type (c_605). */
export const SPOT_TXN_TYPE = '605'

export type NdfSpotRequest = {
  /** The spot's company code (GS_SPOT-BUKRS). */
  bukrs: string
  bp: string
  /** The NDF the spot settles. */
  source: { bukrs: string; rfha: string }
  curr1: string
  curr2: string
  amt1: number
  amt2: number
  /** 1: Currency 1 is the traded (invoice / cash) currency; 2: Currency 2. */
  base: 1 | 2
  /** BS 1 of the draft: 'Buy' when Currency 1 is bought. */
  bs1: string
  rate: number
  /** ISO; blank: the NDF's fixing date, as the ABAP falls back to NDF_DATE. */
  tradeDate: string
  /** The NDF's fixing date and value date, ISO. */
  ndfDate: string
  valueDate: string
  /** The NDF's Deal Type slot (D1 / D2). */
  dealType: string
}

const money = (v: number): number => Math.round(Math.abs(v) * 10000) / 10000

/** yyyy-mm-dd of an OData / ISO date text, or '' when it is not one: a blank or dd-mm-yyyy date makes the POST malformed. */
export const isoDay = (v: unknown): string => {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v ?? ''))
  return m ? (m[1] as string) : ''
}

/** The FxTransaction POST body, shaped like the additional-spot booking's (fo-additional-spot-booking/spotCreate.ts), which SAP accepts. */
export function buildSpotBody(req: NdfSpotRequest, productType: string, original: FxTransaction & Record<string, unknown>): Record<string, unknown> {
  const buysFirst = req.bs1 === 'Buy'
  const buyCurrency = buysFirst ? req.curr1 : req.curr2
  const sellCurrency = buysFirst ? req.curr2 : req.curr1
  const traded = req.base === 1 ? req.curr1 : req.curr2
  const contractDate = isoDay(req.tradeDate) || isoDay(req.ndfDate) || isoDay(original.ContractDate) || new Date().toISOString().slice(0, 10)
  const valueDate = isoDay(original.ValueDate) || isoDay(req.valueDate) || contractDate
  const buyAmount = roundToCurrency(Math.abs(buysFirst ? req.amt1 : req.amt2), buyCurrency)
  const sellAmount = roundToCurrency(Math.abs(buysFirst ? req.amt2 : req.amt1), sellCurrency)
  const body: Record<string, unknown> = {
    CompanyCode: req.bukrs,
    ProductType: productType,
    TransactionType: SPOT_TXN_TYPE,
    Partner: req.bp,
    ValuationClass: String(original['ValuationClass'] ?? '') || VALUATION_CLASS,
    ContractDate: contractDate,
    ValueDate: valueDate,
    BuyAmount: buyAmount,
    SellAmount: sellAmount,
    BuyCurrency: buyCurrency,
    SellCurrency: sellCurrency,
    LeadCurrency: original.LeadCurrency || buyCurrency,
    FollowCurrency: original.FollowCurrency || sellCurrency,
    TradedCurrency: traded,
    SpotRate: req.rate,
    ForwardRate: req.rate,
    SwapRate: 0,
  }
  return body
}

/** The spot's TSF append row: the NDF's Deal ID, description, Master Contract and sequence, the NDF as ZTSF_EX_OPT_NO. */
export function spotAppFields(req: NdfSpotRequest, app: Record<string, unknown> | undefined, blotterDate: string): AppStrFields {
  const text = (name: string): string => String(app?.[name] ?? '')
  const slot = /^D(\d)$/.exec(req.dealType)
  const fields: AppStrFields & { Zgrp?: string } = {
    ZtsfDealID: text('ZtsfDealID'),
    ZtsfDealDesc: text('ZtsfDealDesc'),
    ZtsfMcRefNo: text('ZtsfMcRefNo'),
    ZtsfDealSq: text('ZtsfDealSq'),
    ZtsfExOptNo: req.source.rfha,
    Ztrcode: text('Ztrcode'),
    BlotterDate: blotterDate,
  }
  if (slot) fields.ZtsfDealType = `DS${slot[1]}`
  const grp = text('Zgrp')
  if (grp) fields.Zgrp = grp
  return fields
}

export type NdfSpotResult = { ok: true; transaction: string; companyCode: string; appDataError?: string } | { ok: false; message: string }

/** Reads the NDF, books the spot and saves its TSF row. A failed TSF save keeps the SAP spot and says so. */
export async function createNdfSpot(req: NdfSpotRequest): Promise<NdfSpotResult> {
  const badCurrency = invalidCurrencyMessage([req.curr1, req.curr2])
  if (badCurrency) return { ok: false, message: badCurrency }
  let original: FxTransaction & Record<string, unknown>
  let app: Record<string, unknown> | undefined
  try {
    const key = { CompanyCode: req.source.bukrs, FinancialTransaction: req.source.rfha }
    const [[fx], [appRow]] = await Promise.all([loadFxFor([key]), loadTrmFxAppFor([key])])
    if (!fx) return { ok: false, message: `${req.source.bukrs}/${req.source.rfha} is not served by the FX service, so the NDF cannot be read.` }
    original = fx as FxTransaction & Record<string, unknown>
    app = appRow as Record<string, unknown> | undefined
  } catch (e) {
    return { ok: false, message: `The NDF could not be read: ${sapMessage(e)}` }
  }

  let created: { key?: string | undefined }
  try {
    const productType = await realDeps.productTypeOf(SPOT_TXN_TYPE, { fx: original, app: (app ?? { CompanyCode: req.source.bukrs, FinancialTransaction: req.source.rfha }) as never })
    created = await createEntity<FxTransaction>(fxApi('FxTransaction'), buildSpotBody(req, productType, original), 'FinancialTransaction')
  } catch (e) {
    return { ok: false, message: sapMessage(e) }
  }
  if (!created.key) return { ok: false, message: 'SAP accepted the spot but returned no transaction number.' }

  try {
    const today = new Date().toISOString().slice(0, 10)
    await saveAppStr(req.bukrs, created.key, spotAppFields(req, app, req.tradeDate || req.ndfDate || today), 'create', SPOT_TXN_STATUS)
    return { ok: true, transaction: created.key, companyCode: req.bukrs }
  } catch (e) {
    return {
      ok: true,
      transaction: created.key,
      companyCode: req.bukrs,
      appDataError: `Spot ${created.key} was created in SAP, but its TSF data (Deal ID, status ${SPOT_TXN_STATUS}) could not be saved: ${sapMessage(e)}`,
    }
  }
}
