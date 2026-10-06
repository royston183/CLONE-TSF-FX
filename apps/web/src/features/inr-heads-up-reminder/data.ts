import type { Column, LayoutOption, StatusTone } from './types.ts'

/*
 * Constants of the screen. No business data lives here: the deals, Master Contracts, entities,
 * statuses, FX models and heads-up indicators are read from the SLC middleware in api.ts (see
 * that file for the SAP table behind each one). Test rows live in fixtures.ts.
 */

/**
 * Colour of a status code in the grid (.status-text-<tone>). Presentation only: ZSGTSFTR_DEAL_ST
 * has no colour column, so the codes keep the tones the screen always used; others are 'draft'.
 */
export const STATUS_TONE: Readonly<Record<string, StatusTone>> = {
  '01': 'draft',
  '02': 'pending',
  '03': 'confirmed',
  '04': 'pending',
  '05': 'matured',
  '06': 'confirmed',
  '07': 'matured',
  '08': 'in-use',
}

/**
 * KEPT STATIC: ALV layout variants. SAP reads them with REUSE_ALV_VARIANT_F4 (table LTDX), which
 * no API serves; these are the web grid's column presets, not SAP variants.
 */
export const LAYOUTS: readonly LayoutOption[] = [
  { id: '', name: 'Default layout' },
  { id: 'HEADSUP', name: 'HEADSUP – Heads-up' },
  { id: 'ALLCOLS', name: 'ALLCOLS – All columns' },
]

/** Constants lifted from the ABAP source (ZSGTSF_RDEAL_ID_SETT_TOP). */
export const ABAP = {
  /** c_fx1 */
  SUB_FX1: 'FX1',
  /** c_fx2 */
  SUB_FX2: 'FX2',
  /** c_11d (value changed from 11D to 12D on 08.11.2024): the NDF external product. */
  EXT_PRODUCT_NDF: '12D',
  /** c_d1 */
  LEG_TYPE: 'D1',
  /** c_usd */
  USD: 'USD',
  /** c_05, c_07 */
  MAIL_STATUSES: ['05', '07'] as readonly string[],
  /** gc_mod30, gc_mod34 */
  MODEL_EXT_BASE: ['M030', 'M034'] as readonly string[],
  /** gc_curr01 -> gc_01, gc_curr03 -> gc_02 */
  MODEL_EXT_BY_CURR: { C001: '01', C003: '02' } as Readonly<Record<string, string>>,
} as const

/** TEXT-017 */
export const EMPTY_TEXT = 'No Data Found'
export const LOADING_TEXT = 'Loading Deal IDs from SAP…'
export const CSV_FILE_NAME = 'INR_Heads_Up_Reminder.csv'

/** FORM send_email: ZSGTSFCL_CLASS's heads-up methods have no API. */
export const WAITING_MAIL =
  'WAITING FOR ACTION API — Heads-up e-mail (ZSGTSFCL_CLASS ZSGTSFIF_EMAIL~HEADSUP_FX / HEADSUP_FX_DMCC / HEADSUP_OPT / HEADSUP_OPT_DMCC) has no API yet. Nothing was posted to SAP.'

/** Hotspot ZDEAL_ID: SUBMIT zsgtsf_rdeal_trd_inv WITH p_deal = <deal id> AND RETURN. */
export const WAITING_TRADE_INVOICE =
  'WAITING FOR ACTION API — Trade Invoice report (SUBMIT ZSGTSF_RDEAL_TRD_INV WITH p_deal) has no API yet. Nothing was posted to SAP.'

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
