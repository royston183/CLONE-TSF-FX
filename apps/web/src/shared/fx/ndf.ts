import { ApiError, apiFetch, apiRequest, entityPath, odataQuery, service } from '@slc/api-client'
import { txt } from './masters.ts'
import { fxList, isAbort, type FxRow } from './mw.ts'
import { num } from './sap.ts'

/*
 * The NDF fixing cycle (UA1 ZSGTSFR050, MO ZSGTSFR026, AE1 ZSGTSFR025) on SAP's own services.
 *
 * Where the ABAP reads ZSGTSFV_FX — VTBFHA plus its TSF append — the screens read the two halves
 * the RAP services expose, joined by company code + transaction:
 *
 *   TrmFxApp       ZFS_SB_TRMFXAPP_O4_API, table ZSGTSFTR_APP_STR: the TSF append — TXN_STATUS,
 *                  ZTRCODE, NDF_FO_REM / NDF_MO_REM. It decides which deals are in a queue, and it is
 *                  what ZSGTRMFM_VTBFHA_EXPORT / MODIFY VTBFHA write in the ABAP.
 *   FxTransaction  ZFS_SB_TRMFX_O4_API: the FTR deal itself — product type, currencies, amounts,
 *                  rates, value date, active status. Its bound Settle action is BAPI_FTR_FXT_SETTLE.
 *   tsfvFx         ZSGTSFV_FX through the SLC middleware, only for what neither service carries:
 *                  partner and company names, NDF_DATE and NDF_REF.
 *
 * The status meanings are SAP's, from ZSGTSFTR_TXNSTAT type 01 (middleware "txnstat"):
 *   07 MO: Match & Release for Settlement      -> UA1 fixes it
 *   10 FO: NDF Fixing - pending MO confirmation -> MO confirms (13) or sends back (11)
 *   11 MO: NDF Fixing Correction Req            -> AE1 corrects it (12)
 *   12 FO: NDF Fixing Corrected                 -> MO again
 *   13 MO: Confirm NDF Fixing ("Fixing Settlement")
 *
 * Not available from any service: BAPI_FTR_FXT_NDF_FIXING and the TX02 settle rate, i.e. recording
 * a fixing rate. See NDF_FIXING_API_MISSING.
 */

const trmfx = service('trmfx')
const trmfxApp = service('trmfxapp')

export const TXN = {
  RELEASED: '07',
  FIXED: '10',
  CORRECTION_REQUIRED: '11',
  CORRECTED: '12',
  CONFIRMED: '13',
} as const

/** FxTransaction.ActiveStatus of a reversed deal (VTBFHA-SAKTIV 3); the ABAP drops those. */
export const ACTIVE_STATUS_REVERSED = '3'

const SETTLE_ACTION = 'com.sap.gateway.srvd_a2x.zfs_sd_trmfx.v0001.Settle'
/**
 * NdfFixing (ZBP_FS_TRMFXTP=>ndffixing): BAPI_FTR_FXT_GETDETAIL for the deal's own cash settlement, NDF_FIXING_RATE
 * set to the given rate, BAPI_FTR_FXT_NDF_FIXING, commit. It does not touch the TSF status.
 */
export const NDF_FIXING_ACTION_NAME = 'NdfFixing'
const FIX_NDF_ACTION = `com.sap.gateway.srvd_a2x.zfs_sd_trmfx.v0001.${NDF_FIXING_ACTION_NAME}`
/** NDF_FO_REM's length in ZSGTSFTR_APP_STR. */
export const FO_REMARK_MAX = 80

/** Why Save Fixing / Save Correction cannot post: the only call that records a fixing rate has no API. */
export const NDF_FIXING_API_MISSING =
  'WAITING FOR ACTION API — recording an NDF fixing rate needs BAPI_FTR_FXT_NDF_FIXING (+ the TX02 settle rate). ' +
  'ZFS_SD_TRMFX offers no action that takes a fixing rate, so nothing was posted to SAP.'

export type NdfKey = { bukrs: string; rfha: string }

/** One NDF deal: the FTR deal, its TSF append and the view's display fields. */
export type NdfRecord = NdfKey & {
  productType: string
  transactionType: string
  partner: string
  partnerName: string
  companyName: string
  /** RBUSA - BA_NAME */
  businessArea: string
  /** ZCOM_ID */
  tsfEntity: string
  /** XTEXT, e.g. "631 - NDF-TSF"; the transaction type when the view has no text. */
  txnTypeDesc: string
  /** NORDEXT / REFER */
  externalRef: string
  internalRef: string
  /** ZTSF_MC_REF_NO, from the TSF append. */
  mcReference: string
  /** Lead / following currency of the pair, as ZSGTSFV_FX's CURR1 / CURR2. */
  c1: string
  c2: string
  /** The direction of the CURR1 leg (BS_1). */
  side: 'Buy' | 'Sell'
  /** Signed as ZSGTSFV_FX holds them: a bought leg positive, a sold leg negative. */
  amt1: number
  amt2: number
  spot: number
  swap: number
  fwd: number
  /** The trade (contract conclusion) date, DBLFZ. ISO. */
  contractDate: string
  valueDate: string
  /** NDF_DATE when the deal carries one, else the value date. ISO. */
  fixingDate: string
  ndfRef: string
  activeStatus: string
  activityCategory: string
  txnStatus: string
  traderCode: string
  foRemark: string
  moRemark: string
  dealId: string
  /** The fixing rate in FTR; null while FxTransaction does not serve NdfFixingRate. */
  fixingRate: number | null
  /** ZCASH_AMT / CASH_CURR; null / '' while FxTransaction does not serve them. */
  cashAmount: number | null
  cashCurrency: string
  /** The settlement's FI document (BKPF-BELNR / GJAHR); '' while not served or not posted. */
  fiDoc: string
  fiYear: string
  /** Whether FxTransaction serves AccountingDocument at all (an empty fiDoc then means "not posted"). */
  fiKnown: boolean
  /** TrmFxApp's ETag, sent back as If-Match on an update. */
  etag: string
}

export type FxTransaction = {
  CompanyCode: string
  FinancialTransaction: string
  ProductType?: string
  TransactionType?: string
  Partner?: string
  ContractDate?: string | null
  BuyCurrency?: string
  SellCurrency?: string
  LeadCurrency?: string
  FollowCurrency?: string
  BuyAmount?: number | string
  SellAmount?: number | string
  ValueDate?: string | null
  SpotRate?: number | string
  SwapRate?: number | string
  ForwardRate?: number | string
  ActiveStatus?: string
  ActivityCategory?: string
  /*
   * Settlement fields proposed in docs/abap/ZFS_SD_TRMFX-NdfSettlement.md. Absent from the service until the
   * SAP team adds them; then FX NDF Settlement, MO's NDF Value and AE1's Old Fixing Rate use them.
   */
  NdfFixingRate?: number | string
  CashSettlementAmount?: number | string
  CashSettlementCurrency?: string
  AccountingDocument?: string
  AccountingDocFiscalYear?: string
}

export type TrmFxAppRow = {
  CompanyCode: string
  FinancialTransaction: string
  TxnStatus?: string
  Ztrcode?: string
  NdfFoRem?: string
  NdfMoRem?: string
  ZtsfDealID?: string
  ZtsfMcRefNo?: string
  '@odata.etag'?: string
}

const keyOf = (bukrs: string, rfha: string) => `${bukrs}|${rfha}`

/** NDF product types have D as their third character (sgsart+2(1) = 'D'). */
export const isNdfProduct = (productType: string | undefined) => String(productType ?? '').charAt(2) === 'D'

/* ---------------- pure mapping (tested) ---------------- */

/**
 * Joins the three sources into one deal. CURR1 is the lead currency; its leg is bought when it is the
 * buy currency, so BS_1 and the signs follow from FxTransaction alone and match ZSGTSFV_FX.
 */
export function ndfRecord(fx: FxTransaction, app: TrmFxAppRow, view?: FxRow): NdfRecord {
  const c1 = fx.LeadCurrency || fx.BuyCurrency || ''
  const c2 = fx.FollowCurrency || (fx.BuyCurrency === c1 ? fx.SellCurrency : fx.BuyCurrency) || ''
  const buysC1 = fx.BuyCurrency === c1
  const buy = num(fx.BuyAmount)
  const sell = num(fx.SellAmount)
  const valueDate = String(fx.ValueDate ?? '')
  const ndfDate = view ? txt(view, 'NDF_DATE') : ''
  return {
    bukrs: fx.CompanyCode,
    rfha: fx.FinancialTransaction,
    productType: fx.ProductType ?? '',
    transactionType: fx.TransactionType ?? '',
    partner: fx.Partner ?? '',
    partnerName: (view && txt(view, 'BP_NAME')) || fx.Partner || '',
    companyName: (view && txt(view, 'BUTXT')) || fx.CompanyCode,
    businessArea: view ? [txt(view, 'RBUSA'), txt(view, 'BA_NAME')].filter(Boolean).join(' - ') : '',
    tsfEntity: view ? txt(view, 'ZCOM_ID') : '',
    txnTypeDesc: (view && txt(view, 'XTEXT')) || fx.TransactionType || '',
    externalRef: view ? txt(view, 'NORDEXT') : '',
    internalRef: view ? txt(view, 'REFER') : '',
    mcReference: app.ZtsfMcRefNo ?? '',
    c1,
    c2,
    side: buysC1 ? 'Buy' : 'Sell',
    amt1: buysC1 ? buy : -sell,
    amt2: buysC1 ? -sell : buy,
    spot: num(fx.SpotRate),
    swap: num(fx.SwapRate),
    fwd: num(fx.ForwardRate),
    contractDate: String(fx.ContractDate ?? ''),
    valueDate,
    fixingDate: ndfDate || valueDate,
    ndfRef: view ? txt(view, 'NDF_REF') : '',
    activeStatus: fx.ActiveStatus ?? '',
    activityCategory: fx.ActivityCategory ?? '',
    txnStatus: app.TxnStatus ?? '',
    traderCode: app.Ztrcode ?? '',
    foRemark: app.NdfFoRem ?? '',
    moRemark: app.NdfMoRem ?? '',
    dealId: app.ZtsfDealID ?? '',
    fixingRate: fx.NdfFixingRate === undefined ? null : num(fx.NdfFixingRate),
    cashAmount: fx.CashSettlementAmount === undefined ? null : num(fx.CashSettlementAmount),
    cashCurrency: fx.CashSettlementCurrency ?? '',
    fiDoc: fx.AccountingDocument ?? '',
    fiYear: fx.AccountingDocFiscalYear ?? '',
    fiKnown: fx.AccountingDocument !== undefined,
    etag: app['@odata.etag'] ?? '',
  }
}

/**
 * The queue: TSF append rows in the given statuses whose FTR deal exists, is an NDF and is not
 * reversed. A status row without its deal (or a reversed one) is left out, as the ABAP's join is.
 */
export function joinQueue(
  apps: readonly TrmFxAppRow[],
  deals: readonly FxTransaction[],
  views: readonly FxRow[],
): NdfRecord[] {
  const dealByKey = new Map(deals.map((d) => [keyOf(d.CompanyCode, d.FinancialTransaction), d]))
  const viewByKey = new Map(views.map((v) => [keyOf(txt(v, 'BUKRS'), txt(v, 'RFHA')), v]))
  const out: NdfRecord[] = []
  for (const app of apps) {
    const key = keyOf(app.CompanyCode, app.FinancialTransaction)
    const fx = dealByKey.get(key)
    if (!fx || !isNdfProduct(fx.ProductType) || fx.ActiveStatus === ACTIVE_STATUS_REVERSED) continue
    out.push(ndfRecord(fx, app, viewByKey.get(key)))
  }
  return out.sort((a, b) => (a.bukrs + a.rfha).localeCompare(b.bukrs + b.rfha))
}

/** An OData `or` over one property. */
export const anyOf = (property: string, values: readonly string[]) =>
  values.map((v) => `${property} eq '${v.replace(/'/g, "''")}'`).join(' or ')

/** FTR0/161 "BAPI processing was terminated" and FTR0/030 "No payment details entered" never name the cause. */
const NOISE_CODES = new Set(['FTR0/161', 'FTR0/030'])

/**
 * SAP's reason for a refusal: every message of the error except the generic BAPI noise. The cause can
 * be the top-level message (T0/075 "Transaction … does not exist") or a detail, so both are kept.
 */
export function sapMessage(error: unknown): string {
  if (error instanceof ApiError) {
    type Msg = { code?: string; message?: string }
    const body = error.body as { error?: Msg & { details?: Msg[] } } | null
    const all = [body?.error, ...(body?.error?.details ?? [])]
    const causes = all.filter((m): m is Msg => !!m?.message && !NOISE_CODES.has(m.code ?? '')).map((m) => m.message as string)
    if (causes.length) return [...new Set(causes)].join(' ')
    if (body?.error?.message) return body.error.message
  }
  return error instanceof Error ? error.message : String(error)
}

/* ---------------- reads ---------------- */

const PAGE = 1000

async function pagedOData<T>(url: string, filter: string, signal?: AbortSignal): Promise<T[]> {
  const rows: T[] = []
  for (let skip = 0; ; skip += PAGE) {
    const qs = odataQuery({ filter, top: PAGE, skip })
    const body = await apiFetch<{ value?: T[] }>(`${url}?${qs}`, signal ? { signal } : undefined)
    const page = body?.value ?? []
    rows.push(...page)
    if (page.length < PAGE) return rows
  }
}

/** TrmFxApp rows in the given TSF statuses. */
export function loadTsfAppend(statuses: readonly string[], signal?: AbortSignal): Promise<TrmFxAppRow[]> {
  return pagedOData<TrmFxAppRow>(trmfxApp('TrmFxApp'), anyOf('TxnStatus', statuses), signal)
}

/** Every NDF deal in FTR. The service filters but cannot aggregate, so the NDF test is endswith. */
export function loadNdfTransactions(signal?: AbortSignal): Promise<FxTransaction[]> {
  return pagedOData<FxTransaction>(trmfx('FxTransaction'), "endswith(ProductType,'D')", signal)
}

/** ZSGTSFV_FX rows of the given companies; only names and NDF date / reference are used. */
async function loadViewRows(companies: readonly string[], signal?: AbortSignal): Promise<FxRow[]> {
  if (!companies.length) return []
  try {
    return await fxList('tsfvFx', { 'BUKRS[in]': companies.join(',') }, { signal })
  } catch (error) {
    if (isAbort(error)) throw error
    // Names and the NDF date are display-only; the queue itself does not depend on them.
    console.warn('[ndf] ZSGTSFV_FX unavailable', error)
    return []
  }
}

/** One queue of the fixing cycle, e.g. [TXN.RELEASED] for UA1. */
export async function loadNdfQueue(statuses: readonly string[], signal?: AbortSignal): Promise<NdfRecord[]> {
  const apps = await loadTsfAppend(statuses, signal)
  if (!apps.length) return []
  const deals = await loadNdfTransactions(signal)
  const views = await loadViewRows([...new Set(apps.map((a) => a.CompanyCode))], signal)
  return joinQueue(apps, deals, views)
}

/**
 * Deals with a posted flow (VTBFHAPO SBEWEBE = 2), keyed "<bukrs>|<rfha>" — the Accounting column.
 * Display-only: a failed read leaves every deal "Not Posted" rather than blocking the queue.
 */
export async function loadPostedDeals(deals: readonly NdfKey[], signal?: AbortSignal): Promise<Set<string>> {
  const out = new Set<string>()
  if (!deals.length) return out
  try {
    const filter = {
      'BUKRS[in]': [...new Set(deals.map((d) => d.bukrs))].join(','),
      'RFHA[in]': [...new Set(deals.map((d) => d.rfha))].join(','),
      SBEWEBE: '2',
    }
    for (const r of await fxList('vtbfhapo', filter, { signal })) out.add(keyOf(txt(r, 'BUKRS'), txt(r, 'RFHA')))
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[ndf] VTBFHAPO unavailable', error)
  }
  return out
}

/** The key loadPostedDeals uses. */
export const dealKey = (d: NdfKey) => keyOf(d.bukrs, d.rfha)

/** ZSGTSFTR_TXNSTAT type 01 (FX): code -> description, the text ZSGTSFV_FX's EXT_STAT_DESC carries. */
export async function loadTxnStatusTexts(signal?: AbortSignal): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  try {
    for (const r of await fxList('txnstat', { ZTYPE: '01' }, { signal })) out[txt(r, 'ZTXN_STAT')] = txt(r, 'ZTXN_STAT_DESC')
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[ndf] ZSGTSFTR_TXNSTAT unavailable', error)
  }
  return out
}

/** "<code> - <description>", or the bare code when the master has no text for it. */
export const statusLabel = (code: string, texts: Readonly<Record<string, string>>) =>
  texts[code] ? `${code} - ${texts[code]}` : code

/* ---------------- writes ---------------- */

export type TsfChanges = { TxnStatus?: string; NdfFoRem?: string; NdfMoRem?: string }

/**
 * The ABAP's ZSGTRMFM_VTBFHA_EXPORT / MODIFY VTBFHA on the TSF append. The ETag read with the row
 * goes back as If-Match, so a deal changed by someone else in the meantime is refused, not overwritten.
 */
export async function updateTsfAppend(deal: NdfKey & { etag: string }, changes: TsfChanges): Promise<void> {
  const url = trmfxApp(entityPath('TrmFxApp', { CompanyCode: deal.bukrs, FinancialTransaction: deal.rfha }))
  await apiRequest(url, { method: 'PATCH', body: changes, headers: { 'if-match': deal.etag || '*' } })
}

/* ---------------- NDF fixing (NdfFixing action; switches itself off if SAP removes it) ---------------- */

/** Whether a service's $metadata declares a bound action of that name. */
export const metadataHasAction = (xml: string, name: string) => new RegExp(`<Action\\s+Name="${name}"`).test(xml)

/** What ZFS_SD_TRMFX offers: its bound actions and FxTransaction's properties. */
export type TrmfxCapabilities = { actions: ReadonlySet<string>; fxProperties: ReadonlySet<string> }

/** The capabilities declared in a $metadata document (pure, tested). */
export function capabilitiesFromMetadata(xml: string): TrmfxCapabilities {
  const actions = new Set([...xml.matchAll(/<Action\s+Name="([^"]+)"/g)].map((m) => m[1] ?? ''))
  const type = /<EntityType\s+Name="FxTransactionType"[\s\S]*?<\/EntityType>/.exec(xml)?.[0] ?? ''
  const fxProperties = new Set([...type.matchAll(/<Property\s+Name="([^"]+)"/g)].map((m) => m[1] ?? ''))
  return { actions, fxProperties }
}

let capabilitiesProbe: Promise<TrmfxCapabilities> | undefined

/**
 * ZFS_SD_TRMFX's $metadata, read once per page load, so each screen follows what the service offers
 * rather than a hard-coded assumption: an action or field the SAP team adds is used after a reload.
 * A failed read offers nothing, so buttons stay disabled rather than post into nothing.
 */
export function trmfxCapabilities(): Promise<TrmfxCapabilities> {
  capabilitiesProbe ??= fetch(trmfx('$metadata'), { headers: { accept: 'application/xml' }, credentials: 'same-origin' })
    .then(async (res) => (res.ok ? capabilitiesFromMetadata(await res.text()) : capabilitiesFromMetadata('')))
    .catch(() => capabilitiesFromMetadata(''))
  return capabilitiesProbe
}

/** Whether ZFS_SD_TRMFX offers NdfFixing (UA1 Save Fixing, AE1 Update). */
export function fixNdfAvailable(): Promise<boolean> {
  return trmfxCapabilities().then((c) => c.actions.has(NDF_FIXING_ACTION_NAME))
}

/**
 * FixingRate is Edm.Decimal(13, 9) in the service, but rates are kept to 4 decimals (94.1234):
 * rounded to 4 so no extra precision or float noise is sent.
 */
export const fixingRateValue = (rate: number) => Math.round(rate * 1e4) / 1e4

export type ActionResult = { ok: boolean; message: string }

/**
 * T1/079 "Transaction belongs to activity category Contract": FTR fixes an NDF only after its contract is
 * settled — status 07's SAP action "Contract Settlement" (MO Match & Release), activity category 20 -> 30.
 * Seen on 2026-10-06 for a deal set to 07 without that settlement.
 */
export function fixingHint(error: unknown): string {
  const err = error instanceof ApiError ? (error.body as { error?: { code?: string; message?: string } } | null)?.error : undefined
  // T1/079 names the deal's current category; only "Contract" means the settlement step is missing.
  return err?.code === 'T1/079' && /\bcontract\b/i.test(err.message ?? '')
    ? ' The deal is still a contract in SAP: it has to be settled (MO Match & Release for Settlement) before it can be fixed.'
    : ''
}

/** FxTransaction.ActivityCategory: 30 after the contract settlement, 55 once the NDF is fixed. */
export const CATEGORY_SETTLED = '30'
export const CATEGORY_FIXED = '55'

async function activityCategory(deal: NdfKey): Promise<string> {
  const url = trmfx(entityPath('FxTransaction', { CompanyCode: deal.bukrs, FinancialTransaction: deal.rfha }))
  return (await apiFetch<FxTransaction>(url))?.ActivityCategory ?? ''
}

/**
 * AE1 Update (FORM save_data of ZSGTSF_RFX_NDF_FIX_FO): a new rate for a deal MO sent back.
 * BAPI_FTR_FXT_NDF_FIXING refuses a deal that is already fixed (T1/079 "activity category Fixing"), and the
 * SAP GUI program changed the rate through TX02 instead. Here the fixing activity is reversed first — the
 * service's DELETE is BAPI_FTR_FXT_REVERSE of the latest activity, 55 -> 30, verified on 2026-10-06 — and
 * the new rate is then fixed and the status set to 12.
 *
 * Only a deal whose latest activity is the fixing (55) is reversed, so nothing else can be undone by
 * mistake. If the new fixing then fails, the deal is left settled but unfixed and still in status 11:
 * running Update again fixes it directly (category 30, nothing to reverse).
 */
export async function correctNdfFixing(deal: NdfKey & { etag: string }, rate: number): Promise<ActionResult> {
  if (!Number.isFinite(rate) || rate <= 0) return { ok: false, message: 'Enter a fixing rate greater than zero.' }
  try {
    const category = await activityCategory(deal)
    if (category === CATEGORY_FIXED) {
      await apiRequest(trmfx(entityPath('FxTransaction', { CompanyCode: deal.bukrs, FinancialTransaction: deal.rfha })), { method: 'DELETE' })
      const after = await activityCategory(deal)
      if (after !== CATEGORY_SETTLED) {
        return {
          ok: false,
          message: `The old fixing of transaction ${deal.rfha} was reversed, but the deal is now in activity category ${after || '?'} instead of ${CATEGORY_SETTLED}. Nothing else was changed; check the deal in SAP.`,
        }
      }
    } else if (category !== CATEGORY_SETTLED) {
      return {
        ok: false,
        message: `Transaction ${deal.rfha} is in activity category ${category || '?'}; a fixing can only be corrected from ${CATEGORY_FIXED} (fixed) or ${CATEGORY_SETTLED} (settled). Nothing was changed.`,
      }
    }
  } catch (error) {
    return { ok: false, message: `SAP did not reverse the old fixing of transaction ${deal.rfha}: ${sapMessage(error)}` }
  }
  const res = await fixNdf(deal, rate, TXN.CORRECTED)
  if (!res.ok && res.message.startsWith('SAP did not record')) {
    return {
      ok: false,
      message: `${res.message} The old fixing was already reversed, so the deal is not fixed now; it stays in status ${TXN.CORRECTION_REQUIRED} — run Update again.`,
    }
  }
  return res
}

/**
 * FORM save_data of UA1 (next status 10) and AE1 (next status 12): record the rate in FTR through
 * NdfFixing (BAPI_FTR_FXT_NDF_FIXING), then the TSF status. A fixing SAP refuses changes nothing; a status
 * write that fails after a successful fixing is reported as such, so FTR and the TSF status can be
 * reconciled.
 */
export async function fixNdf(
  deal: NdfKey & { etag: string },
  rate: number,
  nextStatus: string,
  foRemark?: string,
): Promise<ActionResult> {
  if (!Number.isFinite(rate) || rate <= 0) return { ok: false, message: 'Enter a fixing rate greater than zero.' }
  const url = trmfx(`${entityPath('FxTransaction', { CompanyCode: deal.bukrs, FinancialTransaction: deal.rfha })}/${FIX_NDF_ACTION}`)
  try {
    await apiRequest(url, { method: 'POST', body: { FixingRate: fixingRateValue(rate) } })
  } catch (error) {
    return { ok: false, message: `SAP did not record the fixing of transaction ${deal.rfha}: ${sapMessage(error)}${fixingHint(error)}` }
  }
  const changes: TsfChanges = { TxnStatus: nextStatus }
  if (foRemark !== undefined) changes.NdfFoRem = foRemark.trim().slice(0, FO_REMARK_MAX)
  try {
    await updateTsfAppend(deal, changes)
  } catch (error) {
    return {
      ok: false,
      message: `The fixing of transaction ${deal.rfha} was recorded in SAP, but its TSF status could not be set to ${nextStatus}: ${sapMessage(error)}`,
    }
  }
  return { ok: true, message: `Fixing rate ${fixingRateValue(rate).toFixed(4)} recorded for transaction ${deal.rfha} (status ${nextStatus}).` }
}

/* ---------------- bank settlement posting (FX NDF Settlement, ZSGTSFR028) ---------------- */

/**
 * The posting run TBB1 / RFTBBB00 for one deal, as proposed in docs/abap/ZFS_SD_TRMFX-NdfSettlement.md:
 * parameters KeyDate (p_dzterm) and TestRun (p_test). Not in the service until the SAP team adds it.
 */
export const POST_SETTLEMENT_ACTION_NAME = 'PostSettlement'
const POST_SETTLEMENT_ACTION = `com.sap.gateway.srvd_a2x.zfs_sd_trmfx.v0001.${POST_SETTLEMENT_ACTION_NAME}`

/** "Bank Settlement Completed" in ZSGTSFTR_TXNSTAT: what the report sets once the flows are posted. */
export const TXN_BANK_SETTLED = '50'

export type PostingOutcome = ActionResult & { fiDoc: string }

/**
 * SUBMIT RFTBBB00 … p_dzterm = key date, p_test = TestRun, for one deal. Returns the deal's FI document
 * as the service reports it after the run ('' in a test run, or while AccountingDocument is not served).
 */
export async function postSettlement(deal: NdfKey, keyDateIso: string, testRun: boolean): Promise<PostingOutcome> {
  const url = trmfx(`${entityPath('FxTransaction', { CompanyCode: deal.bukrs, FinancialTransaction: deal.rfha })}/${POST_SETTLEMENT_ACTION}`)
  try {
    const res = await apiRequest<FxTransaction>(url, { method: 'POST', body: { KeyDate: keyDateIso, TestRun: testRun } })
    const fiDoc = res.data?.AccountingDocument ?? ''
    return {
      ok: true,
      fiDoc,
      message: testRun
        ? `Test run for transaction ${deal.rfha}: SAP found nothing to refuse.`
        : `Transaction ${deal.rfha} posted${fiDoc ? ` (FI document ${fiDoc})` : ''}.`,
    }
  } catch (error) {
    return { ok: false, fiDoc: '', message: `${testRun ? 'Test run' : 'Posting'} of transaction ${deal.rfha} refused by SAP: ${sapMessage(error)}` }
  }
}

/** BAPI_FTR_FXT_SETTLE through FxTransaction's bound Settle action. SAP refuses a deal it cannot settle. */
export async function settleTransaction(deal: NdfKey): Promise<void> {
  const url = trmfx(`${entityPath('FxTransaction', { CompanyCode: deal.bukrs, FinancialTransaction: deal.rfha })}/${SETTLE_ACTION}`)
  await apiRequest(url, { method: 'POST', body: {} })
}
