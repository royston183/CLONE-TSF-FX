import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { codeText, fmtDate, fmtNum, parseAmount, toNum } from '@slc/api-client'
import { useAsync, useConnectionState } from '@slc/api-client/react'
import { buildChargeRows, chargesTotal, fmt2, recalcAllRows } from '../../shared/charges.ts'
import { ChargesModal } from '../../shared/ChargesModal.tsx'
import { TicketPanel, derivedOptions, exact, loose } from '../../shared/TicketPanel.tsx'
import type { Col, FilterDef } from '../../shared/TicketPanel.tsx'
import {
  collectTraders,
  createDttk,
  fetchFeeRowsByType,
  loadDttk,
  loadFeeTypes,
  loadLookups,
  loadOttk,
  loadOttkByKey,
  pingBackend,
  syncDttkFeeRows,
  updateDttk,
  withUntouchedFields,
} from './api.ts'
import type { FeeSyncResult } from './api.ts'
import { EMPTY_FORM, formFromRow, toPayload } from './form.ts'
import type { DttkForm } from './form.ts'
import { DttkModal, STRUCTURE_OPTIONS, TYPE1_OPTIONS, TYPE2_OPTIONS } from './DttkModal.tsx'
import { OttkViewModal } from './OttkViewModal.tsx'
import { EMPTY_LOOKUPS } from './types.ts'
import type { ChargeRow, ChargesContext, DttkRow, Lookups, OttkRow } from './types.ts'
import './dttk.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './dttk.dark.css'

/**
 * Distribution Ticket (DTTK).
 *
 * A faithful reproduction of legacy/DTTK.html: this file and its siblings mirror that page
 * element for element and class for class, and dttk.legacy.css is that page's own stylesheet
 * with selectors scoped under .dttk. The shared @slc/ui components are deliberately not used.
 *
 * The charges grid, ticket panel and fee calculation come from src/shared — the OTTK console's
 * originals carry exactly the same markup and rules, so they are written once.
 */

const BRAND_LOGO =
  'https://raw.githubusercontent.com/ryannayak/fs-assets/e82f35a83e28689167b22b4300d4994a249acee0/fs-short-logo.png'

const CHARGES_UI: Record<ChargesContext, { title: string; subtitle: string }> = {
  confirmation: { title: 'Confirmation Fee', subtitle: 'Confirmation Fee breakdown for this DTTK' },
  other: { title: 'Other Charges', subtitle: 'Other Charges breakdown for this DTTK' },
}

function StatusPill({ status }: { status: string | undefined }) {
  const text = status || 'Draft'
  const cls = /open/i.test(text) ? 'open' : /pend/i.test(text) ? 'pending' : 'open'
  return <span className={`status-pill ${cls}`}>{text}</span>
}

function structureMatch<Row extends { Zstr?: string; ZstrText?: string }>(row: Row, value: string): boolean {
  const target = (row.Zstr || row.ZstrText || '').toLowerCase()
  const needle = value.toLowerCase()
  return target.includes(needle) || needle.includes(target)
}

export default function DttkApp() {
  const connection = useConnectionState()
  const [searchParams, setSearchParams] = useSearchParams()

  const [reloadToken, setReloadToken] = useState(0)
  const dttk = useAsync<DttkRow[]>((signal) => loadDttk(signal), [reloadToken])
  const ottk = useAsync<OttkRow[]>((signal) => loadOttk(signal), [reloadToken])
  const lookupsState = useAsync((signal) => loadLookups(signal), [])

  const dttkRows = useMemo(() => dttk.data ?? [], [dttk.data])
  const ottkRows = useMemo(() => ottk.data ?? [], [ottk.data])

  const lookups: Lookups = useMemo(
    () => ({
      ...(lookupsState.data ?? EMPTY_LOOKUPS),
      traders: collectTraders(dttkRows, ottkRows),
    }),
    [lookupsState.data, dttkRows, ottkRows],
  )

  const [toast, setToast] = useState<string>()
  const [selectedDttkKey, setSelectedDttkKey] = useState<string>()
  const [selectedOttkKey, setSelectedOttkKey] = useState<string>()

  const [modalOpen, setModalOpen] = useState(false)
  const [mode, setMode] = useState<'create' | 'edit'>('create')
  const [editKey, setEditKey] = useState('')
  const [statusText, setStatusText] = useState('Draft')
  const [createdBy, setCreatedBy] = useState('')
  const [form, setForm] = useState<DttkForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [amountErrors, setAmountErrors] = useState<Record<string, boolean>>({})

  const [chargesOpen, setChargesOpen] = useState(false)
  const [chargesContext, setChargesContext] = useState<ChargesContext>('other')
  const [chargeState, setChargeState] = useState<Record<ChargesContext, ChargeRow[]>>({
    confirmation: [],
    other: [],
  })
  const [chargeSnapshot, setChargeSnapshot] = useState<ChargeRow[]>([])
  const [chargesLoadedForKey, setChargesLoadedForKey] = useState<string>()

  const [viewOttk, setViewOttk] = useState<OttkRow>()
  const [success, setSuccess] = useState<{ title: string; dttkNo: string; verb: string; fees: FeeSyncResult }>()

  const notify = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(undefined), 2400)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => void pingBackend(), 30_000)
    return () => clearInterval(timer)
  }, [])

  const resetCharges = () => {
    setChargeState({ confirmation: [], other: [] })
    setChargeSnapshot([])
    setChargesLoadedForKey(undefined)
  }

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setAmountErrors({})
    setCreatedBy('')
    resetCharges()
    setMode('create')
    setEditKey('')
    setStatusText('Draft')
    setModalOpen(true)
  }

  const openEdit = useCallback(
    (row: DttkRow) => {
      setForm(formFromRow(row, lookups.ottkBanks))
      setAmountErrors({})
      setCreatedBy(row.ZcreatedBy || row.LocalCreatedBy || '')
      resetCharges()
      setMode('edit')
      setEditKey(row.ZdttkNo ?? '')
      setStatusText(row.ZstatDesc || row.ZdttkSt || 'Draft')
      setModalOpen(true)
    },
    [lookups.ottkBanks],
  )

  /** Copy carries the source ticket's header onto a brand-new one. */
  const onCopy = () => {
    if (!selectedDttkKey) return notify('Select a DTTK line to copy first')
    const row = dttkRows.find((r) => String(r.ZdttkNo) === selectedDttkKey)
    if (!row) return notify('Could not find selected DTTK data')
    setForm(formFromRow(row, lookups.ottkBanks))
    setAmountErrors({})
    setCreatedBy('')
    resetCharges()
    setMode('create')
    setEditKey('')
    setStatusText('Draft')
    setModalOpen(true)
    notify(`DTTK ${selectedDttkKey} copied — review and create`)
  }

  /**
   * Display-only entry points. OTTK and Deal ID link here with ?display=<dttk> or
   * ?displayOttk=<ottk>, which is what the legacy /dttk-view.html route did with its own
   * query parameters. The parameter is cleared once consumed so a refresh does not reopen it.
   */
  useEffect(() => {
    const displayDttk = searchParams.get('display') ?? searchParams.get('displayDttk')
    if (displayDttk && dttkRows.length) {
      const row = dttkRows.find((r) => String(r.ZdttkNo) === displayDttk)
      if (row) openEdit(row)
      else notify(`DTTK ${displayDttk} is not in the open list.`)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, dttkRows, openEdit, notify, setSearchParams])

  useEffect(() => {
    const displayOttk = searchParams.get('displayOttk')
    if (!displayOttk) return
    const known = ottkRows.find((r) => String(r.ZottkNo) === displayOttk)
    if (known) setViewOttk(known)
    else void loadOttkByKey(displayOttk).then((row) => setViewOttk(row ?? undefined))
    setSearchParams({}, { replace: true })
  }, [searchParams, ottkRows, setSearchParams])

  const tradeValueNum = parseAmount(form.tradeValue) ?? toNum(form.tradeValue)

  const openChargesFor = async (context: ChargesContext) => {
    let confirmationTypes = lookups.confirmationFeeTypes
    let otherTypes = lookups.otherFeeTypes
    // A fee-type lookup that failed at load would leave the grid permanently empty with no
    // way back short of reloading the page, so it is retried once here.
    if (!confirmationTypes.length) confirmationTypes = await loadFeeTypes('confirmation')
    if (!otherTypes.length) otherTypes = await loadFeeTypes('other')
    if (!confirmationTypes.length && !otherTypes.length) {
      notify('No fee types available — check the connection and refresh')
    }

    let state = chargeState
    // Both grids are rebuilt from the ticket's stored lines in ONE read, then split by which
    // fee-type list each line belongs to.
    if ((mode === 'edit' && editKey && chargesLoadedForKey !== editKey) || !state[context].length) {
      const byType = mode === 'edit' && editKey ? await fetchFeeRowsByType(editKey).catch(() => ({})) : {}
      state = {
        confirmation: buildChargeRows(confirmationTypes, byType),
        other: buildChargeRows(otherTypes, byType),
      }
      setChargesLoadedForKey(mode === 'edit' ? editKey : undefined)
    }

    const rows = recalcAllRows(state[context], tradeValueNum)
    const next = { ...state, [context]: rows }
    setChargeState(next)
    setChargeSnapshot(JSON.parse(JSON.stringify(rows)) as ChargeRow[])
    setChargesContext(context)
    setChargesOpen(true)
  }

  const cancelCharges = () => {
    setChargeState((current) => ({
      ...current,
      [chargesContext]: JSON.parse(JSON.stringify(chargeSnapshot)) as ChargeRow[],
    }))
    setChargesOpen(false)
  }

  const applyCharges = (total: number) => {
    const target = chargesContext === 'confirmation' ? 'confirmationFee' : 'otherCharges'
    setForm((current) => ({ ...current, [target]: total ? fmt2(total) : '' }))
    setChargesOpen(false)
  }

  async function onSave() {
    const errors: Record<string, boolean> = {}
    for (const key of ['otkValue', 'tradeValue', 'disAmt', 'negFee', 'commitmentFee'] as const) {
      if (form[key].trim() && parseAmount(form[key]) === null) errors[key] = true
    }
    if (Object.keys(errors).length) {
      setAmountErrors(errors)
      notify('Please correct the highlighted amount')
      return
    }
    setAmountErrors({})

    const payload = toPayload(form)
    if (!payload['Zbukrs']) return notify('Company Code is required')

    setSaving(true)
    try {
      const currency = String(payload['ZdttkCurr'] ?? 'USD')
      if (mode === 'edit' && editKey) {
        const stored = dttkRows.find((r) => String(r.ZdttkNo) === editKey)
        await updateDttk(editKey, withUntouchedFields(payload, stored))
        const fees = await syncDttkFeeRows(editKey, currency, chargeState.confirmation, chargeState.other)
        setModalOpen(false)
        setReloadToken((token) => token + 1)
        setSuccess({ title: 'DTTK Updated', dttkNo: editKey, verb: 'updated', fees })
      } else {
        const newNo = await createDttk(payload)
        const fees = await syncDttkFeeRows(newNo, currency, chargeState.confirmation, chargeState.other)
        setModalOpen(false)
        setReloadToken((token) => token + 1)
        setSuccess({ title: 'DTTK Created', dttkNo: newNo, verb: 'created', fees })
      }
    } catch (error) {
      notify(`Save failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setSaving(false)
    }
  }

  // Escape closes the topmost open layer, innermost first.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (success) setSuccess(undefined)
      else if (chargesOpen) cancelCharges()
      else if (viewOttk) setViewOttk(undefined)
      else if (modalOpen) setModalOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  const dttkColumns: Array<Col<DttkRow>> = [
    {
      header: 'DTTK No',
      width: 90,
      className: 'link',
      cell: (r) => (
        <span
          style={{ cursor: 'pointer' }}
          onClick={(event) => {
            event.stopPropagation()
            openEdit(r)
          }}
        >
          {r.ZdttkNo ?? ''}
        </span>
      ),
    },
    { header: 'Type 1', width: 180, cell: (r) => codeText(r.Ztype1, r.Ztype1Text) },
    { header: 'Type 2', width: 130, cell: (r) => codeText(r.Ztype2, r.Ztype2Text) },
    // Plain text, as in the original: the read-only OTTK view is opened from the OTTK
    // panel's own number, not from here.
    { header: 'Related OTTK', width: 100, cell: (r) => r.ZottkNo ?? '' },
    { header: 'Structure', width: 210, cell: (r) => codeText(r.Zstr, r.ZstrText) },
    { header: 'Entity String', width: 170, cell: (r) => r.ZentDesc ?? '' },
    { header: 'DTTK Value', width: 120, className: 'num', cell: (r) => fmtNum(r.ZdttkValue) },
    { header: 'Crcy', width: 62, cell: (r) => r.ZdttkCurr ?? '' },
    {
      header: 'Discounting Bank',
      width: 180,
      cell: (r) => (r.ZdisBp ? `${r.ZdisBp}${r.ZdisDesc ? ` — ${r.ZdisDesc}` : ''}` : ''),
    },
    { header: 'Expected LC Date', width: 110, cell: (r) => fmtDate(r.Zdate) },
    { header: 'Tenor', width: 70, className: 'num', cell: (r) => String(r.Ztenor ?? '') },
    { header: 'LC Applicant', width: 110, cell: (r) => r.ZlcApp ?? '' },
    { header: 'LC Beneficiary', width: 110, cell: (r) => r.ZlcBen ?? '' },
    { header: 'CoCode', width: 80, cell: (r) => r.Zbukrs ?? '' },
    {
      header: 'Interest',
      width: 100,
      cell: (r) => (r.ZintCat ? `${r.ZintCatText ?? r.ZintCat} ${fmtNum(r.ZintRate)}%` : ''),
    },
    { header: 'Status', width: 100, cell: (r) => <StatusPill status={r.ZstatDesc ?? r.ZdttkSt} /> },
  ]

  const ottkColumns: Array<Col<OttkRow>> = [
    {
      header: 'OTTK No',
      width: 90,
      className: 'link',
      cell: (r) => (
        <span
          style={{ cursor: 'pointer' }}
          onClick={(event) => {
            event.stopPropagation()
            setViewOttk(r)
          }}
        >
          {r.ZottkNo ?? ''}
        </span>
      ),
    },
    { header: 'Type', width: 78, cell: (r) => codeText(r.Ztype, r.ZtypeText) },
    { header: 'Structure', width: 110, cell: (r) => codeText(r.Zstr, r.ZstrText) },
    { header: 'Entity ID', width: 72, cell: (r) => r.ZentId ?? '' },
    { header: 'Entity String', width: 180, cell: (r) => r.ZentDesc ?? '' },
    {
      header: 'LC Issuing Bank',
      width: 200,
      cell: (r) => (r.ZottkBank ? `${r.ZottkBank} — ${r.BpName ?? ''}` : ''),
    },
    { header: 'Trade Value', width: 120, className: 'num', cell: (r) => fmtNum(r.ZottkValue) },
    { header: 'Crcy', width: 62, cell: (r) => r.ZottkCurr ?? '' },
    { header: 'Expected LC Date', width: 105, cell: (r) => fmtDate(r.Zdate) },
    { header: 'Tenor', width: 70, className: 'num', cell: (r) => String(r.Ztenor ?? '') },
    { header: 'LC Applicant', width: 120, cell: (r) => r.ZlcApp ?? '' },
    { header: 'LC Beneficiary', width: 120, cell: (r) => r.ZlcBen ?? '' },
    { header: 'CoCode', width: 80, cell: (r) => r.Zbukrs ?? '' },
    { header: 'Deposit Amt', width: 90, className: 'num', cell: (r) => fmtNum(r.ZdepAmt) },
    {
      header: 'Interest',
      width: 90,
      cell: (r) => (r.ZintCat ? `${r.ZintCatText ?? r.ZintCat} ${fmtNum(r.ZintRate)}%` : ''),
    },
    { header: 'Status', width: 100, cell: (r) => <StatusPill status={r.ZstatDesc ?? r.ZottkSt} /> },
  ]

  const dttkFilters: Array<FilterDef<DttkRow>> = useMemo(
    () => [
      {
        id: 'status',
        ariaLabel: 'DTTK status',
        allLabel: 'All statuses',
        options: derivedOptions(dttkRows, 'ZstatDesc'),
        match: loose<DttkRow>('ZstatDesc'),
      },
      { id: 'type1', ariaLabel: 'DTTK type 1', allLabel: 'All Type 1', options: TYPE1_OPTIONS, match: exact<DttkRow>('Ztype1') },
      { id: 'type2', ariaLabel: 'DTTK type 2', allLabel: 'All Type 2', options: TYPE2_OPTIONS, match: exact<DttkRow>('Ztype2') },
      {
        id: 'entity',
        ariaLabel: 'Entity',
        allLabel: 'All entities',
        options: derivedOptions(dttkRows, 'ZentId'),
        match: loose<DttkRow>('ZentId'),
      },
      { id: 'structure', ariaLabel: 'Structure', allLabel: 'All structures', options: STRUCTURE_OPTIONS, match: structureMatch },
      {
        id: 'bank',
        ariaLabel: 'Discounting bank',
        allLabel: 'All discounting banks',
        options: lookups.dttkBanks.map((b) => ({ value: b.Zbp ?? '', label: `${b.Zbp ?? ''} — ${b.BpName ?? ''}` })),
        match: exact<DttkRow>('ZdisBp'),
      },
      {
        id: 'applicant',
        ariaLabel: 'LC applicant',
        allLabel: 'All applicants',
        options: derivedOptions(dttkRows, 'ZlcApp'),
        match: loose<DttkRow>('ZlcApp'),
      },
      {
        id: 'cocode',
        ariaLabel: 'Company code',
        allLabel: 'All company codes',
        options: derivedOptions(dttkRows, 'Zbukrs'),
        match: loose<DttkRow>('Zbukrs'),
      },
      {
        id: 'beneficiary',
        ariaLabel: 'LC beneficiary',
        allLabel: 'All beneficiaries',
        options: derivedOptions(dttkRows, 'ZlcBen'),
        match: loose<DttkRow>('ZlcBen'),
      },
    ],
    [dttkRows, lookups.dttkBanks],
  )

  const ottkFilters: Array<FilterDef<OttkRow>> = useMemo(
    () => [
      {
        id: 'type',
        ariaLabel: 'OTTK type',
        allLabel: 'All types',
        options: [
          { value: '01', label: '01 New' },
          { value: '02', label: '02 With Ref DTTK' },
        ],
        match: exact<OttkRow>('Ztype'),
      },
      {
        id: 'currency',
        ariaLabel: 'OTTK currency',
        allLabel: 'All currencies',
        options: derivedOptions(ottkRows, 'ZottkCurr'),
        match: loose<OttkRow>('ZottkCurr'),
      },
      {
        id: 'entity',
        ariaLabel: 'Entity',
        allLabel: 'All entities',
        options: derivedOptions(ottkRows, 'ZentId'),
        match: loose<OttkRow>('ZentId'),
      },
      { id: 'structure', ariaLabel: 'Structure', allLabel: 'All structures', options: STRUCTURE_OPTIONS, match: structureMatch },
      {
        id: 'bank',
        ariaLabel: 'LC issuing bank',
        allLabel: 'All issuing banks',
        options: lookups.ottkBanks.map((b) => ({ value: b.Zbp ?? '', label: `${b.Zbp ?? ''} — ${b.BpName ?? ''}` })),
        match: exact<OttkRow>('ZottkBank'),
      },
      {
        id: 'applicant',
        ariaLabel: 'LC applicant',
        allLabel: 'All applicants',
        options: derivedOptions(ottkRows, 'ZlcApp'),
        match: loose<OttkRow>('ZlcApp'),
      },
      {
        id: 'cocode',
        ariaLabel: 'Company code',
        allLabel: 'All company codes',
        options: derivedOptions(ottkRows, 'Zbukrs'),
        match: loose<OttkRow>('Zbukrs'),
      },
      {
        id: 'beneficiary',
        ariaLabel: 'LC beneficiary',
        allLabel: 'All beneficiaries',
        options: derivedOptions(ottkRows, 'ZlcBen'),
        match: loose<OttkRow>('ZlcBen'),
      },
    ],
    [ottkRows, lookups.ottkBanks],
  )

  return (
    <div className="dttk">
      <div className="app">
        <header className="topbar">
          <div className="title-wrap">
            <BackButton />
            <img className="mark" alt="Fourth Signal" src={BRAND_LOGO} />
            <div className="title">
              Distribution Ticket
            </div>
          </div>
          <div className="actions">
            <button type="button" className="btn primary create-btn" title="Create a new DTTK" onClick={openCreate}>
              <svg viewBox="0 0 24 24">
                <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z" />
              </svg>
              <span className="label">Create DTTK</span>
            </button>
            <span
              className={connection === 'unreachable' ? 'connection offline' : 'connection'}
              title={connection === 'unreachable' ? 'Cannot reach the SAP gateway' : 'System connected'}
            />
            <button type="button" className="btn" onClick={() => window.print()} title="Release & Print">
              <svg viewBox="0 0 24 24">
                <path d="M19 8H5a3 3 0 0 0-3 3v4h4v4h12v-4h4v-4a3 3 0 0 0-3-3zm-3 9H8v-5h8v5zm1-13H7v3h10V4z" />
              </svg>
              <span className="label">Release &amp; Print</span>
            </button>
            <button
              type="button"
              className="btn"
              title="Refresh"
              onClick={() => {
                setReloadToken((token) => token + 1)
                notify('Ticket lists refreshed')
              }}
            >
              <svg viewBox="0 0 24 24">
                <path d="M17.65 6.35A8 8 0 1 0 20 12h-2a6 6 0 1 1-1.76-4.24L13 11h8V3l-3.35 3.35z" />
              </svg>
              <span className="label">Refresh</span>
            </button>
            <button type="button" className="btn" title="Copy DTTK" onClick={onCopy}>
              <svg viewBox="0 0 24 24">
                <path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z" />
              </svg>
              <span className="label">Copy DTTK</span>
            </button>
            <SignOutButton />
          </div>
        </header>

        <main className="main">
          <TicketPanel
            title="Open Distribution Tickets"
            searchPlaceholder="Search DTTK…"
            searchAriaLabel="Search distribution tickets"
            rows={dttkRows}
            columns={dttkColumns}
            filters={dttkFilters}
            rowKey={(row) => row.ZdttkNo ?? ''}
            selectedKey={selectedDttkKey}
            onSelectRow={(row) => setSelectedDttkKey(row.ZdttkNo ?? '')}
            exportName="dttkTable"
            minWidth={1620}
            onFiltersCleared={() => notify('Distribution filters cleared')}
            onExported={() => notify('CSV export downloaded')}
          />
          <TicketPanel
            title="Open Origination Tickets"
            searchPlaceholder="Search OTTK…"
            searchAriaLabel="Search origination tickets"
            rows={ottkRows}
            columns={ottkColumns}
            filters={ottkFilters}
            rowKey={(row) => row.ZottkNo ?? ''}
            selectedKey={selectedOttkKey}
            onSelectRow={(row) => setSelectedOttkKey(row.ZottkNo ?? '')}
            exportName="ottkTable"
            minWidth={1540}
            onFiltersCleared={() => notify('Origination filters cleared')}
            onExported={() => notify('CSV export downloaded')}
          />
        </main>
      </div>

      <DttkModal
        open={modalOpen}
        mode={mode}
        editKey={editKey}
        statusText={statusText}
        createdBy={createdBy}
        form={form}
        onFormChange={setForm}
        lookups={lookups}
        ottkRows={ottkRows}
        amountErrors={amountErrors}
        onOpenCharges={() => void openChargesFor('other')}
        onOpenConfCharges={() => void openChargesFor('confirmation')}
        onClear={() => {
          setForm(EMPTY_FORM)
          setAmountErrors({})
          setCreatedBy('')
          resetCharges()
          notify('Form cleared')
        }}
        onClose={() => setModalOpen(false)}
        onSave={() => void onSave()}
        saving={saving}
      />

      <ChargesModal
        open={chargesOpen}
        rows={chargeState[chargesContext]}
        onRowsChange={(rows) => setChargeState((current) => ({ ...current, [chargesContext]: rows }))}
        onCancel={cancelCharges}
        onApply={applyCharges}
        title={CHARGES_UI[chargesContext].title}
        subtitle={CHARGES_UI[chargesContext].subtitle}
        note="Total is saved to the ticket; the service stores no DTTK charge lines."
      />

      <OttkViewModal row={viewOttk} ottkBanks={lookups.ottkBanks} onClose={() => setViewOttk(undefined)} />

      <div
        className={success ? 'modal-backdrop open' : 'modal-backdrop'}
        aria-hidden={!success}
        role="dialog"
        aria-modal="true"
        aria-labelledby="successModalTitle"
        onClick={(event) => {
          if (event.target === event.currentTarget) setSuccess(undefined)
        }}
      >
        <section className="success-modal">
          <div className="success-icon" aria-hidden="true">
            ✓
          </div>
          <h3 id="successModalTitle">{success?.title}</h3>
          <p>
            {success?.dttkNo ? (
              <>
                Distribution Ticket <b>#{success.dttkNo}</b> has been {success.verb} successfully.
              </>
            ) : (
              <>Distribution ticket has been {success?.verb} successfully.</>
            )}
            {success?.fees.saved ? (
              <>
                <br />
                <span className="success-note">
                  {success.fees.saved} charge line{success.fees.saved === 1 ? '' : 's'} saved.
                </span>
              </>
            ) : null}
            {success?.fees.failed.length ? (
              <>
                <br />
                <span className="success-warn">
                  Charges not saved:
                  <br />
                  {success.fees.failed.map((message) => (
                    <span key={message}>
                      {message}
                      <br />
                    </span>
                  ))}
                </span>
              </>
            ) : null}
          </p>
          <button type="button" className="btn primary" onClick={() => setSuccess(undefined)}>
            OK
          </button>
        </section>
      </div>

      <div className={toast ? 'toast show' : 'toast'} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  )
}
