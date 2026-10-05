import type { Column, CurrentUser, DealSeed, DealStatus, Entity, LayoutOption, McSeed, Model, Region } from './types.ts'

/*
 * All dummy data and constants of the screen, kept as in the original's `appData` and `ABAP`
 * blocks. The shapes mirror the SAP tables ZSGTSF_RDEAL_ID_SETT reads; replace with API calls later.
 */

/** Authorization object C_PROJ_KOK (KOKRS + PS_ACTVT 03). */
export const CURRENT_USER: CurrentUser = { name: 'RMENON', authorizedCoAreas: ['OL01', 'OL02'] }
export const DEFAULT_CO_AREA = 'OL01'

/** zsgtsftr_comp: origin entity -> region. Entities reused from the reference screen. */
export const ENTITIES: readonly Entity[] = [
  { code: 'OSIPL', companyCode: 'IN11', name: 'Olam Agri India Pvt Ltd', currency: 'INR', regionId: 'SAS', fxRate: 90.0 },
  { code: 'OTL', companyCode: 'TH10', name: 'Olam (Thailand) Ltd', currency: 'THB', regionId: 'SEA', fxRate: 35.5 },
  { code: 'OVL', companyCode: 'VN10', name: 'Olam Vietnam Limited', currency: 'VND', regionId: 'SEA', fxRate: 25400.0 },
]

export const REGIONS: readonly Region[] = [
  { id: 'SAS', name: 'South Asia' },
  { id: 'SEA', name: 'South East Asia' },
]

/** zsgtsftr_deal_st (sub type FX1); list box P_STAT shows "<key> - <description>". */
export const STATUSES: readonly DealStatus[] = [
  { code: '01', sdesc: 'Created', tone: 'draft' },
  { code: '02', sdesc: 'Pending Confirmation', tone: 'pending' },
  { code: '03', sdesc: 'Confirmed', tone: 'confirmed' },
  { code: '04', sdesc: 'Rate Pending', tone: 'pending' },
  { code: '05', sdesc: 'Pending Settlement', tone: 'matured' },
  { code: '06', sdesc: 'Rate Fixed', tone: 'confirmed' },
  { code: '07', sdesc: 'Settlement Initiated', tone: 'matured' },
  { code: '08', sdesc: 'Settled', tone: 'in-use' },
]

/**
 * zsgtsftr_rule_bt (model per CO area, sub type) + zsgtsftr_set_typ (heads-up indicators).
 * M041 intentionally has no heads-up indicator.
 */
export const CO_AREAS: readonly string[] = ['OL01', 'OL02', 'OL09']
export const MODELS: readonly Model[] = [
  { id: 'M032', desc: 'INR Long Forward', subType: 'FX1', coArea: 'OL01', headFx: 'X', headOpt: '' },
  { id: 'M033', desc: 'INR-INR-INR Forward', subType: 'FX1', coArea: 'OL01', headFx: 'X', headOpt: '' },
  { id: 'M034', desc: 'INR - INR Staggered Call & Put Option', subType: 'FX2', coArea: 'OL01', headFx: '', headOpt: 'X' },
  { id: 'M035', desc: 'INR-INR-Put & Call Option', subType: 'FX2', coArea: 'OL01', headFx: '', headOpt: 'X' },
  { id: 'M036', desc: 'USD-INR-INR-Put & Call Option', subType: 'FX2', coArea: 'OL02', headFx: '', headOpt: 'X' },
  { id: 'M037', desc: 'INR Short Forward', subType: 'FX1', coArea: 'OL02', headFx: 'X', headOpt: '' },
  { id: 'M041', desc: 'INR - INR Staggered Call & Put Option', subType: 'FX2', coArea: 'OL01', headFx: '', headOpt: '' },
]

export const BANKS: readonly string[] = ['HSBC', 'Citi', 'Standard Chartered', 'JPMorgan', 'Deutsche Bank']

/** ALV layout variants (REUSE_ALV_VARIANT_F4); dummy variants for the demo. */
export const LAYOUTS: readonly LayoutOption[] = [
  { id: '', name: 'Default layout' },
  { id: 'HEADSUP', name: 'HEADSUP – Heads-up' },
  { id: 'ALLCOLS', name: 'ALLCOLS – All columns' },
]

/** zsgtsftr_mas_con */
export const MC_SEED: readonly McSeed[] = [
  { no: '728', origin: 'OSIPL', modelId: 'M032', currId: 'C002', commodity: 'CORN', date: '2026-08-22', amt: 100000 },
  { no: '727', origin: 'OSIPL', modelId: 'M034', currId: 'C003', commodity: 'RICE', date: '2026-09-21', amt: 500000 },
  { no: '726', origin: 'OSIPL', modelId: 'M041', currId: 'C001', commodity: 'WHEAT', date: '2026-09-21', amt: 33055 },
  { no: '725', origin: 'OTL', modelId: 'M034', currId: 'C001', commodity: 'SOYOIL', date: '2026-09-21', amt: 22889 },
  { no: '723', origin: 'OVL', modelId: 'M034', currId: 'C001', commodity: 'MAIZE', date: '2026-09-21', amt: 37391 },
  { no: '717', origin: 'OSIPL', modelId: 'M032', currId: 'C002', commodity: 'PALMOLEIN', date: '2026-09-19', amt: 30087 },
  { no: '716', origin: 'OSIPL', modelId: 'M032', currId: 'C002', commodity: 'SOYABEAN', date: '2026-09-19', amt: 44758 },
  { no: '707', origin: 'OTL', modelId: 'M036', currId: 'C012', commodity: 'SOYABEAN', date: '2026-09-18', amt: 52340 },
  { no: '706', origin: 'OSIPL', modelId: 'M033', currId: 'C001', commodity: 'RICE', date: '2026-09-18', amt: 61200 },
  { no: '705', origin: 'OVL', modelId: 'M037', currId: 'C013', commodity: 'MAIZE', date: '2026-09-17', amt: 29875 },
  { no: '703', origin: 'OTL', modelId: 'M035', currId: 'C003', commodity: 'PALMOLEIN', date: '2026-09-17', amt: 38650 },
  { no: '700', origin: 'OSIPL', modelId: 'M032', currId: 'C002', commodity: 'WHEAT', date: '2026-09-16', amt: 35700 },
]

/** zsgtsftr_dealid seeds: [MC no, start, maturity, status, confirmed, USD amount] */
export const DEAL_SEEDS: readonly DealSeed[] = [
  ['728', '2026-08-24', '2026-10-13', '05', 1, 100000],
  ['727', '2026-09-22', '2026-10-14', '05', 1, 250000],
  ['727', '2026-09-22', '2026-10-14', '07', 1, 250000],
  ['726', '2026-09-22', '2026-10-13', '05', 1, 33055],
  ['725', '2026-09-23', '2026-10-15', '03', 1, 22889],
  ['723', '2026-09-23', '2026-10-15', '05', 1, 37391],
  ['717', '2026-09-21', '2026-10-13', '07', 1, 30087],
  ['716', '2026-09-21', '2026-10-14', '05', 1, 44758],
  ['707', '2026-09-19', '2026-10-16', '05', 1, 52340],
  ['706', '2026-09-19', '2026-10-16', '02', 0, 61200],
  ['705', '2026-09-18', '2026-10-14', '07', 1, 29875],
  ['703', '2026-09-18', '2026-10-19', '05', 1, 38650],
  ['700', '2026-09-17', '2026-10-13', '04', 1, 35700],
  ['728', '2026-08-24', '2026-10-21', '03', 1, 50000],
  ['727', '2026-09-25', '2026-10-15', '05', 1, 100000],
  ['717', '2026-09-24', '2026-10-21', '01', 0, 15000],
  ['716', '2026-09-24', '2026-10-19', '05', 1, 20000],
  ['706', '2026-09-26', '2026-10-14', '05', 1, 30000],
  ['705', '2026-09-26', '2026-10-16', '06', 1, 12000],
  ['703', '2026-09-28', '2026-10-15', '07', 1, 18500],
  ['700', '2026-09-28', '2026-10-21', '05', 1, 22000],
  ['726', '2026-09-29', '2026-10-19', '03', 1, 15000],
  ['725', '2026-09-29', '2026-10-13', '05', 1, 12000],
  ['723', '2026-09-30', '2026-10-16', '04', 1, 15391],
  ['707', '2026-09-30', '2026-10-21', '05', 1, 26000],
  ['728', '2026-10-01', '2026-10-30', '02', 0, 10000],
  ['706', '2026-10-01', '2026-10-30', '01', 0, 9000],
  ['716', '2026-09-22', '2026-10-06', '08', 1, 20000],
  ['717', '2026-09-22', '2026-10-05', '08', 1, 10000],
  ['727', '2026-09-23', '2026-10-08', '06', 1, 80000],
]

/** Dummy creators / changers, cycled by deal index. */
export const USERS: readonly string[] = ['RMENON', 'SKAPOOR', 'APATEL', 'NIYER']

/** Statuses from which a deal counts as settled (P&L amount, spot data are filled in). */
export const SETTLED_STAGE_STATUSES: readonly string[] = ['06', '07', '08']

/** Constants lifted from the ABAP source. */
export const ABAP = {
  SUB_FX1: 'FX1',
  SUB_FX2: 'FX2',
  /** c_11d (value changed from 11 to 12 on 08.11.2024) */
  EXT_PRODUCT_NDF: '12D',
  /** The non-NDF product the dummy FX legs carry. */
  EXT_PRODUCT_OTHER: '11D',
  LEG_TYPE: 'D1',
  /** c_05, c_07 */
  MAIL_STATUSES: ['05', '07'] as readonly string[],
  /** gc_mod30, gc_mod34 */
  MODEL_EXT_BASE: ['M030', 'M034'] as readonly string[],
  MODEL_EXT_BY_CURR: { C001: '01', C003: '02' } as Readonly<Record<string, string>>,
  /** Models whose dummy FX legs are NDFs. */
  NDF_MODELS: ['M032', 'M037'] as readonly string[],
} as const

export const MAIL_SUCCESS_TEXT = 'Successfully Sent'
export const AUTH_ERROR_PREFIX = 'You are not authorized to execute for the CO Area '
export const EMPTY_TEXT = 'No Data Found'
export const CSV_FILE_NAME = 'INR_Heads_Up_Reminder.csv'

/** ALV field catalogue of ty_data. */
export const COLUMNS: readonly Column[] = [
  { key: 'dealId', label: 'Deal ID', type: 'deal', color: 'green', sticky: true },
  { key: 'dealType', label: 'Deal Type' },
  { key: 'subType', label: 'Sub Type' },
  { key: 'dealDesc', label: 'Deal Description' },
  { key: 'startDate', label: 'Deal Start Date', type: 'date' },
  { key: 'maturityDate', label: 'Deal Maturity Date', type: 'date' },
  { key: 'mcRef', label: 'MC Reference', type: 'mc', color: 'blue' },
  { key: 'status', label: 'Deal Status', type: 'status' },
  { key: 'statusDesc', label: 'Status Description', type: 'status' },
  { key: 'origin', label: 'Origin Entity' },
  { key: 'region', label: 'Region' },
  { key: 'modelId', label: 'FX Model' },
  { key: 'modelDesc', label: 'Model Description' },
  { key: 'coArea', label: 'CO Area' },
  { key: 'coModelDesc', label: 'CO Model Description' },
  { key: 'mcDesc', label: 'MC Description' },
  { key: 'mcDate', label: 'MC Date', type: 'date' },
  { key: 'mcAmt', label: 'MC Amount', type: 'amt', num: true, color: 'blue' },
  { key: 'utiAmt', label: 'FX Utilisation Amount', type: 'amt', num: true, color: 'green' },
  { key: 'dealCurrId', label: 'Deal Currency ID' },
  { key: 'confirmed', label: 'Confirmed', type: 'flag' },
  { key: 'plAmt', label: 'P&L Amount', type: 'amt', num: true },
  { key: 'plCurr', label: 'P&L Currency' },
  { key: 'plRate', label: 'P&L Rate', type: 'rate', num: true },
  { key: 'ndfDate', label: 'Fixing Day', type: 'date' },
  { key: 'bank', label: 'Bank name' },
  { key: 'spot', label: 'Save Spot Data', type: 'flag' },
  { key: 'createdBy', label: 'Created By' },
  { key: 'createdDate', label: 'Created On', type: 'date' },
  { key: 'createdTime', label: 'Created At' },
  { key: 'changedBy', label: 'Changed By' },
  { key: 'changedDate', label: 'Changed On', type: 'date' },
  { key: 'changedTime', label: 'Changed At' },
]

/** Columns shown per ALV layout variant; 'ALLCOLS' shows the whole catalogue. */
export const LAYOUT_COLUMNS: Readonly<Record<string, readonly Column['key'][]>> = {
  '': [
    'dealId', 'dealType', 'subType', 'dealDesc', 'startDate', 'maturityDate', 'mcRef', 'status', 'statusDesc', 'origin', 'region',
    'modelId', 'modelDesc', 'mcDate', 'mcAmt', 'utiAmt', 'ndfDate', 'bank', 'spot',
  ],
  HEADSUP: ['dealId', 'subType', 'dealDesc', 'maturityDate', 'mcRef', 'status', 'statusDesc', 'origin', 'modelId', 'utiAmt', 'ndfDate', 'bank'],
  ALLCOLS: COLUMNS.map((c) => c.key),
}

export const PAGE_SIZES: readonly number[] = [8, 12, 20]
export const DEFAULT_PAGE_SIZE = 20

export const MONTH_NAMES: readonly string[] = [
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
]
export const WEEKDAYS: readonly string[] = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

export const TOAST_MS = 3200
export const MODAL_CLOSE_MS = 160
