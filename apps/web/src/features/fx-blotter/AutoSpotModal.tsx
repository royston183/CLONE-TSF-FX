import { ENTITIES } from './data.ts'
import { partnerLabel } from './logic.ts'
import { ModalHeader, Overlay, type ModalStack } from './modal.tsx'
import type { AutoSpotForm, BusinessPartner } from './types.ts'

/**
 * Create Spot: the visible fields of the external Auto Spot program (ZSGTSFR_SPOT_CREATE),
 * whose source was never supplied, so nothing is booked.
 */
export function AutoSpotModal({
  modals,
  form,
  partners,
  onChange,
  onCreate,
}: {
  modals: ModalStack
  form: AutoSpotForm
  /** The bank partners only. */
  partners: BusinessPartner[]
  onChange: (patch: Partial<AutoSpotForm>) => void
  onCreate: () => void
}) {
  const close = () => modals.close('autospot')
  return (
    <Overlay id="autospot" modals={modals}>
      <div className="modal-card" style={{ maxWidth: 620 }}>
        <ModalHeader
          title="Create Spot"
          subtitle="Additional Spot Booking - visual simulation of the external Auto Spot program"
          onClose={close}
        />
        <div className="modal-body">
          <div className="autospot-grid">
            <div className="form-field">
              <label>Deal ID</label>
              <input id="spot-deal-id" type="text" readOnly value={form.dealId} />
            </div>
            <div className="form-field">
              <label>FX Deal Type</label>
              <input id="spot-fx-type" type="text" value="DS1" readOnly />
            </div>
            <div className="form-field">
              <label>DSS Deal Type</label>
              <input id="spot-dss-type" type="text" value="DSS2" readOnly />
            </div>
            <div className="form-field">
              <label>Company Code</label>
              <select id="spot-company" value={form.company} onChange={(e) => onChange({ company: e.target.value })}>
                {ENTITIES.map((e) => (
                  <option key={e.code} value={e.code}>
                    {e.code} - {e.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field span2">
              <label>Transaction Type</label>
              <input id="spot-txn-type" type="text" value="609 SPOT-SETTLEMENT" readOnly />
            </div>
            <div className="form-field">
              <label>Trade Date</label>
              <input id="spot-trade-date" type="text" readOnly value={form.tradeDate} />
            </div>
            <div className="form-field">
              <label>Value Date</label>
              <input id="spot-value-date" type="text" readOnly value={form.valueDate} />
            </div>
            <div className="form-field span2">
              <label>Business Partner</label>
              <select id="spot-bp" value={form.bp} onChange={(e) => onChange({ bp: e.target.value })}>
                {partners.map((b) => (
                  <option key={b.code} value={b.code}>
                    {partnerLabel(b)}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Spot Rate</label>
              <input
                id="spot-rate"
                type="text"
                value={form.rate}
                onChange={(e) => onChange({ rate: e.target.value })}
              />
            </div>
            <div className="form-field" />
            <div className="form-field">
              <label>Buy</label>
              <input id="spot-buy-curr" type="text" value={form.buyCurr} readOnly />
            </div>
            <div className="form-field">
              <label>Buy Amount</label>
              <input
                id="spot-buy-amt"
                type="text"
                value={form.buyAmt}
                onChange={(e) => onChange({ buyAmt: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Sell</label>
              <input id="spot-sell-curr" type="text" value={form.sellCurr} readOnly />
            </div>
            <div className="form-field">
              <label>Sell Amount</label>
              <input
                id="spot-sell-amt"
                type="text"
                value={form.sellAmt}
                onChange={(e) => onChange({ sellAmt: e.target.value })}
              />
            </div>
          </div>
          <div className="validation-box warn" style={{ marginBottom: 0 }}>
            The supplied ABAP delegates Auto Spot to <strong>ZSGTSFR_SPOT_CREATE</strong>. This popup reproduces the
            visible fields from the screenshot; creation remains a standalone simulation.
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-cancel" onClick={close}>
            Cancel
          </button>
          <button type="button" className="btn-confirm" onClick={onCreate}>
            Create Spot
          </button>
        </div>
      </div>
    </Overlay>
  )
}
