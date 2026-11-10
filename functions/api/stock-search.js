// Cloudflare Pages Function — 종목 실시간 검색
// 요청: /api/stock-search?q=삼성  (또는 티커 NVDA)
// 응답: { results: [{ name, code, market }], q }
// 소스: Yahoo Finance 검색(국내·미국·티커·이름 안정적) + 네이버 종목검색(한글명 보강) 병합.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

export async function onRequestGet(context) {
  const url = new URL(context.request.url)
  const q = (url.searchParams.get('q') || '').trim()
  if (q.length < 1) return json({ results: [], q })

  const cache = caches.default
  const cacheKey = new Request(new URL(url.toString()).toString())
  const hit = await cache.match(cacheKey); if (hit) return hit

  // 네이버(한글명 우선) + 야후(티커·미국·보편) 병렬 → 병합
  const [nv, yh] = await Promise.all([safe(searchNaver(q)), safe(searchYahoo(q))])
  const results = dedupe([...nv, ...yh]).slice(0, 12)

  const resp = json({ results, q })
  context.waitUntil(cache.put(cacheKey, resp.clone()))
  return resp
}

const safe = (p) => p.then((r) => r || []).catch(() => [])
function json(obj) {
  return new Response(JSON.stringify(obj), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=86400' },
  })
}
function dedupe(list) {
  const seen = new Set(); const out = []
  for (const r of list) {
    if (!r || !r.code || !r.name) continue
    const k = r.code + '|' + r.market
    if (seen.has(k)) continue
    seen.add(k); out.push(r)
  }
  return out
}

// ---------- Yahoo 검색 ----------
async function searchYahoo(q) {
  for (const h of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
    try {
      const u = `https://${h}/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=12&newsCount=0&listsCount=0`
      const res = await fetch(u, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
      if (!res.ok) continue
      const r = parseYahooSearch(await res.json())
      if (r.length) return r
    } catch (e) { /* 다음 호스트 */ }
  }
  return []
}

export function parseYahooSearch(j) {
  const qs = j && Array.isArray(j.quotes) ? j.quotes : []
  const out = []
  for (const it of qs) {
    const type = (it.quoteType || it.typeDisp || '').toUpperCase()
    if (type && !['EQUITY', 'ETF'].includes(type)) continue
    const symbol = it.symbol || ''
    if (!symbol) continue
    // 국내주(.KS/.KQ)는 Yahoo가 영어명으로 줌 → 한글명이 있는 네이버/전체목록에 맡기고 제외
    if (symbol.endsWith('.KS') || symbol.endsWith('.KQ')) continue
    const name = it.shortname || it.longname || it.name || symbol
    out.push({ name, ...classifySym(symbol) })
  }
  return out
}

function classifySym(symbol) {
  if (symbol.endsWith('.KS')) return { code: symbol.slice(0, -3), market: 'KOSPI' }
  if (symbol.endsWith('.KQ')) return { code: symbol.slice(0, -3), market: 'KOSDAQ' }
  if (!symbol.includes('.')) return { code: symbol, market: 'US' } // 미국주는 접미사 없음
  return { code: symbol.split('.')[0], market: '기타' } // 그 외 해외거래소
}

// ---------- 네이버 검색 (한글명 보강) ----------
async function searchNaver(q) {
  let r = await searchFrontApi(q).catch(() => [])
  if (!r.length) r = await searchAc(q).catch(() => [])
  return r
}

async function searchFrontApi(q) {
  const u = `https://m.stock.naver.com/front-api/search/autoComplete?query=${encodeURIComponent(q)}&target=stock,index,etf`
  const res = await fetch(u, { headers: { 'User-Agent': UA, Accept: 'application/json', Referer: 'https://m.stock.naver.com/' } })
  if (!res.ok) return []
  const data = await res.json()
  const items = data?.result?.items || data?.result?.stocks || data?.items || []
  return normalizeList(items)
}

async function searchAc(q) {
  const u = `https://ac.stock.naver.com/ac?q=${encodeURIComponent(q)}&target=stock,index,etf,worldstock`
  const res = await fetch(u, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!res.ok) return []
  const data = await res.json()
  const flat = []
  const walk = (a) => { if (Array.isArray(a) && a.some(Array.isArray)) a.forEach(walk); else flat.push(a) }
  walk(data?.items || [])
  return normalizeList(flat)
}

export function normalizeList(items) {
  const out = []
  for (const it of (items || [])) { const r = normalizeItem(it); if (r) out.push(r) }
  return out
}

const firstStr = (...v) => v.find((x) => typeof x === 'string' && x.trim())
const KR_MKTS = ['KOSPI', 'KOSDAQ', 'KONEX']

export function normalizeItem(it) {
  let name, rawCode, nation, mkt
  if (it && typeof it === 'object' && !Array.isArray(it)) {
    name = firstStr(it.stockName, it.name, it.korName, it.nm, it.itemName)
    rawCode = firstStr(it.reutersCode, it.code, it.cd, it.symbolCode, it.itemCode, it.symbol)
    nation = firstStr(it.nationCode, it.nationType, it.nation)
    mkt = firstStr(it.stockExchangeType?.name, it.stockExchangeType?.code, it.market, it.marketValue, it.exchange, it.exchangeName)
  } else if (Array.isArray(it)) {
    for (const el of it) {
      if (typeof el !== 'string') continue
      if (!rawCode && /^\d{6}([.][A-Z]{1,3})?$/.test(el)) rawCode = el
      else if (!rawCode && /^[A-Z][A-Z.]{0,6}$/.test(el) && el === el.toUpperCase()) rawCode = el
      if (!mkt && (KR_MKTS.includes(el.toUpperCase()) || /NASDAQ|NYSE|AMEX/i.test(el))) mkt = el
      if (!name && /[가-힣]/.test(el)) name = el
    }
    if (!name) name = it.find((el) => typeof el === 'string' && el && el !== rawCode && !KR_MKTS.includes(el.toUpperCase()))
  }
  if (!rawCode || !name) return null
  return { name, ...classify(rawCode, nation, mkt) }
}

function classify(rawCode, nation, mkt) {
  const base = String(rawCode).split('.')[0]
  const isDomestic = /^\d{6}$/.test(base) || /^KOR$/i.test(nation || '')
  if (isDomestic) {
    const m = (mkt || '').toUpperCase()
    let market = 'KOSPI'
    if (m.includes('KOSDAQ')) market = 'KOSDAQ'
    else if (m.includes('KONEX')) market = 'KONEX'
    return { code: base, market }
  }
  const n = (nation || '').toUpperCase()
  const market = n === 'USA' || n === 'US' || /NASDAQ|NYSE|AMEX/i.test(mkt || '') ? 'US' : (n || 'US')
  return { code: base, market }
}
