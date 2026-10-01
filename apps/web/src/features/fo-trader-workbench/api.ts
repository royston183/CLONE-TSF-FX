/*
 * SAP data for the Trader Workbench (ZSGTSFR_SET_WSPACE), read through the SLC middleware
 * exactly as the ABAP reads it. Nothing falls back to sample data.
 *
 *   Deal list        FORM fetch_deal_details: ZSGTSFTR_DEALID ⋈ ZSGTSFTR_DEAL_ST (sub type FX1),
 *                    then ZSGTSFTR_MAS_CON ⋈ ZSGTSFTR_COMP for each deal's MC
 *   Model filter     ZSGTSFSH_MODEL      -> ZSGTSFTR_RULE_BT
 *   Deal ID filter   ZSGTSFSH_DEAL_ID    -> ZSGTSFTR_DEALID
 *   Status filter    ZSGTSFSH_DEAL_STAT  -> ZSGTSFTR_DEAL_ST (sub type FX1, the join the list uses)
 *   Co. Code         FORM co_code*: ZSGTSFTR_COMP WHERE zbukrs <> space, key zbukrs, text zbutxt
 *   BP               FORM bp: ZSGTRMTR_BP_GRP ⋈ ZSGTRMTR_BPEXT WHERE zgrp = the transaction's zgrp
 *   Action texts     ZSGTSFTR_TRDWAI WHERE ztext_code <> space;  sub type: ZSGTSFTR_RULE_BT
 *   Straddle spot    ZSGTSFTR_SS_SPOT;   settlement data: ZSGTSFTR_IN_SPOT
 *   Rates            TCURR kurst M / RBI (GDATU inverted), TCURF kurst MTM
 *
 *   Transactions     ZSGTSFCDS_FX / ZSGTSFCDS_OPTION WHERE ztsf_deal_id = …  -> WAITING FOR API
 */
import { apiFetch, service } from '@slc/api-client'
import { txt } from '../../shared/fx/masters.ts'
import { fxList, isAbort, type FxRow } from '../../shared/fx/mw.ts'
import { num } from '../../shared/fx/sap.ts'
import { emptyLookups } from './data.ts'
import { leadCurr } from './logic.ts'
import type { AppData, Deal, InSpot, Lookups } from './types.ts'

const middleware = service('middleware')

export const WAITING = 'WAITING FOR API'

/**
 * FETCH_TXN_DATA reads ZSGTSFCDS_FX and ZSGTSFCDS_OPTION by ZTSF_DEAL_ID. No service serves
 * that: the middleware's ZSGTSFV_FX has no ZTSF_DEAL_ID (and no option view at all), and
 * FxTransaction exposes no Deal ID, deal type, txn status, group, NDF or option fields.
 */
export const TXN_WAITING =
  'WAITING FOR API — the deal’s transactions come from ZSGTSFCDS_FX / ZSGTSFCDS_OPTION by ZTSF_DEAL_ID, which no service exposes yet.'

/** The deal list's sub type for the status texts (… AND d~zsub_type = 'FX1'). */
const FX1 = 'FX1'

/* ---------------- pure mappings (tested) ---------------- */

const sortBy = <T,>(key: (x: T) => string) => (a: T, b: T) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)

/** One gt_deal row: the DEALID columns, the MC's origin/model/amount, the region via COMP. */
export function dealFromRows(d: FxRow, mc: FxRow | undefined): Deal {
  // IF gs_deal-zmod_id IS INITIAL. gs_deal-zmod_id = ztsf_model.
  const model = (mc ? txt(mc, 'ZMOD_ID') : '') || txt(d, 'ZTSF_MODEL')
  return {
    id: txt(d, 'ZDEAL_ID'),
    type: txt(d, 'ZDEAL_TYPE'),
    subType: txt(d, 'ZSUB_TYPE'),
    desc: txt(d, 'ZDEAL_DESC'),
    model,
    status: txt(d, 'ZDEAL_STAT'),
    ss: txt(d, 'ZSS') === 'X' ? 'X' : '',
    origin: mc ? txt(mc, 'ZORIGIN') : '',
    mcRef: txt(d, 'ZMC_REF'),
    mcDate: mc ? txt(mc, 'ZMC_DATE') : '',
    mcAmt: mc ? num(mc['ZAMT']) : 0,
    mcAmtCurr: mc ? txt(mc, 'ZCURR') : '',
    start: txt(d, 'ZS_DATE'),
    end: txt(d, 'ZE_DATE'),
    trader: txt(d, 'ZTRD_CODE'),
    region: txt(d, 'ZREGION_ID'),
    dealRef: txt(d, 'ZDEAL_REF'),
    fxInvModel: txt(d, 'ZFX_INV_MODEL'),
    pl: num(d['ZPL']),
    plCurr: txt(d, 'ZPL_CURR'),
    plRate: num(d['ZPL_RATE']),
    plLocal: num(d['ZPL_LAMT']),
    plLCurr: txt(d, 'ZPL_LCURR'),
    mcCurr: txt(d, 'ZMC_CURR_DESC'),
    dealCurr: txt(d, 'ZDEAL_CURR_DESC'),
  }
}

export function inSpotFromRow(r: FxRow): InSpot {
  return {
    dealId: txt(r, 'ZDEAL_ID'),
    dealType: txt(r, 'ZDEAL_TYPE'),
    rfha: txt(r, 'ZRFHA'),
    dssType: txt(r, 'ZDSS_TYPE'),
    fAmt: num(r['ZF_AMT']),
    fxAmt: num(r['ZFX_AMT']),
    curr: txt(r, 'ZCURR'),
    dAmt: num(r['ZD_AMT']),
    bs: txt(r, 'ZBS'),
    spotTxn: txt(r, 'ZSPOT_TXN'),
    spotCreate: txt(r, 'ZSPOT_CREATE') === 'X' ? 'X' : '',
    expiry: txt(r, 'ZEXPIRY'),
    bukrs: txt(r, 'ZBUKRS'),
    entity: txt(r, 'ZSBUKRS'),
  }
}

/** TCURR-GDATU is stored inverted (99999999 − yyyymmdd). */
export const invertedDate = (iso: string) => String(99999999 - Number(iso.replace(/-/g, '')))
export function isoFromInverted(gdatu: string): string {
  const d = String(99999999 - Number(gdatu))
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
}

export type Masters = {
  comp: FxRow[]
  models: FxRow[]
  statuses: FxRow[]
  bpGrp: FxRow[]
  bpext: FxRow[]
  trdwai: FxRow[]
  ssSpot: FxRow[]
  tcurf: FxRow[]
}

/** The lookups as the ABAP builds its lists. */
export function lookupsFrom(m: Masters): Lookups {
  const l = emptyLookups()
  l.companies = m.comp
    .filter((r) => txt(r, 'ZBUKRS') !== '')
    .map((r) => ({ code: txt(r, 'ZBUKRS'), name: txt(r, 'ZBUTXT'), entity: txt(r, 'ZCOM_ID') }))
    .sort(sortBy((c) => c.code))

  const seenModel = new Set<string>()
  for (const r of m.models) {
    const id = txt(r, 'ZMOD_ID')
    if (!id) continue
    if (!(id in l.ruleBt)) l.ruleBt[id] = txt(r, 'ZSUB_TYPE') // ASSIGN lt_zsgtsftr_rule_bt[ 1 ]
    if (!seenModel.has(id)) {
      seenModel.add(id)
      l.models.push({ id, desc: txt(r, 'ZMOD_DESC') })
    }
  }
  l.models.sort(sortBy((x) => x.id))

  l.dealStatus = m.statuses
    .filter((r) => txt(r, 'ZSUB_TYPE') === FX1 && txt(r, 'ZDEAL_STAT') !== '')
    .map((r) => {
      const desc = txt(r, 'ZDEAL_SDESC')
      return { code: txt(r, 'ZDEAL_STAT'), desc, cls: 'status-text-draft', closed: /^settlement completed/i.test(desc) }
    })
    .sort(sortBy((s) => s.code))

  const shortName = new Map(m.bpext.map((r) => [txt(r, 'BP'), txt(r, 'SHORT_NAME')]))
  l.bps = m.bpGrp
    .filter((r) => shortName.has(txt(r, 'BP'))) // INNER JOIN zsgtrmtr_bpext
    .map((r) => ({ bp: txt(r, 'BP'), name: shortName.get(txt(r, 'BP')) ?? '', grp: txt(r, 'ZGRP') }))
    .sort(sortBy((b) => b.bp)) // ORDER BY key

  l.actionTexts = m.trdwai
    .filter((r) => txt(r, 'ZTEXT_CODE') !== '')
    .map((r) => ({ sf: txt(r, 'ZSFHAART'), code: txt(r, 'ZTEXT_CODE'), text: txt(r, 'ZACT_TEXT') }))

  // IF <fs_ss>-zbs1 = '01'. bs1 = 'Buy'. ELSE. bs1 = 'Sell'.
  const bs = (code: string) => (code === '01' ? 'Buy' : 'Sell')
  l.ssSpot = m.ssSpot.map((r) => ({
    model: txt(r, 'ZMOD_ID'),
    opBs: txt(r, 'ZOP_BS'),
    pc: txt(r, 'ZPC'),
    bs1: bs(txt(r, 'ZBS1')),
    curr1: txt(r, 'ZCURR1'),
    bs2: bs(txt(r, 'ZBS2')),
    curr2: txt(r, 'ZCURR2'),
  }))

  for (const r of m.tcurf) {
    const key = `${txt(r, 'FCURR')}>${txt(r, 'TCURR')}`
    if (!(key in l.tcurf)) l.tcurf[key] = { ffact: num(r['FFACT']), tfact: num(r['TFACT']) }
  }
  return l
}

/* ---------------- reads ---------------- */

/** TCURR kurst M for a pair: the latest row dated on or before `iso` (one row). */
async function marketRateRow(lead: string, follow: string, iso: string, signal?: AbortSignal): Promise<{ d: string; r: number } | null> {
  const params = new URLSearchParams({ KURST: 'M', FCURR: lead, TCURR: follow, 'GDATU[gte]': invertedDate(iso), sort: 'GDATU', limit: '1' })
  const body = await apiFetch<{ rows?: FxRow[] }>(`${middleware('data/tcurr')}?${params.toString()}`, signal ? { signal } : undefined)
  const row = body?.rows?.[0]
  return row ? { d: isoFromInverted(txt(row, 'GDATU')), r: num(row['UKURS']) } : null
}

export type Loaded = { data: AppData; lookups: Lookups; txnWaiting: string }

export async function loadWorkbench(today: string, signal?: AbortSignal): Promise<Loaded> {
  const o = { signal }
  const [deals, mcs, comp, statuses, models, bpGrp, bpext, trdwai, ssSpot, tcurf] = await Promise.all([
    fxList('tsfDealId', {}, o),
    fxList('masterContract', {}, o),
    fxList('comp', {}, o),
    fxList('tsfDealStatus', { ZSUB_TYPE: FX1 }, o),
    fxList('fxModel', {}, o),
    fxList('bpGrp', {}, o),
    fxList('trmBpext', {}, o),
    fxList('trdwai', {}, o),
    fxList('ssSpot', {}, o),
    fxList('tcurf', { KURST: 'MTM' }, o),
  ])
  const lookups = lookupsFrom({ comp, models, statuses, bpGrp, bpext, trdwai, ssSpot, tcurf })

  const mcByRef = new Map(mcs.map((r) => [txt(r, 'ZMC_REF_NO'), r]))
  const list = deals.map((d) => dealFromRows(d, mcByRef.get(txt(d, 'ZMC_REF'))))

  const ids = list.map((d) => d.id).filter(Boolean)
  const inSpot = ids.length ? (await fxList('inSpot', { 'ZDEAL_ID[in]': ids.join(',') }, o)).map(inSpotFromRow) : []

  // Today's market rate for every currency the KPIs convert to USD.
  const currs = new Set(list.flatMap((d) => [d.mcAmtCurr, d.plCurr]).filter((c) => c && c !== 'USD'))
  await Promise.all(
    [...currs].map(async (c) => {
      const lc = leadCurr(c, 'USD')
      try {
        const row = await marketRateRow(lc.lead, lc.follow, today, signal)
        if (row) lookups.marketRates[`${lc.lead}-${lc.follow}`] = [row]
      } catch (error) {
        if (isAbort(error)) throw error
        console.warn(`[trader-workbench] TCURR M ${lc.lead}/${lc.follow} unavailable`, error)
      }
    }),
  )

  return { data: { deals: list, txns: [], inSpot, nextRfha: 0 }, lookups, txnWaiting: TXN_WAITING }
}
