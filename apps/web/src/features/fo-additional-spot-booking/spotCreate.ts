/**
 * Create Additional Spot (ZSGTSFR094 / ZSGTSFR_SPOT_CREATE): the business rules and the create
 * orchestration, with every backend call behind `SpotPorts` so the rules are tested without one.
 *
 * Ownership
 *   the Spot transaction            standard FX OData (FxTransaction, BAPI_FTR_FXT_DEALCREATE)
 *   its lifecycle / Deal linkage    ZSGTSFTR_APP_STR (TrmFxApp), keyed BUKRS + RFHA
 *   the worklist and its result     ZSGTSFTR_IN_SPOT (ZSPOT_TXN, ZSPOT_CREATE)
 *
 * The legacy VTBFHA_EXPORT / _IMPORT bridge is not recreated: the standard deal is POSTed first,
 * SAP returns the new BUKRS + RFHA, and only then are APP_STR and IN_SPOT written for it.
 *
 * Order, and why: re-read IN_SPOT (no duplicate) -> load the original deal and the configuration
 * -> POST the deal -> APP_STR for the new RFHA -> IN_SPOT. IN_SPOT is last because it is what makes
 * the row stop being offered; it must never claim a Spot that SAP has not returned. The three
 * writes are separate services, so each can fail alone and `persistSpotMetadata` is safe to repeat:
 * a retry only repairs the step that failed and never books a second deal.
 *
 * This feature never touches the original transaction (its TXN_STATUS, deal type) and never writes
 * ZSGTSFTR_DEALID: the Spot is an additional booking, not a replacement Deal ID leg.
 */
import { invalidCurrencyMessage, roundToCurrency } from '../../shared/fx/currency-decimals.ts'
import { txt } from '../../shared/fx/masters.ts'
import type { FxRow } from '../../shared/fx/mw.ts'
import { isoFromDate, num } from '../../shared/fx/sap.ts'
import type { AppStrFields, AppStrRecord } from '../fx-blotter/appStr.ts'
import type { FxTransaction } from '../mo-fx-deal-confirmation/api.ts'
import { addDays } from './format.ts'
import { spotKey } from './spotList.ts'
import type { Side, SpotRow } from './types.ts'

/** The latest active source books 12A; the older 11A is superseded. */
export const SPOT_PRODUCT_TYPE = '12A'
/** TXN_STATUS of a new Spot: FO -> MO Unmatched. Only ever written to APP_STR, never to Deal ID. */
export const SPOT_TXN_STATUS = '03'
export const SPOT_CREATED_FLAG = 'X'
/** ZGTCATR_PARAM: PROGNAM + BUKRS select the row, PARAM3 is the transaction type (GV_SFHAART). */
export const SPOT_PARAM_PROGRAM = 'ZSGTSFR_SPOT_CREATE'
/** The general valuation class FTR requires on a create (see fx-blotter's VALUATION_CLASS). */
export const SPOT_VALUATION_CLASS = '0011'
/** SET_SPT's sign-of-difference column: '-' for a negative ZD_AMT, '+' otherwise. */
export const SET_SPT_SIGN_COLUMN = 'ZSIGN'

export type TxnKey = { CompanyCode: string; FinancialTransaction: string }

/** Failures the user can act on: the messages are shown as they are. */
export class SpotError extends Error {
  readonly messages: string[]
  constructor(messages: string | string[]) {
    const list = Array.isArray(messages) ? messages : [messages]
    super(list.join(' '))
    this.messages = list
  }
}

// ---------------------------------------------------------------- pure rules

export const isEligible = (row: Pick<SpotRow, 'diffAmt' | 'spotTxn'>): boolean => !row.spotTxn && Number(row.diffAmt) !== 0

/** ZD_AMT < 0 -> '-', otherwise '+'. */
export const differenceSign = (diffAmt: number): '+' | '-' => (diffAmt < 0 ? '-' : '+')

/** DSS type ending in 1 -> D1 setup, ending in 2 -> D2 setup; anything else has none. */
export function dssLeg(dssType: string): 'D1' | 'D2' | null {
  const last = dssType.trim().slice(-1)
  return last === '1' ? 'D1' : last === '2' ? 'D2' : null
}

export type SpotSetup = { entity: string; baseCurrency: string }

/**
 * ZSGTSFTR_SET_SPT for the model (first four characters of ZMOD_ID) and the sign of the difference,
 * read for the DSS leg: ZD1_BUKRS / ZD1_BCURR, or ZD2_* for a DSS type ending in 2.
 */
export function pickSpotSetup(rows: readonly FxRow[], modelId: string, diffAmt: number, dssType: string): SpotSetup | null {
  const leg = dssLeg(dssType)
  if (!leg) return null
  const model = modelId.trim().slice(0, 4)
  const sign = differenceSign(diffAmt)
  const row = rows.find((r) => txt(r, 'ZMOD_ID').slice(0, 4) === model && txt(r, SET_SPT_SIGN_COLUMN) === sign)
  if (!row) return null
  const entity = txt(row, `Z${leg}_BUKRS`)
  const baseCurrency = txt(row, `Z${leg}_BCURR`)
  return entity && baseCurrency ? { entity, baseCurrency } : null
}

/** The configured entity (ZSGTSFTR_COMP-ZCOM_ID) or company code -> the SAP company code. */
export function resolveCompanyCode(entity: string, comp: readonly FxRow[]): string {
  const row = comp.find((r) => txt(r, 'ZCOM_ID') === entity) ?? comp.find((r) => txt(r, 'ZBUKRS') === entity)
  return row ? txt(row, 'ZBUKRS') : ''
}

/** The difference currency is bought when it is the DSS leg's base currency, sold otherwise. */
export const spotDirection = (baseCurrency: string, diffCurrency: string): Side => (baseCurrency === diffCurrency ? 'Buy' : 'Sell')

/** The currency of the original deal that is not the difference currency. */
export function otherCurrency(original: Pick<FxTransaction, 'BuyCurrency' | 'SellCurrency'>, diffCurrency: string): string {
  const buy = original.BuyCurrency ?? ''
  const sell = original.SellCurrency ?? ''
  return buy === diffCurrency ? sell : buy
}

/** The transaction type the BAPI is really sent: ZGTCATR_PARAM-PARAM3 for this program and company code. */
export function configuredTxnType(params: readonly FxRow[], companyCode: string): string {
  return txt(params.find((r) => txt(r, 'PROGNAM') === SPOT_PARAM_PROGRAM && txt(r, 'BUKRS') === companyCode && txt(r, 'PARAM3')) ?? {}, 'PARAM3')
}

export type SpotAmounts = { buyCurrency: string; sellCurrency: string; buyAmount: number; sellAmount: number }

/**
 * The legacy popup's arithmetic. The difference amount is the amount of its own side; the other side
 * is `amount / rate`, except when that other side's source is USD, where it is `amount * rate`:
 *   difference currency is Buy:  buy = |diff|;  sell = buy / rate if the Buy currency is not USD, else buy * rate
 *   difference currency is Sell: sell = |diff|; buy = sell / rate if the Sell currency is not USD, else sell * rate
 * A rate that is not a positive number gives null rather than a division by zero.
 */
export function calculateSpotAmounts(input: {
  diffAmt: number
  diffCurrency: string
  direction: Side
  otherCurrency: string
  rate: number
}): SpotAmounts | null {
  const { diffCurrency, direction, rate } = input
  if (!Number.isFinite(rate) || !(rate > 0)) return null
  const base = Math.abs(input.diffAmt)
  const scaled = (currency: string): number => (currency === 'USD' ? base * rate : base / rate)
  return direction === 'Buy'
    ? { buyCurrency: diffCurrency, sellCurrency: input.otherCurrency, buyAmount: base, sellAmount: scaled(diffCurrency) }
    : { buyCurrency: input.otherCurrency, sellCurrency: diffCurrency, buyAmount: scaled(diffCurrency), sellAmount: base }
}

/** Legacy default: the Trade Date opens two days before the original Value Date. */
export function defaultTradeDate(valueDate: Date): Date {
  return addDays(valueDate, -2)
}

const money = (v: number): number => Math.round(v * 10000) / 10000

/** USD leads a pair that contains it; otherwise the difference currency leads (the existing screen's quote). */
function leadFollow(diffCurrency: string, other: string): { lead: string; follow: string } {
  return diffCurrency === 'USD' || other !== 'USD' ? { lead: diffCurrency, follow: other } : { lead: other, follow: diffCurrency }
}

export type SpotCreatePayload = {
  CompanyCode: string
  ProductType: string
  TransactionType: string
  Partner: string
  ValuationClass: string
  ContractDate: string
  ValueDate: string
  BuyCurrency: string
  SellCurrency: string
  BuyAmount: number
  SellAmount: number
  LeadCurrency: string
  FollowCurrency: string
  TradedCurrency: string
  SpotRate: number
  ForwardRate: number
  SwapRate: number
}

/**
 * The standard FxTransaction POST. Product type is 12A and the transaction type the configured one,
 * whatever the screen showed. Spot and Forward rate are both the entered rate; the Swap rate is
 * blank (0). The Value Date is the original deal's, as in the legacy BAPI preparation.
 */
export function buildSpotCreatePayload(input: {
  companyCode: string
  txnType: string
  partner: string
  tradeDate: Date
  valueDate: Date
  rate: number
  amounts: SpotAmounts
  diffCurrency: string
}): SpotCreatePayload {
  const { amounts } = input
  const other = amounts.buyCurrency === input.diffCurrency ? amounts.sellCurrency : amounts.buyCurrency
  const { lead, follow } = leadFollow(input.diffCurrency, other)
  return {
    CompanyCode: input.companyCode,
    ProductType: SPOT_PRODUCT_TYPE,
    TransactionType: input.txnType,
    Partner: input.partner,
    ValuationClass: SPOT_VALUATION_CLASS,
    ContractDate: isoFromDate(input.tradeDate)!,
    ValueDate: isoFromDate(input.valueDate)!,
    BuyCurrency: amounts.buyCurrency,
    SellCurrency: amounts.sellCurrency,
    // Each amount carries its own currency's decimals: the BAPI refuses USD 1,922,912.8071 (wrong decimal place).
    BuyAmount: roundToCurrency(amounts.buyAmount, amounts.buyCurrency),
    SellAmount: roundToCurrency(amounts.sellAmount, amounts.sellCurrency),
    LeadCurrency: lead,
    FollowCurrency: follow,
    TradedCurrency: input.diffCurrency,
    SpotRate: input.rate,
    ForwardRate: input.rate,
    SwapRate: 0,
  }
}

/** The APP_STR fields the linkage is read from (TrmFxApp serves them as nullable). */
export type LinkSource = {
  ZtsfDealID?: string | null
  ZtsfDealDesc?: string | null
  ZtsfMcRefNo?: string | null
  ZtsfDealSq?: string | null
}

/** The Deal linkage the new Spot copies from the original's APP_STR row; blanks fall back to the worklist row. */
export type SpotLinkage = { dealId: string; dealDesc: string; mcRefNo: string; dealSeq: string }

export function linkageOf(app: LinkSource | null | undefined, row: Pick<SpotRow, 'dealId'>): SpotLinkage {
  return {
    dealId: app?.ZtsfDealID?.trim() || row.dealId,
    dealDesc: app?.ZtsfDealDesc?.trim() ?? '',
    mcRefNo: app?.ZtsfMcRefNo?.trim() ?? '',
    dealSeq: app?.ZtsfDealSq?.trim() ?? '',
  }
}

/**
 * The APP_STR row of the NEW Spot. The deal type is the DSS type (not the original's FX deal type),
 * the status is 03 and the blotter date today. Only the linkage fields that exist are sent; blanks are
 * dropped by the writer. Nothing else of the legacy VTBFHA clone is copied.
 */
export function buildSpotAppStr(row: Pick<SpotRow, 'dssType'>, link: SpotLinkage, today: Date): AppStrFields {
  return {
    ZtsfDealType: row.dssType,
    ZtsfDealID: link.dealId,
    ZtsfDealDesc: link.dealDesc,
    ZtsfMcRefNo: link.mcRefNo,
    ZtsfDealSq: link.dealSeq,
    TxnStatus: SPOT_TXN_STATUS,
    BlotterDate: isoFromDate(today)!,
  }
}

// ---------------------------------------------------------------- orchestration

export type CreateOutcome = { ok: true; companyCode: string; transaction: string } | { ok: false; messages: string[] }

export type SpotPorts = {
  /** The IN_SPOT row by its key (ZMOD_ID, ZDEAL_ID, ZDEAL_TYPE, ZDSS_TYPE), or null. */
  readSpotRow(key: Record<string, string>): Promise<FxRow | null>
  loadOriginal(key: TxnKey): Promise<{ fx: FxTransaction | null; app: LinkSource | null }>
  /** APP_STR rows on a Deal ID + deal type: the candidates when the worklist row has no RFHA. */
  findDealTransactions(dealId: string, dealType: string): Promise<TxnKey[]>
  loadSetupRows(): Promise<FxRow[]>
  loadCompanies(): Promise<FxRow[]>
  loadParams(): Promise<FxRow[]>
  createFx(payload: SpotCreatePayload): Promise<CreateOutcome>
  getAppStr(key: TxnKey): Promise<AppStrRecord | null>
  createAppStr(key: TxnKey, fields: AppStrFields): Promise<void>
  updateAppStr(key: TxnKey, fields: AppStrFields): Promise<void>
  updateSpotRow(key: Record<string, string>, changes: Record<string, string>): Promise<void>
  now(): Date
}

/** What the Create Spot popup shows and what the create is built from. */
export type SpotContext = {
  original: TxnKey
  originalFx: FxTransaction
  originalApp: LinkSource | null
  companyCode: string
  txnType: string
  direction: Side
  otherCurrency: string
  valueDate: Date
  defaultTradeDate: Date
  linkage: SpotLinkage
}

/** The original transaction's key: the worklist row's own, else the single transaction on its Deal ID + deal type. */
async function resolveOriginalKey(ports: SpotPorts, row: SpotRow): Promise<TxnKey> {
  if (row.companyCode && row.originalTxn) return { CompanyCode: row.companyCode, FinancialTransaction: row.originalTxn }
  const candidates = await ports.findDealTransactions(row.dealId, row.dealType)
  if (candidates.length === 1) return candidates[0]!
  if (!candidates.length) throw new SpotError(`Deal ${row.dealId} (${row.dealType}) has no original transaction to book the Spot from.`)
  throw new SpotError(
    `Deal ${row.dealId} (${row.dealType}) has ${candidates.length} candidate transactions (${candidates.map((c) => `${c.CompanyCode}/${c.FinancialTransaction}`).join(', ')}); the original cannot be chosen automatically.`,
  )
}

const dateOf = (iso: string | null | undefined): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}

/** Everything the create needs from the backend, or the reason it cannot go ahead. */
export async function prepareSpot(ports: SpotPorts, row: SpotRow): Promise<SpotContext> {
  if (!row.dssType) throw new SpotError('The worklist row has no DSS deal type.')
  const original = await resolveOriginalKey(ports, row)
  const [{ fx, app }, setupRows, comp, params] = await Promise.all([
    ports.loadOriginal(original),
    ports.loadSetupRows(),
    ports.loadCompanies(),
    ports.loadParams(),
  ])
  if (!fx) throw new SpotError(`Original transaction ${original.CompanyCode}/${original.FinancialTransaction} was not found in SAP.`)
  const valueDate = dateOf(fx.ValueDate)
  if (!valueDate) throw new SpotError(`Original transaction ${original.FinancialTransaction} has no value date.`)

  const setup = pickSpotSetup(setupRows, row.modelId, row.diffAmt, row.dssType)
  if (!setup) {
    throw new SpotError(
      `No Spot settlement setup (ZSGTSFTR_SET_SPT) for model ${row.modelId.slice(0, 4)}, sign ${differenceSign(row.diffAmt)}, DSS type ${row.dssType}.`,
    )
  }
  const companyCode = resolveCompanyCode(setup.entity, comp)
  if (!companyCode) throw new SpotError(`Configured entity ${setup.entity} is not in ZSGTSFTR_COMP.`)
  const txnType = configuredTxnType(params, companyCode)
  if (!txnType) throw new SpotError(`ZGTCATR_PARAM has no PARAM3 transaction type for ${SPOT_PARAM_PROGRAM} in company code ${companyCode}.`)

  return {
    original,
    originalFx: fx,
    originalApp: app,
    companyCode,
    txnType,
    direction: spotDirection(setup.baseCurrency, row.currency),
    otherCurrency: otherCurrency(fx, row.currency),
    valueDate,
    defaultTradeDate: defaultTradeDate(valueDate),
    linkage: linkageOf(app, row),
  }
}

export type PersistState = { appStr: 'done' | string; inSpot: 'done' | string }
export type CreatedSpot = { companyCode: string; transaction: string; linkage: SpotLinkage }

/**
 * APP_STR then IN_SPOT for a Spot SAP has already booked. Each step is independent and idempotent:
 *   APP_STR  exists for BUKRS + RFHA -> PATCH it, else POST it
 *   IN_SPOT  already holds this RFHA -> done; holds another -> refused; blank -> PATCH
 * The IN_SPOT step runs even when APP_STR failed, so the worklist can never offer the row again.
 * Returns 'done' or the failure text per step; it never throws.
 */
export async function persistSpotMetadata(ports: SpotPorts, row: SpotRow, created: CreatedSpot): Promise<PersistState> {
  const key: TxnKey = { CompanyCode: created.companyCode, FinancialTransaction: created.transaction }
  const fields = buildSpotAppStr(row, created.linkage, ports.now())

  const state: PersistState = { appStr: 'done', inSpot: 'done' }
  try {
    if (await ports.getAppStr(key)) await ports.updateAppStr(key, fields)
    else await ports.createAppStr(key, fields)
  } catch (error) {
    state.appStr = errorText(error)
  }

  try {
    const latest = await ports.readSpotRow(spotKey(row))
    const current = latest ? txt(latest, 'ZSPOT_TXN') : ''
    if (current && current !== created.transaction) {
      state.inSpot = `IN_SPOT already holds Spot ${current}; it was not overwritten with ${created.transaction}.`
    } else if (current !== created.transaction) {
      await ports.updateSpotRow(spotKey(row), { ZSPOT_TXN: created.transaction, ZSPOT_CREATE: SPOT_CREATED_FLAG })
    }
  } catch (error) {
    state.inSpot = errorText(error)
  }
  return state
}

const errorText = (error: unknown): string => (error instanceof SpotError ? error.message : error instanceof Error ? error.message : String(error))

export type CreateSpotResult =
  | { stage: 'refused'; messages: string[] }
  | { stage: 'booked'; created: CreatedSpot; persist: PersistState }

export type SpotInput = { partner: string; tradeDate: Date; rate: number }

/**
 * Books the additional Spot. Nothing is sent to SAP when the row is no longer eligible, when the
 * configuration cannot be resolved or when the input is invalid. Once SAP returns an RFHA the result is
 * 'booked' whatever happens next, and `persist` says which of the two follow-up writes still needs a retry.
 */
export async function createAdditionalSpot(ports: SpotPorts, row: SpotRow, input: SpotInput): Promise<CreateSpotResult> {
  try {
    if (!(input.rate > 0)) throw new SpotError('Enter a valid spot rate.')
    if (!input.partner) throw new SpotError('Business Partner is required.')

    const latest = await ports.readSpotRow(spotKey(row))
    if (!latest) throw new SpotError('The worklist row no longer exists. Refresh and try again.')
    const existing = txt(latest, 'ZSPOT_TXN')
    if (existing) throw new SpotError(`Spot transaction ${existing} already exists for this row.`)
    const diffAmt = num(latest['ZD_AMT'])
    if (diffAmt === 0) throw new SpotError('Spot cannot be created: the difference amount is zero.')
    const fresh: SpotRow = { ...row, diffAmt, spotTxn: '' }

    const ctx = await prepareSpot(ports, fresh)
    const amounts = calculateSpotAmounts({ diffAmt, diffCurrency: fresh.currency, direction: ctx.direction, otherCurrency: ctx.otherCurrency, rate: input.rate })
    if (!amounts) throw new SpotError('Enter a valid spot rate.')
    if (!amounts.buyCurrency || !amounts.sellCurrency) throw new SpotError('The Spot currency pair could not be derived from the original transaction.')
    const badCurrency = invalidCurrencyMessage([amounts.buyCurrency, amounts.sellCurrency])
    if (badCurrency) throw new SpotError(badCurrency)

    const out = await ports.createFx(
      buildSpotCreatePayload({
        companyCode: ctx.companyCode,
        txnType: ctx.txnType,
        partner: input.partner,
        tradeDate: input.tradeDate,
        valueDate: ctx.valueDate,
        rate: input.rate,
        amounts,
        diffCurrency: fresh.currency,
      }),
    )
    if (!out.ok) return { stage: 'refused', messages: out.messages }
    const created: CreatedSpot = { companyCode: out.companyCode, transaction: out.transaction, linkage: ctx.linkage }
    return { stage: 'booked', created, persist: await persistSpotMetadata(ports, fresh, created) }
  } catch (error) {
    return { stage: 'refused', messages: error instanceof SpotError ? error.messages : [errorText(error)] }
  }
}
