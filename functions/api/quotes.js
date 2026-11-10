// Cloudflare Pages Function — 보유 종목 시세/수익률
// 요청: /api/quotes?items=005930:KOSPI,000660:KOSDAQ,NVDA:US
// 응답: { quotes: { "005930": { price, returns:{1D,1W,1M,3M,1Y,YTD} }, ... }, updated }
// 국내주: 네이버 금융 일봉(siseJson) · 미국주: Stooq 일봉 CSV.
// 종가 시계열에서 기간별 수익률 = (현재가/과거종가 - 1) * 100.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
// 거래일 기준 근사 오프셋 (주말·휴일 감안한 대략치)
const OFFSET = { '1D': 1, '1W': 5, '1M': 21, '3M': 63, '1Y': 250 }

export async function onRequestGet(context) {
  const url = new URL(context.request.url)
  const raw = (url.searchParams.get('items') || '').split(',').map((s) => s.trim()).filter(Boolean)
  const fresh = url.searchParams.get('fresh')

  const canonical = new URL(url.toString()); canonical.searchParams.delete('fresh')
  const cache = caches.default
  const cacheKey = new Request(canonical.toString())
  if (!fresh) { const hit = await cache.match(cacheKey); if (hit) return hit }

  const items = raw.map((tok) => {
    const [code, market] = tok.split(':')
    return { code: (code || '').trim(), market: (market || '').trim() }
  }).filter((x) => x.code)

  const entries = await Promise.all(items.map(async (it) => {
    try {
      const y = await fetchYahoo(yahooSymbol(it))
      let closes = y && y.closes
      // 국내주는 Yahoo 실패 시 네이버로 보조
      if ((!closes || closes.length < 2) && isKR(it.market)) closes = await fetchNaver(it.code)
      if (!closes || closes.length < 2) return [it.code, null]
      const q = computeReturns(closes)
      const div = computeDiv(y && y.dividends)
      if (div) q.div = div
      return [it.code, q]
    } catch (e) { return [it.code, null] }
  }))

  const quotes = {}
  for (const [code, val] of entries) quotes[code] = val

  const resp = new Response(JSON.stringify({ quotes, updated: new Date().toISOString() }), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=900' },
  })
  context.waitUntil(cache.put(cacheKey, resp.clone()))
  return resp
}

// closes: [{date:'YYYYMMDD'|'YYYY-MM-DD', close:number}] 오름차순
export function computeReturns(closes) {
  const n = closes.length
  const price = closes[n - 1].close
  const ret = (backIdx) => {
    if (backIdx < 0 || backIdx >= n) return null
    const base = closes[backIdx].close
    return base ? +(((price / base) - 1) * 100).toFixed(2) : null
  }
  const returns = {}
  for (const k of Object.keys(OFFSET)) returns[k] = ret(n - 1 - OFFSET[k])
  // YTD: 올해 첫 거래일 직전(= 작년 마지막 종가) 대비. 없으면 올해 첫 종가 대비.
  const year = String(closes[n - 1].date).replace(/-/g, '').slice(0, 4)
  let firstIdxThisYear = -1
  for (let i = 0; i < n; i++) { if (String(closes[i].date).replace(/-/g, '').slice(0, 4) === year) { firstIdxThisYear = i; break } }
  const ytdBase = firstIdxThisYear > 0 ? firstIdxThisYear - 1 : firstIdxThisYear
  returns.YTD = ret(ytdBase)
  return { price, returns }
}

const isKR = (m) => m === 'KOSPI' || m === 'KOSDAQ' || m === 'KR'
// 시장 → Yahoo 심볼. 국내주는 .KS(코스피)/.KQ(코스닥) 접미사, 미국주는 그대로.
function yahooSymbol(it) {
  if (it.market === 'KOSPI' || it.market === 'KR') return `${it.code}.KS`
  if (it.market === 'KOSDAQ') return `${it.code}.KQ`
  return it.code
}

// Yahoo Finance 일봉 차트 — 국내·미국 공통. 2년치 + 배당 이벤트.
async function fetchYahoo(symbol) {
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']
  for (const h of hosts) {
    try {
      const u = `https://${h}/v8/finance/chart/${encodeURIComponent(symbol)}?range=2y&interval=1d&events=div`
      const res = await fetch(u, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
      if (!res.ok) continue
      const j = await res.json()
      const closes = parseYahoo(j)
      if (closes && closes.length >= 2) return { closes, dividends: parseYahooDiv(j) }
    } catch (e) { /* 다음 호스트 시도 */ }
  }
  return null
}

// Yahoo 차트 JSON → 배당 이력 [{date,amount}] 오름차순 (순수 함수)
export function parseYahooDiv(j) {
  const r = j && j.chart && j.chart.result && j.chart.result[0]
  const d = r && r.events && r.events.dividends
  if (!d) return []
  return Object.values(d)
    .map((x) => ({ date: new Date(x.date * 1000).toISOString().slice(0, 10), amount: +x.amount }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
}

// 배당 이력 → { amount(최근 주당), freq(주기 라벨), perYear, lastDate }. 배당 없으면 null.
export function computeDiv(dividends) {
  if (!Array.isArray(dividends) || dividends.length === 0) return null
  const last = dividends[dividends.length - 1]
  const cutoff = new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10)
  const perYear = dividends.filter((d) => d.date >= cutoff).length
  const freq = perYear >= 11 ? '월배당' : perYear >= 6 ? '격월배당' : perYear >= 3 ? '분기배당' : perYear === 2 ? '반기배당' : perYear === 1 ? '연배당' : '비정기'
  return { amount: last.amount, freq, perYear, lastDate: last.date }
}

// Yahoo 차트 JSON → [{date,close}] (순수 함수, 테스트용)
export function parseYahoo(j) {
  const r = j && j.chart && j.chart.result && j.chart.result[0]
  if (!r || !Array.isArray(r.timestamp)) return null
  const ts = r.timestamp
  const q = r.indicators && r.indicators.quote && r.indicators.quote[0]
  const closeArr = q && Array.isArray(q.close) ? q.close : null
  if (!closeArr) return null
  const out = []
  for (let i = 0; i < ts.length; i++) {
    const c = closeArr[i]
    if (c == null) continue
    out.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), close: +c })
  }
  return out
}

// 네이버 금융 일봉 — 약 1.5년치 (국내주 보조)
async function fetchNaver(code) {
  const end = ymd(new Date())
  const start = ymd(new Date(Date.now() - 550 * 86400000))
  const u = `https://api.finance.naver.com/siseJson.naver?symbol=${code}&requestType=1&startTime=${start}&endTime=${end}&timeframe=day`
  const res = await fetch(u, { headers: { 'User-Agent': UA, Referer: 'https://finance.naver.com/' } })
  if (!res.ok) return null
  return parseNaver(await res.text())
}

// 네이버 siseJson 텍스트 → [{date,close}] (순수 함수, 테스트용)
export function parseNaver(text) {
  let rows
  try { rows = JSON.parse(text.replace(/'/g, '"')) } catch (e) { return null }
  if (!Array.isArray(rows) || rows.length < 2) return null
  // rows[0] = 헤더[날짜,시가,고가,저가,종가,거래량,...]
  const out = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]; if (!Array.isArray(r) || r.length < 5) continue
    const close = Number(r[4]); if (!close) continue
    out.push({ date: String(r[0]), close })
  }
  return out
}

// Stooq 일봉 CSV (미국주) — s=nvda.us
async function fetchStooq(code) {
  const u = `https://stooq.com/q/d/l/?s=${encodeURIComponent(code.toLowerCase())}.us&i=d`
  const res = await fetch(u, { headers: { 'User-Agent': UA } })
  if (!res.ok) return null
  return parseStooq(await res.text())
}

// Stooq CSV → [{date,close}] (순수 함수, 테스트용)
export function parseStooq(text) {
  const lines = text.trim().split('\n')
  if (lines.length < 2 || !/^Date/i.test(lines[0])) return null
  const out = []
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',') // Date,Open,High,Low,Close,Volume
    const close = Number(c[4]); if (!close) continue
    out.push({ date: c[0], close })
  }
  return out
}

function ymd(d) { return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}` }
