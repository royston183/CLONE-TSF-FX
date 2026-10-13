import { useMemo, useState } from 'react'
import { money } from './format.ts'
import { compatibleCreatePool, findMc, txnByRfha, unique, validateCreateDeal } from './logic.ts'
import type { MasterContract, PoolTxn } from './types.ts'

/** "Create Deal": the legacy #createModal, cascading Origin -> MC -> Deal1/Deal2 with a live preview. */
export function CreateModal({
  masterContracts,
  pool,
  onClose,
  onCreate,
}: {
  masterContracts: MasterContract[]
  pool: PoolTxn[]
  onClose: () => void
  onCreate: (mc: MasterContract, a: PoolTxn, b: PoolTxn) => void
}) {
  const origins = useMemo(() => unique(masterContracts.map((m) => m.origin)), [masterContracts])
  const [origin, setOrigin] = useState(origins[0] ?? '')

  const mcsForOrigin = useMemo(() => masterContracts.filter((m) => m.origin === origin), [masterContracts, origin])
  const [mcRef, setMcRef] = useState(mcsForOrigin[0]?.ref ?? '')
  const mc = findMc(masterContracts, mcRef)

  const eligiblePool = useMemo(() => (mc ? compatibleCreatePool(mc, pool) : []), [mc, pool])
  const [deal1, setDeal1] = useState(eligiblePool[0]?.rfha ?? '')
  const [deal2, setDeal2] = useState(eligiblePool[1]?.rfha ?? eligiblePool[0]?.rfha ?? '')
  const [error, setError] = useState('')

  const changeOrigin = (o: string) => {
    setOrigin(o)
    const list = masterContracts.filter((m) => m.origin === o)
    const nextMc = list[0]?.ref ?? ''
    setMcRef(nextMc)
    const nextMcObj = findMc(masterContracts, nextMc)
    const nextPool = nextMcObj ? compatibleCreatePool(nextMcObj, pool) : []
    setDeal1(nextPool[0]?.rfha ?? '')
    setDeal2(nextPool[1]?.rfha ?? nextPool[0]?.rfha ?? '')
    setError('')
  }

  const changeMc = (ref: string) => {
    setMcRef(ref)
    const nextMcObj = findMc(masterContracts, ref)
    const nextPool = nextMcObj ? compatibleCreatePool(nextMcObj, pool) : []
    setDeal1(nextPool[0]?.rfha ?? '')
    setDeal2(nextPool[1]?.rfha ?? nextPool[0]?.rfha ?? '')
    setError('')
  }

  const a = txnByRfha(pool, deal1)
  const b = txnByRfha(pool, deal2)

  const submit = () => {
    const err = validateCreateDeal(mc, a, b)
    if (err) {
      setError(err)
      return
    }
    if (mc && a && b) onCreate(mc, a, b)
  }

  const preview = [a, b].filter((t): t is PoolTxn => !!t)

  return (
    <div className="modal-overlay open" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide">
        <div className="modal-head">
          <div className="modal-title">Create Deal</div>
          <button className="modal-close" type="button" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-section">
            <div className="modal-section-title">Origin Details</div>
            <div className="form-grid four">
              <div className="field">
                <label>Origin</label>
                <select className="select" value={origin} onChange={(e) => changeOrigin(e.target.value)}>
                  {origins.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="modal-section">
            <div className="modal-section-title">MC Details</div>
            <div className="form-grid four">
              <div className="field">
                <label>MC No<span className="req">*</span></label>
                <select className="select" value={mcRef} onChange={(e) => changeMc(e.target.value)}>
                  {mcsForOrigin.map((m) => (
                    <option key={m.ref} value={m.ref}>
                      {m.ref} — {m.desc}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>FX Model</label>
                <input className="input" readOnly value={mc?.model ?? ''} />
              </div>
              <div className="field">
                <label>MC Date</label>
                <input className="input" readOnly value={mc?.mcDate ?? ''} />
              </div>
              <div className="field">
                <label>Ship End</label>
                <input className="input" readOnly value={mc?.shipEnd ?? ''} />
              </div>
              <div className="field">
                <label>MC Amount (USD)</label>
                <input className="input" readOnly value={mc ? money(mc.amount) : ''} />
              </div>
              <div className="field">
                <label>MC Balance Amt (USD)</label>
                <input className="input" readOnly value={mc ? money(mc.balance) : ''} />
              </div>
            </div>
          </div>

          <div className="modal-section">
            <div className="modal-section-title">Deal Details</div>
            <div className="help-note">The SAP program validates that both transactions contain a USD leg and that their end dates are within ±3 days.</div>
            <div className="form-grid two">
              <div className="field">
                <label>Deal 1 Transaction<span className="req">*</span></label>
                <select
                  className="select"
                  value={deal1}
                  onChange={(e) => {
                    setDeal1(e.target.value)
                    setError('')
                  }}
                >
                  {eligiblePool.map((t) => (
                    <option key={t.rfha} value={t.rfha}>
                      {t.rfha} — {t.bukrs} · {t.entity}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Deal 2 Transaction<span className="req">*</span></label>
                <select
                  className="select"
                  value={deal2}
                  onChange={(e) => {
                    setDeal2(e.target.value)
                    setError('')
                  }}
                >
                  {eligiblePool.map((t) => (
                    <option key={t.rfha} value={t.rfha}>
                      {t.rfha} — {t.bukrs} · {t.entity}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ height: 10 }} />
            <div className="form-grid four">
              {preview.map((r, i) => (
                <div key={r.rfha} style={{ display: 'contents' }}>
                  <div className="field">
                    <label>Deal {i + 1} Company Code</label>
                    <input className="input" readOnly value={r.bukrs} />
                  </div>
                  <div className="field">
                    <label>Entity</label>
                    <input className="input" readOnly value={r.entity} />
                  </div>
                  <div className="field">
                    <label>Product Type</label>
                    <input className="input" readOnly value={r.sfhaart} />
                  </div>
                  <div className="field">
                    <label>Start / End</label>
                    <input className="input" readOnly value={`${r.start}  →  ${r.end}`} />
                  </div>
                  <div className="field">
                    <label>Leg 1</label>
                    <input className="input" readOnly value={`${r.side1} ${r.curr1} ${money(r.amt1)}`} />
                  </div>
                  <div className="field">
                    <label>Leg 2</label>
                    <input className="input" readOnly value={`${r.side2} ${r.curr2} ${money(r.amt2)}`} />
                  </div>
                </div>
              ))}
            </div>
            <div className="validation">{error}</div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" type="button" onClick={submit}>
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
