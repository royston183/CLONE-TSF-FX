/**
 * Seed data, verbatim from the legacy page's reference-data and "Dummy dataset" blocks. Every
 * list here stands in for an SAP value help or the ALV list of Master Contracts awaiting FO
 * correction.
 *
 * They are now the fallback: api.ts replaces the master lists in place with MySQL's rows once
 * the middleware answers (a master still empty in MySQL keeps these values), and the seed
 * rows are only shown when the middleware cannot be reached. REGION_CATALOG has no migrated
 * master and always stays as it is.
 */
import { compactMillions } from './format.ts'
import type { CodeLabel, ColumnDef, ErrorRow, FxModel, OriginEntity, PaymentTerm, RawRow } from './types.ts'

export const ORIGIN_ENTITIES: OriginEntity[] = [
  { code: 'OSIPL', companyCode: 'IN11', name: 'Olam Agri India Pvt Ltd', currency: 'INR' },
  { code: 'OTL', companyCode: 'TH10', name: 'Olam (Thailand) Ltd', currency: 'THB' },
  { code: 'OVL', companyCode: 'VN10', name: 'Olam Vietnam Limited', currency: 'VND' },
]

export const FX_MODELS: FxModel[] = [
  { id: 'M032', code: 'M032', desc: 'INR Long Forward', entity: 'OGA-DMCC-OSIPL', currency: 'USD-USD-INR' },
  { id: 'M033', code: 'M033', desc: 'INR-INR-INR Forward', entity: 'OGA-OSIPL-DMCC', currency: 'INR-INR-INR' },
  { id: 'M034a', code: 'M034', desc: 'INR - INR Staggered Call & Put Option', entity: 'OGA-OSIPL-DMCC', currency: 'INR-INR-INR' },
  { id: 'M034b', code: 'M034', desc: 'INR - INR Staggered Call & Put Option', entity: 'OGA-OSIPL-DMCC', currency: 'INR-INR-USD' },
  { id: 'M035', code: 'M035', desc: 'INR-INR-Put & Call Option', entity: 'OGA-OSIPL-DMCC', currency: 'INR-INR-USD' },
  { id: 'M036', code: 'M036', desc: 'USD-INR-INR-Put & Call Option', entity: 'OGA-DMCC-OSIPL', currency: 'USD-INR-INR' },
  { id: 'M037', code: 'M037', desc: 'INR Short Forward', entity: 'OGA-OSIPL-DMCC', currency: 'INR-INR-INR' },
  { id: 'M041', code: 'M041', desc: 'INR - INR Staggered Call & Put Option', entity: 'OGA-OSIPL-DMCC', currency: 'INR-INR-INR' },
]

export const PAYMENT_TERMS: PaymentTerm[] = [
  { code: 'P01', label: '270 days from bill of lading date' },
  { code: 'P02', label: '270 days from shipment date against the copy docs' },
  { code: 'P03', label: '270 days from contract date' },
  { code: 'P04', label: '360 days from bill of lading date' },
  { code: 'P05', label: 'On or Before fixed date' },
  { code: 'P06', label: 'On or Before due date' },
]

/** Port / region groups — the "Port of Shipment" value help of the source ABAP screen. */
export const PORT_REGION_GROUPS: CodeLabel[] = [
  { code: 'PG01', label: 'Africa/Europe' },
  { code: 'PG02', label: 'Belgium/Netherlands' },
  { code: 'PG03', label: 'Vietnam' },
  { code: 'PG04', label: 'Europe' },
  { code: 'PG05', label: 'Visakhapatnam, India' },
  { code: 'PG06', label: 'Argentina' },
  { code: 'PG07', label: 'Indonesia' },
  { code: 'PG08', label: 'Thailand/Indonesia' },
  { code: 'PG09', label: 'Brazil' },
  { code: 'PG10', label: 'China' },
  { code: 'PG11', label: 'Thailand/China' },
  { code: 'PG12', label: 'Ukraine' },
  { code: 'PG13', label: 'Thailand' },
  { code: 'PG14', label: 'Africa' },
]

/**
 * Business region of the deal — for the toolbar "Region" filter, distinct from the Port of
 * Shipment/Destination value help in the Error Correction modal.
 */
export const REGION_CATALOG: CodeLabel[] = [
  { code: 'R01', label: 'South-East Asia' },
  { code: 'R02', label: 'China' },
  { code: 'R03', label: 'United States of America' },
  { code: 'R04', label: 'Middle East & Africa' },
  { code: 'R05', label: 'Europe' },
  { code: 'R06', label: 'United Kingdom' },
  { code: 'R07', label: 'Latin America' },
  { code: 'R08', label: 'Brazil' },
  { code: 'R09', label: 'Canada' },
]

/**
 * Entity ID code — ASSUMPTION carried over from the original: the source screenshots tie it
 * to the resolved Entity String rather than to Origin Entity, so it is derived from the FX
 * Model's entity string (only two distinct entity strings exist across the pre-set models).
 */
export const ENTITY_ID_BY_STRING: Record<string, string> = { 'OGA-OSIPL-DMCC': 'E026', 'OGA-DMCC-OSIPL': 'E015' }
/** Currency I code — derived from the resolved Currency String, as in the source screenshots. */
export const CURRENCY_CODE_BY_STRING: Record<string, string> = {
  'INR-INR-INR': 'C001',
  'USD-USD-INR': 'C002',
  'INR-INR-USD': 'C003',
  'USD-INR-INR': 'C012',
}

// The seed rows are built from the dummy masters as they were, not from whatever the lists
// hold after MySQL's rows are swapped in: M034a or P01 need not exist in MySQL.
const SEED_FX_MODELS = [...FX_MODELS]
const SEED_PAYMENT_TERMS = [...PAYMENT_TERMS]

export const findFxModel = (id: string) => FX_MODELS.find((m) => m.id === id)
export const findEntity = (code: string) => ORIGIN_ENTITIES.find((e) => e.code === code)
export const findPaymentTerm = (code: string) => PAYMENT_TERMS.find((p) => p.code === code)
export const findRegion = (code: string) => PORT_REGION_GROUPS.find((r) => r.code === code)
export const findBizRegion = (code: string) => REGION_CATALOG.find((r) => r.code === code)

/**
 * Master Contracts awaiting FO correction. Reference numbers, dates, amounts and exchange
 * rates are taken from the source "FO: MC Error/Amendment" ALV screenshot; everything else is
 * derived by buildRow so each row stays internally consistent.
 */
export const RAW_ROWS: RawRow[] = [
  { mcRef: 2000000348, fxId: 'M035', mcAmt: 3459, exRate: 4, mcDate: '02-09-2026', shipStart: '27-09-2026', shipEnd: '27-09-2026', origin: 'OSIPL', region: 'R01' },
  { mcRef: 2000000370, fxId: 'M032', mcAmt: 3257, exRate: 7, mcDate: '02-09-2026', shipStart: '27-09-2026', shipEnd: '27-09-2026', origin: 'OSIPL', region: 'R05' },
  { mcRef: 2000000371, fxId: 'M034a', mcAmt: 3026, exRate: 9, mcDate: '02-09-2026', shipStart: '27-09-2026', shipEnd: '27-09-2026', origin: 'OSIPL', region: 'R01' },
  { mcRef: 2000000372, fxId: 'M041', mcAmt: 3670, exRate: 7, mcDate: '02-09-2026', shipStart: '27-09-2026', shipEnd: '27-09-2026', origin: 'OSIPL', specificCommodity: 'C001 WHEAT, SOYABEAN, BARLEY', region: 'R04' },
  { mcRef: 2000000394, fxId: 'M034b', mcAmt: 2390, exRate: 9, mcDate: '03-09-2026', shipStart: '28-09-2026', shipEnd: '28-09-2026', origin: 'OSIPL', region: 'R02' },
  { mcRef: 2000000395, fxId: 'M036', mcAmt: 2197, exRate: 5, mcDate: '03-09-2026', shipStart: '28-09-2026', shipEnd: '28-09-2026', origin: 'OSIPL', shipRegion: 'PG14', destRegion: 'PG02', region: 'R04' },
  { mcRef: 2000000827, fxId: 'M033', mcAmt: 46215, exRate: 9, mcDate: '29-10-2026', shipStart: '23-11-2026', shipEnd: '23-11-2026', origin: 'OSIPL', region: 'R03' },
  { mcRef: 2000000828, fxId: 'M034a', mcAmt: 16977, exRate: 6, mcDate: '29-10-2026', shipStart: '23-11-2026', shipEnd: '23-11-2026', origin: 'OSIPL', region: 'R06' },
  { mcRef: 2000000829, fxId: 'M034b', mcAmt: 30948, exRate: 8, mcDate: '29-10-2026', shipStart: '23-11-2026', shipEnd: '23-11-2026', origin: 'OSIPL', shipRegion: 'PG07', destRegion: 'PG08', region: 'R01' },
  { mcRef: 2000000830, fxId: 'M035', mcAmt: 40128, exRate: 5, mcDate: '29-10-2026', shipStart: '23-11-2026', shipEnd: '23-11-2026', origin: 'OSIPL', region: 'R07' },
  { mcRef: 2000000831, fxId: 'M036', mcAmt: 27912, exRate: 3, mcDate: '29-10-2026', shipStart: '23-11-2026', shipEnd: '23-11-2026', origin: 'OSIPL', region: 'R05' },
  { mcRef: 2000000952, fxId: 'M032', mcAmt: 18616, exRate: 8, mcDate: '24-11-2026', shipStart: '19-12-2026', shipEnd: '19-12-2026', origin: 'OSIPL', shipRegion: 'PG06', destRegion: 'PG09', region: 'R08' },
  { mcRef: 2000000994, fxId: 'M032', mcAmt: 47746, exRate: 8, mcDate: '26-11-2026', shipStart: '21-12-2026', shipEnd: '21-12-2026', origin: 'OSIPL', region: 'R09' },
]

/** The original's mkErrorRow: derives model, entity, currency and description fields. */
export function buildRow(raw: RawRow): ErrorRow {
  const fx = SEED_FX_MODELS.find((m) => m.id === raw.fxId)
  const fxCode = fx?.code ?? raw.fxId
  const entity = fx?.entity ?? ''
  const currency = fx?.currency ?? ''
  const descTag = raw.specificCommodity ? '' : 'Multi-Commodity'
  return {
    mcRef: raw.mcRef,
    fxId: raw.fxId,
    fxCode,
    modelDesc: fx?.desc ?? '',
    entityId: ENTITY_ID_BY_STRING[entity] ?? 'E0??',
    entityString: entity,
    currencyI: CURRENCY_CODE_BY_STRING[currency] ?? 'C0??',
    currencyS: currency,
    mcBalAmt: raw.mcAmt,
    mcAmt: raw.mcAmt,
    mcAmountOrigin: Math.round(raw.mcAmt * raw.exRate * 100) / 100,
    curr1: 'USD',
    exRate: raw.exRate,
    mcDate: raw.mcDate,
    origin: raw.origin,
    mcDescription: `${raw.origin}_${descTag}_${fxCode}_${compactMillions(raw.mcAmt)}`,
    gtCommodity: 'C001',
    specificCommodity: raw.specificCommodity || null,
    commodityText: raw.specificCommodity ? raw.specificCommodity : 'C001 Multiple Commodity',
    shipStart: raw.shipStart,
    shipEnd: raw.shipEnd,
    paymentTermsCode: 'P01',
    paymentDate: raw.shipEnd,
    ownExplanation: SEED_PAYMENT_TERMS.find((p) => p.code === 'P01')?.label ?? '',
    shipRegionCode: raw.shipRegion || 'PG01',
    destRegionCode: raw.destRegion || 'PG02',
    regionId: raw.region || 'R01',
    utilization: 0,
    moRemarks: 'Reject',
    foRemarks: '',
    mcAmendedDate: '',
    status: 'correction',
  }
}

/** A fresh copy of every seed row — what the page opens with and what Refresh restores. */
export const buildFreshDataset = (): ErrorRow[] => RAW_ROWS.map(buildRow)

/** Every field is always shown (the original removed its layout switcher). */
export const COLUMN_DEFS: ColumnDef[] = [
  { key: 'select', label: '', sort: false },
  { key: 'status', label: 'MC Status', sort: true },
  { key: 'mcRef', label: 'MC Reference', sort: true },
  { key: 'fxCode', label: 'FX Model', sort: true },
  { key: 'mcBalAmt', label: 'MC Bal Amt', sort: true, num: true },
  { key: 'mcDescription', label: 'MC Description', sort: true },
  { key: 'mcDate', label: 'MC Date', sort: true },
  { key: 'origin', label: 'Origin Entity', sort: true },
  { key: 'regionId', label: 'Region', sort: true },
  { key: 'mcAmt', label: 'MC Amt', sort: true, num: true },
  { key: 'curr1', label: 'Curr1', sort: true },
  { key: 'exRate', label: 'Exchange Rate', sort: true, num: true },
  { key: 'shipStart', label: 'Shipment Start', sort: true },
  { key: 'shipEnd', label: 'Shipment End', sort: true },
  { key: 'gtCommodity', label: 'GT Commodity', sort: true },
  { key: 'commodityText', label: 'Comm Desc', sort: false },
  { key: 'entityId', label: 'Entity ID', sort: true },
  { key: 'entityString', label: 'Entity String', sort: true },
  { key: 'currencyI', label: 'Currency I', sort: true },
  { key: 'currencyS', label: 'Currency S', sort: true },
  { key: 'modelDesc', label: 'Model Description', sort: false },
  { key: 'paymentTermsCode', label: 'Payment te', sort: true },
  { key: 'paymentDate', label: 'Payment De', sort: true },
  { key: 'ownExplanation', label: 'Own Explanation', sort: false },
  { key: 'portShipment', label: 'Port of Shipment', sort: false },
  { key: 'portDestination', label: 'Port of Destination', sort: false },
  { key: 'utilization', label: 'Utilizatio', sort: true, num: true },
  { key: 'moRemarks', label: 'MO Remarks', sort: false },
  { key: 'foRemarks', label: 'FO Remarks', sort: false },
]
