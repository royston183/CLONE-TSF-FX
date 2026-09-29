import { loadMaster, txt, type Sourced } from './masters.ts'

/**
 * ZSGTSFTR_MC_STAT — Master Contract status code and text. The dummy is used only when the
 * middleware cannot be reached. The codes follow the programs that write them:
 *
 *   01 Created · 02 Release to MO · 03 Confirmed by MO · 04 In Use · 09 Expired
 *   11 MO->FO: Correction Required (MO reject, picked up by ZSGTSF_MC_ERROR_CORR)
 *   12 Reversed by FO · 13 FO: Error Correction - Correct (back in MO's queue)
 *   21 Reversed by MO (Short Straddle) · 22 FO correction of a 21 (back in MO's queue)
 */
export type McStatusRow = { code: string; text: string }

export const MC_STATUS_DUMMY: readonly McStatusRow[] = [
  { code: '01', text: 'Created' },
  { code: '02', text: 'Release to MO' },
  { code: '03', text: 'Confirmed by MO' },
  { code: '04', text: 'In Use' },
  { code: '09', text: 'Expired' },
  { code: '11', text: 'MO->FO: Correction Required' },
  { code: '12', text: 'Reversed by FO' },
  { code: '13', text: 'FO: Error Correction - Correct' },
  { code: '21', text: 'Reversed by MO' },
  { code: '22', text: 'FO: Error Correction - Correct' },
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
