// 산업 트래킹 크롤러 — 국내 연구기관·협회·기업 리포트 게시판(scripts/industry/sources.json)의 1페이지 목록을 수집.
// GitHub Actions에서 실행 → public/data/industry.json 커밋 → 빌드에 포함.
// 정책: 게시판마다 1페이지만 매일 읽고, 기존 파일의 항목과 합쳐 누적한다(오래된 항목 유지).
//       한 게시판이 실패해도 그 게시판의 기존 항목은 그대로 남긴다.
// 게시판별 파서: scripts/industry/parsers/*.mjs (export default { ids, board?, parse, fetchUrl?, fetchOpts? })
// 실행: node scripts/fetch-industry.mjs   (Node 18+ 내장 fetch, 외부 의존성 없음)

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tagTitle } from './industry/tags.mjs'

const OUT = process.env.OUT || 'public/data/industry.json'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const THEMES = [
  '반도체', '통신·ICT 일반', 'AI·소프트웨어·데이터', '과학기술·첨단산업 전반', '바이오·헬스케어',
  '에너지·배터리·모빌리티', '소재·부품·디스플레이·로봇·제조', '우주·항공·국방·양자', '기업·금융권 연구소',
]
const MAX_ITEMS = 8000

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const idOf = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12)

async function fetchText(url, opts = {}) {
  try { return await fetchOnce(url, opts) } catch (e) {
    if (/HTTP 4\d\d/.test(e.message) && !/HTTP 40[34]/.test(e.message)) throw e
    await sleep(2000); return fetchOnce(url, opts) // 일시 오류·차단은 한 번만 재시도
  }
}

async function fetchOnce(url, opts = {}) {
  const res = await fetch(url, {
    method: opts.method || 'GET',
    body: opts.body,
    headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9', Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', ...(opts.headers || {}) },
    redirect: 'follow',
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buf = new Uint8Array(await res.arrayBuffer())
  const ctype = (res.headers.get('content-type') || '').toLowerCase()
  let cs = (ctype.match(/charset=([\w-]+)/) || [])[1] || ''
  if (!cs) { const head = new TextDecoder('ascii').decode(buf.slice(0, 2048)).toLowerCase(); if (/charset=["']?euc-kr/.test(head)) cs = 'euc-kr' }
  try { return new TextDecoder(cs || 'utf-8').decode(buf) } catch { return new TextDecoder('utf-8').decode(buf) }
}

async function loadParsers() {
  const dir = new URL('./industry/parsers/', import.meta.url)
  const map = new Map()
  for (const f of (await readdir(dir)).filter((f) => f.endsWith('.mjs'))) {
    const p = (await import(new URL(f, dir))).default
    for (const id of p.ids || []) map.set(id, p)
  }
  return map
}

function friendlyError(e) {
  const code = e?.cause?.code || ''
  const msg = String(e?.message || e)
  if (/ECONNRESET|ECONNREFUSED|ETIMEDOUT|UND_ERR_CONNECT|fetch failed/.test(code + msg)) return '접속 차단(해외 IP 추정)'
  if (/aborted|timeout/i.test(msg)) return '응답 시간 초과'
  return msg.slice(0, 60)
}

async function crawlOne(src, parser) {
  const base = { id: src.id, 테마: src.테마, 기관: src.기관, url: src.url, 게시판: parser?.board?.(src.id) || '' }
  if (!parser) return { ...base, ok: false, error: '파서 없음', items: [] }
  try {
    const target = parser.fetchUrl ? parser.fetchUrl(src.id, src.url) : src.url
    const opts = typeof parser.fetchOpts === 'function' ? parser.fetchOpts(src.id, src.url) : parser.fetchOpts
    let body
    if (process.env.SNAPSHOT_DIR) {
      // 로컬 검증용: 미리 받아 둔 HTML로 파서만 실행(ajax 게시판은 건너뜀)
      if (parser.crawl || parser.fetchUrl) throw new Error('스냅샷 없음(ajax)')
      body = await readFile(`${process.env.SNAPSHOT_DIR}/${src.id}.html`, 'utf-8')
    } else {
      body = parser.crawl ? await parser.crawl(src.id, src.url, { fetchText, UA }) : await fetchText(target, opts)
    }
    try { base.게시판 = parser.board?.(src.id, parser.fetchUrl || parser.crawl ? '' : body) || base.게시판 } catch { /* 이름 추출 실패는 무시 */ }
    const rows = (parser.parse(body, src.url, src.id) || []).filter((r) => r && r.제목)
    if (!rows.length) return { ...base, ok: false, error: '목록 0건(구조 변경?)', items: [] }
    const items = rows.map((r) => ({
      id: idOf(`${r.링크 || src.url}|${r.제목}`),
      테마: src.테마,
      세부: tagTitle(r.제목),
      기관: src.기관,
      게시판: r.게시판 || base.게시판,
      날짜: r.날짜 || '',
      제목: r.제목,
      링크: r.링크 || src.url,
      src: src.id,
      ...(r.요약 ? { 요약: r.요약 } : {}), // 목록 API가 초록을 주는 게시판(IITP)만
    }))
    return { ...base, ok: true, items }
  } catch (e) {
    return { ...base, ok: false, error: friendlyError(e), items: [] }
  }
}

async function main() {
  const sources = JSON.parse(await readFile(new URL('./industry/sources.json', import.meta.url), 'utf-8'))
  const parsers = await loadParsers()
  let prev = null
  try { prev = JSON.parse(await readFile(OUT, 'utf-8')) } catch { /* 첫 실행 */ }

  // 같은 호스트는 순차, 서로 다른 호스트는 병렬(사이트 부담 최소화)
  const byHost = new Map()
  for (const s of sources) { const h = new URL(s.url).host; if (!byHost.has(h)) byHost.set(h, []); byHost.get(h).push(s) }
  const results = []
  await Promise.all([...byHost.values()].map(async (list) => {
    for (const s of list) { results.push(await crawlOne(s, parsers.get(s.id))); await sleep(400) }
  }))
  results.sort((a, b) => a.id - b.id)

  // 병합: 기존 항목 유지 + 신규/수정 덮어쓰기. 세부 테마는 태그 규칙이 바뀌어도 반영되게 매번 재계산.
  const map = new Map()
  for (const it of prev?.items || []) map.set(it.id, { ...it, 세부: tagTitle(it.제목) })
  const now = new Date().toISOString().slice(0, 10)
  for (const r of results) for (const it of r.items) map.set(it.id, { ...it, 수집일: map.get(it.id)?.수집일 || now })
  const items = [...map.values()]
    .sort((a, b) => (b.날짜 || '').localeCompare(a.날짜 || '') || a.기관.localeCompare(b.기관, 'ko'))
    .slice(0, MAX_ITEMS)

  const prevSrc = new Map((prev?.sources || []).map((s) => [s.url, s]))
  const payload = {
    generated_at: new Date().toISOString(),
    themes: THEMES,
    sources: results.map(({ items: its, ...s }) => ({
      ...s,
      count: items.filter((i) => i.src === s.id).length,
      last_ok: s.ok ? now : prevSrc.get(s.url)?.last_ok || null,
    })),
    count: items.length,
    items,
  }
  await mkdir('public/data', { recursive: true })
  await writeFile(OUT, JSON.stringify(payload))
  const ok = results.filter((r) => r.ok).length
  console.log(`게시판 ${ok}/${results.length} 성공 · 누적 ${items.length}건`)
  for (const r of results) console.log(`${r.ok ? 'OK ' : 'ERR'} [${r.id}] ${r.기관} ${r.게시판} — ${r.ok ? r.items.length + '건' : r.error}`)
  if (ok === 0) process.exitCode = 1 // 전부 실패면 실패 표시(기존 파일은 덮어쓰지만 항목은 유지됨)
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
