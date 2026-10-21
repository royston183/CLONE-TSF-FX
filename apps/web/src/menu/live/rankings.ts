import type { FxOverviewRaw } from './fxOverview.ts'
import { isoOf } from './fxOverview.ts'
import { txt } from '../../shared/fx/masters.ts'
import { num } from '../../shared/fx/sap.ts'
import type { FxRow } from '../../shared/fx/mw.ts'
export type RankingKind = 'contracts' | 'fx' | 'trade'
export type RankingFilter = { limit: number; category: string; openOnly: boolean; company: string }
export type RankedItem = { label: string; value: number; row: FxRow }
export const RANKING_COLUMNS: Record<RankingKind, string[]> = {
  contracts: ['ZMC_REF_NO', 'ZMC_DESC', 'ZORIGIN', 'ZAMT', 'ZCURR', 'ZMC_STAT', 'ZMOD_DESC', 'ZSHIP_END'],
  fx: ['RFHA', 'BUKRS', 'ZCOM_ID', 'SGSART', 'CURR1', 'CURR2', 'USD_NOTIONAL', 'DELFZ', 'SAKTIV'],
  trade: ['ZBL_NO', 'ZBL_SPLIT', 'ZTF_NO', 'ZBU', 'ZTTV', 'ZBL_STAT_ID'],
}
export function rankRecords(raw: FxOverviewRaw, kind: RankingKind, f: RankingFilter, today: Date): RankedItem[] {
  const rows = kind === 'contracts' ? raw.mcs : kind === 'fx' ? raw.fxDeals : raw.bls
  const items: RankedItem[] = []
  for (const row of rows ?? []) {
    let label: string
    let value: number
    let result = row
    if (kind === 'contracts') {
      if (txt(row, 'ZCURR') !== f.category) continue
      if (f.openOnly && txt(row, 'ZMC_STAT') !== '04') continue
      label = txt(row, 'ZMC_REF_NO')
      value = num(row.ZAMT)
    } else if (kind === 'fx') {
      if (txt(row, 'SAKTIV') === '3') continue
      if (f.company !== 'All' && txt(row, 'ZCOM_ID') !== f.company) continue
      if (f.category && txt(row, 'SGSART') !== f.category) continue
      if (f.openOnly && txt(row, 'DELFZ') < isoOf(today)) continue
      const amount = row.USD_NOTIONAL ?? (txt(row, 'CURR1') === 'USD' ? row.AMT1 : null)
      if (amount == null) continue
      value = Math.abs(num(amount))
      label = (txt(row, 'BUKRS') || txt(row, 'ZCOM_ID')) + ' / ' + txt(row, 'RFHA')
      result = { ...row, USD_NOTIONAL: String(value) }
    } else {
      if (f.category && txt(row, 'ZBU') !== f.category) continue
      value = num(row.ZTTV)
      label = txt(row, 'ZBL_NO') + (txt(row, 'ZBL_SPLIT') ? ' / ' + txt(row, 'ZBL_SPLIT') : '') + ' / ' + txt(row, 'ZTF_NO') + (txt(row, 'ZTF_SPLIT') ? ' / ' + txt(row, 'ZTF_SPLIT') : '')
    }
    if (!Number.isFinite(value) || value <= 0) continue
    items.push({ label, value, row: result })
  }
  return items.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label)).slice(0, Math.max(1, Math.min(100, Math.trunc(f.limit) || 5)))
}
