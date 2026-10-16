/**
 * Static figures behind the Overview section.
 *
 * None of this comes from SAP. It exists so the layout, the charts and their proportions
 * are real enough to review. Wiring Overview to live data means replacing this module and
 * nothing else — no component below reads anything but these exports.
 */

export type Kpi = {
  label: string
  value: string
  /** Period-over-period change, already a percentage. Sign drives the arrow and colour. */
  delta: number | null
  deltaNote: string
  series: number[]
}

export type Slice = { label: string; value: number }

export type Activity = {
  when: string
  what: string
  who: string
  status: 'Posted' | 'Pending' | 'Draft'
}

export const KPIS: Kpi[] = [
  {
    label: 'Active Trade Flows',
    value: '1,284',
    delta: 4.2,
    deltaNote: 'vs last month',
    series: [1120, 1155, 1140, 1190, 1210, 1198, 1240, 1284],
  },
  {
    label: 'Open ICLs',
    value: '76',
    delta: -1.8,
    deltaNote: 'vs last month',
    series: [84, 82, 85, 80, 79, 81, 77, 76],
  },
  {
    label: 'LCs Outstanding',
    value: '213',
    delta: 2.6,
    deltaNote: 'vs last month',
    series: [190, 196, 201, 199, 205, 208, 207, 213],
  },
  {
    label: 'Total Exposure',
    value: 'USD 1.42bn',
    delta: 6.1,
    deltaNote: 'vs last month',
    series: [1.18, 1.22, 1.25, 1.24, 1.31, 1.34, 1.37, 1.42],
  },
  {
    label: 'Limit Utilisation',
    value: '68.4%',
    delta: 3.0,
    deltaNote: 'points, vs last month',
    series: [61.2, 62.8, 63.1, 64.9, 65.4, 65.9, 67.2, 68.4],
  },
]

/** USD millions. */
export const EXPOSURE_BY_PRODUCT: Slice[] = [
  { label: 'Trade Flows', value: 486 },
  { label: 'Letters of Credit', value: 372 },
  { label: 'Intercompany Loans', value: 244 },
  { label: 'Standby LCs', value: 168 },
  { label: 'Bank Guarantees', value: 98 },
  { label: 'Interest Rate Swaps', value: 52 },
]

export const DEAL_STATUS: Slice[] = [
  { label: 'Settled', value: 612 },
  { label: 'Confirmed', value: 388 },
  { label: 'Pending', value: 194 },
  { label: 'Draft', value: 90 },
]

/** Deal count booked per month, rolling twelve months. */
export const MONTHLY_VOLUME: { month: string; value: number }[] = [
  { month: 'Oct', value: 742 },
  { month: 'Nov', value: 810 },
  { month: 'Dec', value: 688 },
  { month: 'Jan', value: 795 },
  { month: 'Feb', value: 834 },
  { month: 'Mar', value: 902 },
  { month: 'Apr', value: 871 },
  { month: 'May', value: 946 },
  { month: 'Jun', value: 988 },
  { month: 'Jul', value: 1024 },
  { month: 'Aug', value: 997 },
  { month: 'Sep', value: 1084 },
]

export const RECENT_ACTIVITY: Activity[] = [
  { when: '09:42', what: 'Trade flow TF-2026-04812 amended', who: 'a.mehta', status: 'Posted' },
  { when: '09:15', what: 'ICL request ICL-3391 allocated to bank', who: 'r.nayak', status: 'Posted' },
  { when: '08:58', what: 'LC LC-88204 presented for acceptance', who: 'k.raman', status: 'Pending' },
  { when: '08:31', what: 'SBLC SB-1177 termination initiated', who: 'j.fernandes', status: 'Pending' },
  { when: '08:04', what: 'Deal ID DL-55102 created', who: 'a.mehta', status: 'Posted' },
  { when: '07:47', what: 'Invoice INV-2026-9911 drafted', who: 'p.shetty', status: 'Draft' },
]
