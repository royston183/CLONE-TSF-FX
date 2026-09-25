/**
 * Seed data, verbatim from the legacy page's "Dummy data" block. Every list here stands in
 * for an SAP value help or the master-contract table.
 *
 * They are now the fallback: api.ts replaces the master lists in place with MySQL's rows
 * once the middleware answers, and seedContracts() is only shown when it cannot be reached.
 * A master that is registered but still empty in MySQL keeps these values.
 */
import type { Commodity, FxModel, MasterContract, OriginEntity, PaymentTerm, StatusMeta } from './types.ts'

export const ORIGIN_ENTITIES: OriginEntity[] = [
  { code: 'OSIPL', companyCode: 'IN11', name: 'Olam Agri India Pvt Ltd', currency: 'INR' },
  { code: 'OTL', companyCode: 'TH10', name: 'Olam (Thailand) Ltd', currency: 'THB' },
  { code: 'OVL', companyCode: 'VN10', name: 'Olam Vietnam Limited', currency: 'VND' },
]

/** C101 is not a commodity but "several": picking it opens the child-commodity picker. */
export const MULTI_COMMODITY = 'C101'

/**
 * ZSGTSFTR_COMODIT names "several" C001 (Multi-Commodity), not C101 as the legacy seed did,
 * so both mean the child-commodity picker.
 */
export const isMultiCommodity = (code: string | null | undefined): boolean => code === MULTI_COMMODITY || code === 'C001'

export const COMMODITIES: Commodity[] = [
  { code: 'C101', name: 'Multiple Commodity', desc: 'Multiple Commodity' },
  { code: 'C102', name: 'WHEAT', desc: 'WHEAT' },
  { code: 'C104', name: 'BARLEY', desc: 'BARLEY' },
  { code: 'C105', name: 'CORN', desc: 'CORN' },
  { code: 'C106', name: 'MAIZE', desc: 'MAIZE' },
  { code: 'C110', name: 'RUBBER', desc: 'RUBBER' },
  { code: 'C111', name: 'PALMOLEIN', desc: 'PALM OLEIN' },
  { code: 'C112', name: 'SOYOIL', desc: 'SOYOIL' },
  { code: 'C114', name: 'SESAME', desc: 'SESAME' },
  { code: 'C124', name: 'COTTON', desc: 'COTTON' },
  { code: 'C125', name: 'RICE', desc: 'RICE' },
  { code: 'C126', name: 'Fertilizer', desc: 'Fertilizer' },
  { code: 'C103', name: 'SOYABEAN', desc: 'SOYABEAN' },
]

/** Every commodity but the "several" code itself: what the child-commodity picker offers. */
export const childCommodities = () => COMMODITIES.filter((c) => !isMultiCommodity(c.code))

export const PAYMENT_TERMS: PaymentTerm[] = [
  { code: 'P01', label: 'P01 - 270 days from bill of lading date' },
  { code: 'P02', label: 'P02 - 270 days from shipment date against the copy docs' },
  { code: 'P03', label: 'P03 - 270 days from contract date' },
  { code: 'P04', label: 'P04 - 360 days from bill of lading date' },
  { code: 'P05', label: 'P05 - On or Before fixed date' },
  { code: 'P06', label: 'P06 - On or Before due date' },
]

export const PORTS = ['Mumbai', 'Mundra', 'Chennai', 'Singapore', 'Dubai', 'Rotterdam', 'Hamburg', 'Bangkok', 'Ho Chi Minh City']

/**
 * ZCURR_ID for a currency string. There is no currency-string master in MySQL, so this is the
 * mapping the legacy error-correction screen carried (from the SAP screenshots). Only used for
 * dummy FX models; a model read from ZSGTSFTR_RULE_BT brings its own ZCURR_ID.
 */
export const CURRENCY_ID_BY_STRING: Record<string, string> = {
  "INR-INR-INR": "C001",
  "USD-USD-INR": "C002",
  "INR-INR-USD": "C003",
  "USD-INR-INR": "C012",
}

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

export const STATUS_META: Record<string, StatusMeta> = {
  'Created': { cls: 'status-draft', textCls: 'status-text-draft' },
  'Released to M.O.': { cls: 'status-pending', textCls: 'status-text-pending' },
  'In Use': { cls: 'status-in-use', textCls: 'status-text-in-use' },
  'Confirmed': { cls: 'status-confirmed', textCls: 'status-text-confirmed' },
  'Draft': { cls: 'status-draft', textCls: 'status-text-draft' },
  'Pending Approval': { cls: 'status-pending', textCls: 'status-text-pending' },
  'Rejected': { cls: 'status-rejected', textCls: 'status-text-rejected' },
  'Settled': { cls: 'status-settled', textCls: 'status-text-settled' },
  'Matured': { cls: 'status-matured', textCls: 'status-text-matured' },
}

export const DEFAULT_STATUS_META: StatusMeta = { cls: 'status-draft', textCls: 'status-text-draft' }

/** The next MC number the (mock) number range hands out. */
export const FIRST_NEW_MC_NUMBER = 2000002729
/** Starting points of the T1/T2/T3 child-reference number ranges. */
export const FIRST_CHILD_REFS = { T1: 110001, T2: 220001, T3: 330001 }
/** What MC Date shows when the page first opens. */
export const INITIAL_MC_DATE = '23-09-2026'
/** Where the (mock) creation email is addressed. */
export const EMAIL_RECIPIENT = 'royston.d@fourthsignal.com'

/**
 * Tolerance % a new contract starts with: ZSGTSFTR_TOLR's T01, which api.ts loads. 5 is the
 * legacy page's value, kept while TOLR is empty in MySQL.
 */
export const DEFAULT_TOLERANCE = { T01: 5 }

export const findCommodity = (code: string | null | undefined) => COMMODITIES.find((c) => c.code === code)
export const findFxModel = (id: string | null | undefined) => FX_MODELS.find((m) => m.id === id)
export const findEntity = (code: string | null | undefined) => ORIGIN_ENTITIES.find((e) => e.code === code)
export const findPaymentTerm = (code: string | null | undefined) => PAYMENT_TERMS.find((p) => p.code === code)

// The seed contracts are built from the dummy masters as they were, not from whatever the
// lists hold after MySQL's rows are swapped in: C101 or M034a are not in MySQL.
const SEED_ENTITIES = [...ORIGIN_ENTITIES]
const SEED_COMMODITIES = [...COMMODITIES]
const SEED_FX_MODELS = [...FX_MODELS]

function mkContract(
  mcNumber: number,
  entityCode: string,
  fxId: string,
  commCode: string,
  mcDate: string,
  amtUsd: string,
  rate: string,
  shipStart: string,
  shipEnd: string,
  status: string,
  ref: string,
): MasterContract {
  const entity = SEED_ENTITIES.find((e) => e.code === entityCode)
  const comm = SEED_COMMODITIES.find((c) => c.code === commCode)
  const fx = SEED_FX_MODELS.find((m) => m.id === fxId)
  if (!entity || !comm || !fx) throw new Error(`seed contract ${mcNumber} references unknown master data`)
  const amountUsd = parseFloat(amtUsd)
  const exRate = parseFloat(rate)
  return {
    mcNumber,
    status,
    originEntity: entityCode,
    originEntityName: entity.name,
    originCurrency: entity.currency,
    fxModelId: fxId,
    fxModelCode: fx.code,
    fxModelDesc: fx.desc,
    entityString: fx.entity,
    currencyString: fx.currency,
    commodityCode: commCode,
    commodityName: comm.name,
    mcDate,
    mcAmountUsd: amountUsd,
    mcAmountOrigin: Math.round(amountUsd * exRate * 100) / 100,
    exchangeRate: exRate,
    tolerance: 5,
    reference: ref,
    paymentTerms: 'P01',
    paymentDate: shipEnd,
    portShipment: 'Mumbai',
    portDestination: 'Singapore',
    shipStart,
    shipEnd,
  }
}

export function seedContracts(): MasterContract[] {
  const list = [
    mkContract(2000002728, 'OSIPL', 'M032', 'C105', '22-08-2026', '100000', '95.712000', '22-08-2026', '15-09-2026', 'In Use', 'MC/OSIPL/2026/728'),
    mkContract(2000002727, 'OSIPL', 'M034b', 'C125', '21-09-2026', '500000', '90.000000', '21-09-2026', '15-10-2026', 'In Use', 'MC/OSIPL/2026/727'),
    mkContract(2000002726, 'OSIPL', 'M041', 'C102', '21-09-2026', '33055', '6.000000', '21-09-2026', '10-10-2026', 'In Use', 'MC/OSIPL/2026/726'),
    mkContract(2000002725, 'OTL', 'M034a', 'C112', '21-09-2026', '22889', '6.000000', '21-09-2026', '10-10-2026', 'In Use', 'MC/OTL/2026/725'),
    mkContract(2000002724, 'OSIPL', 'M041', 'C104', '21-09-2026', '48602', '8.000000', '21-09-2026', '10-10-2026', 'Confirmed', 'MC/OSIPL/2026/724'),
    mkContract(2000002723, 'OVL', 'M034a', 'C106', '21-09-2026', '37391', '7.000000', '21-09-2026', '10-10-2026', 'In Use', 'MC/OVL/2026/723'),
    mkContract(2000002722, 'OSIPL', 'M034a', 'C110', '21-09-2026', '20280', '6.000000', '21-09-2026', '10-10-2026', 'Draft', 'MC/OSIPL/2026/722'),
    mkContract(2000002719, 'OSIPL', 'M034a', 'C114', '19-09-2026', '16763', '5.000000', '19-09-2026', '08-10-2026', 'In Use', 'MC/OSIPL/2026/719'),
    mkContract(2000002718, 'OTL', 'M034a', 'C124', '19-09-2026', '34222', '5.000000', '19-09-2026', '08-10-2026', 'In Use', 'MC/OTL/2026/718'),
    mkContract(2000002717, 'OSIPL', 'M032', 'C111', '19-09-2026', '30087', '4.000000', '19-09-2026', '08-10-2026', 'In Use', 'MC/OSIPL/2026/717'),
    mkContract(2000002716, 'OSIPL', 'M032', 'C103', '19-09-2026', '44758', '4.000000', '19-09-2026', '08-10-2026', 'In Use', 'MC/OSIPL/2026/716'),
    mkContract(2000002715, 'OVL', 'M041', 'C126', '19-09-2026', '10904', '8.000000', '19-09-2026', '08-10-2026', 'Pending Approval', 'MC/OVL/2026/715'),
    mkContract(2000002714, 'OSIPL', 'M041', 'C105', '19-09-2026', '25021', '9.000000', '19-09-2026', '08-10-2026', 'In Use', 'MC/OSIPL/2026/714'),
    mkContract(2000002713, 'OTL', 'M041', 'C102', '19-09-2026', '48524', '4.000000', '19-09-2026', '08-10-2026', 'In Use', 'MC/OTL/2026/713'),
    mkContract(2000002712, 'OSIPL', 'M034b', 'C125', '19-09-2026', '36912', '9.000000', '19-09-2026', '08-10-2026', 'In Use', 'MC/OSIPL/2026/712'),
    mkContract(2000002710, 'OSIPL', 'M041', 'C106', '19-09-2026', '18335', '8.000000', '19-09-2026', '08-10-2026', 'Settled', 'MC/OSIPL/2026/710'),
    mkContract(2000002709, 'OVL', 'M034a', 'C104', '19-09-2026', '28838', '10.000000', '19-09-2026', '08-10-2026', 'In Use', 'MC/OVL/2026/709'),
    mkContract(2000002708, 'OSIPL', 'M032', 'C110', '19-09-2026', '33050', '10.000000', '19-09-2026', '08-10-2026', 'Matured', 'MC/OSIPL/2026/708'),
    mkContract(2000002707, 'OTL', 'M036', 'C103', '18-09-2026', '52340', '6.500000', '18-09-2026', '05-10-2026', 'In Use', 'MC/OTL/2026/707'),
    mkContract(2000002706, 'OSIPL', 'M033', 'C125', '18-09-2026', '61200', '5.250000', '18-09-2026', '05-10-2026', 'In Use', 'MC/OSIPL/2026/706'),
    mkContract(2000002705, 'OVL', 'M037', 'C106', '17-09-2026', '29875', '7.750000', '17-09-2026', '04-10-2026', 'Confirmed', 'MC/OVL/2026/705'),
    mkContract(2000002704, 'OSIPL', 'M034a', 'C112', '17-09-2026', '44100', '9.000000', '17-09-2026', '04-10-2026', 'In Use', 'MC/OSIPL/2026/704'),
    mkContract(2000002703, 'OTL', 'M035', 'C111', '17-09-2026', '38650', '4.500000', '17-09-2026', '04-10-2026', 'In Use', 'MC/OTL/2026/703'),
    mkContract(2000002702, 'OSIPL', 'M041', 'C114', '16-09-2026', '19980', '6.000000', '16-09-2026', '03-10-2026', 'Draft', 'MC/OSIPL/2026/702'),
    mkContract(2000002701, 'OVL', 'M034b', 'C124', '16-09-2026', '27460', '8.500000', '16-09-2026', '03-10-2026', 'In Use', 'MC/OVL/2026/701'),
    mkContract(2000002700, 'OSIPL', 'M032', 'C102', '16-09-2026', '35700', '4.000000', '16-09-2026', '03-10-2026', 'In Use', 'MC/OSIPL/2026/700'),
    mkContract(2000002699, 'OTL', 'M033', 'C126', '15-09-2026', '14230', '5.500000', '15-09-2026', '02-10-2026', 'Pending Approval', 'MC/OTL/2026/699'),
    mkContract(2000002698, 'OSIPL', 'M034a', 'C103', '15-09-2026', '58900', '9.500000', '15-09-2026', '02-10-2026', 'In Use', 'MC/OSIPL/2026/698'),
    mkContract(2000002697, 'OVL', 'M041', 'C110', '15-09-2026', '21340', '7.000000', '15-09-2026', '02-10-2026', 'In Use', 'MC/OVL/2026/697'),
    mkContract(2000002696, 'OSIPL', 'M036', 'C105', '14-09-2026', '46600', '8.000000', '14-09-2026', '01-10-2026', 'Rejected', 'MC/OSIPL/2026/696'),
    mkContract(2000002695, 'OTL', 'M037', 'C104', '14-09-2026', '32150', '6.250000', '14-09-2026', '01-10-2026', 'In Use', 'MC/OTL/2026/695'),
    mkContract(2000002694, 'OSIPL', 'M034b', 'C125', '14-09-2026', '67300', '9.750000', '14-09-2026', '01-10-2026', 'In Use', 'MC/OSIPL/2026/694'),
    mkContract(2000002693, 'OVL', 'M032', 'C106', '13-09-2026', '25480', '4.750000', '13-09-2026', '30-09-2026', 'Settled', 'MC/OVL/2026/693'),
    mkContract(2000002692, 'OSIPL', 'M035', 'C112', '13-09-2026', '39900', '5.000000', '13-09-2026', '30-09-2026', 'In Use', 'MC/OSIPL/2026/692'),
  ]
  // Two demo rows carry a linked Deal ID so the edit safeguard is visible.
  const linked: Array<[number, string]> = [[0, 'DEAL-900187'], [4, 'DEAL-900142']]
  for (const [index, dealId] of linked) {
    const row = list[index]
    if (row) row.linkedDealId = dealId
  }
  return list
}
