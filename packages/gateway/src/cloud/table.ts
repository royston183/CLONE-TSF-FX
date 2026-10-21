import type { Service } from '../config.ts'
import { proxyRequest } from '../sap/proxy.ts'
import { DdicInputError, type DdicColumn, type DdicRow } from '../sqlite/repositories/ddic-table.ts'

export class CloudTableError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Map each cloud resource's column casing to the SAP names used by the screens. */
export function cloudTable(service: Service | undefined, resource: string, columns: readonly DdicColumn[], columnCase: 'lower' | 'upper' = 'lower') {
  const wireName = (name: string) => columnCase === 'upper' ? name : name.toLowerCase()
  const keys = columns.filter((c) => c.key)
  const byName = new Map(columns.map((c) => [c.name, c]))
  const dateColumn = (name: string) => name.endsWith('_DATE') || name === 'ZDDATE'
  const timeColumn = (name: string) => name.endsWith('_TIME')

  async function call(method: string, query = '', body?: unknown): Promise<Record<string, unknown>> {
    if (!service || service.unavailable || service.kind !== 'rest') {
      throw new CloudTableError(503, 'The cloud middleware is not configured for TSF tables.')
    }
    const result = await proxyRequest(service, method, `data/${resource}`, query,
      body === undefined ? undefined : Buffer.from(JSON.stringify(body)), 'application/json')
    let data: Record<string, unknown>
    try {
      data = JSON.parse(result.body.toString('utf8')) as Record<string, unknown>
    } catch {
      throw new CloudTableError(502, `The cloud resource ${resource} returned an invalid response.`)
    }
    if (result.status >= 400 || data?.['ok'] === false) {
      const error = data?.['error'] as { message?: string | { value?: string } } | undefined
      const message = typeof error?.message === 'string' ? error.message : error?.message?.value
      throw new CloudTableError(result.status >= 400 ? result.status : 502, message || `Cloud request for ${resource} failed.`)
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new CloudTableError(502, `The cloud resource ${resource} returned an invalid response.`)
    }
    return data
  }

  function keyOf(key: Record<string, string>): Record<string, string> {
    return Object.fromEntries(keys.map((c) => {
      const value = key[c.name]
      if (typeof value !== 'string' || !value.trim() || value.length > c.max) {
        throw new DdicInputError(`${c.name} is required, at most ${c.max} characters.`)
      }
      return [wireName(c.name), value]
    }))
  }

  function fieldsOf(body: Record<string, unknown>): DdicRow {
    const out: DdicRow = {}
    for (const [name, value] of Object.entries(body)) {
      const column = byName.get(name)
      if (!column || column.key) throw new DdicInputError(`Unknown or read-only field: ${name}.`)
      if (column.kind === 'number') {
        const n = typeof value === 'string' && value.trim() ? Number(value) : value
        if (typeof n !== 'number' || !Number.isFinite(n)) throw new DdicInputError(`${name} must be a number.`)
        out[name] = n
      } else {
        if (value === null || value === undefined) { out[name] = ''; continue }
        if (typeof value !== 'string' || value.length > column.max) {
          throw new DdicInputError(`${name} must be a string of at most ${column.max} characters.`)
        }
        out[name] = value
      }
    }
    return out
  }

  function toWire(row: DdicRow): Record<string, string | number> {
    return Object.fromEntries(Object.entries(row).map(([name, value]) => {
      // Middleware codecs accept ISO dates/times. Reads are normalised back to SAP DATS/TIMS.
      // Initial TIMS is midnight; the typed cloud resources reject a blank time as NULL.
      if (timeColumn(name) && value === '') value = '000000'
      if (typeof value === 'string' && dateColumn(name) && /^\d{8}$/.test(value) && value !== '00000000') {
        value = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
      }
      if (typeof value === 'string' && timeColumn(name) && /^\d{6}$/.test(value)) {
        value = `${value.slice(0, 2)}:${value.slice(2, 4)}:${value.slice(4, 6)}`
      }
      return [wireName(name), value]
    }))
  }

  function fromWire(raw: Record<string, unknown>): DdicRow {
    const row: DdicRow = {}
    for (const c of columns) {
      let value = raw[wireName(c.name)] ?? ''
      if (c.kind === 'number') {
        value = Number(value)
        if (!Number.isFinite(value)) throw new CloudTableError(502, `Invalid ${c.name} in cloud resource ${resource}.`)
      } else {
        let text = String(value)
        if (dateColumn(c.name)) text = text.replace(/-/g, '')
        if (timeColumn(c.name)) text = text.replace(/:/g, '')
        value = text
      }
      row[c.name] = value as string | number
    }
    return row
  }

  async function read(filter: Record<string, string>): Promise<DdicRow[]> {
    const rows: DdicRow[] = []
    const pageSize = 500
    for (let offset = 0; ; offset += pageSize) {
      const query = new URLSearchParams({ ...filter, limit: String(pageSize), offset: String(offset), sort: keys.map((c) => wireName(c.name)).join(',') })
      const data = await call('GET', query.toString())
      if (!Array.isArray(data['rows'])) throw new CloudTableError(502, `Missing rows in cloud resource ${resource}.`)
      rows.push(...(data['rows'] as Record<string, unknown>[]).map(fromWire))
      if (data['rows'].length < pageSize) return rows
    }
  }

  return {
    async list(filter?: { column: string; value: string }): Promise<DdicRow[]> {
      if (filter && !byName.has(filter.column)) throw new DdicInputError(`Unknown field: ${filter.column}.`)
      return read(filter ? { [wireName(filter.column)]: filter.value } : {})
    },
    async get(key: Record<string, string>): Promise<DdicRow | undefined> {
      return (await read(keyOf(key)))[0]
    },
    async upsert(key: Record<string, string>, body: Record<string, unknown>, existing: DdicRow | undefined): Promise<DdicRow> {
      const wireKey = keyOf(key)
      const fields = fieldsOf(body)
      if (existing) {
        await call('PATCH', '', { key: wireKey, changes: toWire(fields) })
      } else {
        // These imported cloud columns are NOT NULL; partial creates need the DDIC initial values.
        const initial: DdicRow = Object.fromEntries(columns.filter((c) => !c.key).map((c) => [c.name, c.kind === 'number' ? 0 : '']))
        await call('POST', '', { data: toWire({ ...initial, ...key, ...fields }) })
      }
      const saved = (await read(wireKey))[0]
      if (!saved) throw new CloudTableError(existing ? 409 : 502, 'The cloud write could not be read back. Reload before retrying.')
      return saved
    },
    async remove(key: Record<string, string>): Promise<boolean> {
      const wireKey = keyOf(key)
      if (!(await read(wireKey)).length) return false
      const result = await call('DELETE', '', { key: wireKey })
      return result['affectedRows'] !== 0
    },
  }
}
