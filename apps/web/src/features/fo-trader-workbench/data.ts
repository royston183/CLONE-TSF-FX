/*
 * The workbench's lookups and defaults. The lookups start empty and are filled from SAP by
 * api.ts (setLookups); nothing here invents a deal, partner, company or rate. The legacy page's
 * dummy data survives only as test fixtures (fixtures.ts).
 */
import type { AppData, Lookups, Txn } from './types.ts'

/** ZSGTRMFM_LEAD_CURR is not in the export, so its ranking stays the legacy page's (KEPT STATIC). */
export const LEAD_RANK = ['EUR', 'GBP', 'AUD', 'NZD', 'USD']

export function emptyLookups(): Lookups {
  return {
    companies: [],
    models: [],
    dealStatus: [],
    txnStatus: {},
    txnTypes: {},
    bps: [],
    actionTexts: [],
    ruleBt: {},
    tcurf: {},
    marketRates: {},
    rbiRates: {},
    ssSpot: [],
    leadRank: [...LEAD_RANK],
  }
}

/** The lookups every module reads. Replaced in place, so importers see the loaded rows. */
export const LOOKUPS: Lookups = emptyLookups()

export function setLookups(next: Lookups): void {
  Object.assign(LOOKUPS, next)
}

/** A transaction with ZSGTSFCDS_FX's empty defaults; `o` overrides. */
export function mkTxn(dealId: string, rfha: string, o: Partial<Txn>): Txn {
  return {
    dealId,
    rfha,
    bukrs: '',
    sfhaart: '',
    sgsart: '',
    dealType: '',
    cpty: '',
    cptyName: '',
    grp: '',
    entity: '',
    tradeDate: '',
    valueDate: '',
    eDate: '',
    xtext: '',
    pc1: '',
    pc2: '',
    bs1: '',
    curr1: '',
    amt1: 0,
    bs2: '',
    curr2: '',
    amt2: 0,
    ospot: 0,
    oswap: 0,
    rate: 0,
    strike: 0,
    status: '',
    settlfl: '',
    preAmt: 0,
    preCurr: '',
    mcRef: '',
    ndfDate: '',
    ndfRef: '',
    ndfRefName: '',
    ndfRate: 0,
    cpair: '',
    cashAmt: 0,
    cashCurr: '',
    coverTxn: '',
    portfolio: '',
    seq: 1,
    etag: '',
    ...o,
  }
}

export const emptyData = (): AppData => ({ deals: [], txns: [], inSpot: [], nextRfha: 0 })

/** The legacy page's default Settlement Date window (S_DATE has no default in the ABAP). */
export const DEFAULT_FILTERS = { from: '01-09-2026', to: '31-12-2026', model: '', deal: '', status: '' } as const

export const KPI_DUE_DAYS = 7
