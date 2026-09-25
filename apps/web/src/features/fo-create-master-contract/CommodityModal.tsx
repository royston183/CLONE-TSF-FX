import { useEffect, useState } from 'react'
import { childCommodities } from './data.ts'
import { Overlay, type Modal } from './modal.tsx'

/** Picks the commodities behind C101 "Multiple Commodity". */
export function CommodityModal({
  modal,
  selected,
  onApply,
}: {
  modal: Modal
  selected: readonly string[]
  onApply: (codes: string[]) => void
}) {
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState<string[]>([])
  const [error, setError] = useState(false)
  const isOpen = modal.state === 'open'

  // Every opening starts from the contract's current picks with a clear search.
  useEffect(() => {
    if (!isOpen) return
    setSearch('')
    setError(false)
    setDraft([...selected])
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on opening
  }, [isOpen])

  const ft = search.toLowerCase()
  const list = childCommodities().filter((c) => `${c.code} ${c.name}`.toLowerCase().includes(ft))

  const toggle = (code: string, checked: boolean) =>
    setDraft((d) => (checked ? (d.includes(code) ? d : [...d, code]) : d.filter((x) => x !== code)))

  const apply = () => {
    if (draft.length === 0) {
      setError(true)
      return
    }
    onApply(draft)
    modal.hide()
  }

  return (
    <Overlay modal={modal}>
      <div className="modal modal-left" style={{ width: 420 }}>
        <div className="modal-head-row">
          <h2>Select Commodities</h2>
          <button type="button" className="modal-close-btn" aria-label="Close" onClick={modal.hide}>
            ×
          </button>
        </div>
        <input
          className="control"
          placeholder="Search commodities..."
          style={{ marginBottom: 10 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="commodity-check-list">
          {list.length === 0 ? (
            <div className="dd-empty">No matches found</div>
          ) : (
            list.map((c) => (
              <label key={c.code} className="commodity-check-item">
                <input type="checkbox" checked={draft.includes(c.code)} onChange={(e) => toggle(c.code, e.target.checked)} />{' '}
                <span>
                  {c.code}
                  {'  '}
                  {c.name}
                </span>
              </label>
            ))
          )}
        </div>
        <div className="error-msg" style={{ display: error ? 'block' : 'none', margin: '8px 0 0' }}>
          Select at least one commodity.
        </div>
        <div className="modal-actions" style={{ marginTop: 14 }}>
          <button className="btn btn-secondary" type="button" onClick={modal.hide}>
            Cancel
          </button>
          <button className="btn btn-primary" type="button" onClick={apply}>
            Apply
          </button>
        </div>
      </div>
    </Overlay>
  )
}
