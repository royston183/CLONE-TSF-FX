// Dependency-free CDP review. Uses isolated, synthetic sessions; never calls SAP or writes data.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'

const phase = process.argv[2] || 'after'
const output = path.resolve('data/ui-review/fx-alm')
await mkdir(output, { recursive: true })
if (phase === 'report') {
  // Regenerate the gallery from a completed capture, without visiting either app again.
  const report = JSON.parse(await readFile(path.join(output,'after-report.json'),'utf8'))
  assert.equal(report.errors.length,0)
  assert.deepEqual(report.screens.filter(s=>!s.name.startsWith('reference-') && s.overflow),[])
  await writeGallery(report.screens.filter(s=>s.width===1440 && !s.name.includes('reference') && !s.name.endsWith('-dark') && !s.name.includes('dialog')).map(s=>s.name))
  console.log(JSON.stringify({ screenshots:report.screens.length, interactions:report.interactions, targetOverflow:[], referenceOverflow:report.screens.filter(s=>s.name.startsWith('reference-')&&s.overflow).map(s=>s.name), errors:report.errors },null,2))
  process.exit(0)
}
const tab = await (await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' })).json()
const ws = new WebSocket(tab.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
let nextId = 0
const pending = new Map(), errors = [], requests = []
let currentRoute = ''
// Review-only master rows, shaped like the existing masters.test.ts fixtures.
const masters = {
  comp: [
    { ZCOM_ID: 'OGA', ZBUKRS: 'SG03', ZBUTXT: 'Olam Global Agri', ZWAERS: 'USD', ZFX_PC_NAME: 'FX', ZBA_NAME: 'SINGAPORE' },
    { ZCOM_ID: 'OSIPL', ZBUKRS: 'IN11', ZBUTXT: 'Olam Agri India', ZWAERS: 'INR', ZORIGIN: 'X' },
    { ZCOM_ID: 'DMCC', ZBUKRS: 'AE13', ZBUTXT: 'Olam International DMCC', ZWAERS: 'AED' },
  ],
  fxModel: [{ ZMOD_ID: 'M032', ZMOD_DESC: 'INR Long Forward', ZENT_DESC: 'OGA-DMCC-OSIPL', ZD1_BCURR: 'USD', ZD2_BCURR: 'INR', ZSS: 'N' }],
  commodity: [{ ZCOM_ID: 'C102', ZCOM_SDESC: 'WHEAT', ZCOM_DESC: 'WHEAT' }],
  tolerance: [{ ZTOL_ID: 'T01', ZTOL_PER: '5' }],
  ftrtFixDef: [{ FIX_ID: 'FBIL', FCURR: 'USD', LCURR: 'INR' }],
}
function call(method, params = {}) {
  const id = ++nextId
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 20000)
    pending.set(id, { resolve, reject, timer })
    ws.send(JSON.stringify({ id, method, params }))
  })
}
ws.onmessage = async event => {
  const msg = JSON.parse(event.data)
  if (msg.id) {
    const p = pending.get(msg.id)
    if (p) { clearTimeout(p.timer); pending.delete(msg.id); msg.error ? p.reject(msg.error) : p.resolve(msg.result) }
  }
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.text + ': ' + (msg.params.exceptionDetails.exception?.description || ''))
  if (msg.method !== 'Fetch.requestPaused') return
  const { requestId, request } = msg.params
  const url = new URL(request.url)
  try {
    // Read assets locally. All app API requests are intercepted, including writes.
    if (!/^\/(api|auth|config)\//.test(url.pathname) || url.pathname.endsWith('.mjs')) { await call('Fetch.continueRequest', { requestId }); return }
    requests.push({ path: url.pathname, method: request.method })
    let body = {}, responseCode = 200
    if (url.pathname === '/auth/me') body = { user: { username: 'visual-review', displayName: 'Visual Review' } }
    else if (url.pathname === '/api/workspace') body = { session: { username: 'visual-review', sapStatus: 'disconnected' }, auth: {}, assistant: {} }
    else if (url.pathname.startsWith('/config/')) {
      const name = path.basename(url.pathname)
      try { body = JSON.parse(await readFile(path.join('config', name), 'utf8')) } catch { body = {} }
    } else if (['fx-blotter', 'fo-create-deal-id-manually', 'fo-fx-error-correction'].includes(currentRoute) && request.method === 'GET') {
      body = url.pathname.includes('/middleware/data/') ? { rows: masters[path.basename(url.pathname)] || [] } : { value: [] }
    } else { responseCode = 503; body = { error: { message: 'Offline visual review: SAP requests are intercepted.' } } }
    await call('Fetch.fulfillRequest', { requestId, responseCode, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(body)).toString('base64') })
  } catch (e) { if (!String(e?.message).includes('Invalid InterceptionId')) errors.push(JSON.stringify(e)) }
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result.value
}
async function screenshot(name) {
  await evaluate('document.fonts.ready')
  const { data } = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(path.join(output, `${phase}-${name}.png`), Buffer.from(data, 'base64'))
}
async function navigate(url) {
  currentRoute = new URL(url).pathname.split('/').at(-1)
  await call('Page.navigate', { url })
  for (let i = 0; i < 200; i++) {
    await pause(200)
    if (await evaluate('document.readyState === "complete" && (!!document.querySelector(".page-header,.page-head,.topbar,.header,.ds-app") || !!document.querySelector("#alm-fx-ui > :not(.slc-page-center)"))')) break
  }
  await pause(1500)
}
const metrics = `(() => {
  const visible = e => e && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0;
  const pick = selector => [...document.querySelectorAll(selector)].find(visible);
  const style = selector => { const e = pick(selector); if (!e) return null; const s = getComputedStyle(e), r = e.getBoundingClientRect(); return { text:e.innerText?.slice(0,90), font:s.fontFamily, size:s.fontSize, weight:s.fontWeight, color:s.color, background:s.backgroundColor, padding:s.padding, radius:s.borderRadius, align:s.textAlign, height:r.height }; };
  return { title:document.title, width:innerWidth, overflow:document.documentElement.scrollWidth > innerWidth, body:style('#alm-fx-ui > div, .ds-app, .fomc, .fx-blotter'), heading:style('.page-title, .page-header h1, .topbar-title, .page-heading h1, .titleblock h1, .brand-title, .titlewrap > .title, .topbar h1'), th:style('th'), td:style('td'), button:style('.btn-primary, .button:not(.secondary)'), input:style('input:not([type=checkbox]):not([type=radio])'), dialog:style('[role=dialog], .modal-overlay.open .modal'), text:document.body.innerText.slice(0,220) };
})()`
await call('Page.enable')
await call('Runtime.enable')
await call('Fetch.enable', { patterns: [{ urlPattern: '*://127.0.0.1:*/api/*' }, { urlPattern: '*://127.0.0.1:*/auth/*' }, { urlPattern: '*://127.0.0.1:*/config/*' }] })
await call('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('slc.hub.theme','light'); localStorage.setItem('alm-theme','light')` })
await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
const report = { phase, screens: [], errors, requests }
await navigate('http://127.0.0.1:5177/#/master-data/data-sources')
await screenshot('reference-maintenance')
report.screens.push({ name: 'reference-maintenance', ...await evaluate(metrics) })
if (phase !== 'before') {
  for (const [name, width, height] of [['laptop',1280,800],['tablet',768,1024],['mobile',390,844]]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor:1, mobile:false })
    await pause(250)
    await screenshot(`reference-maintenance-${name}`)
    report.screens.push({ name:`reference-maintenance-${name}`, ...await evaluate(metrics) })
  }
  await call('Emulation.setDeviceMetricsOverride', { width:1440, height:1000, deviceScaleFactor:1, mobile:false })
}
const routes = ['fo-create-master-contract', 'mo-confirm-master-contract', 'mo-update-mc-expiry', 'fo-mc-error-correction', 'mo-reject-mc-after-expiry', 'short-straddle-deal-id', 'fx-blotter', 'fo-fx-error-correction', 'fo-change-deal-id', 'fo-create-deal-id-manually', 'fo-early-delivery-unwind-rollover', 'fo-additional-spot-booking', 'fo-trader-workbench', 'tsf-ndf-fixing', 'fo-ndf-fixing-error-correction']
for (const route of process.argv[3] ? routes.filter(r=>process.argv[3].split(',').includes(r)) : routes) {
  await navigate(`http://127.0.0.1:5173/apps/${route}`)
  await screenshot(route)
  const desktop = await evaluate(metrics)
  report.screens.push({ name: route, ...desktop })
  if (phase === 'before') continue
  assert.ok(desktop.text.length > 20, `${route}: app did not load`)
  await evaluate("document.documentElement.dataset.theme='dark'")
  await pause(300)
  await screenshot(`${route}-dark`)
  report.screens.push({ name: `${route}-dark`, ...await evaluate(metrics) })
  await evaluate("document.documentElement.dataset.theme='light'")
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false })
  await pause(300)
  await screenshot(`${route}-mobile`)
  report.screens.push({ name: `${route}-mobile`, ...await evaluate(metrics) })
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  if (['fo-create-master-contract','fx-blotter'].includes(route)) {
    for (const [name, width, height] of [['laptop',1280,800],['tablet',768,1024]]) {
      await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor:1, mobile:false })
      await pause(250)
      await screenshot(`${route}-${name}`)
      report.screens.push({ name:`${route}-${name}`, ...await evaluate(metrics) })
    }
    await call('Emulation.setDeviceMetricsOverride', { width:1440, height:1000, deviceScaleFactor:1, mobile:false })
  }
}
await navigate('http://127.0.0.1:5173/apps/fo-create-master-contract')
const opened = await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(e=>e.textContent.includes('+ Create Master Contract')); b?.click(); return !!b })()`)
await pause(250)
if (opened) { await screenshot('create-contract-dialog'); report.screens.push({ name:'create-contract-dialog', ...await evaluate(metrics) }) }
if (phase !== 'before' && opened) {
  // Trigger existing validation without submitting a valid contract.
  await evaluate(`(() => { const modal=[...document.querySelectorAll('.modal')].find(e=>e.getBoundingClientRect().height>0); [...modal.querySelectorAll('button')].find(e=>e.textContent.trim()==='Create Master Contract')?.click() })()`)
  await pause(200)
  const validation = await evaluate(`document.querySelectorAll('.field.invalid,.field.has-error,.field-error:not(:empty),[aria-invalid=true]').length`)
  assert.ok(validation > 0, 'Contract validation did not appear')
  await screenshot('create-contract-validation')
  await call('Input.dispatchKeyEvent', { type:'keyDown', key:'Escape', code:'Escape' })
  await call('Input.dispatchKeyEvent', { type:'keyUp', key:'Escape', code:'Escape' })
  await pause(300)
  // Search, sorting and row selection use existing event handlers and existing fallback rows.
  const first = await evaluate(`document.querySelector('.mc-table .mc-link')?.textContent`)
  assert.ok(first, 'Master Contract table is missing')
  await evaluate(`(() => {const e=document.querySelector('.fomc .search-box input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(first)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`)
  await pause(200)
  assert.equal(await evaluate(`document.querySelectorAll('.mc-table tbody tr').length`), 1, 'Search did not filter to one contract')
  await evaluate(`(() => {const e=document.querySelector('.fomc .search-box input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'');e.dispatchEvent(new Event('input',{bubbles:true}));})()`)
  await pause(200)
  await evaluate(`(() => {[...document.querySelectorAll('.mc-table th')].find(e=>e.textContent.includes('MC Number'))?.click()})()`)
  await pause(200)
  assert.notEqual(await evaluate(`document.querySelector('.mc-table .mc-link')?.textContent`), first, 'MC Number sorting did not change the first row')
  await evaluate(`document.querySelector('.mc-table tbody input[type=checkbox]')?.click()`)
  await pause(200)
  assert.ok(await evaluate(`document.querySelector('.mc-table tbody input[type=checkbox]')?.checked`), 'Row selection did not update')
  report.interactions = { createDialog:true, requiredFieldValidation:true, search:true, sorting:true, rowSelection:true }
  await screenshot('selected-sorted-contracts')
}
await writeFile(path.join(output, `${phase}-report.json`), JSON.stringify(report, null, 2))
if (phase !== 'before') {
  assert.equal(errors.length, 0, 'Uncaught browser exceptions')
  assert.deepEqual(report.screens.filter(s=>!s.name.startsWith('reference-') && s.overflow).map(s=>s.name), [], 'Clone page-level horizontal overflow')
  await writeGallery(routes)
}
await call('Page.close')
ws.close()
console.log(JSON.stringify({ output, screenshots: report.screens.length, errors, overflowing: report.screens.filter(s=>s.overflow).map(s=>s.name), nonGetRequests: requests.filter(r=>r.method!=='GET') }, null, 2))

async function writeGallery(routes) {
  // A local, reviewable gallery; screenshots themselves are kept out of source control.
  const figures = routes.map(route => `<section><h2>${route}</h2><div class="pair"><figure><figcaption>Before · 1440 × 1000</figcaption><img src="before-${route}.png" loading="lazy"></figure><figure><figcaption>After · 1440 × 1000</figcaption><img src="after-${route}.png" loading="lazy"></figure></div><details><summary>Night and mobile</summary><div class="pair"><img src="after-${route}-dark.png" loading="lazy"><img class="mobile" src="after-${route}-mobile.png" loading="lazy"></div></details></section>`).join('')
  await writeFile(path.join(output,'comparison.html'), `<!doctype html><meta charset="utf-8"><title>FX / ALM visual review</title><style>body{font:14px system-ui;background:#f4f7fb;color:#22354c;margin:24px}section{padding:20px;background:white;border:1px solid #e6ebf2;border-radius:9px;margin:24px 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}img{width:100%;height:auto;border:1px solid #e6ebf2}img.mobile{max-width:390px}figcaption,summary{margin:12px 0;color:#718096}@media(max-width:750px){.pair{grid-template-columns:1fr}}</style><h1>FX Master Contract / Front Office</h1><p>15 implemented routes. Offline synthetic review sessions; no SAP writes. Some original before views show unavailable-service states. Only compare populated views under equivalent data conditions.</p><section><h2>ALM maintenance reference</h2><img src="after-reference-maintenance.png"></section>${figures}`)
}
