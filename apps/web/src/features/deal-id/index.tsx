import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { fmtNum, parseAmount } from '@slc/api-client'
import { useAsync, useConnectionState } from '@slc/api-client/react'
import { createDealId, loadAssignedTotals, loadBanks, loadDttk, loadOttk, pingBackend } from './api.ts'
import { DealForm, summarise } from './DealForm.tsx'
import { DealIdListDialog, OttkSearchDialog, SuccessDialog } from './dialogs.tsx'
import {
  DTTK_TYPE1_OPTIONS,
  DTTK_TYPE2_OPTIONS,
  OTTK_TYPE_OPTIONS,
  STRUCTURE_OPTIONS,
  dttkColumns,
  ottkColumns,
} from './columns.tsx'
import { TicketPanel, derivedOptions, exact, loose } from './TicketPanel.tsx'
import type { FilterDef } from './TicketPanel.tsx'
import type { AssignedTotals, DttkRow, OttkRow } from './types.ts'
import './deal-id.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './deal-id.dark.css'

/**
 * Deal ID Creation.
 *
 * A faithful reproduction of legacy/Deal ID.html: the markup here and in DealForm,
 * TicketPanel and dialogs mirrors that page element for element and class for class, and
 * deal-id.legacy.css is that page's own stylesheet with selectors scoped under .dealid.
 * The shared @slc/ui components are deliberately NOT used in this app — their markup is
 * different, so they would change how it looks.
 */

const EMPTY_TOTALS: AssignedTotals = { byOttk: new Map(), byDttk: new Map() }

const BRAND_LOGO =
  'https://raw.githubusercontent.com/ryannayak/fs-assets/e82f35a83e28689167b22b4300d4994a249acee0/fs-short-logo.png'

/** Matches the structure filter against the code or its description, as the legacy did. */
function structureMatch<Row extends { Zstr?: string; ZstrText?: string }>(row: Row, value: string): boolean {
  const target = (row.Zstr || row.ZstrText || '').toLowerCase()
  const needle = value.toLowerCase()
  return target.includes(needle) || needle.includes(target)
}

export default function DealIdApp() {
  const navigate = useNavigate()
  const connection = useConnectionState()

  const [reloadToken, setReloadToken] = useState(0)
  const ottk = useAsync<OttkRow[]>((signal) => loadOttk(signal), [reloadToken])
  const dttk = useAsync<DttkRow[]>((signal) => loadDttk(signal), [reloadToken])
  const banks = useAsync((signal) => loadBanks(signal), [reloadToken])
  const totalsState = useAsync<AssignedTotals>((signal) => loadAssignedTotals(signal), [reloadToken])

  const ottkRows = useMemo(() => ottk.data ?? [], [ottk.data])
  const dttkRows = useMemo(() => dttk.data ?? [], [dttk.data])
  const totals = totalsState.data ?? EMPTY_TOTALS

  const [ottkNo, setOttkNo] = useState('')
  const [dttkNo, setDttkNo] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('')
  const [amountInvalid, setAmountInvalid] = useState(false)
  const [creating, setCreating] = useState(false)
  const [ottkSearchOpen, setOttkSearchOpen] = useState(false)
  const [dealListOpen, setDealListOpen] = useState(false)
  const [created, setCreated] = useState<{ dealId: string | undefined; ottkNo: string; dttkNo: string }>()
  const [toast, setToast] = useState<string>()

  const notify = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(undefined), 2600)
  }, [])

  const selectedOttk = useMemo(
    () => ottkRows.find((row) => String(row.ZottkNo) === ottkNo.trim()),
    [ottkRows, ottkNo],
  )
  const selectedDttk = useMemo(
    () => dttkRows.find((row) => String(row.ZdttkNo) === dttkNo.trim()),
    [dttkRows, dttkNo],
  )

  const ottkSummary = selectedOttk
    ? summarise(selectedOttk.ZottkValue, selectedOttk.ZottkCurr, totals.byOttk.get(selectedOttk.ZottkNo ?? ''))
    : undefined
  const dttkSummary = selectedDttk
    ? summarise(selectedDttk.ZdttkValue, selectedDttk.ZdttkCurr, totals.byDttk.get(selectedDttk.ZdttkNo ?? ''))
    : undefined

  // The connection dot only moves as a side effect of a real request, so without a poll it
  // goes stale as soon as the user stops clicking.
  useEffect(() => {
    const timer = setInterval(() => void pingBackend(), 30_000)
    return () => clearInterval(timer)
  }, [])

  const selectOttk = useCallback((row: OttkRow) => setOttkNo(row.ZottkNo ?? ''), [])

  // Picking a DTTK also pulls in its related OTTK, so the pair stays consistent.
  const selectDttk = useCallback((row: DttkRow) => {
    setDttkNo(row.ZdttkNo ?? '')
    if (row.ZottkNo) setOttkNo(row.ZottkNo)
  }, [])

  const commitTicketNo = useCallback(
    (kind: 'ottk' | 'dttk') => {
      const value = (kind === 'ottk' ? ottkNo : dttkNo).trim()
      if (!value) return
      const found = kind === 'ottk' ? selectedOttk : selectedDttk
      if (!found) notify(`No ${kind.toUpperCase()} found for "${value}".`)
    },
    [ottkNo, dttkNo, selectedOttk, selectedDttk, notify],
  )

  const reset = () => {
    setOttkNo('')
    setDttkNo('')
    setAmount('')
    setDescription('')
    setStatus('')
    setAmountInvalid(false)
  }

  async function onCreate() {
    // Parsed here as well as on blur: the user can click Create without the amount field
    // ever having lost focus.
    const parsed = parseAmount(amount)
    if (parsed === null) {
      setAmountInvalid(true)
      notify('Please correct the Deal ID Amt.')
      return
    }
    setAmountInvalid(false)

    if (!selectedOttk) return notify('Enter or select a valid OTTK No.')
    if (!selectedDttk) return notify('Enter or select a valid DTTK No.')
    if (parsed <= 0) return notify('Deal ID Amt must be greater than zero.')
    // Hard stop: an amount that outruns either ticket's remaining balance is never sent.
    if (ottkSummary && parsed > ottkSummary.balance) {
      return notify(`Deal ID Amt exceeds OTTK Balance Value (${fmtNum(ottkSummary.balance)}).`)
    }
    if (dttkSummary && parsed > dttkSummary.balance) {
      return notify(`Deal ID Amt exceeds DTTK Balance Value (${fmtNum(dttkSummary.balance)}).`)
    }

    setCreating(true)
    try {
      const dealId = await createDealId({
        ottkNo: ottkNo.trim(),
        dttkNo: dttkNo.trim(),
        // Codes come from the loaded row, never parsed back out of the "CODE description"
        // text the form displays for readability.
        entityId: selectedOttk.ZentId ?? '',
        structure: selectedOttk.Zstr ?? '',
        amount: parsed,
        currency: selectedOttk.ZottkCurr ?? '',
        description,
        status,
      })
      setToast(undefined)
      setCreated({ dealId, ottkNo: ottkNo.trim(), dttkNo: dttkNo.trim() })
      reset()
      // Balances have just changed, so re-read rather than leave stale numbers on screen.
      setReloadToken((token) => token + 1)
    } catch (error) {
      notify(`Could not create Deal ID: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setCreating(false)
    }
  }

  const ottkFilters: Array<FilterDef<OttkRow>> = useMemo(
    () => [
      { id: 'type', allLabel: 'All types', options: OTTK_TYPE_OPTIONS, match: exact<OttkRow>('Ztype') },
      {
        id: 'currency',
        allLabel: 'All currencies',
        options: derivedOptions(ottkRows, 'ZottkCurr'),
        match: loose<OttkRow>('ZottkCurr'),
      },
      {
        id: 'entity',
        allLabel: 'All entities',
        options: derivedOptions(ottkRows, 'ZentId'),
        match: loose<OttkRow>('ZentId'),
      },
      { id: 'structure', allLabel: 'All structures', options: STRUCTURE_OPTIONS, match: structureMatch },
      {
        id: 'bank',
        allLabel: 'All issuing banks',
        options: (banks.data?.ottk ?? []).map((bank) => ({
          value: bank.Zbp ?? '',
          label: `${bank.Zbp ?? ''} — ${bank.BpName ?? ''}`,
        })),
        match: exact<OttkRow>('ZottkBank'),
      },
      {
        id: 'applicant',
        allLabel: 'All applicants',
        options: derivedOptions(ottkRows, 'ZlcApp'),
        match: loose<OttkRow>('ZlcApp'),
      },
      {
        id: 'cocode',
        allLabel: 'All company codes',
        options: derivedOptions(ottkRows, 'Zbukrs'),
        match: loose<OttkRow>('Zbukrs'),
      },
      {
        id: 'beneficiary',
        allLabel: 'All beneficiaries',
        options: derivedOptions(ottkRows, 'ZlcBen'),
        match: loose<OttkRow>('ZlcBen'),
      },
    ],
    [ottkRows, banks.data],
  )

  const dttkFilters: Array<FilterDef<DttkRow>> = useMemo(
    () => [
      {
        id: 'status',
        allLabel: 'All statuses',
        options: derivedOptions(dttkRows, 'ZdttkSt'),
        match: loose<DttkRow>('ZdttkSt'),
      },
      { id: 'type1', allLabel: 'All Type 1', options: DTTK_TYPE1_OPTIONS, match: exact<DttkRow>('Ztype1') },
      { id: 'type2', allLabel: 'All Type 2', options: DTTK_TYPE2_OPTIONS, match: exact<DttkRow>('Ztype2') },
      {
        id: 'entity',
        allLabel: 'All entities',
        options: derivedOptions(dttkRows, 'ZentId'),
        match: loose<DttkRow>('ZentId'),
      },
      { id: 'structure', allLabel: 'All structures', options: STRUCTURE_OPTIONS, match: structureMatch },
      {
        id: 'bank',
        allLabel: 'All discounting banks',
        options: (banks.data?.dttk ?? []).map((bank) => ({
          value: bank.Zbp ?? '',
          label: `${bank.Zbp ?? ''} — ${bank.BpName ?? ''}`,
        })),
        match: exact<DttkRow>('ZdisBp'),
      },
      {
        id: 'applicant',
        allLabel: 'All applicants',
        options: derivedOptions(dttkRows, 'ZlcApp'),
        match: loose<DttkRow>('ZlcApp'),
      },
      {
        id: 'cocode',
        allLabel: 'All company codes',
        options: derivedOptions(dttkRows, 'Zbukrs'),
        match: loose<DttkRow>('Zbukrs'),
      },
      {
        id: 'beneficiary',
        allLabel: 'All beneficiaries',
        options: derivedOptions(dttkRows, 'ZlcBen'),
        match: loose<DttkRow>('ZlcBen'),
      },
    ],
    [dttkRows, banks.data],
  )

  // The legacy console opened a read-only ticket view in an overlay iframe served by the
  // proxy's /dttk-view.html route. That route has no equivalent here, so the number links
  // through to the ticket's own application — still a scaffold until OTTK and DTTK are
  // converted. Intent preserved, destination honest.
  const openTicket = useCallback(
    (kind: 'ottk' | 'dttk', key: string) => navigate(`/apps/${kind}?display=${encodeURIComponent(key)}`),
    [navigate],
  )

  return (
    <div className="dealid">
      <div className="app">
        <header className="topbar">
          <div className="title-wrap">
            <BackButton />
            <img className="mark" alt="Fourth Signal" src={BRAND_LOGO} />
            <div className="title">
              Deal ID Creation
            </div>
          </div>
          <div className="actions">
            <span
              className={connection === 'unreachable' ? 'connection offline' : 'connection'}
              title={connection === 'unreachable' ? 'Cannot reach the SAP gateway' : 'System connected'}
            />
            <button type="button" className="btn" title="Deal ID list" onClick={() => setDealListOpen(true)}>
              <svg viewBox="0 0 24 24">
                <path d="M4 5h16v2H4V5zm0 6h16v2H4v-2zm0 6h16v2H4v-2z" />
              </svg>
              <span className="label">Deal ID list</span>
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
            <SignOutButton />
          </div>
        </header>

        <DealForm
          ottkNo={ottkNo}
          dttkNo={dttkNo}
          onOttkNoChange={setOttkNo}
          onDttkNoChange={setDttkNo}
          onOttkNoCommit={() => commitTicketNo('ottk')}
          onDttkNoCommit={() => commitTicketNo('dttk')}
          selectedOttk={selectedOttk}
          ottkSummary={ottkSummary}
          dttkSummary={dttkSummary}
          amount={amount}
          onAmountChange={setAmount}
          amountInvalid={amountInvalid}
          onAmountInvalidChange={setAmountInvalid}
          description={description}
          onDescriptionChange={setDescription}
          status={status}
          onStatusChange={setStatus}
          onOpenOttkSearch={() => setOttkSearchOpen(true)}
          onCreate={() => void onCreate()}
          creating={creating}
        />

        <main className="main">
          <TicketPanel
            title="Open Origination Tickets (OTTK)"
            searchPlaceholder="Search OTTK…"
            rows={ottkRows}
            columns={ottkColumns(totals, (key) => openTicket('ottk', key))}
            filters={ottkFilters}
            rowKey={(row) => row.ZottkNo ?? ''}
            selectedKey={selectedOttk?.ZottkNo}
            onSelect={selectOttk}
            emptyColSpan={17}
            onFiltersCleared={() => notify('Origination filters cleared')}
          />
          <TicketPanel
            title="Open Distribution Tickets (DTTK)"
            searchPlaceholder="Search DTTK…"
            rows={dttkRows}
            columns={dttkColumns(totals, (key) => openTicket('dttk', key))}
            filters={dttkFilters}
            rowKey={(row) => row.ZdttkNo ?? ''}
            selectedKey={selectedDttk?.ZdttkNo}
            onSelect={selectDttk}
            emptyColSpan={17}
            onFiltersCleared={() => notify('Distribution filters cleared')}
          />
        </main>
      </div>

      <OttkSearchDialog
        open={ottkSearchOpen}
        rows={ottkRows}
        totals={totals}
        onPick={selectOttk}
        onClose={() => setOttkSearchOpen(false)}
      />
      <DealIdListDialog open={dealListOpen} onClose={() => setDealListOpen(false)} />
      <SuccessDialog
        dealId={created?.dealId}
        ottkNo={created?.ottkNo ?? ''}
        dttkNo={created?.dttkNo ?? ''}
        onClose={() => setCreated(undefined)}
      />

      <div className={toast ? 'toast show' : 'toast'} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  )
}
