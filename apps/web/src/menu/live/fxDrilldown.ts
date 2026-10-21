import type { FxOverviewRaw, SeriesKey } from './fxOverview.ts'
import { buildFxOverview, isoOf, lastDays } from './fxOverview.ts'
import { txt } from '../../shared/fx/masters.ts'
import type { FxRow } from '../../shared/fx/mw.ts'

export type Detail = { title: string; rows: FxRow[]; unavailable: boolean; columns: string[] }
const columns = {
  fxDeals: ['RFHA', 'BUKRS', 'ZCOM_ID', 'DCRDAT', 'DELFZ', 'SGSART', 'CURR1', 'CURR2', 'BS_1', 'AMT1', 'USD_NOTIONAL', 'T_RATE', 'SAKTIV'],
  mcs: ['ZMC_REF_NO', 'ZMC_DESC', 'ZMC_DATE', 'ZCOM_DESC', 'ZAMT', 'ZCURR', 'ZSHIP_START', 'ZSHIP_END', 'ZMC_STAT', 'ZMOD_DESC'],
  dealIds: ['ZDEAL_ID', 'ZDEAL_DESC', 'ZMC_REF', 'ZDEAL_STAT', 'ZTSF_MODEL', 'ZCREATED_DATE'],
  bls: ['ZBL_NO', 'ZTF_NO', 'ZBU', 'ZTTV', 'ZBL_STAT_ID', 'ZCREATED_DATE'],
  invoices: ['ZINV_NO', 'ZDEAL_ID', 'ZINV_DATE', 'ZAMT_USD', 'ZCURR', 'ZCREATED_DATE'],
} as const
const product = (r: FxRow) => ({ '12A': 'Spot', '12B': 'Forward', '12D': 'NDF' }[txt(r, 'SGSART')] ?? txt(r, 'SGSART'))

/** The records contributing to a tile or a selected chart mark, with the dashboard filters retained. */
export function detailFor(raw: FxOverviewRaw, company: string, today: Date, title: string, mark = '', series: SeriesKey = 'deals', days = 30): Detail {
  const data = buildFxOverview(raw, company, today)
  const day = isoOf(today)
  let source: keyof typeof columns = 'fxDeals'
  let rows: FxRow[] = []
  const fx = (raw.fxDeals ?? []).filter(r => txt(r, 'SAKTIV') !== '3' && (company === 'All' || txt(r, 'ZCOM_ID') === company))
  const open = fx.filter(r => txt(r, 'DELFZ') >= day)
  const status = (r: FxRow, masters: FxRow[], key: string, text: string, col: string) => txt(masters.find(m => txt(m, key) === txt(r, col)) ?? {}, text) || txt(r, col)
  const selectGroup = (items: FxRow[], label: (r: FxRow) => string, visible: {label: string}[]) => !mark ? items : items.filter(r => mark === 'Other' ? !visible.some(v => v.label !== 'Other' && v.label === label(r)) : label(r) === mark)
  if (title.includes('created per day')) {
    source = ({ deals: 'fxDeals', contracts: 'mcs', dealIds: 'dealIds', invoices: 'invoices' } as const)[series]
    const dateCol = ({ deals: 'DCRDAT', contracts: 'ZMC_DATE', dealIds: 'ZCREATED_DATE', invoices: 'ZCREATED_DATE' } as const)[series]
    const dates = lastDays(today, days)
    rows = (source === 'fxDeals' ? fx : raw[source] ?? []).filter(r => dates.includes(txt(r, dateCol)) && (!mark || txt(r, dateCol).slice(8) + '/' + txt(r, dateCol).slice(5, 7) === mark))
  } else if (title.includes('Contract') || title.includes('contract') || title.includes('Shipment')) {
    source = 'mcs'; rows = raw.mcs ?? []
    if (title === 'Master Contract Value') rows = rows.filter(r => txt(r, 'ZCURR') === 'USD')
    if (title.includes('by status')) rows = selectGroup(rows, r => status(r, raw.mcStatuses, 'ZMC_ID', 'ZMC_STAT', 'ZMC_STAT'), data.mcStatus)
    if (title.includes('by FX model')) rows = selectGroup(rows, r => txt(r, 'ZMOD_DESC') || txt(r, 'ZMOD_ID') || '—', data.mcByModel)
    if (title.includes('Shipment')) rows = rows.filter(r => data.contractWindows.some(w => w.label === txt(r, 'ZMC_REF_NO') + ' · ' + txt(r, 'ZCOM_DESC') && (!mark || w.label === mark)))
  } else if (title.includes('Deal ID')) {
    source = 'dealIds'; rows = raw.dealIds ?? []
    if (title.includes('status')) rows = selectGroup(rows, r => status(r, raw.dealStatuses, 'ZDEAL_STAT', 'ZDEAL_SDESC', 'ZDEAL_STAT'), data.dealIdStatus)
    if (title.includes('model')) rows = selectGroup(rows, r => txt(raw.models.find(m => txt(m, 'ZMOD_ID') === txt(r, 'ZTSF_MODEL')) ?? {}, 'ZMOD_DESC') || txt(r, 'ZTSF_MODEL') || '—', data.dealIdByModel)
    if (title.includes('lifecycle')) {
      rows = rows.filter(r => txt(r, 'ZDEAL_STAT') !== '30')
      if (mark) { const code = rows.find(r => status(r, raw.dealStatuses, 'ZDEAL_STAT', 'ZDEAL_SDESC', 'ZDEAL_STAT') === mark)?.ZDEAL_STAT; rows = rows.filter(r => !!code && txt(r, 'ZDEAL_STAT') >= code) }
    }
  } else if (title.includes('Trade') || title.includes('Bills')) {
    source = 'bls'; rows = raw.bls ?? []
    if (title.includes('business unit')) rows = selectGroup(rows, r => txt(r, 'ZBU') || '—', data.blByUnit)
    if (title.includes('by status')) rows = selectGroup(rows, r => status(r, raw.blStatuses, 'ZBL_ST_ID', 'ZBL_ST_NAME', 'ZBL_STAT_ID'), data.blStatus)
  } else if (title.includes('Progress')) {
    if (!mark) {
      const records = [
        ...(raw.mcs ?? []).filter(r => txt(r, 'ZMC_STAT') === '04').map(r => ({ ...r, RECORD_TYPE: 'Contract in use', RECORD_ID: txt(r, 'ZMC_REF_NO') })),
        ...(raw.dealIds ?? []).filter(r => txt(r, 'ZDEAL_STAT') !== '30' && txt(r, 'ZDEAL_STAT') >= '21').map(r => ({ ...r, RECORD_TYPE: 'Deal ID settled', RECORD_ID: txt(r, 'ZDEAL_ID') })),
        ...(raw.bls ?? []).filter(r => txt(r, 'ZBL_STAT_ID') === '05').map(r => ({ ...r, RECORD_TYPE: 'BL invoiced', RECORD_ID: txt(r, 'ZBL_NO') })),
      ]
      return { title, rows: records, unavailable: raw.mcs === null && raw.dealIds === null && raw.bls === null, columns: ['RECORD_TYPE', 'RECORD_ID', 'ZMC_STAT', 'ZDEAL_STAT', 'ZBL_STAT_ID'] }
    }
    if (mark === 'Deal IDs settled') { source = 'dealIds'; rows = (raw.dealIds ?? []).filter(r => txt(r, 'ZDEAL_STAT') !== '30' && txt(r, 'ZDEAL_STAT') >= '21') }
    else if (mark === 'BLs invoiced') { source = 'bls'; rows = (raw.bls ?? []).filter(r => txt(r, 'ZBL_STAT_ID') === '05') }
    else { source = 'mcs'; rows = (raw.mcs ?? []).filter(r => txt(r, 'ZMC_STAT') === '04') }
  } else {
    rows = title.includes('Exposure') || title.includes('Maturity') || title === 'Open USD Notional' || title === 'Maturing in 30 Days' ? open : fx
    if (title === 'Maturing in 30 Days') rows = rows.filter(r => txt(r, 'DELFZ') <= isoOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30)))
    if (title.includes('Exposure')) rows = rows.filter(r => Number(r.USD_NOTIONAL ?? (txt(r, 'CURR1') === 'USD' ? r.AMT1 : 0)) !== 0 && (!mark || txt(r, 'ZCOM_ID') + '|' + txt(r, 'CURR1') + '/' + txt(r, 'CURR2') === mark))
    if (title.includes('by product') && !title.includes('Maturity')) rows = rows.filter(r => !mark || product(r) === mark)
    if (title.includes('Maturity') && mark) {
      const [bucket, prod] = mark.split('|')
      rows = rows.filter(r => {
        const n = Math.round((new Date(txt(r, 'DELFZ') + 'T00:00:00').getTime() - new Date(day + 'T00:00:00').getTime()) / 86400000)
        const match = bucket === 'Within 7 days' ? n <= 7 : bucket === '8 – 30 days' ? n >= 8 && n <= 30 : bucket === '31 – 90 days' ? n >= 31 && n <= 90 : n > 90
        return match && product(r) === prod
      })
    }
    if (title.includes('Cumulative') && mark) {
      const date = lastDays(today, 60).find(d => d.slice(8) + '/' + d.slice(5, 7) === mark)
      rows = rows.filter(r => !!txt(r, 'DCRDAT') && !!date && txt(r, 'DCRDAT') <= date)
    }
  }
  return { title: title + (mark ? ' · ' + mark.replaceAll('|', ' · ') : ''), rows, unavailable: raw[source] === null, columns: [...columns[source]] }
}
