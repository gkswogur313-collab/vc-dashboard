// DIVA(diva.kvca.or.kr) 항목별공시 크롤러 — 투자실적 · 재무제표 · 조합현황
// GitHub Actions에서 실행 → public/data/diva.json 커밋 → 빌드에 동봉 → 클라이언트 GP 검색.
// 세 항목 모두 로그인 없이 "전체보기" POST(TOTAL_YN=Y, PAGE_UNIT 큼) 한 번으로 전체 VC사 조회.
// 기준: 자동 최신(투자실적=올해 1월~현재월 누적, 재무제표=최신 결산연도, 조합현황=현재).
// 실행: node scripts/fetch-diva.mjs   (Node 18+ 내장 fetch, 외부 의존성 없음)

import { writeFile, mkdir, readFile } from 'node:fs/promises'

const BASE = 'http://diva.kvca.or.kr/div/dii'
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const BIG = '100000'

const now = new Date()
const YEAR = now.getFullYear()
const MONTH = String(now.getMonth() + 1).padStart(2, '0')

// ---------- 공통 ----------
function stripTags(s) { return (s || '').replace(/<[^>]*>/g, '') }
function decode(s) {
  return (s || '')
    .replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, '&')
}
const clean = (s) => decode(stripTags(s)).replace(/\s+/g, ' ').trim()

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function post(path, params, tries = 3) {
  let lastErr
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${BASE}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' },
        body: new URLSearchParams(params),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await decodeBody(res)
    } catch (e) { lastErr = e; await sleep(400 * (i + 1)) } // 일시적 실패 재시도
  }
  throw lastErr
}

async function decodeBody(res) {
  const buf = new Uint8Array(await res.arrayBuffer())
  const cs = ((res.headers.get('content-type') || '').match(/charset=([\w-]+)/) || [])[1] || 'utf-8'
  try { return new TextDecoder(cs).decode(buf) } catch (e) { return new TextDecoder('utf-8').decode(buf) }
}

// <tr> 별 <td> 텍스트 배열들(데이터 행만)
function rowsOf(html) {
  const trs = html.split(/<tr[\s>]/i).slice(1).map((s) => '<tr ' + s.split(/<\/tr>/i)[0])
  const out = []
  for (const tr of trs) {
    const cells = []
    const re = /<td[^>]*>([\s\S]*?)<\/td>/gi
    let m
    while ((m = re.exec(tr))) cells.push(clean(m[1]))
    if (cells.length) out.push(cells)
  }
  return out
}
const isName = (s) => s && !/^(합계|소계|전체|총계)$/.test(s)

// 페이지에 표가 여러 개일 수 있어(예: 재무제표=재무상태표+손익계산서 4개), marker가 있는 첫 표만 사용.
function tableBlock(html, marker) {
  for (const p of html.split(/<table[\s>]/i).slice(1)) {
    const block = '<table ' + p.split(/<\/table>/i)[0]
    if (block.includes(marker)) return block
  }
  return ''
}

// ---------- 투자실적 ----------
function parseInvst(html) {
  const items = []
  for (const c of rowsOf(html)) {
    if (c.length < 7 || !isName(c[0])) continue
    items.push({
      회사명: c[0],
      고유계정: { 업체수: c[1], 금액: c[2] },
      조합: { 업체수: c[3], 금액: c[4] },
      합계: { 업체수: c[5], 금액: c[6] },
    })
  }
  return items
}
async function invstQuery(tp, bf, to) {
  try {
    const html = await post('DivItmInvstPrfmInq', { TOTAL_YN: 'Y', S_PRFM_TP_CD: tp, S_TRD_DD_BF: bf, S_TRD_DD_TO: to, PAGE_UNIT: BIG, PAGE_INDEX: '1' })
    return parseInvst(tableBlock(html, '고유계정'))
  } catch (e) { console.error(`투자실적 ${tp} ${bf}~${to} 실패: ${e.message}`); return [] } // 하나 실패해도 나머지 유지
}
// 구분(투자 P / 회수 R) × 기간(올해 누적 + 최근 3개 완결연도)을 미리 받아 화면 드롭다운에서 전환.
// data 키 = `${구분코드}|${기간키}` (예: P|YTD, R|2025). 투자실적은 집계가 1~2개월 지연되어 올해 누적은 데이터 있는 최신월까지.
async function fetchInvst() {
  const types = { P: '투자', R: '회수' }
  const data = {}, periods = {}
  // 올해 누적
  for (let off = 0; off <= 8; off++) {
    const d = new Date(YEAR, now.getMonth() - off, 1)
    const bf = `${d.getFullYear()}-01`, to = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const p = await invstQuery('P', bf, to)
    if (p.length) { periods.YTD = `올해 누적 (${bf.slice(0, 4)}.${bf.slice(5)}~${to.slice(5)})`; data['P|YTD'] = p; data['R|YTD'] = await invstQuery('R', bf, to); break }
  }
  // 최근 3개 완결연도 전체
  for (const yy of [YEAR - 1, YEAR - 2, YEAR - 3]) {
    const bf = `${yy}-01`, to = `${yy}-12`
    const p = await invstQuery('P', bf, to)
    if (!p.length) continue
    periods[String(yy)] = `${yy} 전체`
    data[`P|${yy}`] = p
    data[`R|${yy}`] = await invstQuery('R', bf, to)
  }
  const total = Object.values(data).reduce((n, a) => n + a.length, 0)
  return { types, periods, data, count: total }
}

// ---------- 재무제표 (재무상태표) ----------
// 결산 재무제표는 전년도가 최신(당해연도는 미확정) → 최신 결산연도부터 시도.
async function fetchFs() {
  for (const yy of [YEAR - 1, YEAR - 2]) {
    const html = await post('DivItmFsInq', { TOTAL_YN: 'Y', S_BAS_YY: String(yy), S_UNQ_ACNT_YN: 'Y', PAGE_UNIT: BIG, PAGE_INDEX: '1' })
    const items = []
    for (const c of rowsOf(tableBlock(html, '자본금'))) { // 재무상태표(벤처투자회사) 표만 — 손익계산서·조합 표 제외
      if (c.length < 10 || !isName(c[0])) continue
      items.push({
        회사명: c[0], 재원: c[1], 결산월: c[2], 회계기준: c[3], 재무구분: c[4],
        자산: c[5], 창업투자자산: c[6], 부채: c[7], 자본금: c[8], 자본: c[9],
      })
    }
    if (items.length) return { year: yy, count: items.length, items }
  }
  return { year: YEAR, count: 0, items: [] }
}

// ---------- 조합현황 ----------
async function fetchAsso() {
  const html = await post('DivItmAssoInq', { TOTAL_YN: 'Y', PAGE_UNIT: BIG, PAGE_INDEX: '1' })
  const items = []
  for (const c of rowsOf(tableBlock(html, '조합명'))) {
    if (c.length < 9 || !/^\d+$/.test(c[0])) continue // 첫 칸이 번호(숫자)인 데이터 행만
    items.push({
      번호: c[0], 회사명: c[1], 조합명: c[2], 등록일: c[3], 결성총액: c[4],
      만기일: c[5], 투자분야구분: c[6], 목적구분: c[7], 지원구분: c[8],
    })
  }
  return { count: items.length, items }
}

async function main() {
  // 동시 요청이 몰리면 DIVA가 막을 수 있어 순차 실행(부하 최소화). 각 단계는 실패해도 나머지 진행.
  const run = async (name, fn) => { try { return await fn() } catch (e) { console.error(`${name} 실패:`, e.message); return null } }
  const invst = await run('투자실적', fetchInvst)
  const fs = await run('재무제표', fetchFs)
  const asso = await run('조합현황', fetchAsso)

  // DIVA 접속이 일시적으로 실패하면(fetch failed) 0건이 나온다.
  // 이때 기존 파일을 0건으로 덮어쓰면 GP 검색이 통째로 비므로, 항목별로 이전 데이터를 유지한다.
  const OUT = 'public/data/diva.json'
  let prev = null
  try { prev = JSON.parse(await readFile(OUT, 'utf8')) } catch (e) { /* 최초 실행 */ }
  const ok = (x) => x && x.count > 0
  const pick = (name, cur, old, empty) => {
    if (ok(cur)) return { v: cur, fresh: true }
    if (ok(old)) { console.warn(`${name}: 이번 수집 0건 → 이전 데이터 유지(${old.count}건)`); return { v: old, fresh: false } }
    return { v: cur || empty, fresh: false }
  }
  const I = pick('투자실적', invst, prev?.invst, { types: {}, periods: {}, data: {}, count: 0 })
  const F = pick('재무제표', fs, prev?.fs, { year: YEAR, count: 0, items: [] })
  const A = pick('조합현황', asso, prev?.asso, { count: 0, items: [] })
  const anyFresh = I.fresh || F.fresh || A.fresh

  const payload = {
    // 새로 받은 게 하나도 없으면 갱신일도 이전 값 유지(화면의 '갱신' 날짜가 실제 수집일을 가리키도록)
    generated_at: anyFresh ? new Date().toISOString() : (prev?.generated_at || new Date().toISOString()),
    source: 'DIVA (diva.kvca.or.kr) 항목별공시',
    invst: I.v,
    fs: F.v,
    asso: A.v,
  }
  await mkdir('public/data', { recursive: true })
  await writeFile(OUT, JSON.stringify(payload))
  console.log(`투자실적 ${payload.invst.count} · 재무제표 ${payload.fs.count}(${payload.fs.year}) · 조합현황 ${payload.asso.count} 저장${anyFresh ? '' : ' (신규 수집 실패 — 이전 데이터 유지)'}`)
  if (!anyFresh) process.exitCode = 1 // 전부 실패면 Actions에 실패로 표시(데이터는 이전 것 유지)
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
