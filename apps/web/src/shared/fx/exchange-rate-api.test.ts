import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { afterEach, it } from 'node:test'
import { loadExchangeRate, loadExchangeRateFactors, type ExchangeRate } from './exchange-rate-api.ts'
import { getExchangeRate } from './exchange-rate.ts'

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

const rate: ExchangeRate = {
  RateType: 'M', SourceCurrency: 'USD', TargetCurrency: 'INR',
  ExchangeRateEffectiveDate: '2026-10-16', ExchangeRate: '83.5',
  NumberOfSourceCurrencyUnits: '1', NumberOfTargetCurrencyUnits: '1',
}

function stub(handler: (url: URL, init?: RequestInit) => ExchangeRate[]): URL[] {
  const seen: URL[] = []
  globalThis.fetch = (async (input, init) => {
    const url = new URL(String(input), 'http://gateway')
    seen.push(url)
    return new Response(JSON.stringify({ value: handler(url, init) }), { status: 200 })
  }) as typeof fetch
  return seen
}

it('reads the newest effective SAP rate with ordinary dates and forwards cancellation', async () => {
  const controller = new AbortController()
  const seen = stub((_url, init) => {
    strictEqual(init?.signal, controller.signal)
    return [rate]
  })
  deepStrictEqual(await loadExchangeRate('USD', 'INR', '2026-10-19', 'M', controller.signal), rate)
  strictEqual(seen[0]?.pathname, '/api/exchangerate/ExchangeRate')
  strictEqual(seen[0]?.searchParams.get('$filter'), "RateType eq 'M' and SourceCurrency eq 'USD' and TargetCurrency eq 'INR' and ExchangeRateEffectiveDate le 2026-10-19")
  strictEqual(seen[0]?.searchParams.get('$orderby'), 'ExchangeRateEffectiveDate desc')
  strictEqual(seen[0]?.searchParams.get('$top'), '1')
})

it('uses the exact fixing date for RBI and escapes string filter values', async () => {
  const seen = stub(() => [])
  strictEqual(await loadExchangeRate('USD', 'INR', '2026-10-19', "R'BI", undefined, true), null)
  strictEqual(seen[0]?.searchParams.get('$filter'), "RateType eq 'R''BI' and SourceCurrency eq 'USD' and TargetCurrency eq 'INR' and ExchangeRateEffectiveDate eq 2026-10-19")
})

it('pages the SAP currency-unit factors and maps them for TCURF consumers', async () => {
  const all = Array.from({ length: 501 }, () => ({ ...rate, RateType: 'MTM', NumberOfSourceCurrencyUnits: '100' }))
  const seen = stub((url) => all.slice(Number(url.searchParams.get('$skip')), Number(url.searchParams.get('$skip')) + Number(url.searchParams.get('$top'))))
  const rows = await loadExchangeRateFactors('MTM')
  strictEqual(rows.length, 501)
  deepStrictEqual(rows[0], { KURST: 'MTM', FCURR: 'USD', TCURR: 'INR', FFACT: '100', TFACT: '1' })
  strictEqual(seen.length, 2)
  strictEqual(seen[0]?.searchParams.get('$filter'), "RateType eq 'MTM'")
  strictEqual(seen[0]?.searchParams.get('$orderby'), 'SourceCurrency,TargetCurrency,ExchangeRateEffectiveDate desc')
  strictEqual(seen[1]?.searchParams.get('$skip'), '500')
})

it('preserves indirect quotation and inverse-pair fallback with the SAP response', async () => {
  stub(() => [{ ...rate, ExchangeRate: '-2' }])
  strictEqual(await getExchangeRate('USD', 'INR', '2026-10-19', 'M'), 0.5)
  const seen = stub((url) => url.searchParams.get('$filter')?.includes("SourceCurrency eq 'USD'") ? [] : [{ ...rate, SourceCurrency: 'INR', TargetCurrency: 'USD', ExchangeRate: '2' }])
  strictEqual(await getExchangeRate('USD', 'INR', '2026-10-19', 'M'), 0.5)
  strictEqual(seen.length, 2)
})

it('keeps same-currency and unavailable-rate results', async () => {
  const seen = stub(() => [])
  strictEqual(await getExchangeRate('USD', 'USD', '2026-10-19', 'M'), 1)
  strictEqual(seen.length, 0)
  strictEqual(await getExchangeRate('USD', 'INR', '2026-10-19', 'M'), null)
})
