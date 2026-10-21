// Isolated browser QA. All API requests are intercepted; only local application assets are loaded.
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { read as readWorkbook, utils } from 'xlsx'

const output = path.resolve('data/ui-review/tsf-deals')
const downloadDirectory = path.join(output, 'downloads', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(downloadDirectory, { recursive: true })
const version = await (await fetch('http://127.0.0.1:9222/json/version')).json()
function connect(url) {
  const ws = new WebSocket(url), pending = new Map()
  let next = 0
  const events = new Set()
  ws.onmessage = async ({ data }) => {
    const msg = JSON.parse(data)
    if (msg.id) {
      const p = pending.get(msg.id)
      if (p) { clearTimeout(p.timer); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result) }
    } else for (const listener of events) await listener(msg)
  }
  return {
    ready: new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject }),
    call(method, params = {}) {
      const id = ++next
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)) }, 20000)
        pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }))
      })
    },
    events, close: () => ws.close(),
  }
}
const browser = connect(version.webSocketDebuggerUrl)
await browser.ready
const { browserContextId } = await browser.call('Target.createBrowserContext')
const { targetId } = await browser.call('Target.createTarget', { url: 'about:blank', browserContextId })
const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json()
const client = connect(targets.find((t) => t.id === targetId).webSocketDebuggerUrl)
await client.ready
const errors = [], requests = [], screenshots = []
let mode = 'rows', download
const apps = Array.from({ length: 32 }, (_, i) => ({
  CompanyCode: i < 16 ? 'SG03' : 'AE13', FinancialTransaction: String(i % 16 + 1).padStart(13, '0'),
  ZtsfDealID: `700000000${i % 8 + 1}`, ZtsfDealType: i % 2 ? 'D2' : 'D1', ZtsfDealDesc: 'Wheat · October shipment hedge',
  ZtsfMcRefNo: `200000000${i % 2 + 1}`, BlotterDate: `2026-10-${String(i % 19 + 1).padStart(2, '0')}`,
  Ztrcode: i % 3 ? 'NID' : 'TAN', TxnStatus: i === 5 ? '02' : i % 2 ? '07' : '03', ZolamDealNo: `TSF-${i + 1}`,
}))
const fx = apps.map((app, i) => ({
  CompanyCode: app.CompanyCode, FinancialTransaction: app.FinancialTransaction, ProductType: '12B', TransactionType: '619', Partner: '0400000002',
  ContractDate: '2026-10-01', ValueDate: '2026-12-20', BuyCurrency: 'USD', SellCurrency: 'INR', LeadCurrency: 'USD', FollowCurrency: 'INR',
  BuyAmount: String(250000 + i * 10000), SellAmount: String((250000 + i * 10000) * 83.5), SpotRate: '83.2', SwapRate: '.3', ForwardRate: '83.5', ActiveStatus: '0', ActivityCategory: '20',
}))
const masters = {
  comp: [{ ZBUKRS: 'SG03', ZBUTXT: 'Olam Global Agri', ZCOM_ID: 'OGA' }, { ZBUKRS: 'AE13', ZBUTXT: 'Olam International DMCC', ZCOM_ID: 'DMCC' }],
  trmTrader: [{ ZTCODE: 'NID', ZNAME: 'Nidhi Singh' }, { ZTCODE: 'TAN', ZNAME: 'Tanmay Shah' }],
  masterContract: [1, 2].map((n) => ({ ZMC_REF_NO: `200000000${n}`, ZMC_DESC: 'Wheat · October procurement', ZCOM_DESC: 'WHEAT', ZMOD_ID: 'M033' })),
  tsfDealId: Array.from({ length: 8 }, (_, i) => ({ ZDEAL_ID: `700000000${i + 1}`, ZTSF_MODEL: 'M033', ZPL: '1250.00', ZPL_CURR: 'USD', ZPL_LAMT: '104375.00', ZPL_LCURR: 'INR' })),
  fxModel: [{ ZMOD_ID: 'M033', ZMOD_DESC: 'INR Long Forward', ZSUB_TYPE: 'FX1', ZLINK_MODEL: '' }],
  tsfvFx: apps.map((app, i) => ({ BUKRS: app.CompanyCode, RFHA: app.FinancialTransaction, BP_NAME: 'Standard Chartered Bank', LTX: i % 4 ? 'FX Forwards: External' : 'FX Forwards: Internal', CRUSER: 'TRADER01', DCRDAT: '2026-10-01', RBUSA: '0615', REFER: `BANK-${i + 1}` })),
}
async function evaluate(expression) {
  const result = await client.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result.value
}
async function until(expression) {
  for (let i = 0; i < 150; i++) {
    if (await evaluate(expression)) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Condition not reached: ${expression}`)
}
async function screenshot(name) {
  await evaluate('document.fonts.ready')
  const { data } = await client.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(path.join(output, `${name}.png`), Buffer.from(data, 'base64'))
  screenshots.push(name)
}
const setValue = (selector, value) => evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true})); })()`)
const clickText = (text) => evaluate(`[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)}).click()`)

client.events.add(async (msg) => {
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text)
  if (msg.method !== 'Fetch.requestPaused') return
  const { requestId, request } = msg.params
  const url = new URL(request.url)
  try {
    requests.push({ method: request.method, path: url.pathname })
    let body, responseCode = 200
    if (url.pathname === '/auth/me') body = { user: { username: 'ui-review', displayName: 'UI Review' } }
    else if (url.pathname.startsWith('/config/')) body = JSON.parse(await readFile(path.join('config', path.basename(url.pathname)), 'utf8'))
    else if (url.pathname.includes('/middleware/data/')) body = { ok: true, rows: masters[path.basename(url.pathname)] ?? [] }
    else if (url.pathname.includes('/trmfxapp/')) {
      if (mode === 'error') { responseCode = 503; body = { error: { message: 'Treasury is temporarily unavailable.' } } }
      else {
        const filter = url.searchParams.get('$filter') ?? ''
        const codes = [...filter.matchAll(/CompanyCode eq '([^']+)'/g)].map((m) => m[1])
        body = { value: mode === 'empty' ? [] : apps.filter((r) => !codes.length || codes.includes(r.CompanyCode)) }
      }
    } else if (url.pathname.includes('/fx/FxTransaction')) {
      const filter = url.searchParams.get('$filter') ?? ''
      const keys = [...filter.matchAll(/CompanyCode eq '([^']+)' and FinancialTransaction eq '([^']+)'/g)].map((m) => `${m[1]}::${m[2]}`)
      body = { value: fx.filter((r) => keys.includes(`${r.CompanyCode}::${r.FinancialTransaction}`)) }
    } else { responseCode = 404; body = { error: { message: `Unmocked API: ${url.pathname}` } } }
    await client.call('Fetch.fulfillRequest', { requestId, responseCode, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(body)).toString('base64') })
  } catch (error) { errors.push(String(error)) }
})
browser.events.add((msg) => { if (msg.method === 'Browser.downloadWillBegin') download = msg.params.suggestedFilename })

try {
  await browser.call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDirectory, browserContextId, eventsEnabled: true })
  await client.call('Page.enable'); await client.call('Runtime.enable')
  await client.call('Fetch.enable', { patterns: [{ urlPattern: '*/api/*' }, { urlPattern: '*/auth/*' }, { urlPattern: '*/config/*' }] })
  await client.call('Page.addScriptToEvaluateOnNewDocument', { source: "localStorage.setItem('slc.hub.theme','light')" })
  await client.call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await client.call('Page.navigate', { url: 'http://127.0.0.1:8080/reporting/fx-structure' })
  await until("!![...document.querySelectorAll('.tile')].find(e=>e.textContent.includes('FX Front-Office'))")
  await evaluate("[...document.querySelectorAll('.tile')].find(e=>e.textContent.includes('FX Front-Office')).click()")
  await until("!![...document.querySelectorAll('.tile')].find(e=>e.textContent.includes('View List of TSF Deals'))")
  await evaluate("[...document.querySelectorAll('.tile')].find(e=>e.textContent.includes('View List of TSF Deals')).click()")
  await until("location.pathname==='/apps/view-tsf-deals' && !![...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Run Report'&&!e.disabled)")
  await setValue('#tsf-from', '2026-10-01')
  await setValue('#tsf-to', '2026-10-19')
  await clickText('Run Report')
  await until("location.pathname==='/apps/view-tsf-deals' && document.querySelector('.tsf-pagination')?.textContent.includes('of 32 transactions')")
  assert.equal(await evaluate("document.querySelector('.tsf-deal-table tbody').rows.length"), 15)
  await screenshot('desktop-light')
  await evaluate("document.documentElement.dataset.theme='dark'")
  await screenshot('desktop-dark')
  await evaluate("document.documentElement.dataset.theme='light'")
  await client.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false })
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true)
  await screenshot('mobile')
  await client.call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await evaluate("document.querySelector('.tsf-txn-link').click()")
  await until("!!document.querySelector('dialog[open]')")
  assert.ok(await evaluate("document.querySelector('dialog[open]').textContent.includes('Transaction Display')"))
  await screenshot('transaction-display')
  await evaluate("document.querySelector('dialog[open] .slc-dialog__close').click()")
  await setValue('input[aria-label="Search report"]', '0000000000001')
  await until("document.querySelector('.tsf-pagination')?.textContent.includes('of 2 transactions')")
  await setValue('input[aria-label="Search report"]', '')
  await until("document.querySelector('.tsf-pagination')?.textContent.includes('of 32 transactions')")
  await evaluate("document.querySelector('button[aria-label=\"Next page\"]').click()")
  assert.ok(await evaluate("document.querySelector('.tsf-pagination').textContent.includes('Showing 16–30')"))
  await clickText('Export Excel')
  for (let i = 0; i < 100 && !download; i++) await new Promise((resolve) => setTimeout(resolve, 100))
  assert.ok(download)
  let file
  for (let i = 0; i < 100; i++) {
    try { file = await readFile(path.join(downloadDirectory, download)); break } catch { await new Promise((resolve) => setTimeout(resolve, 100)) }
  }
  assert.ok(file)
  const workbook = readWorkbook(file)
  const exported = utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]])
  assert.equal(exported.length, 32)
  assert.equal(typeof exported[0].Transaction, 'string')
  assert.ok(exported[0].Transaction.startsWith('000'))
  await setValue('#tsf-company', 'AE13')
  await clickText('Run Report')
  await until("document.querySelector('.tsf-pagination')?.textContent.includes('of 16 transactions')")
  await setValue('#tsf-trader', 'TAN')
  await clickText('Run Report')
  await until("document.querySelector('.tsf-pagination')?.textContent.includes('of 5 transactions')")
  await screenshot('filtered')
  mode = 'empty'; await clickText('Refresh')
  await until("document.querySelector('.tsf-empty')?.textContent.includes('No TSF deals')")
  await screenshot('empty')
  mode = 'error'; await clickText('Refresh')
  await until("document.querySelector('[role=alert]')?.textContent.includes('Treasury is temporarily unavailable')")
  await screenshot('error')
  assert.equal(await evaluate("document.querySelectorAll('.tsf-txn-link').length"), 0)
  await evaluate("document.querySelector('.fx-back-btn').click()")
  await until("location.pathname==='/reporting/fx-structure' && !![...document.querySelectorAll('.tile')].find(e=>e.textContent.includes('View List of TSF Deals'))")
  assert.deepEqual(requests.filter((r) => r.method !== 'GET'), [])
  assert.deepEqual(errors, [])
  await writeFile(path.join(output, 'report.json'), JSON.stringify({ screenshots, assertions: ['reporting menu launch and Back to the same folder', '32 rows / paging', 'light and dark', 'mobile without page overflow', 'transaction details', 'search', 'company/trader filters', '32-row Excel export preserving leading zeroes', 'empty and error states', 'no writes'], requests, errors }, null, 2))
  console.log(JSON.stringify({ screenshots: screenshots.length, exportedRows: exported.length, errors: errors.length, output }))
} finally {
  client.close()
  await browser.call('Target.disposeBrowserContext', { browserContextId })
  browser.close()
}
