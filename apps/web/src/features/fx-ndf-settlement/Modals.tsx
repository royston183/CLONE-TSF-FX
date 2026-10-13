import type { ReactNode } from 'react'
import { formatAmount, formatRate, formatSwap, isoToDmy } from './format.ts'
import { letterDealTable, runSummary, statusText } from './logic.ts'
import { ModalFrame, type Modal } from './modal.tsx'
import type { ConfirmRequest, Deal, LetterModel, RunView } from './types.ts'

/** One label / value pair of a detail grid; an empty value shows a dash. */
function DetailItem({ label, value, full }: { label: string; value: string | number | null | undefined; full?: boolean }) {
  return (
    <div className={`detail-item${full ? ' full' : ''}`}>
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value === '' || value === null || value === undefined ? <span className="cell-muted">—</span> : value}</span>
    </div>
  )
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="detail-section">
      <div className="detail-section-title">{title}</div>
      <div className="detail-grid">{children}</div>
    </div>
  )
}

/** Transaction Details (hotspot: Transaction No) — TB_TRANSACTION_TO_DISPLAY. */
export function TransactionModal({ modal, row }: { modal: Modal; row: Deal | null }) {
  return (
    <ModalFrame
      id="dealModal"
      modal={modal}
      title="Transaction Details"
      width="w-md"
      sub={row ? `${row.rfha} · ${row.bukrs} · Display` : ''}
      subId="dealModalSub"
    >
      <div className="modal-body-scroll" id="dealModalBody">
        {row ? (
          <>
            <DetailSection title="Transaction">
              <DetailItem label="Transaction No" value={row.rfha} />
              <DetailItem label="Status" value={statusText(row.txn_status)} />
              <DetailItem label="Company Code" value={row.bukrs} />
              <DetailItem label="Company Name" value={row.butxt.slice(7)} />
              <DetailItem label="TSF Entity" value={row.zcom_id} />
              <DetailItem label="TSF Deal ID" value={row.ztsf_deal_id} />
              <DetailItem label="MC Reference No" value={row.ztsf_mc_ref_no} />
              <DetailItem label="Product Type" value={row.ltx} />
              {/* ZSGTSFV_FX-XTEXT already reads "<sfhaart> - <text>" */}
              <DetailItem label="Transaction Type" value={row.xtext || row.sfhaart} />
              <DetailItem label="Trader" value={row.rdealer} />
              <DetailItem label="Business Area" value={`${row.rbusa} - ${row.ba_name}`} />
              <DetailItem label="Profit Center" value={`${row.prctr} - ${row.pc_name}`} />
              <DetailItem label="Portfolio" value={row.rportb} />
              <DetailItem label="Accounting Category" value={row.xportb} />
            </DetailSection>
            <DetailSection title="Business Partner">
              <DetailItem label="Business Partner" value={row.kontrh} />
              <DetailItem label="Partner Name" value={row.bp_name} />
              <DetailItem label="Contact Person" value={row.gsppart} />
              <DetailItem label="External Reference" value={row.nordext} />
              <DetailItem label="Internal Reference" value={row.refer} />
            </DetailSection>
            <DetailSection title="Currencies and Amounts">
              <DetailItem label="Buy/Sell 1" value={row.bs_1} />
              <DetailItem label="Buy/Sell 2" value={row.bs_2} />
              <DetailItem label="Currency 1" value={row.curr1} />
              <DetailItem label="Amount 1" value={formatAmount(row.amt1)} />
              <DetailItem label="Currency 2" value={row.curr2} />
              <DetailItem label="Amount 2" value={formatAmount(row.amt2)} />
              <DetailItem label="Spot Rate" value={formatRate(row.ospot)} />
              <DetailItem label="Swap Rate" value={formatSwap(row.oswap)} />
              <DetailItem label="All in Rate" value={formatRate(row.otot_rate)} />
              <DetailItem label="Currency Pair" value={row.cpair} />
            </DetailSection>
            <DetailSection title="NDF Fixing and Settlement">
              <DetailItem label="Trade Date" value={isoToDmy(row.dblfz)} />
              <DetailItem label="Value Date" value={isoToDmy(row.delfz)} />
              <DetailItem label="Fixing Date" value={isoToDmy(row.ndf_date)} />
              <DetailItem label="Fixing Reference ID" value={row.ndf_ref} />
              <DetailItem label="NDF Rate" value={formatRate(row.ndf_rate)} />
              <DetailItem label="Cash Currency" value={row.cash_curr} />
              <DetailItem label="Cash Amount" value={formatAmount(row.zcash_amt)} />
              <DetailItem label="FI Document" value={row.fi_doc} />
            </DetailSection>
            <DetailSection title="Remarks and Audit">
              <DetailItem label="FO Remark" value={row.fo_remark} />
              <DetailItem label="MO Remark" value={row.mo_remark} />
              <DetailItem label="NDF FO Remark" value={row.ndf_fo_rem} />
              <DetailItem label="NDF MO Remark" value={row.ndf_mo_rem} />
              <DetailItem label="Entered By" value={row.cruser} />
              <DetailItem label="Entered On" value={isoToDmy(row.dcrdat)} />
              <DetailItem label="Last Changed By" value={row.upuser} />
              <DetailItem label="Changed On" value={isoToDmy(row.dupdat)} />
            </DetailSection>
          </>
        ) : null}
      </div>
    </ModalFrame>
  )
}

/** FI Document (hotspot: FI Document) — FB03. */
export function FiDocumentModal({ modal, row }: { modal: Modal; row: Deal | null }) {
  return (
    <ModalFrame id="fiModal" modal={modal} title="FI Document" width="w-sm">
      <div className="modal-body-scroll" id="fiModalBody">
        {row ? (
          <div className="detail-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <DetailItem label="Company Code" value={row.bukrs} />
            <DetailItem label="Document Number" value={row.fi_doc} />
            <DetailItem label="Fiscal Year" value={row.delfz.slice(0, 4)} />
            <DetailItem label="Document Type" value="TR" />
            <DetailItem label="Reference" value={row.rfha} />
            <DetailItem label="Currency" value={row.cash_curr} />
            <DetailItem label="Reference Key 2" value="TSF" />
          </div>
        ) : null}
      </div>
    </ModalFrame>
  )
}

/** Bank Settlement: the letter preview (screen 9001). */
export function LetterModal({ modal, model }: { modal: Modal; model: LetterModel | null }) {
  const m = model
  const table = m ? letterDealTable(m) : null
  const isNum = (i: number) => !!table && table.numIdx.includes(i)
  return (
    <ModalFrame id="letterModal" modal={modal} title="Bank Settlement" width="w-lg">
      <div className="modal-body-scroll" id="letterBody">
        {m && table ? (
          <div className="letter">
            {m.addrNote ? <div className="run-note">{m.addrNote}</div> : null}
            <div className="l-date">{m.addr.zdate}</div>
            <div className="l-bank">{m.addr.zbank}</div>
            <div>{m.addr.zaddr1}</div>
            <div>{m.addr.zaddr2}</div>
            <div>{m.addr.zaddr3}</div>
            <div className="l-attn">{m.addr.zattn}</div>
            <div className="l-re">
              <b>RE:</b>
              {m.reg}
            </div>
            <div className="l-vdate">{m.addr.zvdate}</div>
            <div className="l-grid">
              <table className="popup-table">
                <thead>
                  <tr>
                    {table.heads.map((h, i) => (
                      <th key={h} className={isNum(i) ? 'num' : undefined}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {table.vals.map((v, i) => (
                      <td key={table.heads[i]} className={isNum(i) ? 'num mono' : undefined}>
                        {v}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="l-grid">
              <table className="popup-table">
                <thead>
                  <tr>
                    <th>Account Details</th>
                  </tr>
                </thead>
                <tbody>
                  {m.lines.map((l, i) => (
                    <tr key={i}>
                      <td>{l}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="l-sign">
              <div className="l-auth">Authorized Signatories</div>
              <div className="l-faith">Yours Faithfully</div>
              <div className="l-co">{m.company}</div>
            </div>
          </div>
        ) : null}
      </div>
    </ModalFrame>
  )
}

/** The posting-run result (test run, single post, or Execute with Posting). */
export function RunModal({ modal, view }: { modal: Modal; view: RunView | null }) {
  const sum = view ? runSummary(view.results) : { would: 0, posted: 0, already: 0 }
  return (
    <ModalFrame id="runModal" modal={modal} title={view?.title ?? 'Posting Run'} titleId="runModalTitle" width="w-md">
      <div className="modal-body-scroll" id="runModalBody">
        {view ? (
          <>
            <table className="param-table">
              <tbody>
                {view.params.map((p) => (
                  <tr key={p[0]}>
                    <td>{p[0]}</td>
                    <td>{p[1]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="run-summary">
              {sum.would ? (
                <span>
                  <b>{sum.would}</b> would be posted
                </span>
              ) : null}
              {sum.posted ? (
                <span>
                  <b>{sum.posted}</b> posted
                </span>
              ) : null}
              {sum.already ? (
                <span>
                  <b>{sum.already}</b> already posted
                </span>
              ) : null}
            </div>
            <div className="popup-table-wrap">
              <table className="popup-table">
                <thead>
                  <tr>
                    <th>Company Code</th>
                    <th>Transaction No</th>
                    <th>Key Date</th>
                    <th>Result</th>
                    <th>FI Document</th>
                  </tr>
                </thead>
                <tbody>
                  {view.results.map((r) => (
                    <tr key={`${r.bukrs}|${r.rfha}`}>
                      <td>{r.bukrs}</td>
                      <td className="mono">{r.rfha}</td>
                      <td className="mono">{isoToDmy(r.keyDate)}</td>
                      <td>
                        <span className={r.cls}>{r.result}</span>
                      </td>
                      <td className="mono">{r.fiDoc ? r.fiDoc : <span className="cell-muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="run-note">{view.notes}</div>
          </>
        ) : null}
      </div>
    </ModalFrame>
  )
}

/** Confirmation before TBB1 Post and Execute with Posting; only its buttons and Escape close it. */
export function ConfirmModal({
  modal,
  request,
  onConfirm,
}: {
  modal: Modal
  request: ConfirmRequest | null
  onConfirm: () => void
}) {
  const isPost = request?.kind !== 'postAll'
  return (
    <ModalFrame
      id="confirmModal"
      modal={modal}
      title={isPost ? 'TBB1 Post' : 'Execute with Posting'}
      titleId="confirmTitle"
      width="w-sm"
      scrollable={false}
      closeOnBackdrop={false}
      actions={
        <div className="modal-actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn btn-secondary" onClick={modal.close}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" id="btnConfirmOk" onClick={onConfirm}>
            {isPost ? 'Post' : 'Post All'}
          </button>
        </div>
      }
    >
      <div id="confirmBody">
        {request?.kind === 'post' ? (
          <p className="confirm-body">
            Post transaction <b>{request.row.rfha}</b> ({request.row.bukrs}) with key date <b>{isoToDmy(request.row.delfz)}</b>?
          </p>
        ) : null}
        {request?.kind === 'postAll' ? (
          <p className="confirm-body">
            Post all <b>{request.count}</b> deal(s) in the current selection with key date <b>{isoToDmy(request.keyDate)}</b>, then reload
            the list?
          </p>
        ) : null}
        {request ? (
          <p className="confirm-body" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            This runs the posting update and cannot be undone.
          </p>
        ) : null}
      </div>
    </ModalFrame>
  )
}
