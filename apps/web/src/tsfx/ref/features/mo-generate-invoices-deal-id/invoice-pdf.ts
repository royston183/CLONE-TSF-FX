/**
 * The documents issued once a Deal ID's invoices are confirmed: per invoice leg (T1, T2, T3) a Commercial
 * Invoice (Sales_Invoice-<invoice no>.pdf) and the sales-order addendum (Sales_doc-<sale order no>.pdf), laid
 * out like the reference PDFs. No PDF library is on the approved list, so this writes the PDF itself:
 * A4, the built-in Helvetica fonts, text and ruled boxes only (no logo image).
 * Pure: `invoicePdf` / `salesDocPdf` return the file bytes, `pdfLegs` reads them off the confirmed deal.
 */
import type { Logo } from './branding.ts'
import { PRINT_NAMES } from './party-names.ts'
import type { Deal, InvRow } from './types.ts'

/* ------------------------------------------------------------------ the parties and terms */

/** A company as SAP holds it (ZSGTSFTR_COMP): its TSF entity code, company code, name and country. */
export type Company = { entity: string; companyCode: string; name: string; country: string }
export type Companies = Readonly<Record<string, Company>>

type Party = { name: string; lines: string[] }

/** The seller / buyer of a leg: the company's document name for its entity, else the name SAP holds. Only the name. */
export function party(code: string, companies: Companies = {}): Party {
  const key = code.toUpperCase()
  return { name: PRINT_NAMES[key] ?? companies[key]?.name ?? code, lines: [] }
}

const INCOTERMS: Record<string, string> = { FOB: 'Free on board', FCA: 'Free carrier', CIF: 'Cost, insurance and freight', CFR: 'Cost and freight', EXW: 'Ex works', DAP: 'Delivered at place', DDP: 'Delivered duty paid' }
const CURRENCY_WORDS: Record<string, [string, string]> = { INR: ['RUPEE', 'PAISE'], USD: ['US DOLLAR', 'CENTS'], EUR: ['EURO', 'CENTS'], SGD: ['SINGAPORE DOLLAR', 'CENTS'], AED: ['DIRHAM', 'FILS'] }

/* ------------------------------------------------------------------ formatting */

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** '2026-08-06', '06-08-2026' or '20260806' → '06 AUG 2026' ('' when it is not a date). */
export function longDate(value: string): string {
  const v = (value || '').trim()
  const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(v)
  const ymd = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(v)
  const [d, m, y] = dmy ? [dmy[1], dmy[2], dmy[3]] : ymd ? [ymd[3], ymd[2], ymd[1]] : []
  const month = MONTHS[Number(m) - 1]
  return d && y && month ? `${d} ${month} ${y}` : ''
}

export const grouped = (n: number, places: number): string => n.toLocaleString('en-US', { minimumFractionDigits: places, maximumFractionDigits: places })

const ONES = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN']
const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY']
const SCALES = ['', ' THOUSAND', ' MILLION', ' BILLION', ' TRILLION']

function below1000(n: number): string {
  const parts: string[] = []
  if (n >= 100) parts.push(`${ONES[Math.floor(n / 100)]} HUNDRED`)
  const r = n % 100
  if (r) parts.push(r < 20 ? (ONES[r] ?? '') : `${TENS[Math.floor(r / 10)]}${r % 10 ? `-${ONES[r % 10]}` : ''}`)
  return parts.join(' ')
}

export function wholeWords(n: number): string {
  if (n === 0) return 'ZERO'
  const groups: string[] = []
  let rest = Math.floor(n)
  for (let i = 0; rest > 0; i++, rest = Math.floor(rest / 1000)) {
    const g = rest % 1000
    if (g) groups.unshift(`${below1000(g)}${SCALES[i] ?? ''}`)
  }
  return groups.join(' ')
}

/** 1,377,526,369.88 INR → 'RUPEE ONE BILLION … SIXTY-NINE AND PAISE EIGHTY-EIGHT ONLY'. */
export function amountInWords(amount: number, currency: string): string {
  const [major, minor] = CURRENCY_WORDS[currency.toUpperCase()] ?? [currency.toUpperCase(), 'CENTS']
  const cents = Math.round(Math.abs(amount) * 100)
  const whole = Math.floor(cents / 100)
  const fraction = cents % 100
  return `${major} ${wholeWords(whole)} AND ${minor} ${wholeWords(fraction)} ONLY`
}

/* ------------------------------------------------------------------ the data of one leg */

export type PdfLeg = {
  dealId: string
  dealDesc: string
  legId: string
  invNo: string
  invDate: string
  soNo: string
  soDate: string
  masterContract: string
  sellerCode: string
  buyerCode: string
  dueDate: string
  incoterms: string
  commodity: string
  material: string
  qty: number
  rate: number
  amount: number
  currency: string
}

const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v))

/** One PdfLeg per confirmed invoice row of the deal (a row without an invoice number is not an invoice yet). */
export function pdfLegs(deal: Deal): PdfLeg[] {
  return deal.inv
    .filter((r: InvRow) => !!r.invNo)
    .map((r) => {
      const co = text(r.rec['ZINCO'])
      const ref = text(r.rec['ZINV_REF'])
      return {
        dealId: deal.dealId,
        dealDesc: deal.dealRef,
        legId: r.ttype,
        invNo: r.invNo,
        invDate: r.invDate,
        // No sale-order number is stored in the middleware (it is issued by SD), so the invoice reference stands in for it.
        soNo: ref || `${deal.dealId}-${r.ttype}`,
        soDate: text(r.rec['ZSO_DATE']) || r.invDate,
        masterContract: text(r.rec['ZMC_REF_S']) || text(r.rec['ZMC_REF']) || deal.mcRef,
        sellerCode: r.seller,
        buyerCode: r.buyer,
        dueDate: r.dueDate,
        incoterms: INCOTERMS[co.toUpperCase()] ?? co,
        commodity: r.commodity,
        material: r.gtComm,
        qty: r.qty,
        rate: r.price,
        amount: r.amt,
        currency: r.curr || (Math.abs(r.amt - r.amtUsd) < 0.01 ? 'USD' : 'INR'),
      }
    })
}

/* ------------------------------------------------------------------ a small PDF writer */

const W = 595.28
const H = 841.89
// Helvetica advance widths (1/1000 em) for the printable ASCII range 32..126.
const HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584]

type Font = 'F1' | 'F2'

export function textWidth(s: string, size: number, font: Font = 'F1'): number {
  let units = 0
  for (const ch of s) units += HELV[ch.charCodeAt(0) - 32] ?? 556
  return (units / 1000) * size * (font === 'F2' ? 1.06 : 1)
}

const esc = (s: string): string => s.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, '?')
const n2 = (n: number): string => (Math.round(n * 100) / 100).toString()

class Page {
  readonly ops: string[] = []
  /** Text at (x, top-origin y); align 'l' | 'r' | 'c' about x. */
  text(s: string, x: number, y: number, o: { size?: number; font?: Font; align?: 'l' | 'r' | 'c'; color?: [number, number, number] } = {}): void {
    const size = o.size ?? 9
    const font = o.font ?? 'F1'
    const w = textWidth(s, size, font)
    const left = o.align === 'r' ? x - w : o.align === 'c' ? x - w / 2 : x
    const [r, g, b] = o.color ?? [0, 0, 0]
    this.ops.push(`${n2(r)} ${n2(g)} ${n2(b)} rg BT /${font} ${size} Tf ${n2(left)} ${n2(H - y)} Td (${esc(s)}) Tj ET`)
  }
  /** Greedy word wrap into `width`, one line per `lead`; returns the y after the last line. */
  para(s: string, x: number, y: number, width: number, o: { size?: number; font?: Font; lead?: number } = {}): number {
    const size = o.size ?? 9
    const lead = o.lead ?? size * 1.35
    let line = ''
    let at = y
    for (const word of s.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (line && textWidth(next, size, o.font) > width) {
        this.text(line, x, at, o)
        at += lead
        line = word
      } else line = next
    }
    if (line) {
      this.text(line, x, at, o)
      at += lead
    }
    return at
  }
  /** Draws the logo with its artwork box (crop) fitted into a box of `width` pt at (x, top y), without distortion. */
  logo(l: Logo, x: number, y: number, width: number): number {
    this.usesLogo = true
    const s = width / l.crop.w
    const height = l.crop.h * s
    const left = x - l.crop.x * s
    const bottom = H - (y - l.crop.y * s + l.height * s)
    this.ops.push(`q ${n2(x)} ${n2(H - y - height)} ${n2(width)} ${n2(height)} re W n ${n2(l.width * s)} 0 0 ${n2(l.height * s)} ${n2(left)} ${n2(bottom)} cm /Im1 Do Q`)
    return height
  }
  usesLogo = false
  line(x1: number, y1: number, x2: number, y2: number): void {
    this.ops.push(`0.5 w 0 0 0 RG ${n2(x1)} ${n2(H - y1)} m ${n2(x2)} ${n2(H - y2)} l S`)
  }
  box(x: number, y: number, w: number, h: number): void {
    this.ops.push(`0.5 w 0 0 0 RG ${n2(x)} ${n2(H - y - h)} ${n2(w)} ${n2(h)} re S`)
  }
}

/** Assembles the pages into one PDF file (Type1 Helvetica / Helvetica-Bold, WinAnsi; the logo as a DCT/JPEG image). */
export function buildPdf(pages: readonly Page[], title: string, logo?: Logo): Uint8Array {
  const objects: (string | { dict: string; data: Uint8Array })[] = []
  const add = (body: string | { dict: string; data: Uint8Array }): number => objects.push(body)
  add('<< /Type /Catalog /Pages 2 0 R >>')
  add('') // pages, filled below
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
  const imageId = logo ? add({ dict: `/Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, data: logo.bytes }) : 0
  const kids: number[] = []
  for (const p of pages) {
    const content = p.ops.join('\n')
    const contentId = add(`<< /Length ${content.length} >>
stream
${content}
endstream`)
    const xobject = p.usesLogo && imageId ? ` /XObject << /Im1 ${imageId} 0 R >>` : ''
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xobject} >> /Contents ${contentId} 0 R >>`))
  }
  const info = add(`<< /Title (${esc(title)}) /Producer (TSF_FX) >>`)
  objects[1] = `<< /Type /Pages /Count ${kids.length} /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] >>`
  const chunks: Uint8Array[] = []
  let length = 0
  const put = (x: string | Uint8Array) => {
    const bytes = typeof x === 'string' ? Uint8Array.from(x, (c) => c.charCodeAt(0) & 0xff) : x
    chunks.push(bytes)
    length += bytes.length
  }
  put('%PDF-1.4\n')
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(length)
    if (typeof body === 'string') put(`${i + 1} 0 obj
${body}
endobj
`)
    else {
      put(`${i + 1} 0 obj
<< ${body.dict} /Length ${body.data.length} >>
stream
`)
      put(body.data)
      put('\nendstream\nendobj\n')
    }
  })
  const xref = length
  put(`xref
0 ${objects.length + 1}
0000000000 65535 f 
${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n 
`).join('')}`)
  put(`trailer
<< /Size ${objects.length + 1} /Root 1 0 R /Info ${info} 0 R >>
startxref
${xref}
%%EOF`)
  const out = new Uint8Array(length)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}

/* ------------------------------------------------------------------ Commercial Invoice */

const PURPLE: [number, number, number] = [0.53, 0.02, 0.38]

/** The company mark at the top left: the ofi logo (when it is loaded), else the name as text. */
function brand(p: Page, logo?: Logo): void {
  if (logo) p.logo(logo, 44, 22, 64)
  else p.text('ofi', 44, 56, { size: 22, font: 'F2', color: PURPLE })
}

/** The Commercial Invoice of one leg: Sales_Invoice-<invNo>.pdf. */
export function invoicePdf(l: PdfLeg, logo?: Logo, companies?: Companies): Uint8Array {
  const p = new Page()
  const seller = party(l.sellerCode, companies)
  const buyer = party(l.buyerCode, companies)
  brand(p, logo)
  p.text('Commercial Invoice', 297, 52, { size: 14, font: 'F2', align: 'c' })
  const L = 28
  const R = 567
  const M = 335 // the vertical rule between the party column and the reference column
  const top = 88
  p.box(L, top, R - L, 750)
  p.line(M, top, M, top + 166) // refs / special condition column
  // Seller block and the references
  p.text('Seller', L + 4, top + 14, { size: 9, font: 'F2' })
  let y = top + 26
  y = p.para(seller.name + ',', L + 4, y, M - L - 12, { size: 8 })
  for (const s of seller.lines) y = p.para(s, L + 4, y, M - L - 12, { size: 8 })
  p.text('Invoice No. & Date', M + 4, top + 14, { size: 9, font: 'F2' })
  p.text(`${l.invNo} / ${longDate(l.invDate)}`, M + 4, top + 26, { size: 8 })
  p.line(M + 150, top, M + 150, top + 36)
  p.text('Sale Order No', M + 154, top + 14, { size: 9, font: 'F2' })
  p.text(l.soNo, M + 154, top + 26, { size: 8 })
  p.line(M, top + 36, R, top + 36)
  p.text('Deal ID :', M + 4, top + 50, { size: 9, font: 'F2' })
  p.para(l.dealDesc ? `${l.dealId} -${l.dealDesc}` : l.dealId, M + 8, top + 62, R - M - 12, { size: 8 })
  p.line(M, top + 72, R, top + 72)
  p.text('Master contract No :', M + 8, top + 86, { size: 9, font: 'F2' })
  p.text(l.masterContract, M + 4, top + 98, { size: 8 })
  p.line(L, top + 100, R, top + 100)
  // Buyer and the special condition
  p.text('Buyer', L + 4, top + 114, { size: 9, font: 'F2' })
  y = top + 126
  y = p.para(buyer.name + ',', L + 4, y, M - L - 12, { size: 8 })
  for (const s of buyer.lines) y = p.para(s, L + 4, y, M - L - 12, { size: 8 })
  p.text('Special Condition', M + 4, top + 114, { size: 9, font: 'F2' })
  p.para(`${l.dealDesc}^${l.incoterms}^As per Annexure^ As per Annexure^^${(l.soDate || '').replace(/-/g, '').slice(0, 8)}^^`, M + 4, top + 126, R - M - 8, { size: 8 })
  p.line(L, top + 166, R, top + 166)
  // Vessel / ports and the payment terms
  const row = top + 166
  p.line(M, row, M, row + 130)
  p.line(L + 98, row, L + 98, row + 130)
  p.line(L, row + 65, M, row + 65)
  p.text('Vessel Name', L + 4, row + 14, { size: 9, font: 'F2' })
  p.text('As per Annexure', L + 4, row + 26, { size: 8 })
  p.text('Port of Loading', L + 102, row + 14, { size: 9, font: 'F2' })
  p.text('As per Annexure', L + 102, row + 26, { size: 8 })
  p.text('Port of Discharge', L + 4, row + 80, { size: 9, font: 'F2' })
  p.text('As per Annexure', L + 4, row + 92, { size: 8 })
  p.text('Final Destination', L + 102, row + 80, { size: 9, font: 'F2' })
  p.text('As per Annexure', L + 102, row + 92, { size: 8 })
  p.text('Payment Term', M + 4, row + 14, { size: 9, font: 'F2' })
  p.text(`Payment due date ${longDate(l.dueDate)}`, M + 4, row + 26, { size: 8 })
  p.text('Incoterms', M + 4, row + 80, { size: 9, font: 'F2' })
  p.text(`: ${l.incoterms}`, M + 70, row + 80, { size: 8 })
  p.text('Bill Of Lading Date', M + 4, row + 94, { size: 9, font: 'F2' })
  p.text(': As per Annexure', M + 100, row + 94, { size: 8 })
  p.text('Bill Of Lading', M + 4, row + 108, { size: 9, font: 'F2' })
  p.text(': As per Annexure', M + 100, row + 108, { size: 8 })
  // Goods table
  const t = row + 130
  p.line(L, t, R, t)
  const cols = [L, 178, 300, 400, 485, R]
  for (const c of cols.slice(1, -1)) p.line(c, t, c, t + 118)
  const heads: [string, string][] = [['Material No.', ''], ['Description of Goods', ''], ['Quantity', 'MT'], ['Rate', `${l.currency} / MT`], ['Amount', l.currency]]
  heads.forEach(([a, b], i) => {
    const cx = ((cols[i] ?? 0) + (cols[i + 1] ?? 0)) / 2
    p.text(a, cx, t + 16, { size: 9, font: 'F2', align: 'c' })
    if (b) p.text(b, cx, t + 28, { size: 9, font: 'F2', align: 'c' })
  })
  p.line(L, t + 46, R, t + 46)
  p.line(L, t + 92, R, t + 92)
  p.text(l.material, (cols[0]! + cols[1]!) / 2, t + 72, { size: 7, align: 'c' })
  p.text(l.commodity.toUpperCase(), (cols[1]! + cols[2]!) / 2, t + 72, { size: 7, align: 'c' })
  p.text(grouped(l.qty, 3), cols[3]! - 6, t + 72, { size: 9, align: 'r' })
  p.text(grouped(l.rate, 2), cols[4]! - 6, t + 72, { size: 9, align: 'r' })
  p.text(grouped(l.amount, 2), R - 4, t + 72, { size: 9, align: 'r' })
  p.text('Total', cols[4]! - 20, t + 108, { size: 9, font: 'F2', align: 'r' })
  p.box(cols[4]!, t + 92, R - cols[4]!, 26)
  p.text(grouped(l.amount, 2), R - 4, t + 109, { size: 9, align: 'r' })
  p.line(L, t + 118, R, t + 118)
  // Words and the signature block
  const w = t + 130
  p.text('Amount Chargeable - in words', L + 4, w, { size: 9, font: 'F2' })
  const after = p.para(amountInWords(l.amount, l.currency), L + 4, w + 13, R - L - 8, { size: 8 })
  p.text('PAYABLE TO :', L + 4, after + 1, { size: 9, font: 'F2' })
  const foot = top + 750 - 112
  p.line(L, foot, R, foot)
  p.line(M - 28, foot, M - 28, top + 750)
  p.text('Declaration:', L + 4, foot + 14, { size: 9, font: 'F2' })
  p.para('We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.', L + 4, foot + 26, M - 28 - L - 10, { size: 8 })
  p.text('Signature & Date', M - 24, foot + 14, { size: 9, font: 'F2' })
  p.text('For', M + 30, top + 750 - 10, { size: 9, font: 'F2' })
  p.text(seller.name, M + 46, top + 750 - 10, { size: 9 })
  return buildPdf([p], `Commercial Invoice ${l.invNo}`, logo)
}

/* ------------------------------------------------------------------ Sales document (addendum) */

/** The addendum of the sale order of one leg: Sales_doc-<soNo>.pdf (two pages). */
export function salesDocPdf(l: PdfLeg, logo?: Logo, companies?: Companies): Uint8Array {
  const seller = party(l.sellerCode, companies)
  const buyer = party(l.buyerCode, companies)
  const date = longDate(l.invDate)
  const effective = longDate(l.soDate)
  const letterhead = (p: Page) => {
    brand(p, logo)
    p.text(seller.name, 430, 52, { size: 7, font: 'F2' })
    let y = 61
    for (const s of seller.lines) y = p.para(s, 430, y, 140, { size: 7, lead: 9 })
  }
  const field = (p: Page, label: string, value: string[], y: number, bold = false): number => {
    p.text(label, 64, y, { size: 10, font: 'F2' })
    p.text(': ', 190, y, { size: 10, font: 'F2' })
    let at = y
    value.forEach((v) => {
      p.text(v, 199, at, { size: 10, font: bold ? 'F2' : 'F1' })
      at += 13
    })
    return Math.max(y + 28, at + 14)
  }
  const partyLines = (x: Party) => [`${x.name},`, ...x.lines]

  const a = new Page()
  letterhead(a)
  let y = 200
  y = field(a, 'MASTER CONTRACT', [l.masterContract], y, true)
  y = field(a, 'DATE', [date], y + 6, true)
  y = field(a, 'EFFECTIVE DATE', [effective], y + 6, true)
  y = a.para(`Consistent with the agreement reached by the Seller and the Buyer in ${effective},the Parties hereto have executed this Addendum on the ${date} with effect from the ${effective}`, 64, y + 4, 470, { size: 9.5, font: 'F2' })
  y = field(a, 'ORDER NO', [l.soNo], y + 22, true)
  y = field(a, 'BUYER', partyLines(buyer), y + 4)
  y = field(a, 'SELLER', partyLines(seller), y + 4)
  y = field(a, 'PRODUCT', [l.commodity.toUpperCase()], y)
  y = field(a, 'QUANTITY', [`${grouped(l.qty, 3)} MT`], y)
  y = field(a, 'PRICE', [`${grouped(l.rate, 2)} ${l.currency} / MT`], y)
  y = field(a, 'PAYMENT TERMS', [`Payment due date ${longDate(l.dueDate)}`], y + 6)
  y = field(a, 'VESSEL', ['As per Annexure'], y, true)
  y = field(a, 'BL DATE', ['As per Annexure'], y, true)
  field(a, 'SHIPMENT TERM', [l.incoterms], y, true)

  const b = new Page()
  letterhead(b)
  let z = 200
  z = field(b, 'PORT OF SHIPMENT', ['As per Annexure'], z, true)
  z = field(b, 'PORT OF DISCHARGE', ['As per Annexure'], z, true)
  b.text('PAYMENT :', 64, z + 4, { size: 10, font: 'F2' })
  z = b.para(`The Buyer will pay the Seller 100 percent value of the Goods as evidenced in the Seller's commercial invoice via electronic transfer of funds at fixed maturity date ${longDate(l.dueDate)} against presentation of the following documents by the Seller to the Buyer.`, 64, z + 18, 470, { size: 10, font: 'F2' })
  b.para('- One photocopy or fax copy commercial invoice(s).', 64, z + 4, 470, { size: 10, font: 'F2' })
  b.para('- One photocopy or fax copy non-negotiable ocean bill(s) of lading.', 64, z + 18, 470, { size: 10, font: 'F2' })
  b.text('AUTHORISED SIGNATORY FOR', 64, 765, { size: 9, font: 'F2' })
  b.text(seller.name, 64, 777, { size: 9, font: 'F2' })
  b.text('AUTHORISED SIGNATORY FOR', 300, 765, { size: 9, font: 'F2' })
  b.text(buyer.name, 300, 777, { size: 9, font: 'F2' })
  return buildPdf([a, b], `Sales document ${l.soNo}`, logo)
}

/* ------------------------------------------------------------------ the files, and their download */

/** A generated document with what it belongs to: Deal ID, trade leg, the leg's invoice number and the kind. */
export type PdfFile = { name: string; bytes: Uint8Array; dealId: string; leg: string; invNo: string; kind: 'invoice' | 'sales-doc' }

/** Sales_Invoice-{trade invoice number}-{leg}.pdf and Sales_doc-{Deal ID}-{leg}.pdf, safe characters only. */
const safe = (v: string): string => v.replace(/[^A-Za-z0-9._-]+/g, '_')
export const invoiceFileName = (l: Pick<PdfLeg, 'invNo' | 'legId'>): string => `Sales_Invoice-${safe(l.invNo)}-${safe(l.legId)}.pdf`
export const salesDocFileName = (l: Pick<PdfLeg, 'dealId' | 'legId'>): string => `Sales_doc-${safe(l.dealId)}-${safe(l.legId)}.pdf`

/** Every file the confirmed deal produces: an invoice and an addendum per leg. */
export function pdfFiles(deal: Deal, logo?: Logo, companies?: Companies): PdfFile[] {
  return pdfLegs(deal).flatMap((l) => [
    { name: invoiceFileName(l), bytes: invoicePdf(l, logo, companies), dealId: l.dealId, leg: l.legId, invNo: l.invNo, kind: 'invoice' as const },
    { name: salesDocFileName(l), bytes: salesDocPdf(l, logo, companies), dealId: l.dealId, leg: l.legId, invNo: l.invNo, kind: 'sales-doc' as const },
  ])
}

/** Hands the files to the browser one after another (a short gap, so it does not drop the later ones). */
export async function downloadPdfs(files: readonly PdfFile[]): Promise<void> {
  for (const f of files) {
    const url = URL.createObjectURL(new Blob([f.bytes as BlobPart], { type: 'application/pdf' }))
    const a = document.createElement('a')
    a.href = url
    a.download = f.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
    await new Promise((r) => window.setTimeout(r, 350))
  }
}
