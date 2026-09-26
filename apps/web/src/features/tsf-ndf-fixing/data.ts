import { fmtDate } from './format.ts'
import type { NdfDeal } from './types.ts'

export const COMPANY_CODES = ['AE11', 'AE13', 'SG03', 'IN11', 'ES12', '9990']
export const TRADERS = [
  'Nidhi S',
  'Aparna',
  'Lakshmi',
  'Sibte',
  'Rahul K',
  'TERRY TAY',
  'Amey T',
  'Anil Jena',
  'Mayank Jain',
  'Rahul Yadav',
  'Andre',
  'Suraya S',
  'SUN BIN',
  'Prem Sai',
]
export const FIXING_REFERENCES = ['WM/REUTERS', 'Bloomberg', 'Central Bank Reference']

const BASE_DATES = [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 6, 7, 10, 14, 20, 30]
const COMPANIES = [
  'AE13', 'AE13', 'AE11', 'SG03', 'IN11', 'AE13', 'ES12', 'AE11', 'SG03', 'IN11',
  'AE13', 'AE11', 'SG03', 'ES12', 'AE13', 'IN11', 'AE11', 'SG03',
]
const DEAL_TRADERS = [
  'Nidhi S', 'Aparna', 'Lakshmi', 'Sibte', 'Rahul K', 'TERRY TAY', 'Amey T', 'Anil Jena', 'Mayank Jain', 'Rahul Yadav',
  'Andre', 'Suraya S', 'SUN BIN', 'Prem Sai', 'Nidhi S', 'Aparna', 'Lakshmi', 'Sibte',
]
const PAIRS: Array<[string, string]> = [
  ['USD', 'INR'], ['USD', 'IDR'], ['USD', 'VND'], ['USD', 'SGD'], ['EUR', 'USD'], ['USD', 'INR'],
  ['USD', 'TWD'], ['USD', 'AED'], ['EUR', 'USD'], ['USD', 'INR'], ['USD', 'IDR'], ['GBP', 'USD'],
  ['USD', 'VND'], ['USD', 'SGD'], ['USD', 'INR'], ['USD', 'AED'], ['EUR', 'USD'], ['USD', 'TWD'],
]
const SPOTS = [
  83.1425, 15820.0, 24610.0, 1.3426, 1.0864, 83.195, 31.982, 3.6725, 1.0842, 83.225,
  15835, 1.2715, 24640, 1.344, 83.2675, 3.6725, 1.087, 32.015,
]
const SWAPS = [
  0.0525, 15, 35, 0.0012, 0.0008, 0.0475, 0.014, 0.0002, 0.0007, 0.045,
  12, 0.0012, 28, 0.0014, 0.041, 0.0002, 0.0009, 0.011,
]

/** The page's makeData(): a fresh set of NDF fixing deals seeded off today's date. */
export function makeData(): NdfDeal[] {
  const today = new Date()
  return BASE_DATES.map((off, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + off)
    // All the parallel arrays above are exactly as long as BASE_DATES, one entry per deal.
    const [c1, c2] = PAIRS[i]!
    const amt1 = 500000 + (i % 6) * 750000 + i * 35000
    const spot = SPOTS[i]!
    const swap = SWAPS[i]!
    const fwd = spot + swap
    const amt2 = amt1 * fwd
    const ndf = (i % 2 === 0 ? 1 : -1) * (amt1 * (0.0018 + (i % 5) * 0.0004))
    return {
      id: String(710082 + i),
      company: COMPANIES[i]!,
      trader: DEAL_TRADERS[i]!,
      side: i % 2 ? 'Sell' : 'Buy',
      pair: `${c1}/${c2}`,
      amt1,
      c1,
      amt2,
      c2,
      spot,
      swap,
      fwd,
      date: fmtDate(d),
      ndf,
      ref: i % 4 === 0 ? 'WM/REUTERS' : '',
      status: 'Pending Confirmation',
      remarks: '',
      moRemarks: '',
    }
  })
}
