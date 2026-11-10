// 출자사업 공고 크롤러 — KVIC(모태펀드 출자사업공지) + KVCA(출자공고)
// GitHub Actions에서 실행 → public/data/lp-notices.json 커밋 → 빌드에 포함(비공개 저장소라 raw 대신 빌드 동봉).
// 정책: 파일이 없으면(첫 실행) 전체 백필, 있으면 공고일 기준 최근 6개월치만 재확인해 신규/수정 반영(오래된 항목은 유지).
//       수동 전체 재수집은 FULL=1 환경변수로.
// 실행: node scripts/fetch-lp-notices.mjs   (Node 18+ 내장 fetch, 외부 의존성 없음)

import { readFile, writeFile, mkdir } from 'node:fs/promises'

const OUT = 'public/data/lp-notices.json'
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const SIX_MONTHS = 183 * 86400000
const MAX_PAGES = { kvic: 200, kvca: 120 } // 안전 상한(무한루프 방지)

const KVIC_CATS = ['출자계획', '설명회', '질의응답', '접수현황', '서류결과', '1차결과', '선정결과', '기타항목']

// ---------- 공통 유틸 ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
function stripTags(s) { return (s || '').replace(/<[^>]*>/g, '') }
function decode(s) {
  return (s || '')
    .replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, '&')
}
const clean = (s) => decode(stripTags(s)).replace(/\s+/g, ' ').trim()
const dateOf = (s) => { const m = (s || '').match(/\d{4}-\d{2}-\d{2}/); return m ? m[0] : '' }
const ts = (d) => (d ? Date.parse(d) : 0)

// content-type / meta charset 감지 후 디코딩(둘 다 UTF-8이지만 방어적으로)
async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buf = new Uint8Array(await res.arrayBuffer())
  const ctype = (res.headers.get('content-type') || '').toLowerCase()
  let cs = (ctype.match(/charset=([\w-]+)/) || [])[1] || ''
  if (!cs) { const head = new TextDecoder('ascii').decode(buf.slice(0, 2048)).toLowerCase(); if (head.includes('euc-kr')) cs = 'euc-kr' }
  try { return new TextDecoder(cs || 'utf-8').decode(buf) } catch (e) { return new TextDecoder('utf-8').decode(buf) }
}

// <tr>…</tr> 블록을 뽑아 조건에 맞는 것만 반환
function trBlocks(html, mustInclude) {
  const trs = html.split(/<tr[\s>]/i).slice(1).map((s) => '<tr ' + s.split(/<\/tr>/i)[0])
  return trs.filter((t) => t.includes(mustInclude))
}
function tdCells(tr) {
  const out = []
  const re = /<td[^>]*>([\s\S]*?)<\/td>/gi
  let m
  while ((m = re.exec(tr))) out.push(clean(m[1]))
  return out
}

// ---------- KVIC ----------
function kvicUrl(pageNo) {
  return `https://www.kvic.or.kr/notice/kvic-notice/investment-business-notice?pageNo=${pageNo}&searchCategory=&searchType=all&searchWord=`
}
function kvicLink(id) {
  return `https://www.kvic.or.kr/notice/kvic-notice/investment-business-notice?pageNo=1&searchCategory=&searchType=all&searchWord=&id=${id}`
}
function parseKvic(html) {
  const rows = trBlocks(html, 'board_view')
  const out = []
  for (const tr of rows) {
    const id = (tr.match(/board_view\((\d+)\)/) || [])[1]
    const cells = tdCells(tr)
    if (!id || cells.length < 4) continue
    const no = parseInt(cells[0], 10)
    const cat = (cells[1].match(/\[([^\]]+)\]/) || [])[1] || (cells[1] || '').replace(/[[\]]/g, '').trim()
    // 제목은 board_view 링크 텍스트
    const 제목 = clean((tr.match(/board_view\(\d+\)[^>]*>([\s\S]*?)<\/a>/) || [])[1]) || cells[cells.length - 2]
    const 날짜 = dateOf(cells[cells.length - 1])
    const 첨부 = /pdf\.gif|<img/i.test(tr)
    if (!no || !제목) continue
    out.push({ no, 카테고리: cat, 제목, 날짜, 첨부, 링크: kvicLink(id) })
  }
  return out
}

// ---------- KVCA ----------
function kvcaUrl(page) {
  return `https://www.kvca.or.kr/Program/invest/list.html?a_gb=board&a_cd=8&a_item=0&sm=2_2_2&page=${page}`
}
function kvcaLink(po) {
  return `https://www.kvca.or.kr/Program/invest/listbody.html?a_gb=board&a_cd=8&a_item=0&sm=2_2_2&po_no=${po}`
}
function parseKvca(html) {
  const rows = trBlocks(html, 'po_no')
  const out = []
  for (const tr of rows) {
    const po = (tr.match(/po_no=(\d+)/) || [])[1]
    const c = tdCells(tr)
    if (!po || c.length < 4) continue
    const no = parseInt(c[0], 10)
    if (!no) continue
    out.push({
      no,
      LP명: c[1] || '',
      공고명: c[2] || '',
      공고일: dateOf(c[3]),
      신청기한: dateOf(c[4]),
      선정예정일: dateOf(c[5]),
      결성기한: dateOf(c[6]),
      링크: kvcaLink(po),
    })
  }
  return out
}

// ---------- 크롤 루프(공통) ----------
// full=true면 끝까지, 아니면 최근 6개월 벗어나는 페이지에서 중단.
async function crawl(source, urlFn, parseFn, dateKey, full) {
  const cutoff = Date.now() - SIX_MONTHS
  const items = []
  let ok = false
  for (let p = 1; p <= MAX_PAGES[source]; p++) {
    let rows
    try { rows = parseFn(await fetchHtml(urlFn(p))) } catch (e) { console.error(`${source} p${p} 실패: ${e.message}`); break }
    if (!rows.length) break
    ok = true
    items.push(...rows)
    if (!full) {
      // 이 페이지의 모든 행이 6개월보다 오래되면 이후는 볼 필요 없음(날짜 내림차순)
      const allOld = rows.every((r) => { const t = ts(r[dateKey]); return t && t < cutoff })
      if (allOld) break
    }
    await sleep(150)
  }
  return { ok, items }
}

function mergeById(existing, fresh) {
  const map = new Map()
  for (const it of existing || []) map.set(it.no, it)
  for (const it of fresh) map.set(it.no, it) // 신규/수정 덮어쓰기
  return [...map.values()].sort((a, b) => b.no - a.no)
}

async function main() {
  let prev = null
  try { prev = JSON.parse(await readFile(OUT, 'utf-8')) } catch (e) { /* 첫 실행 */ }
  const hasPrev = prev && ((prev.kvic?.items?.length || 0) + (prev.kvca?.items?.length || 0) > 0)
  const full = process.env.FULL === '1' || !hasPrev
  console.log(full ? '전체 백필 모드' : '증분 모드(최근 6개월 재확인)')

  const [kvic, kvca] = await Promise.all([
    crawl('kvic', kvicUrl, parseKvic, '날짜', full),
    crawl('kvca', kvcaUrl, parseKvca, '공고일', full),
  ])

  const kvicItems = mergeById(prev?.kvic?.items, kvic.items)
  const kvcaItems = mergeById(prev?.kvca?.items, kvca.items)

  const payload = {
    generated_at: new Date().toISOString(),
    mode: full ? 'full' : 'incremental',
    kvic: { source: 'KVIC 모태펀드 출자사업공지', url: 'https://www.kvic.or.kr/notice/kvic-notice/investment-business-notice', categories: KVIC_CATS, ok: kvic.ok, count: kvicItems.length, items: kvicItems },
    kvca: { source: 'KVCA 출자공고', url: 'https://www.kvca.or.kr/Program/invest/list.html?a_gb=board&a_cd=8&a_item=0&sm=2_2_2', ok: kvca.ok, count: kvcaItems.length, items: kvcaItems },
  }
  await mkdir('public/data', { recursive: true })
  await writeFile(OUT, JSON.stringify(payload))
  console.log(`KVIC ${kvicItems.length}건(이번 ${kvic.items.length}), KVCA ${kvcaItems.length}건(이번 ${kvca.items.length}) 저장`)
  if (!kvic.ok && !kvca.ok) process.exitCode = 1 // 둘 다 실패면 실패 표시(기존 파일 유지)
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
