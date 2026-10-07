import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, CircleAlert, Download, RefreshCw } from 'lucide-react'
import { runLimited } from '@slc/api-client'
import { useConnectionState } from '@slc/api-client/react'
import { BackButton } from '../../auth/BackButton.tsx'
import { SignOutButton } from '../../auth/SignOutButton.tsx'
import { loadTradeFlows } from '../tf-manage/api.ts'
import type { TrdFlowRow } from '../tf-manage/types.ts'
import { BlNotCreatedError, assertTradeFlowNumbering, loadBusinessUnits, loadCommodities, loadUploadLimits, pingBackend, uploadRow } from './api.ts'
import type { UploadOutcome } from './api.ts'
import { TF_FIELD_MAP, TF_TYPE_CODES, isCreateRow, toIsoDate } from './fields.ts'
import type { BusinessUnit, CommodityRow } from './fields.ts'
import { checkRowBusinessUnit } from './eligibility.ts'
import { validateRow } from './validation.ts'
import type { CellIssue, UploadLimits } from './validation.ts'
import { displayCell, isNumberColumn, responsivePageSize } from './display.ts'
import type { TemplateColumn } from './display.ts'
import { parseExcelFile } from './xlsx.ts'
import type { CellValue } from './xlsx.ts'
import payload from './template.json'
import './tf-upload.legacy.css'
// Night mode. Generated from the sheet above by tools/gen-dark-css.mjs; it only restates the
// colours that change, at a higher specificity, so it must be imported after it.
import './tf-upload.dark.css'
import './tf-upload.css'

/**
 * Trade Flow Excel Upload.
 *
 * A faithful reproduction of legacy/Uplaod TF.html: the markup mirrors that page element for
 * element and class for class, and tf-upload.legacy.css is its own stylesheet scoped under
 * .tfupload. template.json is that page's embedded payload, extracted verbatim — the 45
 * template headers, their column types, the master data and the base64 template workbook.
 */

const BRAND_LOGO =
  'https://raw.githubusercontent.com/ryannayak/fs-assets/e82f35a83e28689167b22b4300d4994a249acee0/fs-short-logo.png'

const HEADERS = payload.template.headers as string[]
const COLUMNS = payload.template.columns as TemplateColumn[]
// TF types are SAP domain fixed values for ZTFTYPE (dd07v: 01 Container, 02 Bulk), not rows
// of any table, so there is no master to read them from. Business units are master data and
// are loaded from MySQL — see loadBusinessUnits.
const TF_TYPES = payload.masterData.tfTypes as Array<{ code: string; name: string }>
const MAX_FILE_MB = payload.uiConfig.maxFileMb as number
const VIEW_COLUMNS = HEADERS.map((label, index) => ({
  label,
  field: TF_FIELD_MAP[index]!.field as keyof TrdFlowRow,
  type: COLUMNS[index]!.type,
}))

type SortDirection = 'asc' | 'desc'
type SortState = { column: number; direction: SortDirection }
type TableFilters = { unit: string; commodity: string; split: string; status: string }
const EMPTY_FILTERS: TableFilters = { unit: '', commodity: '', split: '', status: '' }
type ViewFilters = { id: string; unit: string; commodity: string; incoterms: string; payment: string }
const EMPTY_VIEW_FILTERS: ViewFilters = { id: '', unit: '', commodity: '', incoterms: '', payment: '' }

function filterOptions(values: unknown[]): string[] {
  const options = new Map<string, string>()
  for (const value of values) {
    const label = String(value ?? '').trim()
    if (label && !options.has(label.toLowerCase())) options.set(label.toLowerCase(), label)
  }
  return [...options.values()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

function matchesFilter(value: unknown, selected: string): boolean {
  return !selected || String(value ?? '').trim().toLowerCase() === selected.toLowerCase()
}

function displayFileName(name: string): string {
  try { return decodeURIComponent(name) } catch { return name }
}

function compareCells(a: unknown, b: unknown, type: TemplateColumn['type'], direction: SortDirection): number {
  const aBlank = a === null || a === undefined || a === ''
  const bBlank = b === null || b === undefined || b === ''
  if (aBlank || bBlank) return aBlank === bBlank ? 0 : aBlank ? 1 : -1
  let comparison: number
  if (type === 'number' && Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
    comparison = Number(a) - Number(b)
  } else if (type === 'date') {
    comparison = String(toIsoDate(a as CellValue) ?? a).localeCompare(String(toIsoDate(b as CellValue) ?? b))
  } else {
    comparison = String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
  }
  return direction === 'asc' ? comparison : -comparison
}

function nextSort(current: SortState | undefined, column: number): SortState {
  return { column, direction: current?.column === column && current.direction === 'asc' ? 'desc' : 'asc' }
}

function FilterSelect({ label, value, options, onChange }: {
  label: string
  value: string
  options: readonly string[]
  onChange: (value: string) => void
}) {
  return <label className="tf-filter-select">
    <span className="sr-only">Filter by {label}</span>
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">All {label}</option>
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  </label>
}

type RowResult = { status: 'pending' | 'success' | 'error' | 'skipped'; message: string; tfNo?: string }

/** The Status text for an uploaded row: a create shows the Trade Flow ID it was issued. */
function succeeded(outcome: UploadOutcome): RowResult {
  return {
    status: 'success',
    tfNo: outcome.tfNo,
    message:
      outcome.action === 'created'
        ? `Created ${outcome.tfNo} / ${outcome.split}${outcome.blNo ? ` · BL ${outcome.blNo}` : ''}`
        : 'Updated',
  }
}

type Extracted = {
  fileName: string
  headers: CellValue[]
  rows: CellValue[][]
}

function businessUnitLabel(code: string, units: readonly BusinessUnit[]): string {
  const unit = units.find((b) => b.code === code)
  return unit ? `${unit.code} - ${unit.name}` : code
}

function tfTypeLabel(code: string): string {
  return TF_TYPES.find((t) => t.code === code)?.name ?? code
}

/** Rebuilds the template workbook from the base64 chunks embedded in the payload. */
function downloadTemplate(): void {
  const chunks = (payload.template.fileBase64Chunks as string[] | undefined) ?? []
  const binary = atob(chunks.join(''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = payload.template.fileName as string
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function TfUploadApp() {
  const connection = useConnectionState()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadedFiles = useRef(new Set<string>())

  const [businessUnit, setBusinessUnit] = useState('')
  const [tfType, setTfType] = useState('')
  const [file, setFile] = useState<File>()
  const [error, setError] = useState<string>()

  const [extracted, setExtracted] = useState<Extracted>()
  const [results, setResults] = useState<RowResult[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number }>()
  const [uploadFinished, setUploadFinished] = useState(false)

  const [previewFilters, setPreviewFilters] = useState<TableFilters>(EMPTY_FILTERS)
  const [previewSort, setPreviewSort] = useState<SortState>()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(() =>
    responsivePageSize(window.innerWidth || 1200, window.innerHeight || 800),
  )
  const [commodities, setCommodities] = useState<CommodityRow[]>([])
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([])
  // Column limits for the pre-upload check; null until read, or if they cannot be.
  const [uploadLimits, setUploadLimits] = useState<UploadLimits | null>(null)
  const [toast, setToast] = useState<{ title: string; message: string; isError: boolean }>()
  const [activeTab, setActiveTab] = useState<'upload' | 'view'>('upload')
  const [viewRows, setViewRows] = useState<TrdFlowRow[]>([])
  const [viewBusy, setViewBusy] = useState(false)
  const [viewError, setViewError] = useState<string>()
  const [viewFilters, setViewFilters] = useState<ViewFilters>(EMPTY_VIEW_FILTERS)
  const [viewSort, setViewSort] = useState<SortState>()
  const [viewPage, setViewPage] = useState(1)
  const [viewRefresh, setViewRefresh] = useState(0)

  const contextReady = Boolean(businessUnit && tfType)
  const fileKey = (candidate: File) => `${candidate.name}\u0000${candidate.size}\u0000${candidate.lastModified}`

  useEffect(() => {
    void loadCommodities().then(setCommodities)
    void loadUploadLimits().then(setUploadLimits)
    void loadBusinessUnits()
      .then(setBusinessUnits)
      .catch(() => setBusinessUnits([]))
    const timer = setInterval(() => void pingBackend(), 30_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (activeTab !== 'view') return
    const controller = new AbortController()
    setViewBusy(true)
    setViewError(undefined)
    void loadTradeFlows(controller.signal)
      .then((rows) => setViewRows(rows))
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setViewRows([])
          setViewError(err instanceof Error ? err.message : 'Unable to load trade flows.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setViewBusy(false)
      })
    return () => controller.abort()
  }, [activeTab, viewRefresh])

  // Every cell that will not fit its column, per row — found here so a file can be fixed in
  // one pass, rather than learnt one rejected row at a time (see validation.ts).
  const cellIssues = useMemo<CellIssue[][]>(
    () => extracted?.rows.map((row) => (uploadLimits ? validateRow(row, uploadLimits) : [])) ?? [],
    [extracted, uploadLimits],
  )
  const eligibility = useMemo(
    () =>
      extracted?.rows.map((row, index) => {
        const unit = checkRowBusinessUnit(row, businessUnit, businessUnits)
        if (!unit.eligible) return { ...unit, kind: 'unit' as const }
        const issues = cellIssues[index] ?? []
        if (issues.length === 0) return { ...unit, kind: 'ok' as const }
        return {
          eligible: false,
          kind: 'cells' as const,
          reason: issues.map((issue) => `${HEADERS[issue.index]}: ${issue.message}`).join('; '),
        }
      }) ?? [],
    [extracted, businessUnit, businessUnits, cellIssues],
  )
  const readyCount = eligibility.filter((item) => item.eligible).length
  const skippedCount = eligibility.length - readyCount
  const previewStatus = (index: number): string => {
    if (!eligibility[index]?.eligible) return 'Skipped'
    if (results[index]?.status === 'success') return 'Uploaded'
    if (results[index]?.status === 'error') return 'Failed'
    return 'Pending'
  }
  const previewFilterOptions = {
    unit: filterOptions(extracted?.rows.map((row) => row[3]) ?? []),
    commodity: filterOptions(extracted?.rows.map((row) => row[6]) ?? []),
    split: filterOptions(extracted?.rows.map((row) => row[1]) ?? []),
    status: filterOptions(extracted?.rows.map((_, index) => previewStatus(index)) ?? []),
  }
  const viewFilterOptions = {
    id: filterOptions(viewRows.map((row) => row.ZtfNo)),
    unit: filterOptions(viewRows.map((row) => row.Zbu)),
    commodity: filterOptions(viewRows.map((row) => row.Zcmmd)),
    incoterms: filterOptions(viewRows.map((row) => row.ZpurInc)),
    payment: filterOptions(viewRows.map((row) => row.Zpaypur)),
  }

  const filteredViewRows = useMemo(() => {
    const rows = viewRows.filter((row) =>
      matchesFilter(row.ZtfNo, viewFilters.id) &&
      matchesFilter(row.Zbu, viewFilters.unit) &&
      matchesFilter(row.Zcmmd, viewFilters.commodity) &&
      matchesFilter(row.ZpurInc, viewFilters.incoterms) &&
      matchesFilter(row.Zpaypur, viewFilters.payment),
    )
    if (viewSort) {
      const column = VIEW_COLUMNS[viewSort.column]!
      rows.sort((a, b) => compareCells(a[column.field], b[column.field], column.type, viewSort.direction))
    }
    return rows
  }, [viewRows, viewFilters, viewSort])
  const viewPageSize = 20
  const viewPageCount = Math.max(1, Math.ceil(filteredViewRows.length / viewPageSize))
  const currentViewPage = Math.min(viewPage, viewPageCount)
  const viewStart = (currentViewPage - 1) * viewPageSize
  const visibleViewRows = filteredViewRows.slice(viewStart, viewStart + viewPageSize)

  useEffect(() => {
    const onResize = () =>
      setPageSize(responsivePageSize(window.innerWidth || 1200, window.innerHeight || 800))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const resetPreview = useCallback(() => {
    setExtracted(undefined)
    setResults([])
    setPreviewFilters(EMPTY_FILTERS)
    setPage(1)
    setUploadFinished(false)
    setUploadProgress(undefined)
  }, [])

  const clearFile = useCallback(() => {
    setFile(undefined)
    if (fileInputRef.current) fileInputRef.current.value = ''
    resetPreview()
  }, [resetPreview])

  /** Validates before accepting: extension, size, and that the context is chosen. */
  const acceptFile = useCallback(
    (candidate: File | undefined) => {
      setError(undefined)
      if (uploading) return
      if (!contextReady) {
        setError('Select Business Unit and TF Type before choosing an Excel file.')
        if (fileInputRef.current) fileInputRef.current.value = ''
        return
      }
      if (!candidate) {
        clearFile()
        return
      }
      const lower = candidate.name.toLowerCase()
      if (!lower.endsWith('.xlsx') && !lower.endsWith('.xlsm')) {
        setError('Please select an .xlsx or .xlsm Excel workbook.')
        clearFile()
        return
      }
      if (candidate.size > MAX_FILE_MB * 1024 * 1024) {
        setError('The selected file exceeds the maximum allowed size.')
        clearFile()
        return
      }
      if (uploadedFiles.current.has(fileKey(candidate))) {
        setError('This file has already been uploaded. Select a different Excel file.')
        if (fileInputRef.current) fileInputRef.current.value = ''
        return
      }
      setFile(candidate)
      resetPreview()
    },
    [contextReady, clearFile, resetPreview, uploading],
  )

  async function handleExtract() {
    if (uploading || uploadFinished) return
    setError(undefined)
    if (!contextReady) return setError('Select Business Unit and TF Type before extracting.')
    if (!file) return setError('Select an Excel file before extracting.')

    try {
      const parsed = await parseExcelFile(file, HEADERS)
      setExtracted({ fileName: file.name, headers: parsed.headers, rows: parsed.rows })
      setResults(parsed.rows.map(() => ({ status: 'pending', message: '' })))
      setPage(1)
      setUploadFinished(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to read the selected Excel file.')
    }
  }

  /**
   * Rows go up three at a time. Each row's outcome is recorded against its own index, so the
   * Status column stays correct even after filters narrow the visible list.
   *
   * Every row is independent: a blank Trade Flow ID creates a trade flow with a number of its
   * own, anything else updates the row it names (see createKey).
   *
   * Creates run one after another in workbook order, so the numbers the range issues follow the
   * rows — as they do in SAP's upload, which loops over them in turn. Run concurrently, a later
   * row can reach the range first and take the lower number. Updates carry their own keys, so
   * they still go three at a time alongside the creates.
   */
  async function handleUpload() {
    if (uploading || uploadFinished) return
    if (!extracted) return setError('Extract the selected Excel file before uploading.')
    if (!file || uploadedFiles.current.has(fileKey(file))) return
    const eligibleIndexes = extracted.rows.flatMap((_, index) => eligibility[index]?.eligible ? [index] : [])
    if (eligibleIndexes.length === 0) return setError('No rows match the selected Business Unit.')
    setError(undefined)
    setUploading(true)
    uploadedFiles.current.add(fileKey(file))

    const total = eligibleIndexes.length
    const next: RowResult[] = extracted.rows.map((_, index) => eligibility[index]?.eligible
      ? { status: 'pending', message: '' }
      : { status: 'skipped', message: eligibility[index]?.reason ?? 'Business Unit does not match.' })
    setResults(next)
    setUploadProgress({ done: 0, total })

    let done = 0
    const tfTypeCode = TF_TYPE_CODES[tfType] ?? ''

    const rows = extracted.rows
    const record = (index: number, result: RowResult) => {
      next[index] = result
      done++
      setUploadProgress({ done, total })
      setResults([...next])
    }
    const failure = (err: unknown): RowResult => ({
      status: 'error',
      message: err instanceof Error ? err.message : 'Failed',
      ...(err instanceof BlNotCreatedError ? { tfNo: err.tfNo } : {}),
    })
    // Asked once, before anything is written: if new trade flows cannot be numbered, none of
    // them is sent, while updates to existing ones still go ahead.
    const createBlocked = eligibleIndexes.some((index) => isCreateRow(rows[index]!))
      ? await assertTradeFlowNumbering().then(
          () => undefined,
          (err: unknown) => failure(err),
        )
      : undefined

    const uploadOne = async (index: number) => {
      try {
        record(index, succeeded(await uploadRow(rows[index]!, businessUnit, tfTypeCode, businessUnits, commodities)))
      } catch (err) {
        record(index, failure(err))
      }
    }
    const creates = eligibleIndexes.filter((index) => isCreateRow(rows[index]!))
    const updates = eligibleIndexes.filter((index) => !isCreateRow(rows[index]!))

    await runLimited(
      [
        // All creates as one task, in order. A create that fails does not stop the next.
        async () => {
          for (const index of creates) {
            if (createBlocked) record(index, createBlocked)
            else await uploadOne(index)
          }
        },
        ...updates.map((index) => () => uploadOne(index)),
      ],
      3,
    )

    const successCount = next.filter((r) => r.status === 'success').length
    const failCount = total - successCount
    setUploading(false)
    setUploadFinished(true)
    setUploadProgress(undefined)
    setToast(
      failCount === 0
        ? { title: 'Success', message: `${successCount} row(s) uploaded${skippedCount ? `, ${skippedCount} skipped for Business Unit mismatch` : ''}.`, isError: false }
        : {
            title: 'Completed with errors',
            message: `${successCount} uploaded, ${failCount} failed, ${skippedCount} skipped. See the Status column.`,
            isError: true,
          },
    )
    window.setTimeout(() => setToast(undefined), 5200)
  }

  /** Filtered row indexes, kept as ORIGINAL indexes so results still line up. */
  const filteredIndexes = useMemo(() => {
    if (!extracted) return []
    const indexes = extracted.rows.reduce<number[]>((acc, row, index) => {
      if (!matchesFilter(row[3], previewFilters.unit) ||
          !matchesFilter(row[6], previewFilters.commodity) ||
          !matchesFilter(row[1], previewFilters.split) ||
          !matchesFilter(previewStatus(index), previewFilters.status)) return acc
      acc.push(index)
      return acc
    }, [])
    if (previewSort) {
      const value = (index: number) => previewSort.column === HEADERS.length
        ? eligibility[index]?.eligible ? results[index]?.message || 'Pending' : 'Skipped'
        : previewSort.column === 0 && results[index]?.tfNo
          ? results[index].tfNo
          : extracted.rows[index]?.[previewSort.column]
      indexes.sort((a, b) => compareCells(
        value(a), value(b), COLUMNS[previewSort.column]?.type ?? 'text', previewSort.direction,
      ))
    }
    return indexes
  }, [extracted, results, previewSort, eligibility, previewFilters])

  const total = filteredIndexes.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, totalPages)
  const start = (currentPage - 1) * pageSize
  const end = Math.min(start + pageSize, total)
  const visible = filteredIndexes.slice(start, end)

  const summary = extracted
    ? [
        extracted.fileName,
        businessUnitLabel(businessUnit, businessUnits),
        tfTypeLabel(tfType),
        `${extracted.rows.length} rows`,
        `${extracted.headers.length} columns`,
      ].join(' | ')
    : ''

  const uploadLabel = uploading
    ? `Uploading ${uploadProgress?.done ?? 0}/${uploadProgress?.total ?? 0}...`
    : uploadFinished
      ? 'Uploaded'
      : 'Upload'

  // The page numbers group shows the current page and the one after it, as the original did.
  const pageNumbers: number[] = []
  {
    let from = currentPage
    const to = Math.min(totalPages, from + 1)
    if (from === totalPages && totalPages > 1) from = totalPages - 1
    for (let p = from; p <= to; p++) pageNumbers.push(p)
  }

  return (
    <div className="tfupload">
      <div className="app-shell">
        <header className="app-header">
          <div className="header-left">
            <BackButton />
            <img className="ds-mark" alt="Fourth Signal" src={BRAND_LOGO} />
            <div className="app-title">Trade Flow Excel Upload</div>
          </div>
          <div className="header-right">
            <span
              className={connection === 'unreachable' ? 'ds-conn offline' : 'ds-conn'}
              title={connection === 'unreachable' ? 'Cannot reach the SAP gateway' : 'System connected'}
            />
            <button
              type="button"
              className="btn template-link"
              title="Download the Trade Flow Excel template"
              onClick={downloadTemplate}
            >
              <Download size={16} strokeWidth={1.8} aria-hidden="true" />
              <span>Download Template</span>
            </button>
            <SignOutButton />
          </div>
        </header>

        <main>
          <section className="page">
            <nav className="tf-tabs" role="tablist" aria-label="Trade Flow workspace">
              <button type="button" role="tab" id="upload-tab" aria-controls="upload-panel"
                aria-selected={activeTab === 'upload'} className={activeTab === 'upload' ? 'tf-tab active' : 'tf-tab'}
                onClick={() => setActiveTab('upload')}>
                Upload Trade Flow
              </button>
              <button type="button" role="tab" id="view-tab" aria-controls="view-panel"
                aria-selected={activeTab === 'view'} className={activeTab === 'view' ? 'tf-tab active' : 'tf-tab'}
                onClick={() => setActiveTab('view')}>
                View Uploaded Trade Flow
              </button>
            </nav>
            <div id="upload-panel" role="tabpanel" aria-labelledby="upload-tab" hidden={activeTab !== 'upload'}>
            <div className="intake-layout">
              <section className="card context-card">
                <div className="card-head compact-card-head">
                  <div>
                    <div className="card-title">Upload Context</div>
                  </div>
                </div>
                <div className="card-body context-body">
                  <div className="field compact-field">
                    <label htmlFor="businessUnitSelect">
                      Business Unit<span className="req">*</span>
                    </label>
                    <select
                      id="businessUnitSelect"
                      required
                      disabled={uploading || uploadFinished}
                      value={businessUnit}
                      onChange={(event) => {
                        setBusinessUnit(event.target.value)
                        setError(undefined)
                      }}
                    >
                      <option value="">Select Business Unit</option>
                      {businessUnits.map((unit) => (
                        <option key={unit.code} value={unit.code}>
                          {unit.code} - {unit.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field compact-field">
                    <label htmlFor="tfTypeSelect">
                      TF Type<span className="req">*</span>
                    </label>
                    <select
                      id="tfTypeSelect"
                      required
                      disabled={uploading || uploadFinished}
                      value={tfType}
                      onChange={(event) => {
                        setTfType(event.target.value)
                        setError(undefined)
                      }}
                    >
                      <option value="">Select TF Type</option>
                      {TF_TYPES.map((type) => (
                        <option key={type.code} value={type.code}>
                          {type.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              <section className="card upload-card compact-upload-card">
                <div className="card-head compact-card-head">
                  <div>
                    <div className="card-title">Excel File</div>
                  </div>
                </div>
                <div className="card-body compact-upload-body">
                  <div className="upload-file-row">
                    <div
                      className={`drop-zone compact-drop-zone${file ? ' has-file' : ''}`}
                      tabIndex={0}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault()
                        acceptFile(event.dataTransfer.files[0])
                      }}
                    >
                      <div className="drop-inline">
                        <div className="upload-glyph compact-upload-glyph" aria-hidden="true" />
                        <div className="drop-text-wrap">
                          <div className="drop-title">Drop Excel file here</div>
                          <div className="drop-copy">
                            or{' '}
                            <button
                              type="button"
                              className="browse-link"
                              disabled={uploading}
                              onClick={() => {
                                if (!contextReady) {
                                  setError('Select Business Unit and TF Type before choosing an Excel file.')
                                  return
                                }
                                fileInputRef.current?.click()
                              }}
                            >
                              Browse
                            </button>
                          </div>
                          <div className="file-note">Supported: .xlsx, .xlsm</div>
                        </div>
                      </div>
                      <div className={file ? 'selected-file' : 'selected-file hidden'}>
                        <div className="file-main">
                          <div className="file-name">{file?.name ?? ''}</div>
                        </div>
                      </div>
                    </div>
                    <div className="extract-actions">
                      <button
                        type="button"
                        className="btn primary"
                        disabled={!file || !contextReady || uploading || uploadFinished}
                        onClick={() => void handleExtract()}
                      >
                        Extract
                      </button>
                      <button
                        type="button"
                        className="btn"
                        disabled={uploading}
                        onClick={() => {
                          clearFile()
                          setBusinessUnit('')
                          setTfType('')
                          setError(undefined)
                        }}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xlsm"
                    hidden
                    onChange={(event) => acceptFile(event.target.files?.[0])}
                  />
                  <div className={error ? 'message error' : 'message error hidden'}>{error}</div>
                </div>
              </section>
            </div>

            <section className={extracted ? 'card table-card' : 'card table-card hidden'}>
              <div className="preview-headbar">
                <div className="preview-heading-wrap">
                  <div className="card-title">Extracted Excel Preview</div>
                  <span className="preview-file" title={summary}>{displayFileName(extracted?.fileName ?? '')}</span>
                </div>
                <div className="preview-counts" role="status">
                  <span className="eligibility-ready">
                    {uploadFinished ? `${results.filter((result) => result.status === 'success').length} uploaded` : `${readyCount} ready`}
                  </span>
                  {skippedCount > 0 && <span className="eligibility-skipped" title="These rows will not be uploaded">{skippedCount} skipped</span>}
                </div>
                <button
                  type="button"
                  className="btn primary final-upload-btn"
                  disabled={uploading || uploadFinished || readyCount === 0}
                  onClick={() => void handleUpload()}
                >
                  {uploadLabel}
                </button>
              </div>

              <div className="table-toolbar">
                <div className="tf-filter-row">
                  <FilterSelect label="Business Units" value={previewFilters.unit} options={previewFilterOptions.unit}
                    onChange={(unit) => { setPreviewFilters((current) => ({ ...current, unit })); setPage(1) }} />
                  <FilterSelect label="Commodities" value={previewFilters.commodity} options={previewFilterOptions.commodity}
                    onChange={(commodity) => { setPreviewFilters((current) => ({ ...current, commodity })); setPage(1) }} />
                  <FilterSelect label="Splits" value={previewFilters.split} options={previewFilterOptions.split}
                    onChange={(split) => { setPreviewFilters((current) => ({ ...current, split })); setPage(1) }} />
                  <FilterSelect label="Statuses" value={previewFilters.status} options={previewFilterOptions.status}
                    onChange={(status) => { setPreviewFilters((current) => ({ ...current, status })); setPage(1) }} />
                  {Object.values(previewFilters).some(Boolean) && <button type="button" className="filter-clear"
                    onClick={() => { setPreviewFilters(EMPTY_FILTERS); setPage(1) }}>Clear filters</button>}
                </div>
                <div className="table-meta">
                  {total} row{total === 1 ? '' : 's'} | {HEADERS.length} columns
                </div>
              </div>

              <div className="table-wrap">
                <table className={total === 0 ? 'preview-table hidden' : 'preview-table'}>
                  <thead>
                    <tr>
                      {HEADERS.map((header, index) => (
                        <th
                          key={header}
                          className={`${index === 0 ? 'sticky-1' : index === 1 ? 'sticky-2' : ''} ${isNumberColumn(COLUMNS, index) ? 'num' : ''}`.trim()}
                          title={header}
                        >
                          <button type="button" className="column-sort" aria-label={`Sort ${header} ${previewSort?.column === index && previewSort.direction === 'asc' ? 'descending' : 'ascending'}`}
                            onClick={() => { setPreviewSort((current) => nextSort(current, index)); setPage(1) }}>
                            <span>{header}</span>
                            {previewSort?.column === index
                              ? previewSort.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                              : <ArrowUpDown size={11} />}
                          </button>
                        </th>
                      ))}
                      <th className="status-column"><button type="button" className="column-sort"
                        aria-label={`Sort Status ${previewSort?.column === HEADERS.length && previewSort.direction === 'asc' ? 'descending' : 'ascending'}`}
                        onClick={() => { setPreviewSort((current) => nextSort(current, HEADERS.length)); setPage(1) }}>
                        <span>Status</span>
                        {previewSort?.column === HEADERS.length
                          ? previewSort.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                          : <ArrowUpDown size={11} />}
                      </button></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((originalIndex) => {
                      const row = extracted?.rows[originalIndex] ?? []
                      const result = results[originalIndex]
                      return (
                        <tr key={originalIndex}>
                          {HEADERS.map((header, columnIndex) => {
                            const text = columnIndex === 0 && result?.tfNo
                              ? result.tfNo
                              : displayCell(row[columnIndex], columnIndex, COLUMNS)
                            const sticky = columnIndex === 0 ? 'sticky-1' : columnIndex === 1 ? 'sticky-2' : ''
                            const numeric = isNumberColumn(COLUMNS, columnIndex) ? 'num' : ''
                            const invalidRow = !eligibility[originalIndex]?.eligible
                            const missingCommodity = eligibility[originalIndex]?.reason?.startsWith('BU Commodity is blank') ||
                              eligibility[originalIndex]?.reason?.startsWith('BU Commodity cannot be verified')
                            const unitRejected = eligibility[originalIndex]?.kind === 'unit'
                            const invalidBusinessUnit = invalidRow && unitRejected && columnIndex === (missingCommodity ? 6 : 3)
                            const cellIssue = cellIssues[originalIndex]?.find((issue) => issue.index === columnIndex)
                            const marked = invalidBusinessUnit || cellIssue !== undefined
                            return (
                              <td key={header} className={`${sticky} ${numeric} ${marked ? 'business-unit-mismatch' : ''}`.trim()}
                                title={cellIssue ? `${header}: ${cellIssue.message}` : invalidBusinessUnit || (columnIndex === 0 && invalidRow) ? eligibility[originalIndex]?.reason : text}>
                                {text}
                                {columnIndex === 0 && invalidRow && <CircleAlert className="row-warning" size={14} aria-label="This row will be skipped" />}
                              </td>
                            )
                          })}
                          <td className="status-column">
                            {!eligibility[originalIndex]?.eligible ? (
                              <span className="tf-status tf-status-skipped" title={eligibility[originalIndex]?.reason}>
                                {eligibility[originalIndex]?.kind === 'cells'
                                  ? `Skipped: ${cellIssues[originalIndex]?.length ?? 0} cell(s) do not fit`
                                  : 'Skipped: BU mismatch'}
                              </span>
                            ) : !result || result.status === 'pending' ? (
                              <span className="tf-status tf-status-pending">Pending</span>
                            ) : result.status === 'success' ? (
                              <span className="tf-status tf-status-success" title={result.message}>
                                {result.message}
                              </span>
                            ) : (
                              <span className="tf-status tf-status-error" title={result.message}>
                                Failed
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div className={total === 0 ? 'empty-preview' : 'empty-preview hidden'}>
                  No rows match these filters.
                </div>
              </div>

              <div className="pagination">
                <div className="page-info">
                  {total === 0 ? '0 rows' : `Showing ${start + 1}-${end} of ${total} rows`}
                </div>
                <div className="page-actions">
                  <button
                    type="button"
                    className="page-btn"
                    aria-label="Previous page"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    &lt;
                  </button>
                  <div className="page-number-group">
                    {pageNumbers.map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={p === currentPage ? 'page-btn active' : 'page-btn'}
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="page-btn"
                    aria-label="Next page"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    &gt;
                  </button>
                </div>
              </div>
            </section>
            </div>
            <section id="view-panel" role="tabpanel" aria-labelledby="view-tab" className="view-panel" hidden={activeTab !== 'view'}>
              <div className="card view-card">
                <div className="view-toolbar">
                  <div className="tf-filter-row">
                  <FilterSelect label="Trade Flow IDs" value={viewFilters.id} options={viewFilterOptions.id}
                    onChange={(id) => { setViewFilters((current) => ({ ...current, id })); setViewPage(1) }} />
                  <FilterSelect label="Business Units" value={viewFilters.unit} options={viewFilterOptions.unit}
                    onChange={(unit) => { setViewFilters((current) => ({ ...current, unit })); setViewPage(1) }} />
                  <FilterSelect label="Commodities" value={viewFilters.commodity} options={viewFilterOptions.commodity}
                    onChange={(commodity) => { setViewFilters((current) => ({ ...current, commodity })); setViewPage(1) }} />
                  <FilterSelect label="Purchase Incoterms" value={viewFilters.incoterms} options={viewFilterOptions.incoterms}
                    onChange={(incoterms) => { setViewFilters((current) => ({ ...current, incoterms })); setViewPage(1) }} />
                  <FilterSelect label="Purchase Payment Terms" value={viewFilters.payment} options={viewFilterOptions.payment}
                    onChange={(payment) => { setViewFilters((current) => ({ ...current, payment })); setViewPage(1) }} />
                  {Object.values(viewFilters).some(Boolean) && <button type="button" className="filter-clear"
                    onClick={() => { setViewFilters(EMPTY_VIEW_FILTERS); setViewPage(1) }}>Clear filters</button>}
                  </div>
                  <span className="view-count">{filteredViewRows.length} trade flows</span>
                  <button type="button" className="btn view-refresh" disabled={viewBusy}
                    onClick={() => setViewRefresh((count) => count + 1)}>
                    <RefreshCw size={15} aria-hidden="true" /> Refresh
                  </button>
                </div>
                {viewError && <div className="view-error" role="alert">{viewError}</div>}
                <div className="view-table-wrap">
                  <table className="view-table">
                    <thead><tr>
                      {VIEW_COLUMNS.map(({ label }, index) => <th key={label}
                        className={`${index === 0 ? 'view-sticky-1' : index === 1 ? 'view-sticky-2' : ''} ${isNumberColumn(COLUMNS, index) ? 'num' : ''}`.trim()}>
                        <button type="button" className="column-sort"
                          aria-label={`Sort ${label} ${viewSort?.column === index && viewSort.direction === 'asc' ? 'descending' : 'ascending'}`}
                          onClick={() => { setViewSort((current) => nextSort(current, index)); setViewPage(1) }}>
                          <span>{label}</span>
                          {viewSort?.column === index
                            ? viewSort.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                            : <ArrowUpDown size={11} />}
                        </button>
                      </th>)}
                    </tr></thead>
                    <tbody>
                      {visibleViewRows.map((row, index) => <tr key={`${row.ZtfNo ?? index}-${row.ZtfSplit ?? index}`}>
                        {VIEW_COLUMNS.map(({ label, field }, columnIndex) => {
                          const raw = row[field]
                          const shown = displayCell(raw as CellValue, columnIndex, COLUMNS)
                          return <td key={label}
                            className={`${columnIndex === 0 ? 'view-id view-sticky-1' : columnIndex === 1 ? 'view-sticky-2' : ''} ${isNumberColumn(COLUMNS, columnIndex) ? 'num' : ''}`.trim()}
                            title={shown}>{shown}</td>
                        })}
                      </tr>)}
                    </tbody>
                  </table>
                  {!viewBusy && !viewError && filteredViewRows.length === 0 &&
                    <div className="view-empty">No saved trade flows match these filters.</div>}
                  {viewBusy && <div className="view-empty">Loading trade flows…</div>}
                </div>
                <div className="view-pagination">
                  <span>{filteredViewRows.length ? `${viewStart + 1}–${Math.min(viewStart + viewPageSize, filteredViewRows.length)} of ${filteredViewRows.length}` : '0 trade flows'}</span>
                  <div className="view-page-actions">
                    <button type="button" className="page-btn" disabled={currentViewPage <= 1}
                      onClick={() => setViewPage((p) => Math.max(1, p - 1))}>Previous</button>
                    <span>Page {currentViewPage} of {viewPageCount}</span>
                    <button type="button" className="page-btn" disabled={currentViewPage >= viewPageCount}
                      onClick={() => setViewPage((p) => Math.min(viewPageCount, p + 1))}>Next</button>
                  </div>
                </div>
              </div>
            </section>
          </section>
        </main>
      </div>

      <div
        className={toast ? 'upload-toast' : 'upload-toast hidden'}
        role="status"
        aria-live="polite"
        style={toast ? { borderLeftColor: toast.isError ? 'var(--red)' : 'var(--green)' } : undefined}
      >
        <div className="upload-toast-icon">&#10003;</div>
        <div className="upload-toast-content">
          <div className="upload-toast-title">{toast?.title ?? 'Success'}</div>
          <div className="upload-toast-message">{toast?.message ?? 'Uploaded successfully.'}</div>
        </div>
      </div>
    </div>
  )
}
