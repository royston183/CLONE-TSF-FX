import { loadMaster, txt, type Sourced } from './masters.ts'

/**
 * ZSGTSFTR_MC_STAT — Master Contract status code and text. The table is registered but empty
 * in MySQL, so the dummy is what the FX screens themselves showed, one text per code:
 *
 *   01 Created · 02 Release to MO · 03 Confirmed by MO · 04 In Use · 09 Expired
 *   11 Error Correction · 13 Rejected by MO · 21 Reversed by MO
 *
 * 12 (FO reversal) and 22 (FO correction of a 21) are written by ZSGTSF_MC_ERROR_CORR but no
 * screen ever named them, so they carry the code alone until MC_STAT is migrated.
 */
export type McStatusRow = { code: string; text: string }

export const MC_STATUS_DUMMY: readonly McStatusRow[] = [
  { code: '01', text: 'Created' },
  { code: '02', text: 'Release to MO' },
  { code: '03', text: 'Confirmed by MO' },
  { code: '04', text: 'In Use' },
  { code: '09', text: 'Expired' },
  { code: '11', text: 'Error Correction' },
  { code: '13', text: 'Rejected by MO' },
  { code: '21', text: 'Reversed by MO' },
]

export function loadMcStatuses(signal?: AbortSignal): Promise<Sourced<McStatusRow>> {
  return loadMaster(
    'mcStatus',
    (rows) => rows.map((r) => ({ code: txt(r, 'ZMC_ID'), text: txt(r, 'ZMC_STAT') || txt(r, 'ZMC_DESC') })),
    MC_STATUS_DUMMY,
    { signal },
  )
}

/** The status text for a code, from whichever master answered; the bare code if unknown. */
export function statusText(statuses: readonly McStatusRow[], code: string): string {
  return statuses.find((s) => s.code === code)?.text ?? code
}
