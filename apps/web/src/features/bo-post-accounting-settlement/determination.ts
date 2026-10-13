/**
 * Debit / credit determination of a trade invoice leg: what BO's posting pop-up (ZSGTSF_RDEAL_TRD_POST, screen 9002,
 * MODULE status_9002) works out when it opens, and what Update (SAVE_BANK_DATA + SAVE_POSTING_DATA) stores in
 * ZSGTSFTR_TRD_POS. Nothing here is a guess: every value comes from the leg's own row, its ZSGTSFTR_TRD_ACC posting type, the
 * company master (ZSGTSFTR_COMP) or SAP master data, and a value that cannot be found is reported, never filled in.
 *
 * ZSGTSFTR_TRD_ACC fixes the two lines: ZDEBIT / ZCREDIT the posting keys, ZDR_ENT / ZCR_ENT the entity (01 seller, 02 buyer) and
 * ZDR_ACC / ZCR_ACC the account category, which says how the account is found:
 *
 *   01 Bank           G/L of the house bank account (T012K, through service "housebank") of the leg's bank
 *   02 BP-Vendor      the vendor of the entity (ZSGTSFTR_COMP ZVENDOR); its reconciliation account (LFB1-AKONT) for the leg's company
 *   03 BP-Customer    the customer of the entity (ZCUSTOMER); its reconciliation account (KNB1-AKONT)
 *   04 Bank Clearing  the G/L of account symbol FXEXT10 in chart OL10 for the settlement currency (TRACC_ACCSYMBREP)
 *   05 Bank BP        the vendor of the bank partner (ZSGTRMTR_BPEXT by house bank; ZHBKID_OGA for company SG03), its LFB1-AKONT
 *   06                posted from stored values only: the ABAP does not determine it
 *
 * Fields of ZSGTSFTR_TRD_POS: ZDR_PK / ZCR_PK the posting key, ZDR_ACC / ZCR_ACC the category, ZDR_ACCNT / ZCR_ACCNT only the
 * category's TEXT ('Bank', 'BP-Vendor', ...: a label, not an account), ZDR_CV / ZCR_CV the vendor or customer number,
 * ZDR_GL / ZCR_GL the G/L (or reconciliation) account.
 *
 * Differences from the ABAP, on purpose: the credit line's bank G/L is looked up in the company of the buying entity (the ABAP's
 * LEFT OUTER JOIN there reads any company's account of that bank id), and a line the ABAP would post incomplete is reported as an issue.
 */
import { apiFetch, odataString, service } from '@slc/api-client'
import { loadHouseBankAccounts } from '../../shared/fx/house-bank.ts'
import { txt } from '../../shared/fx/masters.ts'
import { fxList, type FxRow } from '../../shared/fx/mw.ts'

export type Row = Record<string, unknown>

export const CATEGORY = { bank: '01', vendor: '02', customer: '03', clearing: '04', bankBp: '05', other: '06' } as const
export const CATEGORY_TEXT: Readonly<Record<string, string>> = { '01': 'Bank', '02': 'BP-Vendor', '03': 'BP-Customer', '04': 'Bank Clearing', '05': 'Bank BP' }

/** TEXT-013's currency-specific G/L is read from this chart / account symbol (hard-coded in the ABAP: gc_ol10, gc_fxext10). */
export const CHART_OF_ACCOUNTS = 'OL10'
export const CLEARING_SYMBOL = 'FXEXT10'

export type PostLine = {
  /** ZDR_PK / ZCR_PK */
  postingKey: string
  /** ZDR_ACC / ZCR_ACC: 01..06 */
  category: string
  /** ZDR_ACCNT / ZCR_ACCNT: the category's text. */
  label: string
  /** ZDR_CV / ZCR_CV: vendor or customer number. */
  partner: string
  /** ZDR_GL / ZCR_GL */
  glAccount: string
  /** ZDR_PRCTR / ZCR_PRCTR */
  profitCenter: string
  /** ZDR_RBUSA / ZCR_RBUSA */
  businessArea: string
}

export type Determined = { debit: PostLine; credit: PostLine; issues: string[] }

/** What determination reads from SAP. Each call answers '' (or an empty list) when SAP holds nothing; it throws only when SAP cannot be asked. */
export type DeterminationPorts = {
  /** ZSGTSFTR_COMP, every company. */
  companies: () => Promise<FxRow[]>
  /** ZORIGIN of the Deal ID's Master Contract (gv_origin). */
  origin: (dealId: string) => Promise<string>
  /** T012K-HKONT of a company's house bank account. */
  houseBankGl: (companyCode: string, houseBank: string, accountId: string) => Promise<string>
  /** LFB1 / KNB1 AKONT of a vendor / customer in a company code. */
  reconciliation: (kind: 'vendor' | 'customer', companyCode: string, partner: string) => Promise<string>
  /** TRACC_ACCSYMBREP: the G/L of FXEXT10 in OL10 for a currency. */
  clearingGl: (currency: string) => Promise<string>
  /** ZSGTRMTR_BPEXT, every bank partner. */
  bankPartners: () => Promise<FxRow[]>
  /** The vendor linked to a business partner (CVI_VEND_LINK). */
  vendorOf: (businessPartner: string) => Promise<string>
}

const t = (r: Row, k: string): string => String(r[k] ?? '').trim()

const emptyLine = (): PostLine => ({ postingKey: '', category: '', label: '', partner: '', glAccount: '', profitCenter: '', businessArea: '' })

/** The company master row of an entity (ZCOM_ID) or of a company code (ZBUKRS). */
const compOfEntity = (comps: readonly FxRow[], entity: string): FxRow | undefined => (entity ? comps.find((c) => txt(c, 'ZCOM_ID') === entity) : undefined)
const compOfCode = (comps: readonly FxRow[], code: string): FxRow | undefined => (code ? comps.find((c) => txt(c, 'ZBUKRS') === code) : undefined)

/**
 * The customer / vendor of the leg (gt_inv-cus_ven, PBO): for posting types 01 / 03 / 05 the buying entity's, by the credit
 * line's category; for 02 / 04 / 06 the selling entity's, by the debit line's category. One value per leg, used by whichever line is 02 / 03.
 */
export function partnerOf(row: Row, acc: Row, comps: readonly FxRow[]): string {
  const fiType = t(row, 'ZFI_TYPE')
  const buying = ['01', '03', '05'].includes(fiType)
  const selling = ['02', '04', '06'].includes(fiType)
  if (!buying && !selling) return ''
  const comp = compOfEntity(comps, t(row, buying ? 'ZBUY' : 'ZSELL'))
  if (!comp) return ''
  const category = t(acc, buying ? 'ZCR_ACC' : 'ZDR_ACC')
  return category === CATEGORY.vendor ? txt(comp, 'ZVENDOR') : category === CATEGORY.customer ? txt(comp, 'ZCUSTOMER') : ''
}

/** The two lines of a leg, with what could not be determined in `issues`. */
export async function determinePosting(row: Row, acc: Row, ctx: { dealId: string }, ports: DeterminationPorts): Promise<Determined> {
  const issues: string[] = []
  const name = `${t(row, 'ZT_TYPE')} (seq ${t(row, 'ZSEQ')})`
  if (!t(row, 'ZFI_TYPE') || !Object.keys(acc).length) {
    issues.push(`${name} has no posting type in ZSGTSFTR_TRD_ACC (ZFI_TYPE ${t(row, 'ZFI_TYPE') || 'blank'}).`)
    return { debit: emptyLine(), credit: emptyLine(), issues }
  }
  const [comps, origin] = await Promise.all([ports.companies(), ports.origin(ctx.dealId)])
  const company = t(row, 'ZBUKRS')
  const partner = partnerOf(row, acc, comps)
  const needsBankPartners = t(acc, 'ZDR_ACC') === CATEGORY.bankBp || t(acc, 'ZCR_ACC') === CATEGORY.bankBp
  const bankPartners = needsBankPartners ? await ports.bankPartners() : []

  // Debit takes the Receiver / Payee's bank (the seller's company), credit the Sender / Payer's (the buyer's).
  const sides = [
    { side: 'debit', key: 'ZDEBIT', cat: 'ZDR_ACC', entity: t(row, 'ZSELL'), houseBank: t(row, 'ZREC_HBKID'), accountId: t(row, 'ZREC_HKTID'), text: 'Debit' },
    { side: 'credit', key: 'ZCREDIT', cat: 'ZCR_ACC', entity: t(row, 'ZBUY'), houseBank: t(row, 'ZHBKID'), accountId: t(row, 'ZHKTID'), text: 'Credit' },
  ] as const

  const lines: PostLine[] = []
  for (const s of sides) {
    const line: PostLine = { ...emptyLine(), postingKey: t(acc, s.key), category: t(acc, s.cat), label: CATEGORY_TEXT[t(acc, s.cat)] ?? '' }
    const compOfLine = compOfCode(comps, company)
    const setBankDimensions = () => {
      line.businessArea = compOfLine ? txt(compOfLine, 'ZRBUSA_B') : ''
      line.profitCenter = compOfLine ? txt(compOfLine, 'ZPRCTR_B') : ''
      if (company === 'AE13') {
        const originComp = compOfEntity(comps, origin)
        if (originComp) line.businessArea = txt(originComp, 'ZRBUSA')
      }
    }
    switch (line.category) {
      case CATEGORY.bank: {
        const code = txt(compOfEntity(comps, s.entity) ?? {}, 'ZBUKRS')
        if (!s.houseBank || !s.accountId) {
          issues.push(`${name}: the ${s.text.toLowerCase()} line is a bank line and needs a house bank and account ID (${s.side === 'debit' ? 'Receiver / Payee' : 'Sender / Payer'}). Choose them on MO: Execute Settlement for Deal ID.`)
        } else if (!code) {
          issues.push(`${name}: entity ${s.entity || '(blank)'} is not in ZSGTSFTR_COMP, so the ${s.text.toLowerCase()} bank account has no company code.`)
        } else {
          line.glAccount = await ports.houseBankGl(code, s.houseBank, s.accountId)
          if (!line.glAccount) issues.push(`${name}: house bank ${s.houseBank} / ${s.accountId} of company ${code} has no G/L account (T012K).`)
        }
        setBankDimensions()
        break
      }
      case CATEGORY.vendor:
      case CATEGORY.customer: {
        const kind = line.category === CATEGORY.vendor ? 'vendor' : 'customer'
        line.partner = partner
        if (!partner) {
          issues.push(`${name}: no ${kind} is set in ZSGTSFTR_COMP for entity ${s.entity || '(blank)'} (${kind === 'vendor' ? 'ZVENDOR' : 'ZCUSTOMER'}).`)
        } else {
          // The reconciliation account is shown, not posted: SAP posts to the vendor / customer. Missing it means the partner is not extended to this company.
          line.glAccount = await ports.reconciliation(kind, company, partner)
          if (!line.glAccount) issues.push(`${name}: ${kind} ${partner} has no reconciliation account in company ${company} (LFB1 / KNB1): it is not extended to that company code.`)
        }
        break
      }
      case CATEGORY.clearing: {
        line.glAccount = await ports.clearingGl(t(row, 'ZSET_CURR'))
        if (!line.glAccount) issues.push(`${name}: no clearing G/L for currency ${t(row, 'ZSET_CURR') || '(blank)'} (${CLEARING_SYMBOL} in chart ${CHART_OF_ACCOUNTS}, TRACC_ACCSYMBREP).`)
        setBankDimensions()
        break
      }
      case CATEGORY.bankBp: {
        setBankDimensions()
        if (!s.houseBank) {
          issues.push(`${name}: the ${s.text.toLowerCase()} line is posted to the bank's business partner and needs a house bank (${s.side === 'debit' ? 'Receiver / Payee' : 'Sender / Payer'}).`)
          break
        }
        const column = company === 'SG03' ? 'ZHBKID_OGA' : 'HBKID'
        const bp = bankPartners.find((b) => txt(b, column) === s.houseBank)
        const vendor = bp ? await ports.vendorOf(txt(bp, 'BP')) : ''
        if (!bp || !vendor) {
          issues.push(`${name}: house bank ${s.houseBank} has no bank partner with a vendor for company ${company} (ZSGTRMTR_BPEXT ${column}).`)
          break
        }
        line.partner = vendor
        line.glAccount = await ports.reconciliation('vendor', company, vendor)
        if (!line.glAccount) issues.push(`${name}: bank vendor ${vendor} has no reconciliation account in company ${company} (LFB1).`)
        break
      }
      default:
        issues.push(`${name}: the ${s.text.toLowerCase()} line has account category '${line.category || 'blank'}', which is not determined automatically.`)
    }
    if (!line.postingKey) issues.push(`${name}: the posting type has no ${s.text.toLowerCase()} posting key.`)
    lines.push(line)
  }
  return { debit: lines[0]!, credit: lines[1]!, issues }
}

/* ------------------------------------------------------------------ the TRD_POS fields */

/** SAVE_POSTING_DATA: the six posting fields per side plus profit center / business area, as ZSGTSFTR_TRD_POS stores them. */
export function positionFields(d: Determined): Record<string, string> {
  const side = (p: 'DR' | 'CR', l: PostLine): Record<string, string> => ({
    [`Z${p}_PK`]: l.postingKey,
    [`Z${p}_ACCNT`]: l.label,
    [`Z${p}_ACC`]: l.category,
    [`Z${p}_CV`]: l.partner,
    [`Z${p}_PRCTR`]: l.profitCenter,
    [`Z${p}_RBUSA`]: l.businessArea,
    [`Z${p}_GL`]: l.glAccount,
  })
  return { ...side('DR', d.debit), ...side('CR', d.credit) }
}

/* ------------------------------------------------------------------ live ports */

type V2<T> = { d?: { results?: T[] } }
const partnerApi = service('businesspartner')

const firstOf = async <T extends Row>(path: string): Promise<T | undefined> => (await apiFetch<V2<T>>(path))?.d?.results?.[0]

export const livePorts: DeterminationPorts = {
  companies: () => fxList('comp'),
  origin: async (dealId) => {
    const deal = (await fxList('tsfDealId', { ZDEAL_ID: dealId }))[0]
    const mc = deal ? txt(deal, 'ZMC_REF') : ''
    return mc ? txt((await fxList('masterContract', { ZMC_REF_NO: mc }))[0] ?? {}, 'ZORIGIN') : ''
  },
  houseBankGl: async (companyCode, houseBank, accountId) => {
    const accounts = await loadHouseBankAccounts(companyCode)
    return accounts.find((a) => a.houseBank === houseBank && a.accountId === accountId)?.glAccount ?? ''
  },
  reconciliation: async (kind, companyCode, partner) => {
    const [set, key] = kind === 'vendor' ? (['A_SupplierCompany', 'Supplier'] as const) : (['A_CustomerCompany', 'Customer'] as const)
    const filter = `${key} eq ${odataString(partner)} and CompanyCode eq ${odataString(companyCode)}`
    const row = await firstOf<Row>(`${partnerApi(set)}?$filter=${encodeURIComponent(filter)}&$select=${key},CompanyCode,ReconciliationAccount`)
    return row ? t(row, 'ReconciliationAccount') : ''
  },
  // TRACC_ACCSYMBREP has no service yet: a clearing leg reports it rather than posting to a guessed account.
  clearingGl: async () => '',
  bankPartners: () => fxList('trmBpext'),
  vendorOf: async (businessPartner) => {
    const row = await firstOf<Row>(`${partnerApi('A_BusinessPartner')}?$filter=${encodeURIComponent(`BusinessPartner eq ${odataString(businessPartner)}`)}&$select=BusinessPartner,Supplier`)
    return row ? t(row, 'Supplier') : ''
  },
}
