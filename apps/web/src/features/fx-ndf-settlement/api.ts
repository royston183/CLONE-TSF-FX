/*
 * SAP data for ZSGTSFR028 "FX NDF Settlement" (ZSGTSF_RBANKSETTLE_NDF), read as the ABAP reads it.
 * Nothing falls back to sample data.
 *
 *   Company Code (S_BUKRS)  F4 of VTBFHA-BUKRS = T001 (API_COMPANYCODE_SRV / A_CompanyCode), "code - name"
 *   Value Date (S_DATE)     typed / calendar, no value help
 *   Transaction No (S_RFHA) the RFHAs of the deals GET_DATA lists for the current company / dates
 *   Worklist                FORM get_data: sgsart = '12D', saktiv <> 3, delfz IN s_date, and of the TSF
 *                           statuses only 13 ("MO: Confirm NDF Fixing") survives the report's DELETEs.
 *                           Read as the TSF append (TrmFxApp OData) in status 13 joined to the FTR deal
 *                           (FxTransaction OData) — shared/fx/ndf.ts; logic.getData applies the WHERE.
 *   NDF_RATE / ZCASH_AMT /  FxTransaction NdfFixingRate / CashSettlementAmount / CashSettlementCurrency /
 *   CASH_CURR / FI_DOC      AccountingDocument — proposed in docs/abap/ZFS_SD_TRMFX-NdfSettlement.md; used as
 *                           soon as the service declares them, blank until then.
 *   Letter address          ZSGTSFCL_GET_BANK_SETTLE->GET_ADDR: the partner's address of usage Z002
 *                           (BUT021_FS adr_kind 'Z002' -> ADRC) — API_BUSINESS_PARTNER A_BuPaAddressUsage /
 *                           A_BusinessPartnerAddress. No Z002 address: the block stays empty, as in the ABAP.
 *   Letter account lines    ->GET_DATA: VTBSTC1 standing instructions FX / FX1 / NFX + T012 / T012K / BNKA /
 *                           TBCHAIN21 — no service serves VTBSTC1 or the house banks (API_HOUSEBANKACCOUNT_SRV
 *                           answers 403 for FS_DEV), so these lines say WAITING FOR API.
 *   PDF form name           ZSGTSFTR_BS_PDF WHERE zlet_code = 'L003' (middleware "bsPdf")
 *   TEST / TBB1 / Execute   SUBMIT RFTBBB00 (+ UPDATE vtbfha txn_status = '50') -> FxTransaction PostSettlement
 *                           (proposed) and TrmFxApp TxnStatus 50; disabled until the service declares it.
 */
import { apiFetch, service } from '@slc/api-client'
import { txt } from '../../shared/fx/masters.ts'
import { fxList, isAbort, type FxRow } from '../../shared/fx/mw.ts'
import { loadNdfQueue, type NdfRecord } from '../../shared/fx/ndf.ts'
import { GET_DATA, LETTER_CODE } from './data.ts'
import { isoToDmy } from './format.ts'
import type { BankAddress, CompanyOption, Criteria, Deal, Loaded } from './types.ts'

const companyApi = service('companycode')
const partnerApi = service('businesspartner')

/** The middleware resource behind ZSGTSFTR_BS_PDF. */
export const BS_PDF = 'bsPdf'

/** GET_ADDR: SELECT SINGLE addrnumber FROM but021_fs WHERE partner = … AND adr_kind = 'Z002'. */
export const SETTLEMENT_ADDRESS_USAGE = 'Z002'

const sortBy = <T,>(key: (x: T) => string) => (a: T, b: T) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)

/* ---------------- pure mappings (tested) ---------------- */

/** T001 by code (leading zeros kept). */
export function companyOptions(rows: readonly { CompanyCode?: string; CompanyCodeName?: string }[]): CompanyOption[] {
  return rows
    .filter((r) => r.CompanyCode)
    .map((r) => ({ code: String(r.CompanyCode), name: String(r.CompanyCodeName ?? '').trim() }))
    .sort(sortBy((o) => o.code))
}

/** One queued deal as a GET_DATA row. */
export function dealFromRecord(r: NdfRecord): Deal {
  return {
    bukrs: r.bukrs,
    rfha: r.rfha,
    refnr: '',
    saktiv: r.activeStatus,
    sgsart: r.productType,
    rfhazul: r.activityCategory,
    butxt: r.companyName,
    ltx: r.productType,
    sfhaart: r.transactionType,
    xtext: r.txnTypeDesc,
    kontrh: r.partner,
    bp_name: r.partnerName,
    gsppart: '',
    blotter_date: '',
    prctr: '',
    pc_name: '',
    rbusa: r.businessArea.split(' - ')[0] ?? '',
    ba_name: r.businessArea.split(' - ').slice(1).join(' - '),
    rportb: '',
    xportb: '',
    refer: r.internalRef,
    nordext: r.externalRef,
    dblfz: r.contractDate,
    delfz: r.valueDate,
    zcom_id: r.tsfEntity,
    rdealer: r.traderCode,
    txn_status: r.txnStatus,
    ztsf_deal_id: r.dealId,
    ztsf_mc_ref_no: r.mcReference,
    ndf_date: r.fixingDate,
    ndf_ref: r.ndfRef,
    ndf_rate: r.fixingRate ?? 0,
    fo_remark: '',
    mo_remark: '',
    ndf_fo_rem: r.foRemark,
    ndf_mo_rem: r.moRemark,
    bs: r.side === 'Buy' ? '1' : '2',
    bs_1: r.side,
    bs_2: r.side === 'Buy' ? 'Sell' : 'Buy',
    curr1: r.c1,
    amt1: r.amt1,
    curr2: r.c2,
    amt2: r.amt2,
    ospot: r.spot,
    oswap: r.swap,
    otot_rate: r.fwd,
    spot: r.spot,
    swap: r.swap,
    tot_rate: r.fwd,
    t_rate: r.fwd,
    cpair: `${r.c1}/${r.c2}`,
    zwaers: '',
    cash_curr: r.cashCurrency,
    zcash_amt: r.cashAmount ?? 0,
    cruser: '',
    dcrdat: '',
    upuser: '',
    dupdat: '',
    fi_doc: r.fiDoc,
    fi_gjahr: r.fiYear,
    settlement_known: r.cashAmount !== null,
    fi_known: r.fiKnown,
    etag: r.etag,
  }
}

/** SELECT SINGLE zform_name FROM zsgtsftr_bs_pdf WHERE zlet_code = 'L003' (first row wins). */
export function letterFormName(rows: readonly FxRow[]): string {
  return txt(rows.find((r) => txt(r, 'ZLET_CODE') === LETTER_CODE) ?? {}, 'ZFORM_NAME')
}

/** The API_BUSINESS_PARTNER address fields GET_ADDR reads from ADRC. */
export type PartnerAddress = {
  FullName?: string
  StreetName?: string
  StreetPrefixName?: string
  CityName?: string
  PostalCode?: string
  CareOfName?: string
  to_FaxNumber?: { results?: { FaxNumber?: string }[] }
}

/**
 * GET_ADDR on one ADRC address: zbank = name1 name2, zaddr1 street, zaddr2 str_suppl1, zaddr3
 * "CITY - postcode" (mc_city1 is the upper-case city), zattn "Attn : c/o , Fax : number",
 * zvdate "Value Date - <date>", zdate today.
 */
export function bankAddress(a: PartnerAddress | null, valueDateIso: string, todayIso: string): BankAddress {
  const city = String(a?.CityName ?? '').trim().toUpperCase()
  const post = String(a?.PostalCode ?? '').trim()
  const co = String(a?.CareOfName ?? '').trim()
  const fax = String(a?.to_FaxNumber?.results?.[0]?.FaxNumber ?? '').trim()
  return {
    zdate: isoToDmy(todayIso),
    zbank: String(a?.FullName ?? '').trim(),
    zaddr1: String(a?.StreetName ?? '').trim(),
    zaddr2: String(a?.StreetPrefixName ?? '').trim(),
    zaddr3: city && post ? `${city} - ${post}` : city || post,
    zattn: co && fax ? `Attn : ${co} , Fax : ${fax}` : co ? `Attn : ${co}` : fax ? `Fax : ${fax}` : '',
    zvdate: `Value Date - ${isoToDmy(valueDateIso)}`,
  }
}

/* ---------------- reads ---------------- */

const failure = <T,>(what: string, error: unknown): Loaded<T> => {
  if (isAbort(error)) throw error
  console.warn(`[ndf-settlement] ${what} unavailable`, error)
  return { state: 'error', reason: `${what} could not be read from SAP.` }
}

export async function loadCompanies(signal?: AbortSignal): Promise<Loaded<CompanyOption[]>> {
  try {
    const params = new URLSearchParams({ $select: 'CompanyCode,CompanyCodeName', $top: '5000', $format: 'json' })
    const v2 = await apiFetch<{ d?: { results?: { CompanyCode?: string; CompanyCodeName?: string }[] } }>(
      `${companyApi('A_CompanyCode')}?${params.toString()}`,
      signal ? { signal } : undefined,
    )
    return { state: 'ok', value: companyOptions(v2?.d?.results ?? []) }
  } catch (error) {
    return failure('Company codes (T001)', error)
  }
}

/** GET_DATA's database part: the status-13 NDF deals of the selected company codes (dates in logic.getData). */
export async function loadDeals(c: Pick<Criteria, 'bukrs' | 'dateFrom' | 'dateTo'>, signal?: AbortSignal): Promise<Loaded<Deal[]>> {
  try {
    if (!c.bukrs.length || !c.dateFrom) return { state: 'ok', value: [] }
    const records = await loadNdfQueue([GET_DATA.ndfStatus], signal)
    return { state: 'ok', value: records.filter((r) => c.bukrs.includes(r.bukrs)).map(dealFromRecord) }
  } catch (error) {
    return failure('NDF deals (TrmFxApp / FxTransaction)', error)
  }
}

/** The letter's address block and, when it is empty, why. */
export type LetterAddress = { addr: BankAddress; note: string }

/** GET_ADDR: the partner's Z002 address (no other address is used, as in the ABAP). */
export async function loadBankAddress(kontrh: string, valueDateIso: string, todayIso: string): Promise<LetterAddress> {
  const bp = kontrh.replace(/^0+/, '')
  try {
    const usage = await apiFetch<{ d?: { results?: { AddressID?: string }[] } }>(
      `${partnerApi('A_BuPaAddressUsage')}?${new URLSearchParams({
        $filter: `BusinessPartner eq '${bp}' and AddressUsage eq '${SETTLEMENT_ADDRESS_USAGE}'`,
        $select: 'AddressID',
        $format: 'json',
      }).toString()}`,
    )
    const addressId = usage?.d?.results?.[0]?.AddressID
    if (!addressId) {
      return {
        addr: bankAddress(null, valueDateIso, todayIso),
        note: `No settlement address (usage ${SETTLEMENT_ADDRESS_USAGE}) is maintained for business partner ${bp}; the address block is left empty, as in SAP.`,
      }
    }
    const one = await apiFetch<{ d?: PartnerAddress }>(
      `${partnerApi(`A_BusinessPartnerAddress(BusinessPartner='${bp}',AddressID='${addressId}')`)}?${new URLSearchParams({
        $expand: 'to_FaxNumber',
        $format: 'json',
      }).toString()}`,
    )
    return { addr: bankAddress(one?.d ?? null, valueDateIso, todayIso), note: '' }
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[ndf-settlement] partner address unavailable', error)
    return { addr: bankAddress(null, valueDateIso, todayIso), note: `The address of business partner ${bp} could not be read from SAP.` }
  }
}

/** The Adobe form name FORM PDF would call ('' when none or unreadable). */
export async function loadLetterFormName(signal?: AbortSignal): Promise<string> {
  try {
    return letterFormName(await fxList(BS_PDF, { ZLET_CODE: LETTER_CODE }, { signal }))
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[ndf-settlement] ZSGTSFTR_BS_PDF unavailable', error)
    return ''
  }
}
