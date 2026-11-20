import { FX_LOGO } from '../fx/logo.ts'

/**
 * The Master Contract confirmation PDF. `mcPdfSections` and `pngSize` are pure (and tested); `buildMcPdf` draws them with jsPDF,
 * which is loaded only when a PDF is asked for. The input is deliberately plain strings and numbers, so any screen can feed it.
 */

export type McPdfChild = {
  type: string
  seller: string
  buyer: string
  side: string
  description: string
  amountUsd: number
  plannedAmount: number
  currency: string
}

export type McPdfInput = {
  mcNumber: string
  reference: string
  status: string
  mcDate: string
  originEntity: string
  entityString: string
  amountUsd: number
  amountOrigin: number
  originCurrency: string
  exchangeRate: number
  tolerance: string
  commodity: string
  commodityDescription: string
  shipStart: string
  shipEnd: string
  paymentTerms: string
  paymentDate: string
  portOfShipment: string
  portOfDestination: string
  fxModel: string
  modelDescription: string
  currencyString: string
  foRemarks: string
  moRemarks: string
  children: McPdfChild[]
}

export type PdfSection = { title: string; rows: [string, string][] }
export type McPdfMeta = { confirmedBy: string; confirmedOn: string }

const num = (n: number, decimals = 2) =>
  n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
const text = (s: string | undefined | null) => (s && s.trim() ? s : '—')

/** The details of one Master Contract as titled sections of label / value rows; empty values print as a dash. */
export function mcPdfSections(mc: McPdfInput): PdfSection[] {
  return [
    {
      title: 'Basic Details',
      rows: [
        ['Status', text(mc.status)],
        ['MC Number', text(mc.mcNumber)],
        ['MC Reference No', text(mc.reference)],
        ['MC Date', text(mc.mcDate)],
        ['Origin Entity', text(mc.originEntity)],
        ['Entity String', text(mc.entityString)],
      ],
    },
    {
      title: 'Financial Details',
      rows: [
        ['MC Amount (USD)', `${num(mc.amountUsd)} USD`],
        ['MC Amount (Origin)', `${num(mc.amountOrigin)} ${mc.originCurrency}`.trim()],
        ['Exchange Rate', num(mc.exchangeRate, 4)],
        ['Tolerance %', text(mc.tolerance)],
      ],
    },
    {
      title: 'Commodity Details',
      rows: [
        ['Commodity', text(mc.commodity)],
        ['Commodity Description', text(mc.commodityDescription)],
      ],
    },
    {
      title: 'Shipment & Payment Details',
      rows: [
        ['Shipment Start', text(mc.shipStart)],
        ['Shipment End', text(mc.shipEnd)],
        ['Payment Terms', text(mc.paymentTerms)],
        ['Payment Date', text(mc.paymentDate)],
        ['Port of Shipment', text(mc.portOfShipment)],
        ['Port of Destination', text(mc.portOfDestination)],
      ],
    },
    {
      title: 'FX Model Details',
      rows: [
        ['FX Model', [mc.fxModel, mc.modelDescription].filter(Boolean).join(' - ') || '—'],
        ['Currency String', text(mc.currencyString)],
      ],
    },
    {
      title: 'Remarks',
      rows: [
        ['FO Remarks', text(mc.foRemarks)],
        ['MO Remarks', text(mc.moRemarks)],
      ],
    },
  ]
}

/** Width and height of a PNG data URL, read from its IHDR chunk; null when it is not a PNG. */
export function pngSize(dataUrl: string): { width: number; height: number } | null {
  const base64 = dataUrl.split(',')[1]
  if (!base64) return null
  const head = typeof atob === 'function' ? atob(base64.slice(0, 40)) : Buffer.from(base64.slice(0, 40), 'base64').toString('binary')
  if (head.charCodeAt(1) !== 0x50 || head.charCodeAt(2) !== 0x4e || head.charCodeAt(3) !== 0x47) return null
  const at = (i: number) => (head.charCodeAt(i) << 24) | (head.charCodeAt(i + 1) << 16) | (head.charCodeAt(i + 2) << 8) | head.charCodeAt(i + 3)
  return { width: at(16) >>> 0, height: at(20) >>> 0 }
}

const BLUE: [number, number, number] = [8, 84, 160]
const INK: [number, number, number] = [29, 45, 62]
const MUTED: [number, number, number] = [92, 112, 133]
const TINT: [number, number, number] = [234, 242, 255]
const LINE: [number, number, number] = [225, 233, 242]

/** The confirmation PDF of one or several Master Contracts (one page, or more, per contract), with the company logo. */
export async function buildMcPdf(mcs: McPdfInput[], meta: McPdfMeta): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210
  const M = 15
  const size = pngSize(FX_LOGO)

  mcs.forEach((mc, index) => {
    if (index > 0) doc.addPage()
    let y = 12
    const logoH = 16
    const logoW = size ? Math.min(40, (logoH * size.width) / size.height) : 0
    if (size) doc.addImage(FX_LOGO, 'PNG', M, y, logoW, logoH)
    const left = M + logoW + (logoW ? 6 : 0)
    doc.setTextColor(...BLUE).setFont('helvetica', 'bold').setFontSize(17)
    doc.text('Master Contract Confirmation', left, y + 7)
    doc.setTextColor(...MUTED).setFont('helvetica', 'normal').setFontSize(10)
    doc.text(`MC ${mc.mcNumber}${mc.reference ? ` · ${mc.reference}` : ''}`, left, y + 13)
    y += logoH + 5
    doc.setDrawColor(...LINE).setLineWidth(0.4).line(M, y, W - M, y)
    y += 8

    const room = (needed: number) => {
      if (y + needed > 276) {
        doc.addPage()
        y = 18
        doc.setTextColor(...MUTED).setFont('helvetica', 'normal').setFontSize(8)
        doc.text(`Master Contract ${mc.mcNumber} (continued)`, M, 12)
      }
    }

    for (const section of mcPdfSections(mc)) {
      room(16)
      doc.setFillColor(...TINT).rect(M, y, W - 2 * M, 7, 'F')
      doc.setTextColor(...BLUE).setFont('helvetica', 'bold').setFontSize(10)
      doc.text(section.title.toUpperCase(), M + 3, y + 4.9)
      y += 10
      for (const [label, value] of section.rows) {
        const lines = doc.setFont('helvetica', 'normal').setFontSize(10).splitTextToSize(value, W - 2 * M - 62) as string[]
        const height = lines.length * 4.7 + 2.2
        room(height)
        doc.setTextColor(...MUTED).setFont('helvetica', 'normal').setFontSize(9.5)
        doc.text(label, M + 3, y + 3.6)
        doc.setTextColor(...INK).setFont('helvetica', 'bold').setFontSize(10)
        doc.text(lines, M + 62, y + 3.6)
        y += height
        doc.setDrawColor(...LINE).setLineWidth(0.2).line(M + 3, y - 0.6, W - M - 3, y - 0.6)
      }
      y += 5
    }

    if (mc.children.length) {
      room(24)
      doc.setFillColor(...TINT).rect(M, y, W - 2 * M, 7, 'F')
      doc.setTextColor(...BLUE).setFont('helvetica', 'bold').setFontSize(10)
      doc.text('CHILD CONTRACTS', M + 3, y + 4.9)
      y += 10
      const cols: [string, number, boolean][] = [
        ['Type', 0, false], ['Description', 12, false], ['Sell', 48, false], ['Buy', 64, false],
        ['Side', 80, false], ['MC Amt (USD)', 124, true], ['Planned Inv Amt', 154, true], ['Curr', 158, false],
      ]
      const draw = (cells: string[], bold: boolean) => {
        doc.setTextColor(...INK).setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(8.5)
        cols.forEach(([, x, right], i) => {
          const at = M + 3 + x
          if (right) doc.text(cells[i] ?? '', at, y + 3.4, { align: 'right' })
          else doc.text(cells[i] ?? '', at, y + 3.4)
        })
        y += 6
        doc.setDrawColor(...LINE).setLineWidth(0.2).line(M + 3, y - 0.8, W - M - 3, y - 0.8)
      }
      draw(cols.map(([name]) => name), true)
      for (const ch of mc.children) {
        room(7)
        draw([ch.type, ch.description, ch.seller, ch.buyer, ch.side, num(ch.amountUsd), num(ch.plannedAmount), ch.currency], false)
      }
    }
  })

  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setDrawColor(...LINE).setLineWidth(0.3).line(M, 284, W - M, 284)
    doc.setTextColor(...MUTED).setFont('helvetica', 'normal').setFontSize(8.5)
    doc.text(`Confirmed by ${meta.confirmedBy || '—'} on ${meta.confirmedOn}`, M, 289)
    doc.text(`Page ${p} of ${pages}`, W - M, 289, { align: 'right' })
  }
  return doc.output('blob')
}
