/*
 * SAP data for AE1: TSF FO Error Correction – NDF Fixing (ZSGTSF_RFX_NDF_FIX_FO), read as that
 * program reads it. Its own rules, not normal NDF Fixing's (ZSGTSF_RFX_NDF_FIX):
 *
 *   Company Code (S_BUKRS)  a range over VTBFHA-BUKRS; F4 = T001 (API_COMPANYCODE_SRV / A_CompanyCode).
 *                           This program runs no AUTHORITY-CHECK, so no company is withheld.
 *   Worklist                FORM get_data: ZSGTSFV_FX WHERE bukrs IN s_bukrs AND txn_status = '11'
 *                           AND ndf_date = p_date; then DELETE WHERE sgsart+2(1) <> 'D'.
 *                           No SAKTIV condition here.   (middleware "tsfvFx" -> WAITING FOR API)
 *   9001 reference text     FTRT_FIX_DEF_T fix_id -> fix_id_text      (middleware "ftrtFixDefT")
 *   9001 old rate           GV_O_RATE = the row's NDF_RATE; GV_N_RATE starts blank.
 *   9001 settlement         FORM cash_settelment with CHECK_RATE — but this program never selects
 *                           TCURF, so the rate is never scaled.
 */
import { apiFetch, service } from '@slc/api-client'
import { txt } from '../../shared/fx/masters.ts'
import { fxColumns, fxList, isAbort, type FxRow } from '../../shared/fx/mw.ts'
import { dmyFromIso, num } from '../../shared/fx/sap.ts'
import { leadCurr } from './data.ts'
import type { NdfRow } from './types.ts'

const companyApi = service('companycode')

export const WAITING = 'WAITING FOR API'
export const FX_VIEW = 'tsfvFx'

/** GET_DATA's input status, and the status a correction moves the transaction to. */
export const TXN_STATUS_TO_CORRECT = '11'
export const TXN_STATUS_CORRECTED = '12'

/** ZSGTSFV_FX fields GET_DATA filters on or the grid / popup shows. */
export const VIEW_REQUIRED_COLUMNS = [
  'BUKRS',
  'RFHA',
  'SGSART',
  'BUTXT',
  'TXN_STATUS',
  'NDF_DATE',
  'NDF_REF',
  'NDF_RATE',
  'BS_1',
  'CURR1',
  'CURR2',
  'AMT1',
  'AMT2',
  'TRD_NAME',
  'BP_NAME',
  'EXT_STAT_DESC',
] as const

export type Option = { value: string; label: string; title?: string }
export type Avail<T> = { state: 'ok'; value: T } | { state: 'waiting' | 'error'; reason: string }

const isoOf = (dmy: string) => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dmy.trim())
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}

/* ---------------- pure mappings (tested) ---------------- */

export const missingColumns = (have: readonly string[], need: readonly string[]) => {
  const present = new Set(have.map((c) => c.toUpperCase()))
  return need.filter((c) => !present.has(c))
}

/** GET_DATA: TXN_STATUS 11 on the NDF date, NDF product types only (sgsart+2(1) = 'D'). */
export function eligible(rows: readonly FxRow[], ndfDateIso: string): FxRow[] {
  return rows.filter(
    (r) => txt(r, 'TXN_STATUS') === TXN_STATUS_TO_CORRECT && txt(r, 'NDF_DATE') === ndfDateIso && txt(r, 'SGSART').charAt(2) === 'D',
  )
}

/**
 * One ZSGTSFV_FX row as a grid row. The settlement currency is ZSGTRMFM_LEAD_CURR_S's following
 * currency, and the formula divides the following-currency leg (see leadCurr in data.ts).
 */
export function rowFromView(r: FxRow, refTexts: Readonly<Record<string, string>>): NdfRow {
  const curr1 = txt(r, 'CURR1')
  const curr2 = txt(r, 'CURR2')
  const { follow } = leadCurr(curr1, curr2)
  const fixRef = txt(r, 'NDF_REF')
  return {
    rfha: txt(r, 'RFHA'),
    bukrs: txt(r, 'BUKRS'),
    company: txt(r, 'BUTXT'),
    product: txt(r, 'SGSART'),
    pair: `${curr1}/${curr2}`,
    side: txt(r, 'BS_1') === 'Sell' ? 'Sell' : 'Buy',
    amt1: num(r['AMT1']),
    curr1,
    amt2: num(r['AMT2']),
    curr2,
    fixDate: dmyFromIso(txt(r, 'NDF_DATE')),
    fixRef,
    fixRefName: refTexts[fixRef] ?? '',
    oldRate: num(r['NDF_RATE']),
    trader: txt(r, 'TRD_NAME'),
    partner: txt(r, 'BP_NAME'),
    status: txt(r, 'TXN_STATUS'),
    statusText: txt(r, 'EXT_STAT_DESC'),
    foreignFirst: curr1 === follow,
    settleCurr: follow,
  }
}

export function companyOptions(rows: readonly { CompanyCode?: string; CompanyCodeName?: string }[]): Option[] {
  return rows
    .filter((r) => r.CompanyCode)
    .map((r) => {
      const code = String(r.CompanyCode)
      const name = String(r.CompanyCodeName ?? '').trim()
      return { value: code, label: name ? `${code} - ${name}` : code, title: name }
    })
    .sort((a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : 0))
}

/* ---------------- reads ---------------- */

export async function loadCompanies(signal?: AbortSignal): Promise<Avail<Option[]>> {
  try {
    const params = new URLSearchParams({ $select: 'CompanyCode,CompanyCodeName', $top: '5000', $format: 'json' })
    const v2 = await apiFetch<{ d?: { results?: { CompanyCode?: string; CompanyCodeName?: string }[] } }>(
      `${companyApi('A_CompanyCode')}?${params.toString()}`,
      signal ? { signal } : undefined,
    )
    return { state: 'ok', value: companyOptions(v2?.d?.results ?? []) }
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[ndf-fix-ec] T001 unavailable', error)
    return { state: 'error', reason: 'Company codes could not be read from SAP.' }
  }
}

/** FTRT_FIX_DEF_T: SELECT SINGLE by fix_id with no language condition, so the first text wins. */
export async function loadFixingReferences(signal?: AbortSignal): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  try {
    for (const r of await fxList('ftrtFixDefT', {}, { signal })) {
      const id = txt(r, 'FIX_ID')
      if (id && !(id in out)) out[id] = txt(r, 'FIX_ID_TEXT')
    }
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[ndf-fix-ec] FTRT_FIX_DEF_T unavailable', error)
  }
  return out
}

/**
 * GET_DATA for one NDF Fixing Date. Checks the view's columns first: without TXN_STATUS and the
 * NDF fields the status-11 queue cannot be reproduced, so it says WAITING FOR API instead of
 * listing unrelated FX transactions.
 */
export async function loadWorklist(ndfDateDmy: string, refTexts: Readonly<Record<string, string>>, signal?: AbortSignal): Promise<Avail<NdfRow[]>> {
  try {
    const missing = missingColumns(await fxColumns(FX_VIEW, signal), VIEW_REQUIRED_COLUMNS)
    if (missing.length)
      return { state: 'waiting', reason: `${WAITING} — ZSGTSFV_FX (middleware "${FX_VIEW}") does not serve ${missing.join(', ')}.` }
    const iso = isoOf(ndfDateDmy)
    if (!iso) return { state: 'ok', value: [] }
    const rows = await fxList(FX_VIEW, { TXN_STATUS: TXN_STATUS_TO_CORRECT, NDF_DATE: iso }, { signal })
    return { state: 'ok', value: eligible(rows, iso).map((r) => rowFromView(r, refTexts)) }
  } catch (error) {
    if (isAbort(error)) throw error
    console.warn('[ndf-fix-ec] ZSGTSFV_FX unavailable', error)
    return { state: 'error', reason: 'The NDF transactions could not be read from SAP.' }
  }
}
