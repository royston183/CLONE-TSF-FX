export type Company = { bukrs: string; name: string; entity: string }

export type ProfitCentre = { prctr: string; pcName: string; rbusa: string; baName: string }

export type Partner = { id: string; name: string }

export type CurrencyPair = { pair: string; f: string; t: string }

/** Month-end spot model: the rate at 30-09-2026 plus a monthly drift and a small wave. */
export type SpotModel = { base: number; drift: number; amp: number; phase: number }

export type LayoutVariant = { value: string; label: string; secondary: string }

export type DealExtra = {
  bapiError?: string | undefined
  saktiv?: string | undefined
  txnStatus?: string | undefined
}

/**
 * One demo deal as seeded: company, pair, product type, foreign amount, direction (S sell, B buy),
 * start, maturity, partner index, deviation in bp from the market forward, months already posted.
 */
export type DealSeed = readonly [
  company: string,
  pair: string,
  productType: string,
  foreignAmount: number,
  direction: 'S' | 'B',
  start: string,
  maturity: string,
  partnerIdx: number,
  deviationBp: number,
  postedFor: readonly string[],
  extra?: DealExtra,
]

export type GlBase = { loss: number; prov: number; asset: number; gain: number }

/** A transaction as the demo hands it over (the ZSGTSF_RMTM_OTHERS source rows). */
export type Deal = {
  bukrs: string
  butxt: string
  rfha: string
  ztsfDealId: string
  zolamDealNo: string
  xtext: string
  kontrh: string
  bpName: string
  cpair: string
  sgsart: string
  curr1: string
  curr2: string
  /** The pair's first and second currency (table ZSGTRMTR_CURPAIR). */
  fromCurr: string
  toCurr: string
  amt1: number
  amt2: number
  bs1: string
  bs2: string
  /** '1' when the company sells the foreign currency, '2' when it buys. */
  bsO: '1' | '2'
  cRate: number
  /** Local currency of the posting (always USD in this demo). */
  zwaers: string
  /** Start (DBLFZ) and maturity (DELFZ) dates. */
  dblfz: string
  delfz: string
  prctr: string
  pcName: string
  rbusa: string
  baName: string
  txnStatus: string
  saktiv: string
  bapiError: string
}

/** A deal plus everything the page derives for the key date. */
export type Row = Deal & {
  key: string
  fAmt: number
  fCurr: string
  bsBu: 'Buy' | 'Sell'
  ccAmt: number
  vSpot: number
  vSwap: number
  monat: number
  vRate: number
  vAmt: number
  vGl: number
  month: string
  mtmDoc: string
  revDoc: string
  msg: string
}

/** A posted MTM document pair (table ZSGTRMTR_MTM_DATA). */
export type MtmRecord = {
  ztype: string
  zbukrs: string
  zrfha: string
  zdate: string
  zdoc: string
  zrevDoc: string
  zmsg: string
  zcreatedBy: string
}

/** One posting configuration row (table ZSGTRMTR_ACC_TBL): ML loss, MG gain, with or without NDF. */
export type AccConfig = {
  zbukrs: string
  type: 'ML' | 'MG'
  zndf: '' | 'X'
  glDebit: string
  glCredit: string
  pcDebit: string
  baDebit: string
  pcCredit: string
  baCredit: string
  docDebit: string
  docCredit: string
  docHeader: string
}

/** The mock database: static reference data plus the posted documents, which posting extends. */
export type Db = {
  deals: readonly Deal[]
  mtmData: readonly MtmRecord[]
  accConfig: readonly AccConfig[]
  spot: Readonly<Record<string, Readonly<Record<string, number>>>>
  docSeq: number
}

export type MtmMonth = { zmonth: number; zmonthDate: string; lowDate: string; highDate: string }

export type SwapPoint = { dlfz: number; kkurs: number }

export type DealType = 'ALL' | 'NDF' | 'DELIVERABLE'
export type PostingType = 'POST' | 'VIEW'

export type RfhaRange = { from: string; to: string }

/** The selection criteria the transactions are read with. */
export type Criteria = {
  keyIso: string
  companies: readonly string[]
  rfhaRanges: readonly RfhaRange[]
  bp: string
  pair: string
  dealType: DealType
}

export type ColumnKey =
  | 'bukrs'
  | 'butxt'
  | 'rfha'
  | 'ztsfDealId'
  | 'xtext'
  | 'kontrh'
  | 'bpName'
  | 'sgsart'
  | 'cpair'
  | 'bsBu'
  | 'dblfz'
  | 'delfz'
  | 'fAmt'
  | 'fCurr'
  | 'cRate'
  | 'ccAmt'
  | 'month'
  | 'monat'
  | 'vSpot'
  | 'vSwap'
  | 'vRate'
  | 'vAmt'
  | 'vGl'
  | 'mtmDoc'
  | 'revDoc'
  | 'msg'
  | 'prctr'
  | 'rbusa'
  | 'txnStatus'

/** How a cell is written: a date, a 4-decimal rate, 6-decimal swap points, 2 decimals, or the foreign amount in its own currency. */
export type CellFormat = 'date' | 'rate4' | 'swap6' | 'amount2' | 'foreign'

export type Column = {
  key: ColumnKey
  label: string
  type: 'text' | 'num' | 'date'
  /** Transaction data - external (ext) or MTM data (mtm). */
  group: 'ext' | 'mtm' | ''
  fmt?: CellFormat
  /** Hotspot: the transaction details, or the MTM / reversal document. */
  link?: 'rfha' | 'mtm' | 'rev'
  cls?: string
  /** Shown red/green by the sign of the valuation gain/loss. */
  signed?: boolean
  /** The message cell turns green once it has text. */
  msgOk?: boolean
  /** Sorts on the maturity month instead of the text shown. */
  sortByMaturityMonth?: boolean
}

export type Sort = { field: ColumnKey | ''; dir: 'asc' | 'desc' }

export type LogMessage = {
  ok: boolean
  rfha: string
  doc: string
  diff: number
  message: string
  cRate: number
}

export type DocKind = 'mtm' | 'rev'

export type DocItem = { item: number; gl: string; pc: string; ba: string; text: string; amount: number }

export type DocumentView = {
  docNo: string
  bukrs: string
  fiscalYear: string
  docType: string
  docDate: string
  postingDate: string
  reference: string
  headerText: string
  user: string
  currency: string
  reversalOf: string
  items: DocItem[]
}

export type DetailItem = { label: string; value: string; full?: boolean }

export type DetailSection = { title: string; items: DetailItem[] }

export type CalendarView = { y: number; m: number }

export type SelectItem = { value: string; label: string; secondary?: string }
