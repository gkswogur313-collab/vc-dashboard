// Post-IPO 데이터 크롤러 (GitHub Actions)
// ipo.json(KIND·신규상장만) → 최근 3년·스팩 제외 → 회사명→코드 변환(네이버 시총맵 + 검색 폴백)
// → Yahoo OHLC → 시초가·공모가 대비 수익률(1M/3M/6M/12M)·90일 스파크 계산 → post-ipo.json
// 캔들 원본은 저장하지 않음(용량). 차트는 프런트에서 /api/ohlc로 종목별 실시간 조회.

import fs from 'fs'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const YEARS = 3
const OFFSETS = { '1M': 21, '3M': 63, '6M': 126, '12M': 252 } // 거래일 근사
const isSpac = (name) => /스팩|기업인수목적/.test(name || '')
const won = (v) => { const n = parseInt(String(v ?? '').replace(/[^0-9]/g, ''), 10); return isNaN(n) ? null : n }
const norm = (s) => (s || '').normalize('NFC').replace(/\s+/g, '').toLowerCase()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------- 순수 계산부 (테스트용) ----------
// candles: [{d,o,h,l,c}] (상장일부터 오름차순), 공모가: number
export function computePostIpo(candles, 공모가) {
  if (!candles || candles.length < 1) return null
  const 시초가 = candles[0].o
  const returns = {}
  for (const [k, off] of Object.entries(OFFSETS)) {
    returns[k] = (공모가 && candles.length > off) ? +(((candles[off].c / 공모가) - 1) * 100).toFixed(2) : null
  }
  const spark = candles.slice(-90).map((k) => k.c)
  return { 시초가, returns, spark }
}

// ---------- 네트워크 ----------
async function getJson(u, headers) {
  for (let t = 0; t < 3; t++) {
    try {
      const res = await fetch(u, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers } })
      if (res.ok) return await res.json()
    } catch (e) { /* 재시도 */ }
    await sleep(400 * (t + 1))
  }
  return null
}

// EUC-KR HTML 가져오기
async function getEuc(u) {
  for (let t = 0; t < 3; t++) {
    try {
      const res = await fetch(u, { headers: { 'User-Agent': UA, Referer: 'https://finance.naver.com/' } })
      if (res.ok) return new TextDecoder('euc-kr').decode(await res.arrayBuffer())
    } catch (e) { /* 재시도 */ }
    await sleep(400 * (t + 1))
  }
  return null
}

// 네이버 시가총액 페이지 전체를 훑어 국내 상장 종목 이름→{code,market} 맵 구성
export function parseNameCode(html) {
  const out = []
  const re = /code=(\d{6})"[^>]*class="tltle"[^>]*>([^<]+)</g
  let m
  while ((m = re.exec(html))) out.push({ code: m[1], name: m[2].trim() })
  return out
}
async function buildCodeMap() {
  const map = {}
  for (const [sosok, market] of [[0, 'KOSPI'], [1, 'KOSDAQ']]) {
    for (let page = 1; page <= 45; page++) {
      const html = await getEuc(`https://finance.naver.com/sise/sise_market_sum.naver?sosok=${sosok}&page=${page}`)
      if (!html) break
      const rows = parseNameCode(html)
      if (rows.length === 0) break
      for (const r of rows) { const k = norm(r.name); if (!map[k]) map[k] = { code: r.code, market } }
      await sleep(150)
    }
  }
  return map
}

// ---------- 이름→코드 검색 폴백 (시총맵 미스 보강: 사명변경·약칭·신형코드·커버리지 갱신) ----------
// 검색결과 후보 1건 → {code, name, market} | null
// ※ 2026년 신규상장부터 KRX 단축코드에 영문 포함(예: 매드업 0039P0) → 6자리 영숫자 허용.
function toCand(it) {
  let name, rawCode, mkt
  if (it && typeof it === 'object' && !Array.isArray(it)) {
    name = it.stockName || it.name || it.korName || it.nm || it.itemName
    rawCode = it.code || it.reutersCode || it.cd || it.symbolCode || it.itemCode || it.symbol
    mkt = it.typeCode || it.typeName || it.stockExchangeType?.name || it.stockExchangeType?.code || it.market || ''
  } else if (Array.isArray(it)) {
    for (const el of it) {
      if (typeof el !== 'string') continue
      if (!rawCode && /^[A-Z]?[0-9A-Z]{6}([.][A-Z]{1,3})?$/.test(el) && /\d/.test(el)) rawCode = el
      if (!mkt && /KOSPI|KOSDAQ|KONEX|코스피|코스닥/i.test(el)) mkt = el
      if (!name && /[가-힣]/.test(el)) name = el
    }
  }
  if (!rawCode || !name) return null
  let base = String(rawCode).split('.')[0]
  if (/^[A-Z][0-9A-Z]{6}$/.test(base)) base = base.slice(1) // 로이터식 접두문자(A…) 제거
  if (!/^[0-9A-Z]{6}$/.test(base) || !/\d/.test(base)) return null // 국내주 6자리 영숫자만
  const m = String(mkt || '').toUpperCase()
  const market = (m.includes('KOSDAQ') || m.includes('코스닥')) ? 'KOSDAQ' : 'KOSPI'
  return { code: base, name: String(name).trim(), market }
}
// q(검색어)와 가장 잘 맞는 후보: 부분일치 우선, 없으면 최상위(연관도) 결과
function pickCand(rawItems, q) {
  const list = (rawItems || []).map(toCand).filter(Boolean)
  if (!list.length) return null
  const nq = norm(q)
  return list.find((c) => norm(c.name) === nq)
      || list.find((c) => norm(c.name).includes(nq) || nq.includes(norm(c.name)))
      || list[0]
}
async function naverSearchCode(q, dbg) {
  // ac.finance 는 러너에서 응답 없음(확인됨) → 러너에서 동작 검증된 m.stock·ac.stock 만 사용
  const tries = [
    { url: `https://m.stock.naver.com/front-api/search/autoComplete?query=${encodeURIComponent(q)}&target=stock`, headers: { Referer: 'https://m.stock.naver.com/' }, via: 'm.stock' },
    { url: `https://ac.stock.naver.com/ac?q=${encodeURIComponent(q)}&target=stock`, headers: {}, via: 'ac.stock' },
  ]
  for (const t of tries) {
    const j = await getJson(t.url, t.headers)
    if (dbg) dbg.push({ via: t.via, ok: !!j, sample: j ? JSON.stringify(j).slice(0, 200) : null })
    if (!j) continue
    let items = j?.result?.items || j?.result?.stocks || j?.items || []
    if (Array.isArray(items) && items.some(Array.isArray)) {
      const flat = []
      const walk = (a) => { if (Array.isArray(a) && a.some(Array.isArray)) a.forEach(walk); else flat.push(a) }
      walk(items); items = flat
    }
    const hit = pickCand(items, q)
    if (hit) return { ...hit, via: t.via }
  }
  return null
}

// Yahoo 일봉 OHLC — .KS/.KQ 양쪽 시도(시장 자동확정). marketHint로 우선순위만 결정.
async function fetchOHLC(code, marketHint, from) {
  const order = marketHint === 'KOSDAQ' ? ['KQ', 'KS'] : ['KS', 'KQ']
  const p1 = Math.floor(new Date(from + 'T00:00:00Z').getTime() / 1000)
  const p2 = Math.floor(Date.now() / 1000)
  for (const suf of order) {
    const sym = `${code}.${suf}`
    for (const h of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
      const j = await getJson(`https://${h}/v8/finance/chart/${sym}?period1=${p1}&period2=${p2}&interval=1d`)
      const r = j?.chart?.result?.[0]
      if (!r || !Array.isArray(r.timestamp)) continue
      const q = r.indicators?.quote?.[0] || {}
      const out = []
      for (let i = 0; i < r.timestamp.length; i++) {
        if (q.open?.[i] == null || q.close?.[i] == null) continue
        out.push({ d: new Date(r.timestamp[i] * 1000).toISOString().slice(0, 10), o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i] })
      }
      if (out.length) return { candles: out, market: suf === 'KQ' ? 'KOSDAQ' : 'KOSPI' }
    }
  }
  return { candles: [], market: marketHint }
}

async function main() {
  const ipo = JSON.parse(fs.readFileSync('public/data/ipo.json', 'utf8'))
  const today = new Date().toISOString().slice(0, 10)
  const cut = new Date(Date.now() - YEARS * 365 * 86400000).toISOString().slice(0, 10)

  const targets = (ipo.items || []).filter((r) => {
    const d = r.상장일
    return d && d >= cut && d <= today && !isSpac(r.회사명)
  })
  console.log(`대상 ${targets.length}개 (최근 ${YEARS}년·스팩 제외, 전체 ${ipo.items?.length})`)

  const codeMap = await buildCodeMap()
  console.log(`이름→코드 맵: ${Object.keys(codeMap).length}종목`)

  const items = []
  let noCode = 0, noPrice = 0, recovered = 0
  const missNames = []
  const recoveredMap = []
  const CONC = 5
  for (let i = 0; i < targets.length; i += CONC) {
    const batch = targets.slice(i, i + CONC)
    const done = await Promise.all(batch.map(async (r) => {
      try {
        let hit = codeMap[norm(r.회사명)]
        let via = 'map'
        if (!hit) {
          const s = await naverSearchCode(r.회사명) // 시총맵 미스 → 네이버 검색 폴백
          if (s) { hit = { code: s.code, market: s.market || 'KOSPI' }; via = s.via; recovered++; recoveredMap.push({ 회사명: r.회사명, code: s.code, 매칭명: s.name, via: s.via }) }
        }
        if (!hit) { noCode++; missNames.push(r.회사명); return null }
        const { candles, market } = await fetchOHLC(hit.code, hit.market, r.상장일)
        if (candles.length < 1) { noPrice++; missNames.push(r.회사명 + '(시세X)'); return null }
        const 공모가 = won(r.확정공모가)
        const calc = computePostIpo(candles, 공모가)
        if (!calc) return null
        return { 회사명: r.회사명, 시장: market === 'KOSPI' ? 'KS' : 'KQ', code: hit.code, 상장일: r.상장일, 확정공모가: 공모가, ...calc }
      } catch (e) { return null }
    }))
    items.push(...done.filter(Boolean))
    await sleep(200)
  }
  console.log(`처리 완료: 성공 ${items.length}, 검색폴백 복구 ${recovered}, 코드없음 ${noCode}, 시세없음 ${noPrice}`)
  if (missNames.length) console.log(`누락 목록: ${JSON.stringify(missNames)}`)
  if (recoveredMap.length) console.log(`복구 매핑: ${JSON.stringify(recoveredMap)}`)

  items.sort((a, b) => (b.상장일 || '').localeCompare(a.상장일 || ''))
  const data = { generated_at: new Date().toISOString(), source: 'KIND + Yahoo Finance', base: '공모가 대비', from: cut, count: items.length, items }
  fs.writeFileSync('public/data/post-ipo.json', JSON.stringify(data))
  console.log(`완료: ${items.length}개 → public/data/post-ipo.json`)
}

// 직접 실행 시에만 main() (테스트 import 시 제외)
if (process.argv[1] && process.argv[1].endsWith('fetch-post-ipo.mjs')) main()
