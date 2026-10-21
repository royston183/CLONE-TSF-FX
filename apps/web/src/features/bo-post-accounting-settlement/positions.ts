/**
 * ZSGTSFTR_TRD_POS for BO: Post Accounting Entries for Settlement (ZSGTSFR081). The rows are what MO: Execute
 * Settlement for Deal ID (ZSGTSFR060) stored at Initiate Settlement and on each leg's Update / Settlement Complete
 * (cloud trdPos through the compatibility route /api/localdb/tsf-trade-position).
 *
 * The indicators, as ZSGTSF_RDEAL_TRD_POST reads them, never one for another:
 *   ZEXE_CO      Settlement Complete (Execution), set by MO's Settlement Complete (gt_inv-set_co).
 *   ZSET_CHECK   the "Settlement" checkbox: SET_TYP configuration, display only.
 *   ZPOST_CHECK  the "FI Posting" checkbox: SET_TYP configuration, whether the leg is posted to FI at all.
 *   ZBELNR       the FI document of the posting: a leg is posted once it has one. Only a SAP posting fills it.
 *
 * The rows are the trade invoice legs, in their settlement sequence (ZSEQ), as the SAP grid lists them. FX legs are
 * not in this table: their completion is VTBFHA ZTSF_EXE_CO, read through TrmFxApp.
 */
import { apiFetch, service } from '@slc/api-client'
import type { FxLeg, InvLeg } from './types.ts'

/** ZT_TYPE of the FX rows an earlier version of MO wrote into TRD_POS; they are not SAP's and are left out. */
export const FX_LEG_TYPE = 'FX'

const tradePositionApi = service('localdb')('tsf-trade-position')

export type PositionRow = Record<string, unknown>

export async function loadPositions(dealId: string, signal?: AbortSignal): Promise<PositionRow[]> {
  const body = await apiFetch<{ value?: PositionRow[] }>(`${tradePositionApi}?ZDEAL_ID=${encodeURIComponent(dealId)}`, signal ? { signal } : undefined)
  return body?.value ?? []
}

const text = (r: PositionRow, k: string): string => String(r[k] ?? '').trim()
const amount = (r: PositionRow, k: string): number => {
  const n = Number(r[k])
  return Number.isFinite(n) ? n : 0
}

/** The trade invoice legs, by settlement sequence. */
export function toInvLegs(rows: readonly PositionRow[]): InvLeg[] {
  return rows
    .filter((r) => text(r, 'ZT_TYPE') !== FX_LEG_TYPE)
    .sort((a, b) => Number(text(a, 'ZSEQ')) - Number(text(b, 'ZSEQ')) || text(a, 'ZSEQ').localeCompare(text(b, 'ZSEQ')))
    .map((r) => ({
      seq: text(r, 'ZSEQ'),
      tType: text(r, 'ZT_TYPE'),
      tradeType: text(r, 'ZT_TYPE'),
      setDesc: text(r, 'ZSET_DESC'),
      dMap: text(r, 'ZD_MAP'),
      dssDeal: '',
      trfType: text(r, 'ZTRF_TYPE'),
      invAmt: amount(r, 'ZAMT'),
      invCurr: text(r, 'ZCURR'),
      payAmt: amount(r, 'ZPAY_AMT'),
      payCurr: text(r, 'ZSET_CURR') || text(r, 'ZCURR'),
      preAmt: 0,
      postCheck: text(r, 'ZPOST_CHECK') === 'X',
      setCheck: text(r, 'ZSET_CHECK') === 'X',
      exeCo: text(r, 'ZEXE_CO') === 'X',
      fiDoc: text(r, 'ZBELNR'),
      docMsg: text(r, 'ZMSG'),
      buy: text(r, 'ZBUY'),
      sell: text(r, 'ZSELL'),
      senderHouseBank: text(r, 'ZHBKID'),
      senderAccountId: text(r, 'ZHKTID'),
      receiverHouseBank: text(r, 'ZREC_HBKID'),
      receiverAccountId: text(r, 'ZREC_HKTID'),
    }))
}

/**
 * The model's ZSGTSFTR_SET_FX laid over the FX legs (PBO deal_detals): the sequence and DSS deal of the leg's deal
 * type, and a DSS leg takes the sequence of the leg it belongs to. Their FI documents (Doc No 1 / 2) are BKPF's,
 * which has no resource: they stay blank, so no FX leg reads as posted here.
 */
export function withSetFxSequence(legs: readonly FxLeg[], setFx: readonly PositionRow[]): FxLeg[] {
  const out = legs.map((leg) => {
    const row = setFx.find((r) => text(r, 'ZD_MAP') === leg.dealType)
    return { ...leg, seq: row ? text(row, 'ZSEQ') : '', dssDeal: row ? text(row, 'ZDSS_DEAL') : '' }
  })
  for (const leg of out) {
    const dss = leg.dssDeal ? out.find((l) => l.dealType === leg.dssDeal) : undefined
    if (dss) dss.seq = leg.seq
  }
  return out
}
