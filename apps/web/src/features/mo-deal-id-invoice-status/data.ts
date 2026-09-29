/**
 * Seed data, verbatim from the legacy page's STATUS_MAP/ORIGIN_OPTIONS/REGION_OPTIONS/MODELS
 * and buildSampleData(). The page never called an API, so this stays the only source of rows.
 */
import type { CodeDesc, DealRow, DealStatusCode } from './types.ts'

export const STATUS_MAP: Record<string, string> = {
  '01': 'FO: FX Deals Created',
  '04': 'BL Assigned to Deal ID for Invoicing',
  '05': 'Invoice Created in TRM',
  '07': 'Partial Invoice Created in TRM',
  '20': 'Settlement Initiated',
  '21': 'Settlement Completed - Execution',
  '30': 'Deal ID Cancelled',
}

export const ORIGIN_OPTIONS: CodeDesc[] = [
  { id: 'AMBER', desc: 'Amber Foods Limited' },
  { id: 'DMCC', desc: 'Olam International DMCC' },
  { id: 'OAL', desc: 'Olam Global Agri Americas' },
  { id: 'OGA', desc: 'Olam Global Agri Pte. Ltd' },
  { id: 'OGAT', desc: 'Olam Global Agri Treasury' },
  { id: 'OSIPL', desc: 'Olam Agri India Pvt Ltd' },
  { id: 'OSL', desc: 'Olam Shanghai Limited' },
  { id: 'OTL', desc: 'Olam (Thailand) Ltd' },
  { id: 'OVL', desc: 'Olam Vietnam Limited' },
  { id: 'PAN', desc: 'Panasia International FZE' },
  { id: 'SEDA', desc: 'SEDA OUTSPAN IBERIA S.L.U' },
]

export const REGION_OPTIONS: CodeDesc[] = [
  { id: 'R01', desc: 'South-East Asia' },
  { id: 'R02', desc: 'China' },
  { id: 'R03', desc: 'United States of America' },
  { id: 'R04', desc: 'Middle East & Africa' },
  { id: 'R05', desc: 'Europe' },
  { id: 'R06', desc: 'United Kingdom' },
  { id: 'R07', desc: 'Latin America' },
  { id: 'R08', desc: 'Brazil' },
  { id: 'R09', desc: 'Canada' },
]

export const MODELS: CodeDesc[] = [
  { id: 'M032', desc: 'INR Long Forward' },
  { id: 'M033', desc: 'INR-INR-INR Forward' },
  { id: 'M034', desc: 'INR - INR Staggered Call & Put Option' },
  { id: 'M035', desc: 'INR-INR-Put & Call Option' },
  { id: 'M036', desc: 'USD-INR-INR-Put & Call Option' },
  { id: 'M037', desc: 'INR Short Forward' },
  { id: 'M041', desc: 'INR - INR Staggered Call & Put Option' },
]

export const COMPANY_CODES: Record<string, string> = {
  OGA: 'SG03',
  DMCC: 'AE13',
  OSIPL: 'IN11',
  OTL: 'TH10',
  OVL: 'VN10',
  SEDA: 'ES12',
  PAN: 'AE11',
}

export const modelDescription = (id: string): string => MODELS.find((m) => m.id === id)?.desc ?? id

/** The DMS modal's fixed document-type list, code first — mirrors the legacy dmsDocs(). */
export const DMS_DOCS: Array<[string, string]> = [
  ['D01', 'Bank Trade Recap confirmed by trader'],
  ['D02', 'Signed Long Form Confirmation from Bank'],
  ['D03', 'Miscellaneous 1'],
  ['D19', 'Miscellaneous 2'],
  ['D20', 'Miscellaneous 3'],
  ['D21', 'Miscellaneous 4'],
  ['D22', 'Miscellaneous 5'],
]

function sampleRow(
  id: string,
  desc: string,
  mc: string,
  start: string,
  end: string,
  r1: string,
  r2: string,
  r3: string,
  r4: string,
  status: DealStatusCode,
  model: string,
  amount: number,
): DealRow {
  return {
    dealId: id,
    dealDesc: desc,
    mcRef: mc,
    startDate: start,
    endDate: end,
    rfha1: r1 || '',
    rfha2: r2 || '',
    rfha3: r3 || '',
    rfha4: r4 || '',
    rfha5: '',
    dealStatus: status,
    dealStatusDesc: STATUS_MAP[status] || status,
    origin: 'OSIPL',
    modelId: model,
    region: 'R01',
    modelDesc: modelDescription(model),
    utiAmt: amount,
    invStatus: '',
    t1Amt: null,
    bukrs1: 'IN11',
    bukrs2: 'SG03',
  }
}

export function buildSampleData(): DealRow[] {
  return [
    sampleRow('1100000031', 'Antony N_OSIPL_2024/OGA-DMCC-OSIPL', '2000000027', '2024-10-17', '2025-10-19', '640200000011', '640200000044', '', '', '21', 'M036', 4825000),
    sampleRow('1100000001', 'Niranjan K_OSIPL_2024/OGA-OSIPL-DMCC', '2000000013', '2024-10-16', '2024-12-30', '620500000005', '630200000019', '', '', '30', 'M033', 2150000),
    sampleRow('1100000004', 'Niranjan K_OSIPL_2024/OGA-OSIPL-DMCC', '2000000017', '2024-10-16', '2025-12-30', '620500000002', '630200000023', '', '', '20', 'M037', 3670000),
    sampleRow('1100000005', 'Niranjan K_OSIPL_2024/OGA-DMCC-OSIPL', '2000000012', '2024-10-16', '2025-12-30', '620500000003', '630200000024', '', '', '30', 'M032', 3026000),
    sampleRow('1100000012', 'Vaishnavi J_OSIPL_2024/OGA-DMCC-OSIPL', '2000000021', '2024-10-16', '2024-11-29', '640200000017', '640200000018', '', '', '01', 'M034', 2289000),
    sampleRow('1100000262', 'Niranjan K_OSIPL_2024/OGA-DMCC-OSIPL', '2000000012', '2024-11-10', '2024-12-20', '620500000057', '630200000195', '', '', '01', 'M032', 4860200),
    sampleRow('1100000009', 'Antony N_OSIPL_2024/OGA-DMCC-OSIPL', '2000000021', '2024-10-16', '2024-11-30', '640200000015', '640200000016', '', '', '01', 'M034', 3739100),
    sampleRow('1100000010', 'Niranjan K_OSIPL_2024/OGA-DMCC-OSIPL', '2000000012', '2024-10-17', '2025-12-30', '620500000005', '630200000026', '', '', '01', 'M032', 2028000),
    sampleRow('1100000014', 'Antony N_OSIPL_2024/OGA-OSIPL-DMCC', '2000000017', '2024-10-16', '2024-11-30', '640200000008', '640200000032', '', '', '01', 'M037', 1676300),
    sampleRow('1100000015', 'Antony N_OSIPL_2024/OGA-DMCC-OSIPL', '2000000021', '2024-10-16', '2024-11-30', '640200000021', '640200000022', '', '', '01', 'M034', 3422200),
    sampleRow('1100000072', 'Niranjan K_OSIPL_2024/OGA-OSIPL-DMCC', '2000000016', '2024-10-24', '2025-12-30', '600500000064', '630200000092', '600500000009', '', '21', 'M033', 3078700),
    sampleRow('1100000018', 'Antony N_OSIPL_2024/OGA-DMCC-OSIPL', '2000000025', '2024-10-17', '2025-10-19', '640200000003', '640200000028', '', '', '01', 'M035', 4475800),
    sampleRow('1100000034', 'Vaishnavi J_OSIPL_2024/OGA-OSIPL-DMCC', '2000000021', '2024-10-18', '2024-11-30', '640200000050', '640200000051', '', '', '01', 'M034', 1090400),
    sampleRow('1100000019', 'Antony N_OSIPL_2024/OGA-DMCC-OSIPL', '2000000027', '2024-10-17', '2025-10-19', '640200000005', '640200000032', '', '', '01', 'M036', 2502100),
    sampleRow('1100000023', 'Antony N_OSIPL_2024/OGA-OSIPL-DMCC', '2000000025', '2024-10-17', '2024-11-30', '640200000006', '640200000035', '', '', '07', 'M035', 4852400),
    sampleRow('1100000035', 'Vaishnavi J_OSIPL_2024/OGA-OSIPL-DMCC', '2000000021', '2024-10-18', '2024-11-30', '640200000053', '640200000054', '', '', '01', 'M034', 3691200),
    sampleRow('1100000029', 'Antony N_OSIPL_2024/OGA-DMCC-OSIPL', '2000000025', '2024-10-17', '2025-10-19', '640200000009', '640200000040', '', '', '07', 'M035', 4070000),
    sampleRow('1100000134', 'Antony N_OSIPL_2024/OGA-DMCC-OSIPL', '2000000027', '2024-11-26', '2026-12-30', '640200000021', '640200000097', '', '640200000099', '04', 'M036', 1833500),
    sampleRow('1100000002', 'Niranjan K_OSIPL_2024/OGA-DMCC-OSIPL', '2000000013', '2024-10-16', '2024-12-30', '620500000006', '630200000020', '', '', '05', 'M033', 2883800),
    sampleRow('1100000021', 'Niranjan K_OSIPL_2024/OGA-OSIPL-DMCC', '2000000012', '2024-10-17', '2025-12-30', '620500000011', '630200000035', '600500000006', '', '20', 'M032', 3305000),
    sampleRow('1100000032', 'Vaishnavi J_OSIPL_2024/OGA-OSIPL-DMCC', '2000000025', '2024-10-18', '2024-11-30', '640200000012', '640200000046', '', '640200000048', '01', 'M035', 1245000),
  ]
}
