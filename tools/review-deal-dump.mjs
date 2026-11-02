// Isolated browser QA: API reads are intercepted; no SAP/middleware traffic or writes.
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { read as readWorkbook, utils } from 'xlsx'

const output = path.resolve('data/ui-review/deal-dump')
const downloads = path.join(output, 'downloads', String(Date.now()))
await mkdir(downloads, { recursive: true })
function connect(url) {
  const ws = new WebSocket(url), pending = new Map(), events = new Set()
  let next = 0
  ws.onmessage = async ({ data }) => {
    const msg = JSON.parse(data)
    if (msg.id) {
      const request = pending.get(msg.id)
      if (request) { clearTimeout(request.timer); pending.delete(msg.id); msg.error ? request.reject(new Error(JSON.stringify(msg.error))) : request.resolve(msg.result) }
    } else for (const listener of events) await listener(msg)
  }
  return {
    ready: new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject }), events,
    call(method, params = {}) {
      const id = ++next
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)) }, 20000)
        pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }))
      })
    }, close: () => ws.close(),
  }
}
const version = await (await fetch('http://127.0.0.1:9333/json/version')).json()
const browser = connect(version.webSocketDebuggerUrl)
await browser.ready
const { browserContextId } = await browser.call('Target.createBrowserContext')
const { targetId } = await browser.call('Target.createTarget', { url: 'about:blank', browserContextId })
const targets = await (await fetch('http://127.0.0.1:9333/json/list')).json()
const client = connect(targets.find((t) => t.id === targetId).webSocketDebuggerUrl)
await client.ready
const errors = [], requests = [], screenshots = []
let mode = 'rows', download
const now = new Date()
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
const apps = Array.from({ length: 32 }, (_, i) => ({
  CompanyCode: i < 16 ? 'SG03' : 'AE13', FinancialTransaction: String(i % 16 + 1).padStart(13, '0'),
  BlotterDate: today, TxnStatus: i === 5 ? '02' : '03', ZtsfDealID: i % 2 ? `700000000${i % 8}` : '', Ztrcode: i % 2 ? 'NID' : 'TAN',
}))
const fx = [...apps, { CompanyCode: 'SG03', FinancialTransaction: '0000000000099' }].map((a, i) => ({
  CompanyCode: a.CompanyCode, FinancialTransaction: a.FinancialTransaction, ProductType: '12B', TransactionType: '619', Partner: '0400000002',
  ContractDate: today, ValueDate: today, BuyCurrency: 'EUR', SellCurrency: 'USD', LeadCurrency: 'EUR', FollowCurrency: 'USD',
  BuyAmount: String(1000 + i * 100), SellAmount: String((1000 + i * 100) * 1.2), ForwardRate: '1.2', SpotRate: '1.19', SwapRate: '.01', ActiveStatus: '0',
}))
const masters = {
  comp: [{ ZBUKRS: 'SG03', ZBUTXT: 'Singapore Treasury' }, { ZBUKRS: 'AE13', ZBUTXT: 'Dubai Treasury' }],
  trdGrp: [{ ZTCODE: 'NID', ZTRADER: 'Nidhi Singh' }, { ZTCODE: 'TAN', ZTRADER: 'Tanmay Shah' }],
  tsfvFx: fx.map((r, i) => ({ BUKRS: r.CompanyCode, RFHA: r.FinancialTransaction, BP_NAME: 'Bank <script>never execute</script>', LTX: i % 4 ? 'FX Forwards: External' : 'FX Forwards: Internal', XTEXT: 'Forward', RBUSA: '0615', BA_NAME: 'Treasury', NORDEXT: `BANK-${i}` })),
}
async function evaluate(expression) {
  const result = await client.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result.value
}
async function until(expression) {
  for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await new Promise((resolve) => setTimeout(resolve, 100)) }
  throw new Error(`Condition not reached: ${expression}`)
}
const clickText = (text) => evaluate(`[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)}).click()`)
const setValue = (selector, value) => evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`)
async function screenshot(name) {
  await evaluate('document.fonts.ready')
  const { data } = await client.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(path.join(output, `${name}.png`), Buffer.from(data, 'base64')); screenshots.push(name)
}
client.events.add(async (msg) => {
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text)
  if (msg.method !== 'Fetch.requestPaused') return
  const { requestId, request } = msg.params
  const url = new URL(request.url)
  if (!/^\/(auth|config|api)\//.test(url.pathname)) { await client.call('Fetch.continueRequest', { requestId }); return }
  requests.push({ method: request.method, path: url.pathname, filter: url.searchParams.get('$filter') })
  let body, responseCode = 200
  if (url.pathname === '/auth/me') body = { user: { username: 'report-review', displayName: 'Report Review' } }
  else if (url.pathname.startsWith('/config/')) body = JSON.parse(await readFile(path.join('config', path.basename(url.pathname)), 'utf8'))
  else if (url.pathname.includes('/middleware/data/')) {
    if (mode === 'details-error' && url.pathname.endsWith('/tsfvFx')) { responseCode = 503; body = { error: { message: 'Descriptions unavailable' } } }
    else body = { rows: masters[path.basename(url.pathname)] ?? [] }
  } else if (url.pathname.includes('/trmfxapp/') || url.pathname.includes('/fx/')) {
    if (mode === 'error') { responseCode = 503; body = { error: { message: 'Treasury is temporarily unavailable' } } }
    else body = { value: mode === 'empty' ? [] : url.pathname.includes('/trmfxapp/') ? apps : fx }
  } else { responseCode = 404; body = { error: { message: `Unexpected request: ${url.pathname}` } } }
  await client.call('Fetch.fulfillRequest', { requestId, responseCode, responseHeaders: [{ name: 'content-type', value: 'application/json' }], body: Buffer.from(JSON.stringify(body)).toString('base64') })
})
browser.events.add((msg) => {
  if (msg.method === 'Browser.downloadWillBegin') download = { name: msg.params.suggestedFilename, done: false }
  if (msg.method === 'Browser.downloadProgress' && msg.params.state === 'completed' && download) download.done = true
})
try {
  await Promise.all([client.call('Page.enable'), client.call('Runtime.enable'), client.call('Fetch.enable', { patterns: [{ urlPattern: '*' }] })])
  await client.call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await browser.call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, eventsEnabled: true, browserContextId })
  await client.call('Page.navigate', { url: 'http://127.0.0.1:5181/reporting/fx-structure' })
  await until("[...document.querySelectorAll('.tile')].some(e=>e.textContent.includes('FX Front-Office'))")
  await evaluate("[...document.querySelectorAll('.tile')].find(e=>e.textContent.includes('FX Front-Office')).click()")
  await until("[...document.querySelectorAll('.tile')].some(e=>e.textContent.includes('View List of All Transactions'))")
  await evaluate("[...document.querySelectorAll('.tile')].find(e=>e.textContent.includes('View List of All Transactions')).click()")
  await until("document.querySelector('.tsf-pagination')?.textContent.includes('of 32 transactions')")
  assert.equal(await evaluate("document.querySelectorAll('.deal-dump tbody tr').length"), 15)
  await evaluate("document.querySelector('[aria-label=\"Next page\"]').click()")
  await until("document.querySelector('.tsf-pagination')?.textContent.includes('Showing 16–30')")
  await evaluate("document.querySelector('[aria-label=\"Previous page\"]').click()")
  await until("document.querySelector('.tsf-pagination')?.textContent.includes('Showing 1–15')")
  await screenshot('desktop-light')
  await evaluate("document.documentElement.dataset.theme='dark'")
  await screenshot('desktop-dark')
  await evaluate("document.documentElement.dataset.theme='light'")
  await evaluate("document.querySelector('.tsf-txn-link').click()")
  await until("!!document.querySelector('dialog[open]')")
  assert.ok(await evaluate("document.querySelector('dialog[open]').textContent.includes('Rate Quotation')"))
  assert.equal(await evaluate("document.querySelector('dialog[open]').querySelectorAll('script').length"), 0)
  await screenshot('details')
  await evaluate("document.querySelector('dialog[open] .slc-dialog__close').click()")
  await clickText('Columns')
  await until("!!document.querySelector('dialog[open] .dump-columns')")
  await evaluate("[...document.querySelectorAll('dialog[open] label')].find(e=>e.textContent==='TSF Deal ID').querySelector('input').click()")
  await clickText('Done')
  assert.ok(await evaluate("[...document.querySelectorAll('thead th')].some(e=>e.textContent.includes('TSF Deal ID'))"))
  await clickText('Export Excel')
  for (let i = 0; i < 100 && !download?.done; i++) await new Promise((resolve) => setTimeout(resolve, 100))
  assert.ok(download?.done, 'Excel download completed')
  const records = utils.sheet_to_json(readWorkbook(await readFile(path.join(downloads, download.name))).Sheets['Deal Dump'])
  assert.equal(records.length, 32)
  assert.equal(typeof records[0]['Transaction No.'], 'string')
  assert.equal(typeof records[0]['Amount 1'], 'number')
  download = undefined
  await clickText('Download CSV')
  for (let i = 0; i < 100 && !download?.done; i++) await new Promise((resolve) => setTimeout(resolve, 100))
  assert.ok(download?.done, 'CSV download completed')
  const csv = await readFile(path.join(downloads, download.name), 'utf8')
  assert.equal(csv.split('\r\n').length, 33)
  assert.ok(csv.includes('"0000000000001"'))
  await setValue('[aria-label="Type"]', 'TSF-linked')
  await until("document.querySelector('.tsf-pagination')?.textContent.includes('of 16 transactions')")
  await clickText('Clear filters')
  await clickText('Value')
  await clickText('Run Report')
  await until("document.querySelector('.tsf-pagination')?.textContent.includes('of 33 transactions')")
  assert.ok(requests.some((r) => r.filter?.includes('ValueDate ge')))
  await clickText('Trade')
  assert.equal(await evaluate("[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Export Excel').disabled"), true)
  await clickText('Run Report')
  await until("document.querySelector('.tsf-pagination')?.textContent.includes('of 33 transactions')")
  await setValue('[aria-label="Search all columns"]', '0000000000099')
  await until("document.querySelector('.tsf-pagination')?.textContent.includes('of 1 transactions')")
  await screenshot('non-tsf-transaction')
  await clickText('Clear filters')
  await clickText('More filters')
  await setValue('[aria-label="Trader"]', 'NID')
  await until("document.querySelector('.tsf-pagination')?.textContent.includes('of 16 transactions')")
  await clickText('Clear filters')
  await setValue('#dump-company', 'AE13'); await clickText('Run Report')
  await until("document.querySelector('.tsf-pagination')?.textContent.includes('of 16 transactions')")
  await client.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'no page overflow on mobile')
  await screenshot('mobile')
  await client.call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  mode = 'details-error'; await clickText('Refresh')
  await until("[...document.querySelectorAll('[role=status]')].some(e=>e.textContent.includes('could not be loaded'))")
  assert.ok(await evaluate("document.querySelector('.tsf-pagination').textContent.includes('of 16 transactions')"))
  mode = 'empty'; await clickText('Refresh')
  await until("document.querySelector('.tsf-empty')?.textContent.includes('No transactions match this selection')")
  await screenshot('empty')
  mode = 'error'; await clickText('Refresh')
  await until("document.querySelector('[role=alert]')?.textContent.includes('Treasury is temporarily unavailable')")
  await screenshot('error')
  mode = 'rows'; await clickText('Retry')
  await until("document.querySelector('.tsf-pagination')?.textContent.includes('of 16 transactions')")
  await evaluate("document.querySelector('.fx-back-btn').click()")
  await until("location.pathname==='/reporting/fx-structure' && [...document.querySelectorAll('.tile')].some(e=>e.textContent.includes('View List of All Transactions'))")
  assert.deepEqual(requests.filter((r) => r.method !== 'GET'), [])
  assert.deepEqual(errors, [])
  await writeFile(path.join(output, 'report.json'), JSON.stringify({ screenshots, exportedRows: records.length, assertions: ['menu launch / Back', 'non-TSF transactions', 'all date bases', 'details / escaped text', 'column chooser', 'search / trader / company / type', 'pagination', 'CSV and Excel export across pages / identifier types', 'dirty selection export guard', 'light / dark / mobile', 'supplementary failure / empty / error / retry', 'no writes'], requests, errors }, null, 2))
  console.log(JSON.stringify({ screenshots: screenshots.length, exportedRows: records.length, errors: errors.length, output }))
} finally {
  await browser.call('Target.disposeBrowserContext', { browserContextId })
  client.close(); browser.close()
}
