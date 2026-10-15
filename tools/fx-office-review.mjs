// Dependency-free CDP review. Uses isolated, synthetic sessions; never calls SAP or writes data.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'

const phase = process.argv[2] || 'after'
const output = path.resolve('data/ui-review/fx-office')
await mkdir(output, { recursive: true })
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
  await pause(250)
  for (let i = 0; i < 150; i++) {
    await pause(100)
    if (await evaluate('document.readyState !== "loading" && !document.querySelector(".slc-page-center") && (!!document.querySelector(".page-header,.page-head,.topbar,.header,.ds-app") || !!document.querySelector("#alm-fx-ui > :not(.slc-page-center)"))')) break
  }
  await pause(500)
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
const apps = JSON.parse(await readFile('config/apps.json','utf8')).apps
const menu = JSON.parse(await readFile('config/fx-menu.json','utf8'))
const targets = []
function walk(n) { for (const item of n.items || []) { const app=apps.find(a=>a.code===item.code); if(app && !targets.includes(app.id)) targets.push(app.id) } for(const child of n.subgroups||[]) walk(child) }
menu.slice(2).forEach(walk)
const routes = ['fo-create-master-contract','fx-blotter', ...targets]
report.interactions=[]
for(const route of process.argv[3] ? routes.filter(r=>process.argv[3].split(',').includes(r)) : routes) {
  await navigate(`http://127.0.0.1:5182/apps/${route}`)
  for(const [suffix,width,height,theme] of phase==='before' ? [['',1440,1000,'light']] : [['',1440,1000,'light'],['-dark',1440,1000,'dark'],['-mobile',390,844,'light']]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false})
    await evaluate(`document.documentElement.dataset.theme='${theme}'`)
    await pause(150)
    await screenshot(route+suffix)
    report.screens.push({name:route+suffix,...await evaluate(metrics)})
  }
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false})
  await evaluate("document.documentElement.dataset.theme='light'")
  if(phase!=='before') {
    const controls=await evaluate(`(() => { const visible=e=>e.getBoundingClientRect().height>0; return {buttons:[...document.querySelectorAll('button')].filter(visible).length,inputs:[...document.querySelectorAll('input,select')].filter(visible).length,tables:document.querySelectorAll('table').length,disabled:document.querySelectorAll('button:disabled').length} })()`)
    report.interactions.push({route,...controls})
  }
}
if (phase !== 'before') {
  assert.equal(errors.length, 0, 'Browser runtime exceptions')
  assert.ok(report.screens.every(s=>s.text && s.text !== 'Opening application'), 'All routes must render')
  assert.deepEqual(report.screens.filter(s=>s.overflow).map(s=>s.name), [], 'Page overflow')
  const baselinePath=path.join(output,'before-report.json')
  try {
    const baseline=JSON.parse(await readFile(baselinePath,'utf8'))
    for(const name of ['fo-create-master-contract','fx-blotter']) {
      for(const key of ['body','heading','th','td','button','input']) {
        assert.deepEqual(report.screens.find(s=>s.name===name)?.[key], baseline.screens.find(s=>s.name===name)?.[key], name+' '+key+' regression')
      }
    }
  } catch(error) { if(error.code !== 'ENOENT') throw error }
}
await writeFile(path.join(output,`${phase}-report.json`),JSON.stringify(report,null,2))
console.log(JSON.stringify({screens:report.screens.length,errors,overflow:report.screens.filter(s=>s.overflow).map(s=>s.name)},null,2))
await call('Page.close')
ws.close()



