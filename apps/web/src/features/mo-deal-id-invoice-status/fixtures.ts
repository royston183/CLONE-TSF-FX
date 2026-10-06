/**
 * Test fixtures only — imported by the *.test.ts files, never by the screen. Rows from the
 * legacy page's buildSampleData(), reshaped to DealRow.
 */
import type { DealRow } from './types.ts'

function sampleRow(id: string, desc: string, mc: string, start: string, end: string, status: string, statusDesc: string, origin: string, region: string, model: string): DealRow {
  return {
    dealId: id,
    dealDesc: desc,
    mcRef: mc,
    startDate: start,
    endDate: end,
    rfha1: '',
    rfha2: '',
    rfha3: '',
    rfha4: '',
    rfha5: '',
    dealStatus: status,
    dealStatusDesc: statusDesc,
    origin,
    modelId: model,
    region,
    modelDesc: '',
    utiAmt: null,
    invStatus: '',
    t1Amt: null,
    bukrs1: '',
    bukrs2: '',
    trader: '',
    mcDesc: '',
    mcDate: '',
    shipStart: '',
    shipEnd: '',
    entityString: '',
    currencyString: '',
  }
}

export function buildSampleData(): DealRow[] {
  return [
    sampleRow('1100000031', 'Antony N_OSIPL_2024/OGA-DMCC-OSIPL', '2000000027', '2024-10-17', '2025-10-19', '21', 'Settlement Completed - Execution', 'OSIPL', 'R01', 'M036'),
    sampleRow('1100000001', 'Niranjan K_OSIPL_2024/OGA-OSIPL-DMCC', '2000000013', '2024-10-16', '2024-12-30', '30', 'Deal ID Cancelled', 'OSIPL', 'R01', 'M033'),
    sampleRow('1100000012', 'Vaishnavi J_OSIPL_2024/OGA-DMCC-OSIPL', '2000000021', '2024-10-16', '2024-11-29', '01', 'FO: FX Deals Created', 'DMCC', 'R04', 'M034'),
    sampleRow('1100000099', 'No dates', '2000000021', '', '', '01', 'FO: FX Deals Created', 'DMCC', 'R04', 'M034'),
  ]
}
