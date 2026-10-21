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
 * when the TrmFxApp entity does not declare them. Spot routing follows TSF_PAY + COMP, not the source's D1/D2 slot.
 */
import { createEntity, service } from '@slc/api-client'
import { VALUATION_CLASS, sapMessage } from '../fx-blotter/api.ts'
import { saveAppStr, type AppStrFields } from '../fx-blotter/appStr.ts'
import { realDeps } from '../fo-early-delivery-unwind-rollover/deps.ts'
import type { FxTransaction } from '../mo-fx-deal-confirmation/api.ts'
import { loadFxFor, loadTrmFxAppFor } from '../../shared/fx/app-str.ts'
import { invalidCurrencyMessage, roundToCurrency } from '../../shared/fx/currency-decimals.ts'
import { fxList, type FxRow } from '../../shared/fx/mw.ts'
import { txt } from '../../shared/fx/masters.ts'

const fxApi = service('fx')

/** ZSGTSFTR_TXNSTAT 03: MO - the spot goes straight to the MO queue. */
export const SPOT_TXN_STATUS = '03'
/** The spot's SAP transaction type (c_605). */
export const SPOT_TXN_TYPE = '605'

export type NdfSpotRequest = {
  variant: 'ndf' | 'dndf'
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

/** DERIVE_DEAL_TYPE_NDF / DNDF: COMP translates the selected company to the TSF_PAY entity.
 * NDF tries the original currency 2, then currency 1; DNDF tries only the original bought currency.
 * The second assignment in ABAP gives DS2 precedence when both slots match the same currency.
 */
export function deriveNdfSpotType(pay: readonly FxRow[], companies: readonly FxRow[], company: string, currencies: readonly string[]): string {
  const entity = txt(companies.find((r) => txt(r, 'ZBUKRS') === company) ?? {}, 'ZCOM_ID')
  if (!entity) return ''
  for (const currency of currencies.filter(Boolean)) {
    if (pay.some((r) => txt(r, 'ZD2_BUKRS') === entity && txt(r, 'ZD2_BCURR') === currency)) return 'DS2'
    if (pay.some((r) => txt(r, 'ZD1_BUKRS') === entity && txt(r, 'ZD1_BCURR') === currency)) return 'DS1'
  }
  return ''
}

type Source = { fx: FxTransaction & Record<string, unknown>; app: Record<string, unknown> | undefined }
export type NdfSpotPorts = {
  source: (key: NdfSpotRequest['source']) => Promise<Source>
  list: (resource: string, filter: Record<string, string>) => Promise<FxRow[]>
  productType: (source: Source) => Promise<string>
  create: (body: Record<string, unknown>) => Promise<{ key?: string | undefined }>
  save: (company: string, transaction: string, fields: AppStrFields) => Promise<void>
}

const ports: NdfSpotPorts = {
  async source(key) {
    const keys = [{ CompanyCode: key.bukrs, FinancialTransaction: key.rfha }]
    const [[fx], [app]] = await Promise.all([loadFxFor(keys), loadTrmFxAppFor(keys)])
    if (!fx) throw new Error(`${key.bukrs}/${key.rfha} is not served by the FX service, so the NDF cannot be read.`)
    return { fx: fx as Source['fx'], app: app as Source['app'] }
  },
  list: (resource, filter) => fxList(resource, filter),
  productType: ({ fx, app }) => realDeps.productTypeOf(SPOT_TXN_TYPE, { fx, app: (app ?? { CompanyCode: fx.CompanyCode, FinancialTransaction: fx.FinancialTransaction }) as never }),
  create: (body) => createEntity<FxTransaction>(fxApi('FxTransaction'), body, 'FinancialTransaction'),
  save: (company, transaction, fields) => saveAppStr(company, transaction, fields, 'create', SPOT_TXN_STATUS),
}

/** Re-read routing before any SAP POST. A linked spot must have both a derived slot and SET_FX sides. */
async function validatedSpotType(req: NdfSpotRequest, { fx, app }: Source, deps: NdfSpotPorts): Promise<string> {
  const dealId = String(app?.['ZtsfDealID'] ?? '').trim()
  const mcRef = String(app?.['ZtsfMcRefNo'] ?? '').trim()
  const sourceType = String(app?.['ZtsfDealType'] ?? '').trim()
  // An independent transaction has no TSF model to derive a slot from.
  if (!dealId && !mcRef && !sourceType && !req.dealType) return ''
  if (!dealId || !mcRef || !sourceType || sourceType !== req.dealType) throw new Error('The NDF’s Deal ID linkage changed or is incomplete. Refresh the workbench before creating its spot.')
  const [[deal], [mc], companies, invoices] = await Promise.all([
    deps.list('tsfDealId', { ZDEAL_ID: dealId }),
    deps.list('masterContract', { ZMC_REF_NO: mcRef }),
    deps.list('comp', {}),
    req.variant === 'ndf' ? deps.list('inSpot', { ZDEAL_ID: dealId, ZDEAL_TYPE: sourceType }) : Promise.resolve([]),
  ])
  const model = txt(mc ?? {}, 'ZMOD_ID')
  // The original NDF join is MAS_CON.ZMOD_ID = DEALID.ZTSF_MODEL; DNDF uses the selected deal's model.
  if (!model || !deal || txt(deal, 'ZMC_REF') !== mcRef || (req.variant === 'ndf' && txt(deal, 'ZTSF_MODEL') !== model)) {
    throw new Error('The Deal ID and master contract do not resolve to a consistent TSF model. Correct their model linkage before booking a spot.')
  }
  const [pay, setFx] = await Promise.all([
    deps.list('tsfPay', { ZMOD_ID: model }),
    deps.list('setFx', { ZMOD_ID: model }),
  ])
  const currencies = req.variant === 'ndf'
    ? [fx.FollowCurrency || fx.SellCurrency || '', fx.LeadCurrency || fx.BuyCurrency || '']
    : [fx.BuyCurrency || '']
  const type = deriveNdfSpotType(pay, companies, req.bukrs, currencies)
  if (!type) throw new Error(`Model ${model} has no NDF spot routing for company ${req.bukrs} and ${currencies.filter(Boolean).join(' / ')}. Select the company configured in TSF_PAY.`)
  const mapping = setFx.filter((r) => txt(r, 'ZD_MAP') === type && txt(r, 'ZBUKRS') === req.bukrs)
  const buyCurrency = req.bs1 === 'Buy' ? req.curr1 : req.curr2
  const sellCurrency = req.bs1 === 'Buy' ? req.curr2 : req.curr1
  if (!mapping.some((r) => txt(r, 'ZBS') === 'B' && txt(r, 'ZCURR') === buyCurrency) || !mapping.some((r) => txt(r, 'ZBS') === 'S' && txt(r, 'ZCURR') === sellCurrency)) {
    throw new Error(`Model ${model} has no matching SET_FX buy/sell mapping for ${type} in ${req.bukrs} (${buyCurrency} / ${sellCurrency}). Correct the settlement configuration before booking.`)
  }
  if (req.variant === 'ndf') {
    const invoice = invoices.find((r) => txt(r, 'ZRFHA') === '')
    if (!invoice || !(Math.abs(Number(invoice['ZF_AMT'])) > 0)) throw new Error('No invoice amount is available for this NDF. Save the FX–Invoice Difference on MO: Execute Settlement before creating its spot.')
    const currency = req.base === 1 ? req.curr1 : req.curr2
    const amount = req.base === 1 ? req.amt1 : req.amt2
    const buying = txt(invoice, 'ZBS') === 'Buy'
    if (currency !== txt(invoice, 'ZCURR') || buying !== (buyCurrency === currency) || roundToCurrency(Math.abs(amount), currency) !== roundToCurrency(Math.abs(Number(invoice['ZF_AMT'])), currency)) {
      throw new Error('The NDF invoice amount, currency or buy/sell direction changed. Refresh the workbench and reopen Create Spot to load the current invoice data.')
    }
  }
  return type
}

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
export function spotAppFields(req: NdfSpotRequest, app: Record<string, unknown> | undefined, blotterDate: string, spotType: string): AppStrFields {
  const text = (name: string): string => String(app?.[name] ?? '')
  const fields: AppStrFields & { Zgrp?: string } = {
    ZtsfDealID: text('ZtsfDealID'),
    ZtsfDealDesc: text('ZtsfDealDesc'),
    ZtsfMcRefNo: text('ZtsfMcRefNo'),
    ZtsfDealSq: text('ZtsfDealSq'),
    ZtsfExOptNo: req.source.rfha,
    Ztrcode: text('Ztrcode'),
    BlotterDate: blotterDate,
  }
  if (spotType) fields.ZtsfDealType = spotType
  const grp = text('Zgrp')
  if (grp) fields.Zgrp = grp
  return fields
}

export type NdfSpotResult = { ok: true; transaction: string; companyCode: string; appDataError?: string } | { ok: false; message: string }

/** Reads the NDF, books the spot and saves its TSF row. A failed TSF save keeps the SAP spot and says so. */
export async function createNdfSpot(req: NdfSpotRequest, deps: NdfSpotPorts = ports): Promise<NdfSpotResult> {
  const badCurrency = invalidCurrencyMessage([req.curr1, req.curr2])
  if (badCurrency) return { ok: false, message: badCurrency }
  let source: Source
  let spotType: string
  try {
    source = await deps.source(req.source)
    spotType = await validatedSpotType(req, source, deps)
  } catch (e) {
    return { ok: false, message: sapMessage(e) }
  }

  let created: { key?: string | undefined }
  try {
    const productType = await deps.productType(source)
    created = await deps.create(buildSpotBody(req, productType, source.fx))
  } catch (e) {
    return { ok: false, message: sapMessage(e) }
  }
  if (!created.key) return { ok: false, message: 'SAP accepted the spot but returned no transaction number.' }

  try {
    const today = new Date().toISOString().slice(0, 10)
    await deps.save(req.bukrs, created.key, spotAppFields(req, source.app, req.tradeDate || req.ndfDate || today, spotType))
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
