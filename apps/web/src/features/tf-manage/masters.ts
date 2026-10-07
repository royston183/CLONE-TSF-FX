import { mwList } from '../../shared/middleware.ts'
import type { TrdFlowRow } from './types.ts'

/**
 * The masters Manage Trade Flows reads, rather than keeping lists of its own.
 *
 *  - ZSGTSFTR_TF_STAT holds three status lists in one table, told apart by ZTF_ST_TYPE:
 *    01 the trade flow's own status (set automatically), 02 blocked / allocated, and
 *    03 OGBS — the one the Status tab's OGBS Status select offers.
 *  - ZSGTSFTR_COMODIT is the commodity master, behind Basic Data's BU Commodity.
 *
 * Neither has a SAP OData set, so a failed read degrades to an empty list: a select offers no
 * choices and a description stays blank, which is honest, rather than falling back to a list
 * someone keeps by hand.
 */

export type SelectOption = { value: string; label: string }

export const TF_STATUS_TYPE = { flow: '01', blocked: '02', ogbs: '03' } as const

type TfStatusRow = { ZtfStId?: string; ZtfStName?: string; ZtfStType?: string }

export type TfStatusMaster = {
  flow: SelectOption[]
  ogbs: SelectOption[]
  blocked: SelectOption[]
  /** Status name by code, across every type. */
  nameOf: Map<string, string>
}

export function buildTfStatusMaster(rows: readonly TfStatusRow[]): TfStatusMaster {
  const ofType = (type: string): SelectOption[] =>
    rows
      .filter((r) => String(r.ZtfStType ?? '').trim() === type && r.ZtfStId)
      .map((r) => {
        const value = String(r.ZtfStId).trim()
        const name = String(r.ZtfStName ?? '').trim()
        return { value, label: name ? `${value} ${name}` : value }
      })
      .sort((a, b) => a.value.localeCompare(b.value))
  return {
    flow: ofType(TF_STATUS_TYPE.flow),
    ogbs: ofType(TF_STATUS_TYPE.ogbs),
    blocked: ofType(TF_STATUS_TYPE.blocked),
    nameOf: new Map(rows.map((r) => [String(r.ZtfStId ?? '').trim(), String(r.ZtfStName ?? '').trim()])),
  }
}

export async function loadTfStatusMaster(signal?: AbortSignal): Promise<TfStatusMaster> {
  const rows = await mwList<TfStatusRow>('tradeFlowStatus', undefined, signal).catch(() => [] as TfStatusRow[])
  return buildTfStatusMaster(rows)
}

export type CommodityRow = { ZcomId?: string; ZcomDesc?: string; ZcomSdesc?: string; ZbuId?: string }

export async function loadCommodityMaster(signal?: AbortSignal): Promise<CommodityRow[]> {
  return mwList<CommodityRow>('commodity', undefined, signal).catch(() => [] as CommodityRow[])
}

/**
 * Basic Data's BU Commodity: the commodity master's description for the trade flow.
 *
 * By the trade flow's own commodity ID (ZTRM_COM_ID) when it has one. A trade flow uploaded
 * while SAP's ChComm was unreachable has none, so failing that, the business unit's commodity —
 * but only when the master gives that unit exactly one; Grains, for instance, has five, and
 * picking one would be a guess.
 */
export function buCommodity(row: Pick<TrdFlowRow, 'ZtrmComId' | 'ZbuId'>, commodities: readonly CommodityRow[]): string {
  const describe = (c: CommodityRow) => String(c.ZcomDesc ?? c.ZcomSdesc ?? '').trim()
  const id = String(row.ZtrmComId ?? '').trim()
  if (id) {
    const byId = commodities.find((c) => String(c.ZcomId ?? '').trim() === id)
    return byId ? describe(byId) : id
  }
  const bu = String(row.ZbuId ?? '').trim()
  if (!bu) return ''
  const ofUnit = commodities.filter((c) => String(c.ZbuId ?? '').trim() === bu)
  return ofUnit.length === 1 ? describe(ofUnit[0]!) : ''
}

/**
 * TF Type: SAP domain fixed values for ZTF_TYPE (dd07v 01 Container, 02 Bulk), not rows of any
 * table — so, like the upload's own TF type list, they are kept here.
 */
export const TF_TYPE_OPTIONS: readonly SelectOption[] = [
  { value: '01', label: '01 Container' },
  { value: '02', label: '02 Bulk' },
]
