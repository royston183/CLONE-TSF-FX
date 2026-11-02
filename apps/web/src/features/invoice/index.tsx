import { useMemo, useState } from 'react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { COLUMNS } from './columns.ts'
import { DUMMY_DEALS } from './deals.ts'
import { buildLines, calculate, sortLines } from './lines.ts'
import type { InvoiceDeal, InvoiceLine } from './types.ts'
import './invoice.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './invoice.dark.css'

const BRAND_LOGO =
  'https://raw.githubusercontent.com/ryannayak/fs-assets/e82f35a83e28689167b22b4300d4994a249acee0/fs-short-logo.png'

/** The original's toolbar, in its order. Only the wired ones do anything yet. */
const TOOLBAR = [
  { id: 'confirmBtn', label: 'Confirm Invoice Generation', primary: true },
  { id: 'reverseConfirmBtn', label: 'Reverse Confirm Invoice Generation' },
  { id: 'viewBlBtn', label: "View List of BL's" },
  { id: 'refreshBtn', label: 'Refresh' },
  { id: 'pnlBtn', label: 'P&L' },
  { id: 'saveBtn', label: 'Save Data' },
  { id: 'amendBtn', label: 'Amendment' },
  { id: 'amendConfirmBtn', label: 'Amendment Confirm' },
  { id: 'sblcFeeBtn', label: 'SBLC Fee Details' },
  { id: 'printFormBtn', label: 'Print Form' },
  { id: 'mergePdfBtn', label: 'Merge PDF' },
] as const

type SortState = { key: keyof InvoiceLine; direction: 'asc' | 'desc' } | null

export default function InvoiceApp() {
  const [dealId, setDealId] = useState(DUMMY_DEALS[0]?.deal ?? '')
  const [linesByDeal, setLinesByDeal] = useState<Record<string, InvoiceLine[]>>({})
  const [sort, setSort] = useState<SortState>(null)
  const [notice, setNotice] = useState<string>()

  const deal: InvoiceDeal | undefined = DUMMY_DEALS.find((d) => d.deal === dealId)

  // Rows are generated once per deal and then edited in place, as the original does.
  const lines = useMemo(() => {
    if (!deal) return []
    return linesByDeal[deal.deal] ?? buildLines(deal)
  }, [deal, linesByDeal])

  const shown = useMemo(
    () => (sort ? sortLines(lines, sort.key, sort.direction) : lines),
    [lines, sort],
  )

  function setLines(next: InvoiceLine[]) {
    if (!deal) return
    setLinesByDeal((current) => ({ ...current, [deal.deal]: next }))
  }

  function editCell(index: number, key: keyof InvoiceLine, value: string) {
    const next = lines.map((line, i) => (i === index ? { ...line, [key]: value } : line))
    setLines(next)
    setNotice(undefined)
  }

  function toggleSort(key: keyof InvoiceLine) {
    setSort((current) =>
      current && current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    )
  }

  return (
    <div className="invoice">
      <div className="page">
        <div className="header">
          <table className="header-table">
            <tbody>
              <tr>
                <td className="header-left">
                  <div className="ds-head-wrap">
                    <BackButton className="tool-btn" />
                    <img className="ds-mark" alt="Fourth Signal" src={BRAND_LOGO} />
                    <div className="header-title">Amend BLs &amp; Finalise Trade Invoices</div>
                  </div>
                </td>
                <td className="header-right">
                  <span className="ds-conn" id="connIndicator" title="System connected" />
                  <SignOutButton className="tool-btn" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="main">
          <div id="detailScreen" className="screen-visible">
            <div className="toolbar">
              {TOOLBAR.map((button) => (
                <button
                  key={button.id}
                  id={button.id}
                  className={'primary' in button ? 'tool-btn tool-primary' : 'tool-btn'}
                  type="button"
                  onClick={() =>
                    setNotice(
                      `"${button.label}" has no backend yet — this screen has never had a SAP service.`,
                    )
                  }
                >
                  {button.label}
                </button>
              ))}
            </div>

            {notice ? (
              <div className="panel" role="status">
                <div className="panel-body">{notice}</div>
              </div>
            ) : null}

            <div className="panel upper-panel basic-panel">
              <div className="panel-head">
                <table className="panel-head-table">
                  <tbody>
                    <tr>
                      <td className="panel-title">Basic Selection</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="panel-body">
                <table className="details-table">
                  <tbody>
                    <tr>
                      <td className="details-left">
                        <table className="form-table">
                          <tbody>
                            <tr>
                              <td className="label-cell">Deal ID</td>
                              <td>
                                <select
                                  id="dDeal"
                                  className="select-text deal-select"
                                  value={dealId}
                                  onChange={(event) => {
                                    setDealId(event.target.value)
                                    setSort(null)
                                  }}
                                >
                                  {DUMMY_DEALS.map((d) => (
                                    <option key={d.deal} value={d.deal}>
                                      {d.deal}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                            <tr>
                              <td className="label-cell">Entity ID</td>
                              <td>
                                <input
                                  id="dEntity"
                                  className="input-text input-readonly"
                                  type="text"
                                  readOnly
                                  value={deal?.entity ?? ''}
                                />
                              </td>
                            </tr>
                            <tr>
                              <td className="label-cell">Business Area</td>
                              <td>
                                <input
                                  id="dBusa"
                                  className="input-text input-readonly"
                                  type="text"
                                  readOnly
                                  value={deal?.busa ?? ''}
                                />
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                      <td className="details-right">
                        <table className="form-table">
                          <tbody>
                            <tr>
                              <td className="label-cell">SLC Structure</td>
                              <td>
                                <input
                                  id="dStruct"
                                  className="input-text input-readonly"
                                  type="text"
                                  readOnly
                                  value={deal?.structure ?? ''}
                                />
                              </td>
                            </tr>
                            <tr>
                              <td className="label-cell">Deal ID Status</td>
                              <td>
                                <input
                                  id="dStatus"
                                  className="input-text input-readonly"
                                  type="text"
                                  readOnly
                                  value={deal?.status ?? ''}
                                />
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <table className="two-col-table">
              <tbody>
                <tr>
                  <td className="left-col">
                    <PricingPanel
                      title="OTTK Pricing Details"
                      rows={[
                        { id: 'oNo', label: 'OTTK No', value: deal?.ottk },
                        { id: 'oTenor', label: 'LC Tenor', value: deal?.ottk_tenor },
                        { id: 'oCat', label: 'Interest Category', value: deal?.ottk_cat },
                        { id: 'oRate', label: 'Interest Rate', value: deal?.ottk_rate },
                      ]}
                    />
                  </td>
                  <td className="right-col">
                    <PricingPanel
                      title="DTTK Pricing Details"
                      rows={[
                        { id: 'dNo', label: 'DTTK No', value: deal?.dttk },
                        { id: 'dTenor', label: 'LC Tenor', value: deal?.dttk_tenor },
                        { id: 'dCat', label: 'Interest Category', value: deal?.dttk_cat },
                        { id: 'dRate', label: 'Ref. Int. Rate + Sprd', value: deal?.dttk_rate },
                      ]}
                    />
                  </td>
                </tr>
              </tbody>
            </table>

            <div id="adjustedPanel" className="panel adjusted-panel">
              <div className="panel-head">
                <table className="panel-head-table">
                  <tbody>
                    <tr>
                      <td className="panel-title">Adjusted Price / Qty</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="grid-toolbar">
                <div className="grid-toolbar-left">
                  <button
                    id="calcBtn"
                    className="grid-calc-btn"
                    type="button"
                    onClick={() => setLines(calculate(lines))}
                  >
                    Calculate
                  </button>
                  <button
                    id="downloadTableBtn"
                    className="grid-calc-btn"
                    type="button"
                    onClick={() => downloadCsv(shown)}
                  >
                    Download
                  </button>
                  <button
                    id="refreshTableBtn"
                    className="grid-icon-btn"
                    type="button"
                    title="Refresh table"
                    aria-label="Refresh table"
                    onClick={() => {
                      if (deal) setLines(buildLines(deal))
                      setSort(null)
                    }}
                  >
                    {'↻'}
                  </button>
                </div>
              </div>
              <div id="ftiTableWrap" className="table-wrap fti-table-wrap">
                <table id="ftiLineTable" className="data-table fti-table">
                  <thead id="lineHead">
                    <tr>
                      {COLUMNS.map((col) => {
                        const active = sort?.key === col.key
                        return (
                          <th
                            key={col.key}
                            className={col.number ? 'sortable number' : 'sortable'}
                            style={{
                              width: `${col.width}px`,
                              minWidth: `${col.width}px`,
                              maxWidth: `${col.width}px`,
                            }}
                            title={`Sort ${col.label}`}
                            onClick={() => toggleSort(col.key)}
                          >
                            <span className="sort-label">{col.label}</span>
                            <span className="sort-arrows">
                              <span
                                className={active && sort.direction === 'asc' ? 'sort-up on' : 'sort-up'}
                              />
                              <span
                                className={
                                  active && sort.direction === 'desc' ? 'sort-down on' : 'sort-down'
                                }
                              />
                            </span>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody id="lineBody">
                    {shown.map((line, index) => (
                      <tr key={`${line.dealId}-${index}`}>
                        {COLUMNS.map((col) => (
                          <td key={col.key} className={col.number ? 'number' : undefined}>
                            {col.editable ? (
                              <input
                                type="text"
                                className="grid-input"
                                value={line[col.key] ?? ''}
                                onChange={(event) => editCell(index, col.key, event.target.value)}
                              />
                            ) : (
                              (line[col.key] ?? '')
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PricingPanel({
  title,
  rows,
}: {
  title: string
  rows: ReadonlyArray<{ id: string; label: string; value: string | undefined }>
}) {
  return (
    <div className="panel upper-panel pricing-panel">
      <div className="panel-head">
        <table className="panel-head-table">
          <tbody>
            <tr>
              <td className="panel-title">{title}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="panel-body">
        <table className="form-table">
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="label-cell">{row.label}</td>
                <td>
                  <input
                    id={row.id}
                    className="input-text input-readonly"
                    type="text"
                    readOnly
                    value={row.value ?? ''}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** The original's Download button writes the grid out as CSV. */
function downloadCsv(lines: readonly InvoiceLine[]) {
  const escape = (value: string) => `"${String(value ?? '').replace(/"/g, '""')}"`
  const rows = [
    COLUMNS.map((col) => escape(col.label)).join(','),
    ...lines.map((line) => COLUMNS.map((col) => escape(line[col.key] ?? '')).join(',')),
  ]
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'adjusted-price-qty.csv'
  anchor.click()
  URL.revokeObjectURL(url)
}
