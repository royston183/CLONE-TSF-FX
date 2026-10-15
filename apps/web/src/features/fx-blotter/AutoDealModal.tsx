import { useState, type ReactNode } from 'react'
import { DealPickerModal, ViewDealsButton } from '../../shared/ui/DealPickerModal.tsx'
import { entityOf, txnTypeOf } from './data.ts'
import { fmtDate, fmtNum, RATE_DP } from './format.ts'
import { CommitInput } from './inputs.tsx'
import { DateField } from './DateField.tsx'
import {
  autoBpOptions,
  autoEntityOptions,
  assignmentOptions,
  bsOptions,
  currOptions,
  fixingRefOptions,
  mcBalance,
  txnTypeOptions,
} from './logic.ts'
import { ModalHeader, Overlay, type ModalStack } from './modal.tsx'
import type { AutoLeg, AutoLegField, BusinessPartner, MasterContract, Option } from './types.ts'

const AWAITING = <div className="auto-awaiting-mc">Select a Master Contract to derive Deal 1 / Deal 2 details.</div>

/** The editable leg fields validateAutoLegs requires before Create Transaction is enabled. */
const REQUIRED_LEG_FIELDS = new Set(['Trade Date', 'Value Date', 'Partner', 'Amount 1', 'All in Rate'])

const optionList = (items: Option[]) =>
  items.map((o, i) => (
    <option key={`${i}:${o.value}`} value={o.value}>
      {o.label}
    </option>
  ))

/**
 * Auto-create Deals (screen 9006): pick an origin entity and a Master Contract, and both legs
 * are derived from its FX model. Model-derived fields are locked; the rest can be adjusted.
 */
export function AutoDealModal({
  modals,
  origins,
  origin,
  eligible,
  mc,
  legs,
  msgs,
  partners,
  onOrigin,
  onMc,
  onLeg,
  onConfirm,
}: {
  modals: ModalStack
  origins: string[]
  origin: string
  eligible: MasterContract[]
  mc: MasterContract | undefined
  legs: AutoLeg[] | null
  /** The validation lines; empty means both deals are valid. */
  msgs: string[]
  partners: BusinessPartner[]
  onOrigin: (origin: string) => void
  onMc: (mcNumber: string) => void
  onLeg: (index: number, field: AutoLegField, value: string) => void
  onConfirm: () => void
}) {
  const close = () => modals.close('auto')
  const ready = !!(mc && legs)
  const ok = ready && msgs.length === 0
  const [mcPickerOpen, setMcPickerOpen] = useState(false)

  return (
    <>
    <Overlay id="auto" modals={modals} closeOnBackdrop={false}>
      <div className="modal-card" style={{ maxWidth: 'min(880px, calc(100vw - 40px))' }}>
        <ModalHeader
          title="Auto Deal Creation"
          subtitle="Master Contract driven two-leg FX creation (Screen 9006 reference)"
          onClose={close}
        />
        <div className="modal-body">
          <div className="section-label">MC Details</div>
          <div className="auto-mc-entry-grid">
            <div className="form-field">
              <label htmlFor="auto-origin">Origin Entity</label>
              <select id="auto-origin" value={origin} onChange={(e) => onOrigin(e.target.value)}>
                {origins.map((code) => (
                  <option key={code} value={code}>
                    {code} - {entityOf(code)?.name ?? code}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="auto-mc">
                MC Ref No<span className="req">*</span>
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id="auto-mc"
                  readOnly
                  placeholder="Select MC Ref No"
                  value={mc ? `${mc.mcNumber} - ${mc.modelDesc}` : ''}
                  style={{ flex: 1, cursor: 'pointer' }}
                  onClick={() => setMcPickerOpen(true)}
                />
                <ViewDealsButton label="View MCs" onClick={() => setMcPickerOpen(true)} />
              </div>
            </div>
          </div>
          <div id="auto-mc-detail" className="auto-mc-summary">
            {mc
              ? (
                  [
                    ['MC Amount', `USD ${fmtNum(mc.amtUSD)}`],
                    ['MC Available Amount', `USD ${fmtNum(mcBalance(mc))}`],
                    ['MC Date', fmtDate(mc.mcDate)],
                    ['Shipping End Date', fmtDate(mc.shipEnd)],
                  ] as const
                ).map(([label, value]) => (
                  <div className="auto-readonly-field" key={label}>
                    <div className="auto-field-label">{label}</div>
                    <div className="auto-readonly-value">{value}</div>
                  </div>
                ))
              : null}
          </div>
          <div className="section-label">Deal 1 / Deal 2 Details</div>
          <div id="auto-legs-table" className="auto-leg-stack">
            {mc && legs
              ? legs.map((l, idx) => <LegBlock key={l.leg} l={l} idx={idx} partners={partners} onLeg={onLeg} active={modals.isOpen('auto')} />)
              : AWAITING}
          </div>
          <div id="auto-validation">
            {ready ? (
              <div className={`validation-box ${ok ? 'ok' : 'bad'}`}>
                {ok ? (
                  'Both deals are valid. MC/model-derived fields are locked; editable fields will be used for transaction creation.'
                ) : (
                  <ul>
                    {msgs.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-cancel" onClick={close}>
            Cancel
          </button>
          <button type="button" className="btn-confirm" id="auto-confirm-btn" disabled={!ok} onClick={onConfirm}>
            Create Transaction
          </button>
        </div>
      </div>
    </Overlay>
    {mcPickerOpen ? (
      <DealPickerModal
        title="View Master Contracts"
        searchPlaceholder="Search MC Ref No, model, commodity or currency pair..."
        columns={['MC Ref No', 'FX Model', 'Commodity', 'Currency Pair', 'Available (USD)']}
        rows={eligible.map((m) => ({
          dealId: m.mcNumber,
          cells: [m.mcNumber, m.modelDesc, m.commodityDesc, m.currPair, fmtNum(mcBalance(m))],
          text: [m.mcNumber, m.fxModel, m.modelDesc, m.commodityCode, m.commodityDesc, m.currPair].join(' '),
        }))}
        emptyText="No eligible Master Contracts for this origin entity."
        hint="Click a row to select the Master Contract."
        onClose={() => setMcPickerOpen(false)}
        onPick={(id) => {
          setMcPickerOpen(false)
          onMc(id)
        }}
      />
    ) : null}
    </>
  )
}

function LegBlock({
  l,
  idx,
  partners,
  onLeg,
  active,
}: {
  l: AutoLeg
  idx: number
  partners: BusinessPartner[]
  onLeg: (index: number, field: AutoLegField, value: string) => void
  active: boolean
}) {
  const date = (field: AutoLegField, label: string, value: Date | null) => (
    <DateField label={`${l.leg} ${label}`} className="auto-control" value={fmtDate(value)}
      active={active} onCommit={(v) => onLeg(idx, field, v)} />
  )
  const input = (field: AutoLegField, value: string, cls = '') => (
    <CommitInput
      className={cls ? `auto-control ${cls}` : 'auto-control'}
      value={value}
      onCommit={(v) => onLeg(idx, field, v)}
    />
  )
  const select = (field: AutoLegField, opts: Option[], value: string) => (
    <select className="auto-control" value={value} onChange={(e) => onLeg(idx, field, e.target.value)}>
      {optionList(opts)}
    </select>
  )
  const lockedSelect = (opts: Option[], value: string) => (
    <select className="auto-control auto-locked" disabled value={value} onChange={() => {}}>
      {optionList(opts)}
    </select>
  )
  const lockedValue = (value: string) => (
    <input className="auto-control auto-locked num" type="text" value={value} readOnly disabled />
  )

  const fields: Array<[string, ReactNode, boolean?]> = [
    ['Trade Date', date('tradeDate', 'Trade Date', l.tradeDate)],
    ['Value Date', date('valueDate', 'Value Date', l.valueDate)],
    ['Company Code', lockedSelect(autoEntityOptions(), l.entity), true],
    ['Transaction Type', lockedSelect(txnTypeOptions(), l.txnType), true],
    ['Partner', select('partner', autoBpOptions(partners), l.partner)],
    ['B/S 1', lockedSelect(bsOptions(), l.bs), true],
    ['Curr 1', lockedSelect(currOptions(), l.curr1), true],
    ['Amount 1', input('amt1', fmtNum(l.amt1, 2), 'num')],
    ['B/S 2', lockedSelect(bsOptions(), l.bs2), true],
    ['Curr 2', lockedSelect(currOptions(), l.curr2), true],
    ['Amount 2', lockedValue(l.amt2 ? fmtNum(l.amt2, 2) : ''), true],
    ['All in Rate', input('rate', l.rate ? fmtNum(l.rate, RATE_DP) : '', 'num')],
    ['Swap Rate', input('swap', l.swap ? fmtNum(l.swap, 6) : '', 'num')],
    ['Spot Rate', input('spot', l.spot ? fmtNum(l.spot, RATE_DP) : '', 'num')],
    ['Mode of Trade', select('mode', assignmentOptions(), l.mode)],
  ]
  if (txnTypeOf(l.txnType)?.ndf) {
    fields.push(['NDF Fixing Date', date('fixingDate', 'NDF Fixing Date', l.fixingDate)])
    fields.push(['Fixing Ref. ID', select('fixRef', fixingRefOptions(), l.fixRef)])
  }

  return (
    <div className="auto-deal-block">
      <div className="auto-deal-title">{l.leg} - Details</div>
      <div className="auto-deal-grid">
        {fields.map(([label, control, locked]) => (
          <div className={locked ? 'auto-edit-field locked-field' : 'auto-edit-field'} key={label}>
            <div className="auto-field-label">
              {label}
              {REQUIRED_LEG_FIELDS.has(label) ? <span className="req">*</span> : null}
            </div>
            {control}
          </div>
        ))}
      </div>
    </div>
  )
}
