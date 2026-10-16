import { readFileSync, writeFileSync } from 'node:fs'
import { Agent, fetch } from 'undici'

// Read-only verification. Credentials stay in memory and are never written to evidence.
const config = JSON.parse(readFileSync('config/services.json', 'utf8'))
const folder = new URL('./', import.meta.url)
const results = []
await Promise.all(['trmfx', 'trmfxapp', 'trmflowpost', 'fiaccdoc', 'housebank', 'businesspartner'].map(async (key) => {
  const svc = config.services[key]
  const auth = config.auth[svc.auth]
  const password = process.env[auth.passwordEnv]
  if (!password) throw new Error(`Missing credential for ${key}`)
  const dispatcher = new Agent({ connect: { rejectUnauthorized: svc.tlsVerify !== false } })
  try {
    const url = `${svc.base}/$metadata?sap-client=${svc.client}`
    const res = await fetch(url, { dispatcher, headers: { Authorization: `Basic ${Buffer.from(`${auth.user}:${password}`).toString('base64')}`, Accept: 'application/xml' }, signal: AbortSignal.timeout(20000) })
    const body = await res.text()
    if (res.ok) writeFileSync(new URL(`${key}.metadata.xml`, folder), body)
    results.push({ key, status: res.status, entitySets: [...body.matchAll(/<(?:\w+:)?EntitySet\b[^>]*Name="([^"]+)"/g)].map(m => m[1]), actions: [...body.matchAll(/<(?:\w+:)?Action\b[^>]*Name="([^"]+)"/g)].map(m => m[1]), error: res.ok ? undefined : body.slice(0, 500) })
  } catch (error) {
    results.push({ key, error: error.message, cause: error.cause?.code })
  } finally {
    await dispatcher.close()
  }
}))
const evidence = { checkedAt: new Date().toISOString(), method: 'GET only; no posting, test posting, PATCH, or SAP data changes', results: results.sort((a, b) => a.key.localeCompare(b.key)) }
writeFileSync(new URL('probe-results.json', folder), JSON.stringify(evidence, null, 2) + '\n')
console.log(JSON.stringify(evidence, null, 2))
