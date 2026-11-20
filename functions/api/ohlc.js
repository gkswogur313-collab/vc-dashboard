// Cloudflare Pages Function — 단일 종목 캔들(OHLC) 데이터 (국내: 네이버 일봉 우선 + Yahoo 보조)
// ※ Yahoo는 갓 상장한 국내 종목 일봉에 구멍(고가·저가 null, 날짜 누락)이 잦음 → 네이버를 기본으로 쓰고, 더 많은 쪽을 채택.
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

  const isKr = /^[0-9A-Z]{6}$/.test(code) && /\d/.test(code) && market !== 'US'
  const [nv, yh] = await Promise.all([
    isKr ? fetchNaverOHLC(code, from).catch(() => []) : Promise.resolve([]),
    fetchYahooOHLC(yahooSymbol(code, market), from).catch(() => []),
  ])
  const candles = nv.length >= yh.length ? nv : yh

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

// 네이버 금융 일봉(siseJson) — 국내주 OHLC
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '')
async function fetchNaverOHLC(code, from) {
  const end = ymd(new Date(Date.now() + 9 * 3600000)) // KST 기준 오늘
  const start = from ? from.replace(/-/g, '') : ymd(new Date(Date.now() - 5 * 365 * 86400000))
  const u = `https://api.finance.naver.com/siseJson.naver?symbol=${code}&requestType=1&startTime=${start}&endTime=${end}&timeframe=day`
  const res = await fetch(u, { headers: { 'User-Agent': UA, Referer: 'https://finance.naver.com/' } })
  if (!res.ok) return []
  return parseNaverOHLC(await res.text())
}

// 네이버 siseJson 텍스트 → 캔들 배열 (순수 함수, 테스트용)
// 행: [날짜(YYYYMMDD), 시가, 고가, 저가, 종가, 거래량, ...]
export function parseNaverOHLC(text) {
  let rows
  try { rows = JSON.parse(String(text).replace(/'/g, '"')) } catch (e) { return [] }
  if (!Array.isArray(rows)) return []
  const out = []
  for (const r of rows) {
    if (!Array.isArray(r) || r.length < 5 || !/^\d{8}$/.test(String(r[0]).trim())) continue
    const d = String(r[0]).trim()
    const o = Number(r[1]), h = Number(r[2]), l = Number(r[3]), c = Number(r[4])
    if (!c || !h || !l) continue
    out.push({ d: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, o: o || c, h, l, c })
  }
  return out
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
