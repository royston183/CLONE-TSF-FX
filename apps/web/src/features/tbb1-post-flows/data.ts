/*
 * Constants of RFTBBB00 (Treasury: Post Flows, TBB1). No business data lives here: company codes,
 * product / transaction / flow types and the flows are read from SAP (api.ts).
 */
import type { AppKey, MsgType } from './types.ts'

/** P_TX … P_TF with the RANTYP each stands for (RFTBBB00_DATA: anwendung_*). RANTYP = trmmaster ContractType. */
export const APPLICATIONS: { key: AppKey; rantyp: string; name: string }[] = [
  { key: 'tx', rantyp: '4', name: 'Foreign Exchange' },
  { key: 'tm', rantyp: '5', name: 'Money Market' },
  { key: 'ti', rantyp: '6', name: 'Derivatives' },
  { key: 'ts', rantyp: '2', name: 'Securities' },
  { key: 'tf', rantyp: 'T', name: 'Trade Finance' },
]

/** VTBFHAPO-SBEWEBE: buchung_freigegeben / buchung_durchgefuehrt. */
export const POSTING_RELEASED = '1'
export const POSTING_DONE = '2'

export const MSG_NAMES: Record<MsgType, string> = { E: 'Error', W: 'Warning', S: 'Success', I: 'Information' }
export const MSG_ORDER: MsgType[] = ['E', 'W', 'S', 'I']

/** P_PSIZE DEFAULT '7'. */
export const DEFAULT_PACKAGE_SIZE = '07'
/** Multitasking: process count limit of the screen. */
export const MT_MAX_PROCESSES = 99
export const MT_DEFAULT_PROCESSES = '4'
export const MT_DEFAULT_PACKAGE = '10'

export const PAGE_SIZES = [8, 12, 20] as const
export const DEFAULT_PAGE_SIZE = 20

export const TOAST_MS = 3200

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
