import { CommodityModal } from './CommodityModal.tsx'
import {
  COMMODITIES,
  FX_MODELS,
  MULTI_COMMODITY,
  ORIGIN_ENTITIES,
  PAYMENT_TERMS,
  PORTS,
  findCommodity,
  findEntity,
  findFxModel,
  findPaymentTerm,
} from './data.ts'
import { DateField } from './DateField.tsx'
import { commitAmount } from './format.ts'
import { commodityDescription, originAmount } from './logic.ts'
import { Overlay, useModal, type Modal } from './modal.tsx'
import { SearchDropdown } from './SearchDropdown.tsx'
import type { FieldErrors, FieldKey, FormMode, FormValues } from './types.ts'

const PORT_ITEMS = PORTS.map((name) => ({ name }))
const NBSP = ' '

/**
 * Create / Edit / Copy Master Contract. The values live in the page so it can reset or
 * prefill them; this component only renders them and reports edits.
 */
export function ContractFormModal({
  modal,
  mode,
  sourceMcNumber,
  values,
  errors,
  onChange,
  onClearError,
  onClose,
  onCancel,
  onSave,
}: {
  modal: Modal
  mode: FormMode
  /** The contract being edited or copied, for the title. */
  sourceMcNumber: number | null
  values: FormValues
  errors: FieldErrors
  onChange: (patch: Partial<FormValues>) => void
  onClearError: (key: FieldKey) => void
  onClose: () => void
  onCancel: () => void
  onSave: () => void
}) {
  const commodityModal = useModal()

  const set = (patch: Partial<FormValues>, clear?: FieldKey) => {
    onChange(patch)
    if (clear) onClearError(clear)
  }
  const fieldCls = (key: FieldKey, span: string) => `field ${span}${errors[key] ? ' has-error' : ''}`

  const title =
    mode === 'edit'
      ? `Edit Master Contract — ${sourceMcNumber}`
      : mode === 'copy'
        ? `Copy Master Contract — ${sourceMcNumber}`
        : 'Create Master Contract'

  const entity = findEntity(values.originEntity)
  const fx = findFxModel(values.fxModel)
  const desc = commodityDescription(values)
  const isMulti = values.commodity === MULTI_COMMODITY

  return (
    <>
      <Overlay modal={modal} onBackdrop={onClose}>
        <div className="modal modal-left modal-scrollable create-contract-modal">
          <div className="modal-head-row">
            <h2>{title}</h2>
            <button type="button" className="modal-close-btn" aria-label="Close" onClick={onClose}>
              ×
            </button>
          </div>

          <div className="modal-body-scroll">
            <div className="form-section">
              <div className="section-title">
                <span className="dot" />
                Basic Selection
              </div>
              <div className="section-body">
                <div className="form-grid-12">
                  <div className={fieldCls('originEntity', 'gc-6')}>
                    <label>
                      Origin Entity<span className="req">*</span>
                    </label>
                    <SearchDropdown
                      items={ORIGIN_ENTITIES}
                      selected={entity}
                      keyOf={(e) => e.code}
                      searchText={(e) => `${e.code} ${e.name} ${e.companyCode}`}
                      primaryText={(e) => `${e.code} · ${e.companyCode} · ${e.name}`}
                      displayText={(e) => `${e.code} - ${e.name}`}
                      placeholder="Select origin entity"
                      disabled={mode === 'edit'}
                      onSelect={(e) => set({ originEntity: e.code }, 'originEntity')}
                      onClear={() => set({ originEntity: null })}
                    />
                    <div className="error-msg">Origin Entity is required.</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="form-section">
              <div className="section-title">
                <span className="dot" />
                Basic Details
              </div>
              <div className="section-body">
                <div className="form-grid-12">
                  <div className={fieldCls('mcDate', 'gc-4')}>
                    <label>
                      MC Date<span className="req">*</span>
                    </label>
                    <DateField
                      value={values.mcDate}
                      onChange={(v) => set({ mcDate: v })}
                      onPicked={() => onClearError('mcDate')}
                    />
                    <div className="error-msg">MC Date is required.</div>
                  </div>

                  <div className={fieldCls('mcAmountUsd', 'gc-4')}>
                    <label>
                      MC Amount (USD)<span className="req">*</span>
                    </label>
                    <div className="input-with-suffix">
                      <input
                        className="control text-right"
                        placeholder="0.00"
                        inputMode="decimal"
                        value={values.mcAmountUsd}
                        onChange={(e) => set({ mcAmountUsd: e.target.value }, 'mcAmountUsd')}
                        onBlur={(e) => set({ mcAmountUsd: commitAmount(e.target.value) })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') set({ mcAmountUsd: commitAmount(e.currentTarget.value) })
                        }}
                      />
                      <span className="suffix">USD</span>
                    </div>
                    <div className="error-msg">Enter a valid amount greater than 0.</div>
                  </div>

                  <div className={fieldCls('exchangeRate', 'gc-4')}>
                    <label>
                      Exchange Rate<span className="req">*</span>
                    </label>
                    <input
                      className="control text-right"
                      placeholder="0.000000"
                      inputMode="decimal"
                      value={values.exchangeRate}
                      onChange={(e) => set({ exchangeRate: e.target.value }, 'exchangeRate')}
                    />
                    <div className="error-msg">Must be greater than 0.</div>
                  </div>

                  <div className="field gc-5">
                    <label>MC Reference No</label>
                    <input
                      className="control"
                      placeholder="e.g. MC/OSIPL/2026/001"
                      value={values.mcReference}
                      onChange={(e) => set({ mcReference: e.target.value })}
                    />
                  </div>

                  <div className={fieldCls('tolerance', 'gc-3')}>
                    <label>Tolerance %</label>
                    <input
                      className="control text-right"
                      placeholder="0.000000"
                      inputMode="decimal"
                      value={values.tolerance}
                      onChange={(e) => set({ tolerance: e.target.value })}
                    />
                    <div className="error-msg">Cannot be negative.</div>
                  </div>

                  <div className="field gc-4">
                    <label>MC Amount (Origin)</label>
                    <div className="input-with-suffix">
                      <input className="control text-right" placeholder="0.00" readOnly value={originAmount(values)} />
                      <span className="suffix">{entity ? entity.currency : '—'}</span>
                    </div>
                    <div className="hint">Auto-calculated: USD × rate</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="form-section">
              <div className="section-title">
                <span className="dot" />
                Commodity Details
              </div>
              <div className="section-body">
                <div className="form-grid-12">
                  <div className={fieldCls('commodity', 'gc-5')}>
                    <label>
                      Commodity<span className="req">*</span>
                    </label>
                    <SearchDropdown
                      items={COMMODITIES}
                      selected={findCommodity(values.commodity)}
                      keyOf={(c) => c.code}
                      searchText={(c) => `${c.code} ${c.name}`}
                      primaryText={(c) => `${c.code}${NBSP}${NBSP} ${c.name}`}
                      displayText={(c) => `${c.code} - ${c.name}`}
                      placeholder="Select commodity"
                      onSelect={(c) => {
                        if (c.code === MULTI_COMMODITY) {
                          set({ commodity: c.code }, 'commodity')
                          commodityModal.open()
                        } else {
                          set({ commodity: c.code, selectedCommodities: [] }, 'commodity')
                        }
                      }}
                      onClear={() => set({ commodity: null })}
                    />
                    <div className="error-msg">{isMulti ? 'Select at least one commodity.' : 'Commodity is required.'}</div>
                  </div>

                  <div className="field gc-7">
                    <label>Comm. Description Long</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        className="control"
                        placeholder="Auto-populated"
                        readOnly
                        style={{ paddingRight: 56 }}
                        value={desc.value}
                        title={desc.title}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{
                          display: isMulti ? 'inline-flex' : 'none',
                          position: 'absolute',
                          right: 4,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          height: 24,
                          padding: '0 8px',
                        }}
                        onClick={commodityModal.open}
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="form-section">
              <div className="section-title">
                <span className="dot" />
                Shipment Details
              </div>
              <div className="section-body">
                <div className="form-grid-12">
                  <div className={fieldCls('shipStart', 'gc-3')}>
                    <label>
                      Shipment Start<span className="req">*</span>
                    </label>
                    <DateField
                      value={values.shipStart}
                      onChange={(v) => set({ shipStart: v })}
                      onPicked={() => onClearError('shipStart')}
                    />
                    <div className="error-msg">Required.</div>
                  </div>

                  <div className={fieldCls('shipEnd', 'gc-3')}>
                    <label>
                      Shipment End<span className="req">*</span>
                    </label>
                    <DateField
                      value={values.shipEnd}
                      onChange={(v) => set({ shipEnd: v })}
                      onPicked={() => onClearError('shipEnd')}
                    />
                    <div className="error-msg">Must be ≥ start date.</div>
                  </div>

                  <div className="field gc-6">
                    <label>Payment Terms</label>
                    <SearchDropdown
                      items={PAYMENT_TERMS}
                      selected={findPaymentTerm(values.paymentTerms)}
                      keyOf={(p) => p.code}
                      searchText={(p) => p.label}
                      primaryText={(p) => p.label}
                      displayText={(p) => p.label}
                      placeholder="Select payment terms"
                      onSelect={(p) => set({ paymentTerms: p.code })}
                      onClear={() => set({ paymentTerms: null })}
                    />
                  </div>

                  <div className="field gc-3">
                    <label>Payment Date</label>
                    <DateField value={values.paymentDate} onChange={(v) => set({ paymentDate: v })} />
                  </div>

                  <div className="field gc-4">
                    <label>Port of Shipment</label>
                    <SearchDropdown
                      items={PORT_ITEMS}
                      selected={PORT_ITEMS.find((p) => p.name === values.portShipment)}
                      keyOf={(p) => p.name}
                      searchText={(p) => p.name}
                      primaryText={(p) => p.name}
                      displayText={(p) => p.name}
                      placeholder="Select port"
                      onSelect={(p) => set({ portShipment: p.name })}
                      onClear={() => set({ portShipment: null })}
                    />
                  </div>

                  <div className="field gc-4">
                    <label>Port of Destination</label>
                    <SearchDropdown
                      items={PORT_ITEMS}
                      selected={PORT_ITEMS.find((p) => p.name === values.portDestination)}
                      keyOf={(p) => p.name}
                      searchText={(p) => p.name}
                      primaryText={(p) => p.name}
                      displayText={(p) => p.name}
                      placeholder="Select port"
                      onSelect={(p) => set({ portDestination: p.name })}
                      onClear={() => set({ portDestination: null })}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="form-section">
              <div className="section-title">
                <span className="dot" />
                FX Model Details
              </div>
              <div className="section-body">
                <div className="form-grid-12">
                  <div className={fieldCls('fxModel', 'gc-4')}>
                    <label>
                      FX Model<span className="req">*</span>
                    </label>
                    <SearchDropdown
                      items={FX_MODELS}
                      selected={fx}
                      keyOf={(m) => m.id}
                      searchText={(m) => `${m.code} ${m.desc} ${m.currency}`}
                      primaryText={(m) => `${m.code} - ${m.desc}`}
                      secondaryText={(m) => `Entity: ${m.entity} ${NBSP}|${NBSP} Currency: ${m.currency}`}
                      displayText={(m) => `${m.code} - ${m.desc}`}
                      placeholder="Select FX model"
                      onSelect={(m) => set({ fxModel: m.id }, 'fxModel')}
                      onClear={() => set({ fxModel: null })}
                    />
                    <div className="error-msg">FX Model is required.</div>
                  </div>

                  <div className="field gc-3">
                    <label>Entity String</label>
                    <input className="control" placeholder="Auto-populated" readOnly value={fx ? fx.entity : ''} />
                  </div>

                  <div className="field gc-3">
                    <label>Currency String</label>
                    <input className="control" placeholder="Auto-populated" readOnly value={fx ? fx.currency : ''} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="modal-actions create-modal-actions">
            <button className="btn btn-secondary" type="button" onClick={onCancel}>
              Cancel
            </button>
            <button className="btn btn-primary" type="button" onClick={onSave}>
              {mode === 'edit' ? 'Update Master Contract' : 'Create Master Contract'}
            </button>
          </div>
        </div>
      </Overlay>

      <CommodityModal
        modal={commodityModal}
        selected={values.selectedCommodities}
        onApply={(codes) => set({ selectedCommodities: codes }, 'commodity')}
      />
    </>
  )
}
