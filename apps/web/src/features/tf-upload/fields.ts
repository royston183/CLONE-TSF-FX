import type { CellValue } from './xlsx.ts'

export type FieldType = 'text' | 'date' | 'number'

/**
 * Column index -> OData field, mapped by each field's real DDIC label (dd04t) rather than its
 * frequently misleading technical name — the table's own ZUNIT column is labelled
 * "Contract Price", and ZCPRICE is actually "CMP (MT)".
 *
 * The last four columns follow SE11's own descriptions for ZSGTSFTR_TRDFLOW. They used to be
 * shifted by one: "OGBS Status Desc" landed in ZPOL_CTRY, "POL Country" in ZPOD_CTRY, and
 * "POD Country" in ZOGBS_STAT_ID — a two-character status code — while "Blocked Status Desc"
 * went to ZFLW_STS rather than ZFLW_STAS2, the column SE11 names "Blocked Status Desc".
 *
 * Index 0 and 1 (ZtfNo / ZtfSplit) are the entity key: read separately by uploadRow and never
 * sent inside a PATCH body.
 */
export const TF_FIELD_MAP: ReadonlyArray<{ field: string; type: FieldType }> = [
  { field: 'ZtfNo', type: 'text' },
  { field: 'ZtfSplit', type: 'text' },
  { field: 'ZtfDate', type: 'date' },
  { field: 'Zbu', type: 'text' },
  { field: 'Zoprtr', type: 'text' },
  { field: 'ZblVsslName', type: 'text' },
  { field: 'Zcmmd', type: 'text' },
  { field: 'ZconNum1', type: 'text' },
  { field: 'ZpurInc', type: 'text' },
  { field: 'Zpaypur', type: 'text' },
  { field: 'Zbplsb', type: 'text' },
  { field: 'Zbplbb', type: 'text' },
  { field: 'ZconNum2', type: 'text' },
  { field: 'Zsalesinc', type: 'text' },
  { field: 'Zptss', type: 'text' },
  { field: 'Zbslsb', type: 'text' },
  { field: 'Zbslbb', type: 'text' },
  { field: 'Zotfd', type: 'date' },
  { field: 'Zottd', type: 'date' },
  { field: 'Zquantity', type: 'number' },
  { field: 'Zunit', type: 'number' },
  { field: 'Zcprice', type: 'number' },
  { field: 'Zttv', type: 'number' },
  { field: 'Zpol', type: 'text' },
  { field: 'Zpod', type: 'text' },
  { field: 'Zsldate', type: 'date' },
  { field: 'Zblno', type: 'text' },
  { field: 'Zdays', type: 'text' },
  { field: 'ZetaDsPort', type: 'date' },
  { field: 'Zcob', type: 'text' },
  { field: 'Znotify', type: 'text' },
  { field: 'Zlc', type: 'text' },
  { field: 'Zoentity', type: 'text' },
  { field: 'Zsod', type: 'text' },
  { field: 'Zbod', type: 'text' },
  { field: 'Zaobf13', type: 'date' },
  { field: 'Zaobt13', type: 'date' },
  { field: 'Zaobf33', type: 'date' },
  { field: 'Zaobt33', type: 'date' },
  { field: 'Zremark', type: 'text' },
  { field: 'ZblRcpdt', type: 'date' },
  { field: 'ZflwStas2', type: 'text' },
  { field: 'ZogbsStatDesc', type: 'text' },
  { field: 'ZpolCtry', type: 'text' },
  { field: 'ZpodCtry', type: 'text' },
]

/**
 * ZTFTYPE is CHAR(2) and the domain's own fixed values (dd07v) are 01 Container / 02 Bulk,
 * used in preference to the informal codes seen in some live rows.
 */
export const TF_TYPE_CODES: Record<string, string> = { CONTAINER: '01', BULK: '02' }

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/**
 * An 8-digit SAP DATS value (20241218, as a number or text) as "YYYY-MM-DD", or null when the
 * value is not one.
 *
 * Workbooks exported from SAP carry dates this way, and read as an Excel serial 20241218 is a
 * day in the year 57,000-odd. The two cannot be confused: the serial for 31-12-9999 is
 * 2958465, seven digits, so any 8-digit integer is a DATS value or nothing.
 */
export function datsToIso(value: CellValue | null | undefined): string | null {
  const match = String(value ?? '').trim().match(/^(\d{4})(\d{2})(\d{2})$/)
  if (!match) return null
  const [, y, m, d] = match
  const month = Number(m)
  const day = Number(d)
  if (Number(y) < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${y}-${m}-${d}`
}

/**
 * Excel serial, SAP DATS or ISO text to "YYYY-MM-DD" for the Edm.Date fields, or null when there
 * is nothing usable — a null is skipped rather than sent, so a bad cell never clears a field.
 *
 * The epoch is 1899-12-30, not 1900-01-01: Excel treats 1900 as a leap year, and counting
 * from the 30th absorbs that phantom day.
 *
 * A date before the year 1000 is no date. SAP writes an empty date as its initial value
 * 00000000, and an export renders that as 0001-01-01 or 0001-01-02; the migration turns the
 * same value into NULL (SAP_DATS_TO_DATE_NULL), and the middleware refuses it outright. It
 * is skipped here like any other empty cell, rather than failing the whole row.
 */
export function toIsoDate(value: CellValue | null | undefined): string | null {
  const iso = parseDate(value)
  return iso && Number(iso.slice(0, 4)) >= 1000 ? iso : null
}

function parseDate(value: CellValue | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null

  const dats = datsToIso(value)
  if (dats) return dats

  if (typeof value === 'number') {
    const millis = Date.UTC(1899, 11, 30) + Math.round(value * 86400000)
    const d = new Date(millis)
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
  }

  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  return match ? match[0] : null
}

/**
 * ZtfNo / ZtfSplit are stored zero-padded ("0000000022", "01"), but Excel drops leading
 * zeros, so a plain "22" would address a key that does not exist. Only purely numeric values
 * are padded; anything else passes through untouched.
 */
export function padKey(value: CellValue | null | undefined, length: number): string {
  const text = String(value ?? '').trim()
  return /^\d+$/.test(text) && text.length < length ? text.padStart(length, '0') : text
}

export type CommodityRow = {
  ZcommId?: string
  ZcommDesc?: string
  ZchName1?: string
  ZchName2?: string
}

/** Matched on either commodity name, exactly as ZSGTSF_RTF_UPLOAD's own READ TABLE does. */
export function lookupCommodity(
  zcmmd: unknown,
  rows: readonly CommodityRow[],
): CommodityRow | undefined {
  if (!zcmmd) return undefined
  return rows.find((r) => r.ZchName1 === zcmmd) ?? rows.find((r) => r.ZchName2 === zcmmd)
}

export type BusinessUnit = { code: string; name: string }

/**
 * The request body for one row.
 *
 * Only cells with a value are included, so on UPDATE an empty cell leaves that field
 * untouched on the SAP side rather than clearing it — deliberately safer than
 * ZSGTSF_RTF_UPLOAD's own full-overwrite behaviour.
 *
 * On create the Business Unit name is resolved from the master list by the selected code,
 * ignoring whatever the workbook's own "Business Unit Name" column says; on update that
 * column's text is used as-is. Both match the corresponding branches of that program.
 */
export function buildRowPayload(
  row: readonly CellValue[],
  buCode: string,
  tfTypeCode: string,
  isCreate: boolean,
  businessUnits: readonly BusinessUnit[],
  commodities: readonly CommodityRow[],
): Record<string, string | number> {
  const body: Record<string, string | number> = {}

  for (let i = 2; i < TF_FIELD_MAP.length; i++) {
    const col = TF_FIELD_MAP[i]!
    const raw = row[i]
    if (raw === null || raw === undefined || raw === '') continue

    if (col.type === 'date') {
      const iso = toIsoDate(raw)
      if (iso) body[col.field] = iso
    } else if (col.type === 'number') {
      const num = Number(raw)
      if (Number.isFinite(num)) body[col.field] = num
    } else {
      body[col.field] = String(raw)
    }
  }

  if (buCode) body['ZbuId'] = buCode
  if (tfTypeCode) body['ZtfType'] = tfTypeCode

  if (isCreate && buCode) {
    const unit = businessUnits.find((b) => b.code === buCode)
    if (unit) body['Zbu'] = unit.name
  }

  const commodity = lookupCommodity(body['Zcmmd'], commodities)
  if (commodity) {
    body['ZtrmComId'] = commodity.ZcommId ?? ''
    body['ZtrmComDesc'] = commodity.ZcommDesc ?? ''
    body['ZchName1'] = commodity.ZchName1 ?? ''
    body['ZchName2'] = commodity.ZchName2 ?? ''
  }

  return body
}

/** A blank Trade Flow ID means a genuinely new row; the backend generates the number. */
export function isCreateRow(row: readonly CellValue[]): boolean {
  return !String(row[0] ?? '').trim()
}

/**
 * The key a new trade flow is created under: ZTF_NO left blank, so the middleware issues the
 * next number from the SNRO range, and split 01.
 *
 * Every row with a blank Trade Flow ID is a trade flow of its own and gets a number of its own.
 * That is what SAP's ZSGTSF_RTF_UPLOAD does — its create branch ("IF ztf_no IS INITIAL") draws
 * a new number for each such row and hardcodes split '01' — and what the legacy page did. The
 * workbook's TF Split ID is therefore not used on a create: a split of an existing trade flow
 * is uploaded with that flow's Trade Flow ID filled in, which makes it an update.
 *
 * This deliberately replaces an earlier rule that placed a blank-ID row with split 02 under the
 * new trade flow above it. That inferred a relationship the workbook never states, and it made
 * two uploaded rows share one Trade Flow ID where SAP would have issued two.
 */
export const CREATE_SPLIT = '01'

export function createKey(): { ZtfNo: string; ZtfSplit: string } {
  return { ZtfNo: '', ZtfSplit: CREATE_SPLIT }
}

/** A new BL's status: ZSGTSFTR_BL_STAT 01, BL created and not assigned to a Deal ID. */
export const BL_CREATED_STATUS = '01'

/**
 * Columns ZSGTSFTR_BL holds narrower than ZSGTSFTR_TRDFLOW does. SAP moves a CHAR into a shorter
 * one by truncating it, and the middleware refuses an over-long value outright, so the BL copy
 * is cut to fit rather than failing the BL over a long remark.
 */
const BL_NARROWER: Readonly<Record<string, number>> = { Zbu: 20, Zremark: 80 }

/**
 * The ZSGTSFTR_BL row created with each new trade flow.
 *
 * The BL table repeats the trade flow's columns under the same data elements, so the BL is the
 * trade flow's own payload, keyed as a BL of it:
 *
 *  - ZTF_NO / ZTF_SPLIT: the trade flow it was created with;
 *  - ZBL_NO blank, so the middleware issues the next number from the range mirroring SNRO
 *    ZSGTSFNR02 (4000000001-4999999999) — every BL gets its own, like every trade flow;
 *  - ZBL_SPLIT 01 and ZBL_REUSE blank (SAP's initial value): a first BL, not yet reused;
 *  - ZBL_DATE: the Sailing Date, the date a BL is issued on;
 *  - ZBL_STAT_ID 01, "BL Created" in ZSGTSFTR_BL_STAT — created, not yet assigned to a Deal ID.
 *    Only the code is written; the text is the master's, resolved where it is shown.
 *
 * Trade-flow fields the BL has no column for (ZBU_ID, the country fields, ...) are dropped when
 * the payload is mapped to columns, so nothing needs filtering here.
 */
export function buildBlPayload(
  tradeFlow: Readonly<Record<string, string | number>>,
  tfNo: string,
  tfSplit: string,
): Record<string, string | number> {
  const body: Record<string, string | number> = { ...tradeFlow }
  for (const [field, width] of Object.entries(BL_NARROWER)) {
    const value = body[field]
    if (typeof value === 'string' && value.length > width) body[field] = value.slice(0, width)
  }
  const sailing = tradeFlow['Zsldate']
  return {
    ...body,
    ZtfNo: tfNo,
    ZtfSplit: tfSplit,
    ZblNo: '',
    ZblSplit: CREATE_SPLIT,
    ZblReuse: '',
    ZblStatId: BL_CREATED_STATUS,
    ...(sailing ? { ZblDate: sailing } : {}),
  }
}
