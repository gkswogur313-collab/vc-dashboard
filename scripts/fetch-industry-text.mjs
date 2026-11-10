// 산업 트래킹 — 새 리포트의 본문·PDF 앞부분 텍스트 수집(주간 브리핑 재료)
// GitHub Actions에서 fetch-industry 뒤에 실행 → data/industry-text.json 커밋(웹에 배포되지 않는 경로).
// · 최근 RECENT_DAYS 이내 발간(또는 수집)된 항목 중 아직 텍스트가 없는 것만 처리
// · 상세 페이지 본문: 페이지 텍스트에서 제목이 나온 뒤부터 일정 길이(메뉴·푸터 제외 휴리스틱)
// · PDF: 링크 자체가 PDF이거나, 상세 페이지 안의 PDF/다운로드 링크 → pdftotext 앞 PDF_PAGES쪽
// · PDF는 저장하지 않는다(임시 파일 후 삭제). 텍스트만 MAX_CHARS까지 보관, RETAIN_DAYS 지나면 정리.
// 실행: node scripts/fetch-industry-text.mjs   (pdftotext 필요: apt-get install poppler-utils)

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const run = promisify(execFile)
const OUT = 'data/industry-text.json'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const RECENT_DAYS = 21
const RETAIN_DAYS = 120
const MAX_PER_RUN = 150
const PAGE_CHARS = 6000
const PDF_PAGES = 6
const MAX_CHARS = 9000
const MAX_PDF_BYTES = 25 * 1024 * 1024
const VERSION = 4 // 추출 규칙이 바뀌면 올림 → 이전 버전 항목을 다시 추출

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const day = (n) => new Date(Date.now() + 9 * 3600e3 - n * 86400e3).toISOString().slice(0, 10)
const ENT = { nbsp: ' ', lt: '<', gt: '>', quot: '"', apos: "'", middot: '·', bull: '•', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', ndash: '–', mdash: '—', times: '×', rarr: '→', larr: '←', uarr: '↑', darr: '↓', deg: '°', plusmn: '±', le: '≤', ge: '≥', laquo: '«', raquo: '»', amp: '&' }
const dec = (s) => (s || '').replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m)
const norm = (s) => s.replace(/[\s ]+/g, ' ').trim()

async function get(url, accept = 'text/html,*/*', referer) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9', Accept: accept, ...(referer ? { Referer: referer } : {}) }, redirect: 'follow', signal: AbortSignal.timeout(40000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const ct = (res.headers.get('content-type') || '').toLowerCase()
  const len = Number(res.headers.get('content-length') || 0)
  if (len > MAX_PDF_BYTES) throw new Error('파일이 너무 큼')
  const buf = Buffer.from(await res.arrayBuffer())
  return { buf, ct, url: res.url }
}
const isPdf = (r) => r.ct.includes('pdf') || r.buf.subarray(0, 5).toString() === '%PDF-'

function htmlText(buf, ct) {
  let cs = (ct.match(/charset=([\w-]+)/) || [])[1] || ''
  if (!cs && /charset=["']?euc-kr/i.test(buf.subarray(0, 3000).toString('latin1'))) cs = 'euc-kr'
  let html
  try { html = new TextDecoder(cs || 'utf-8').decode(buf) } catch { html = buf.toString('utf-8') }
  return html
}

// 본문 추출: 스크립트·메뉴 제거 후 텍스트에서 제목이 처음 나온 곳 뒤를 가져온다(보통 상세 본문 시작)
function bodyText(html, title) {
  const cleaned = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->|<head[\s>][\s\S]*?<\/head>/gi, ' ')
    .replace(/<(nav|header|footer)[\s>][\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|p|div|li|tr|h\d)[^>]*>/gi, '\n')
  const text = dec(cleaned.replace(/<[^>]+>/g, ' ')).split('\n').map(norm).filter(Boolean).join('\n')
  const key = norm(title).slice(0, 18)
  let at = key.length >= 6 ? text.indexOf(key) : -1 // 첫 등장(본문 제목) — BioIN 등은 제목 바로 뒤에 요약이 온다
  if (at < 0) at = Math.max(0, Math.floor(text.length * 0.2))
  let body = text.slice(at)
  // 본문 뒤에 붙는 게시판 꼬리(목록·이전글·추천 메일 폼 등)를 잘라낸다
  const tail = body.slice(200).search(/\n(목록|이전글|다음글|이전 글|다음 글|스크랩|자료 추천하기|관련 ?정보|공공누리|이 페이지에서 제공하는 정보에 대하여)\b/)
  if (tail > 0) body = body.slice(0, tail + 200)
  return body.replace(/\{\{[^}]*\}\}/g, '').replace(/\*\*/g, '').slice(0, PAGE_CHARS) // 렌더 안 된 템플릿·마크다운 기호 제거
}

// 상세 페이지 안의 PDF 후보 링크 — 점수순(파일명이 .pdf인 첨부 > 다운로드 핸들러 > 기타)
//  · href 직접 링크, eGov 표준 fn_egov_downFile('atchFileId','fileSn') → /cmm/fms/FileDown.do 로 변환
function pdfLinks(html, base) {
  const cands = []
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = dec(m[1]); const text = dec(m[2].replace(/<[^>]+>/g, ' '))
    const blob = `${attrs} ${text}`
    let url = ''
    const eg = blob.match(/fn_egov_downFile\(\s*'([^']+)'\s*,\s*'([^']*)'/)
    if (eg) url = `/cmm/fms/FileDown.do?atchFileId=${eg[1]}&fileSn=${eg[2] || 0}`
    else { const h = (attrs.match(/href\s*=\s*["']([^"']+)["']/i) || [])[1] || ''; if (h && !/^(javascript|#|mailto)/i.test(h)) url = h }
    if (!url) continue
    let score = 0
    if (/\.pdf/i.test(text)) score += 5
    if (/\.pdf(\?|$|&)/i.test(url)) score += 4
    if (/(file_?down|download|filedown|atchfile|getfile)/i.test(url)) score += 2
    if (/(hwp|hwpx|zip|docx?|xlsx?)\b/i.test(text) && !/\.pdf/i.test(text)) score -= 6
    if (/(일괄|zip)/i.test(text)) score -= 3
    if (score <= 0) continue
    try { cands.push({ u: new URL(url, base).href, score }) } catch { /* 무시 */ }
  }
  const seen = new Set()
  return cands.sort((a, b) => b.score - a.score).filter((c) => !seen.has(c.u) && seen.add(c.u)).slice(0, 3).map((c) => c.u)
}

async function pdfText(buf) {
  const f = join(tmpdir(), `it-${process.pid}-${Math.random().toString(36).slice(2)}.pdf`)
  try {
    await writeFile(f, buf)
    const { stdout } = await run('pdftotext', ['-l', String(PDF_PAGES), '-enc', 'UTF-8', f, '-'], { maxBuffer: 20 * 1024 * 1024 })
    return stdout.split('\n').map(norm).filter((l) => l.length > 1).join('\n')
  } finally { await rm(f, { force: true }) }
}

async function extract(it) {
  const r = await get(it.링크)
  if (isPdf(r)) return { pdf: (await pdfText(r.buf)).slice(0, MAX_CHARS), page: '' }
  const html = htmlText(r.buf, r.ct)
  const page = bodyText(html, it.제목)
  let pdf = ''
  for (const u of pdfLinks(html, r.url)) {
    try { const p = await get(u, 'application/pdf,*/*', r.url); if (isPdf(p)) { pdf = await pdfText(p.buf); break } } catch { /* 다음 후보 */ }
  }
  return { page, pdf: pdf.slice(0, MAX_CHARS - page.length) }
}

async function main() {
  const data = JSON.parse(await readFile('public/data/industry.json', 'utf-8'))
  let store = { items: {} }
  try { store = JSON.parse(await readFile(OUT, 'utf-8')) } catch { /* 첫 실행 */ }
  const since = day(RECENT_DAYS)
  // 발간일(일 단위)이 최근이거나, 발간일이 월·연 단위인데 최근 일주일 안에 처음 수집된 항목
  const recent = (i) => ((i.날짜 || '').length === 10 ? i.날짜 >= since : (i.수집일 || '') >= day(7))
  const again = (e) => !e || (e.error && (e.tries || 1) < 3) || (e.v || 1) < VERSION
  const todo = data.items.filter((i) => recent(i) && again(store.items[i.id])).slice(0, MAX_PER_RUN)
  console.log(`텍스트 수집 대상 ${todo.length}건`)

  // 같은 호스트는 순차, 다른 호스트는 병렬
  const byHost = new Map()
  for (const it of todo) { const h = new URL(it.링크).host; if (!byHost.has(h)) byHost.set(h, []); byHost.get(h).push(it) }
  let ok = 0
  await Promise.all([...byHost.values()].map(async (list) => {
    for (const it of list) {
      try {
        const t = await extract(it)
        store.items[it.id] = { 제목: it.제목, 기관: it.기관, 날짜: it.날짜, at: day(0), v: VERSION, page: t.page || store.items[it.id]?.page || '', pdf: t.pdf || store.items[it.id]?.pdf || '' }
        if (t.page.length + t.pdf.length > 200) ok++
      } catch (e) {
        const prev = store.items[it.id]
        store.items[it.id] = { 제목: it.제목, 기관: it.기관, 날짜: it.날짜, at: day(0), v: VERSION, tries: (prev?.tries || 0) + 1, error: String(e.message || e).slice(0, 80), page: prev?.page || '', pdf: prev?.pdf || '' }
      }
      await sleep(600)
    }
  }))

  // 오래된 텍스트 정리
  const cut = day(RETAIN_DAYS)
  for (const [k, v] of Object.entries(store.items)) if ((v.at || '') < cut) delete store.items[k]
  store.updated_at = new Date().toISOString()
  await mkdir('data', { recursive: true })
  await writeFile(OUT, JSON.stringify(store))
  const withPdf = todo.filter((i) => (store.items[i.id]?.pdf || '').length > 200).length
  console.log(`완료: 본문 확보 ${ok}/${todo.length}건 (PDF 텍스트 ${withPdf}건) · 보관 ${Object.keys(store.items).length}건`)
}

if (process.argv[1]?.endsWith('fetch-industry-text.mjs')) main().catch((e) => { console.error(e); process.exitCode = 1 })
