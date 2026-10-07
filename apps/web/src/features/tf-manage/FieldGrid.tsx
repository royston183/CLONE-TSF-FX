import { DateField } from './DateField.tsx'
import type { Section } from './fields.ts'
import type { SelectOption } from './masters.ts'
import type { TrdFlowRow } from './types.ts'

export type FieldGridProps = {
  section: Section
  draft: TrdFlowRow
  /** Options for a bound <select>: a master's codes where one exists, else the loaded values. */
  optionsFor: (field: keyof TrdFlowRow) => readonly SelectOption[]
  onChange: (field: keyof TrdFlowRow, value: string) => void
  /** The value shown by a `derived` descriptor, which has no column of its own. */
  derivedValue?: (descriptorId: string) => string
}

/**
 * One `.section-box`. Each field is a `.field` wrapper (label stacked directly above its
 * control) so the detail popup's grid columns are whole fields, not raw label/control cells —
 * matching the OTTK modal's own field layout.
 */
export function FieldGrid({ section, draft, optionsFor, onChange, derivedValue }: FieldGridProps) {
  const bodyClass = section.grid
    ? `section-body field-grid ${section.grid}`
    : 'section-body field-grid'

  return (
    <div className="section-box">
      <div className="section-head">{section.heading}</div>
      <div className={bodyClass}>
        {section.fields.map((descriptor) => {
          const bound = descriptor.field
          const derived = descriptor.derived === true
          const value = bound ? (draft[bound] ?? '') : derived ? (derivedValue?.(descriptor.id) ?? '') : ''
          const unmapped = bound === undefined && !derived
          const title = unmapped ? 'No SAP source for this field yet' : undefined

          return (
            <div className="field" key={descriptor.id}>
              <label htmlFor={descriptor.id}>{descriptor.label}</label>
              {descriptor.control === 'select' ? (
                <select
                  id={descriptor.id}
                  value={String(value)}
                  disabled={unmapped}
                  title={title}
                  onChange={(event) => bound && onChange(bound, event.target.value)}
                >
                  <option value="" />
                  {bound
                    ? optionsFor(bound).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))
                    : null}
                  {/* A stored code the master does not list is still shown, not silently blanked. */}
                  {bound && value !== '' && !optionsFor(bound).some((o) => o.value === String(value)) ? (
                    <option value={String(value)}>{String(value)}</option>
                  ) : null}
                </select>
              ) : descriptor.type === 'date' ? (
                <DateField
                  id={descriptor.id}
                  iso={String(value)}
                  disabled={unmapped}
                  readOnly={descriptor.readOnly}
                  title={title}
                  onChange={(next) => bound && onChange(bound, next)}
                />
              ) : (
                <input
                  id={descriptor.id}
                  type="text"
                  // The original right-aligns amounts at a fixed 150px; without the class
                  // a number field renders full-width and breaks the column rhythm.
                  className={descriptor.type === 'number' ? 'amt-input' : undefined}
                  value={String(value)}
                  disabled={unmapped}
                  readOnly={descriptor.readOnly}
                  title={title}
                  onChange={(event) => bound && onChange(bound, event.target.value)}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
