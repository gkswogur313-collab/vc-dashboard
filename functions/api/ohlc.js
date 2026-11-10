// Cloudflare Pages Function — 단일 종목 캔들(OHLC) 데이터 (Yahoo Finance)
// 요청: /api/ohlc?code=005930&market=KOSPI&from=2024-08-06
// 응답: { candles: [{ d:'YYYY-MM-DD', o,h,l,c }], code }
// Post-IPO 캔들차트에서 종목 클릭 시 그 종목만 불러옴.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

export async function onRequestGet(context) {
  const url = new URL(context.request.url)
  const code = (url.searchParams.get('code') || '').trim()
  const market = (url.searchParams.get('market') || '').trim()
  const from = (url.searchParams.get('from') || '').trim() // 상장일(선택)
  if (!code) return json({ candles: [], code })

  const cache = caches.default
  const cacheKey = new Request(new URL(url.toString()).toString())
  const hit = await cache.match(cacheKey); if (hit) return hit

  let candles = []
  try { candles = await fetchYahooOHLC(yahooSymbol(code, market), from) } catch (e) { /* 빈 배열 */ }

  const resp = json({ candles, code })
  context.waitUntil(cache.put(cacheKey, resp.clone()))
  return resp
}

function json(obj) {
  return new Response(JSON.stringify(obj), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=1800' },
  })
}

export function yahooSymbol(code, market) {
  if (market === 'KOSPI' || market === 'KR') return `${code}.KS`
  if (market === 'KOSDAQ') return `${code}.KQ`
  return code
}

async function fetchYahooOHLC(symbol, from) {
  const now = Math.floor(Date.now() / 1000)
  const p1 = from ? Math.floor(new Date(from + 'T00:00:00Z').getTime() / 1000) : now - 5 * 365 * 86400
  for (const h of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
    try {
      const u = `https://${h}/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${p1}&period2=${now}&interval=1d`
      const res = await fetch(u, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
      if (!res.ok) continue
      const c = parseYahooOHLC(await res.json())
      if (c.length) return c
    } catch (e) { /* 다음 호스트 */ }
  }
  return []
}

// Yahoo 차트 JSON → 캔들 배열 (순수 함수, 테스트용)
export function parseYahooOHLC(j) {
  const r = j && j.chart && j.chart.result && j.chart.result[0]
  if (!r || !Array.isArray(r.timestamp)) return []
  const ts = r.timestamp
  const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {}
  const o = q.open || [], h = q.high || [], l = q.low || [], c = q.close || []
  const out = []
  for (let i = 0; i < ts.length; i++) {
    if (o[i] == null || h[i] == null || l[i] == null || c[i] == null) continue
    out.push({
      d: new Date(ts[i] * 1000).toISOString().slice(0, 10),
      o: +o[i].toFixed(2), h: +h[i].toFixed(2), l: +l[i].toFixed(2), c: +c[i].toFixed(2),
    })
  }
  return out
}
