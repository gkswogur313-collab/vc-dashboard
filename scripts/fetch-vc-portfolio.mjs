// 운용사 홈페이지 포트폴리오 주간 크롤러 (LLM 없이 동작)
// GitHub Actions(주 1회)에서 Playwright로 각 운용사 포트폴리오 페이지를 열고 회사명을 추출해
// public/data/vc-portfolio.json 을 갱신하고, 이번 주 변동을 public/data/vc-portfolio-changes.json 에 남긴다.
//
// 동작 원리 — 사이트별 규칙을 사람이 쓰지 않는다:
//  1) 이미 알고 있는 포트폴리오 이름이 있는 사이트: 페이지에서 그 이름들이 들어 있는 요소의 "구조 경로(태그.클래스 체인)"를
//     찾아 가장 많이 겹치는 경로를 그 사이트의 추출 규칙으로 학습(data/vc-portfolio-state.json에 저장) → 다음부터 그 경로의 요소 전부를 읽는다.
//  2) 아는 이름이 없는 사이트(이전에 접속 불가였던 곳 등): 같은 구조로 반복되는 요소 묶음 중 가장 큰 것을 자동 추출하고 '검토 필요'로 표시.
//  3) 더보기·Load more 버튼은 눌러서 펼치고, 무한 스크롤은 끝까지 내린다. 로고만 있는 사이트는 이미지 alt/파일명도 후보로 쓴다.
//
// 안전장치: 이번에 뽑힌 이름 수가 지난번의 절반 미만이면 구조가 바뀐 것으로 보고 데이터는 그대로 두고 '수집이상'으로만 기록한다.
// 실행: node scripts/fetch-vc-portfolio.mjs [--only=운용사명] [--limit=N]

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const PUB = 'public/data/vc-portfolio.json'
const CHANGES = 'public/data/vc-portfolio-changes.json'
const STATE = 'data/vc-portfolio-state.json'
const SITES = 'scripts/vc-portfolio-sites.json'
const TODAY = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10) // KST
const CONCURRENCY = 4
const PAGE_TIMEOUT = 30000

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')))
const readJson = async (p, d) => { try { return JSON.parse(await readFile(p, 'utf8')) } catch (e) { return d } }

export function normName(s) {
  return String(s || '')
    .replace(/\(로고.*?\)/g, '')
    .replace(/㈜|\(주\)|주식회사|\(유\)|유한회사|유한책임회사/g, '')
    .replace(/,?\s*(inc|co|ltd|corp|corporation|limited|llc)\.?(?=\s|$|\/)/gi, '')
    .replace(/[\s.,()'"·\-_/&]/g, '')
    .toLowerCase()
}

// 회사명이 아닐 가능성이 큰 텍스트(메뉴·버튼·문장)
const JUNK = /^(더\s*보기|view\s*more|load\s*more|see\s*more|more|all|전체|home|portfolio|포트폴리오|contact|about|team|news|exit|exited|current|ipo|m&a|투자기업|투자\s*포트폴리오|copyright|privacy|terms|login|로그인|메뉴|menu|top|닫기|close|prev|next|이전|다음|[\d\s.,/-]+|[\p{P}\p{S}\s_]+)$/iu
function cleanName(t) {
  t = String(t || '').replace(/\s+/g, ' ').trim()
  if (t.length < 2 || t.length > 60) return ''
  if (JUNK.test(t)) return ''
  if (/[.!?]$/.test(t) && t.split(' ').length > 5) return '' // 문장
  if (/^https?:\/\//i.test(t) || /@/.test(t)) return ''
  return t
}

// ── 페이지 안에서 실행: 후보 요소들을 (구조경로, 텍스트) 로 수집 ──
function collectInPage() {
  const sigOf = (el) => {
    const parts = []
    let e = el
    for (let d = 0; d < 5 && e && e.nodeType === 1 && e.tagName !== 'BODY'; d++, e = e.parentElement) {
      const cls = [...e.classList].filter((c) => !/^(active|on|show|hover|is-|swiper-slide-(active|next|prev|duplicate))/.test(c)).slice(0, 1).join('.')  // 첫 클래스만(숨김·상태 클래스 차이 무시)
      parts.unshift(e.tagName.toLowerCase() + (cls ? '.' + cls : ''))
    }
    return parts.join('>')
  }
  const out = []
  const skip = (el) => el.closest('nav,header,footer,[class*="gnb"],[class*="menu"],[class*="footer"],[class*="header"],[id*="footer"],[id*="header"]')
  // 텍스트 리프(자식 요소가 없거나 인라인뿐인 요소)
  for (const el of document.querySelectorAll('body *')) {
    if (skip(el)) continue
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'svg', 'PATH', 'OPTION'].includes(el.tagName)) continue
    const hasBlockChild = [...el.children].some((c) => !['B', 'STRONG', 'SPAN', 'EM', 'I', 'SMALL', 'BR'].includes(c.tagName))
    if (hasBlockChild) continue
    const t = (el.innerText || el.textContent || '').trim()
    if (!t || t.length > 80 || t.includes('\n\n')) continue
    const firstLine = t.split('\n')[0].trim()
    out.push({ sig: sigOf(el), text: firstLine, kind: 'text' })
  }
  // 로고 이미지 alt / 파일명 / 감싼 링크 도메인
  for (const img of document.querySelectorAll('img')) {
    if (skip(img)) continue
    const alt = (img.getAttribute('alt') || img.getAttribute('title') || '').trim()
    const a = img.closest('a[href^="http"]')
    let dom = ''
    try { if (a) dom = new URL(a.href).hostname.replace(/^www\./, '') } catch (e) { /* 무시 */ }
    if (dom && dom === location.hostname.replace(/^www\./, '')) dom = ''
    out.push({ sig: 'img:' + sigOf(img), text: alt, kind: 'alt', dom })
  }
  return out
}

async function expand(page) {
  for (let i = 0; i < 25; i++) {
    const before = await page.evaluate(() => document.body.scrollHeight)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(700)
    const clicked = await page.evaluate(() => {
      const re = /^(\+?\s*)(더\s*보기|더보기|view\s*more|load\s*more|see\s*more|show\s*more|more)\s*\+?$/i
      for (const el of document.querySelectorAll('button, a, [role="button"], div, span')) {
        const t = (el.innerText || '').trim()
        if (!re.test(t)) continue
        const r = el.getBoundingClientRect()
        if (!r.width || !r.height) continue
        if (el.tagName === 'A') { const h = el.getAttribute('href') || ''; if (h && !h.startsWith('#') && !h.startsWith('javascript')) continue }
        el.click(); return true
      }
      return false
    }).catch(() => false)
    await page.waitForTimeout(clicked ? 1200 : 300)
    const after = await page.evaluate(() => document.body.scrollHeight)
    if (!clicked && after === before) break
  }
}

async function findPortfolioUrl(page) {
  return page.evaluate(() => {
    const re = /portfolio|포트폴리오|투자\s*기업|투자기업|투자\s*현황|investments?|companies|our\s*companies|투자사례/i
    for (const a of document.querySelectorAll('a[href]')) {
      const t = (a.innerText || '').trim(), h = a.getAttribute('href') || ''
      if (re.test(t) || re.test(h)) { try { return new URL(h, location.href).href } catch (e) { /* 무시 */ } }
    }
    return ''
  })
}

async function openFirst(page, urls) {
  for (const u of urls) {
    if (!u) continue
    const variants = u.startsWith('https://') ? [u, u.replace('https://', 'http://')] : [u, u.replace('http://', 'https://')]
    for (const v of variants) {
      try {
        const res = await page.goto(v, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT })
        if (res && res.status() >= 400) continue
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
        return page.url()
      } catch (e) { /* 다음 후보 */ }
    }
  }
  return ''
}

// 학습/자동 선택으로 이름 목록 결정
function pickNames(cands, known, learned) {
  const groups = new Map()
  for (const c of cands) {
    const name = cleanName(c.text) || (c.kind === 'alt' && c.dom ? c.dom : '')
    if (!name) continue
    if (!groups.has(c.sig)) groups.set(c.sig, [])
    groups.get(c.sig).push({ name, isDom: !cleanName(c.text) })
  }
  const uniq = (arr) => { const m = new Map(); for (const x of arr) { const k = normName(x.name); if (k && !m.has(k)) m.set(k, x) } return [...m.values()] }

  if (learned && groups.has(learned)) return { names: uniq(groups.get(learned)), sig: learned, mode: 'learned' }

  if (known.size >= 3) {
    let best = null
    for (const [sig, arr] of groups) {
      const hit = uniq(arr).filter((x) => known.has(normName(x.name))).length
      if (hit >= 3 && (!best || hit > best.hit)) best = { sig, hit }
    }
    if (best && best.hit >= Math.min(5, Math.ceil(known.size * 0.3))) return { names: uniq(groups.get(best.sig)), sig: best.sig, mode: 'learned-new' }
  }
  // 자동: 같은 구조로 반복되는 가장 큰 묶음(6개 이상, 짧은 텍스트 위주)
  let best = null
  for (const [sig, arr] of groups) {
    const u = uniq(arr)
    if (u.length < 6) continue
    const avgLen = u.reduce((s, x) => s + x.name.length, 0) / u.length
    if (avgLen > 30) continue
    const score = u.length - (sig.startsWith('img:') && u.every((x) => x.isDom) ? u.length * 0.3 : 0)
    if (!best || score > best.score) best = { sig, score, u }
  }
  if (best) return { names: best.u, sig: best.sig, mode: 'auto' }
  return { names: [], sig: '', mode: 'none' }
}

async function crawlSite(browser, site, known, learned) {
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', locale: 'ko-KR', ignoreHTTPSErrors: true })
  const page = await ctx.newPage()
  try {
    let url = await openFirst(page, [learned?.url, site.pp, site.home])
    if (!url) return { status: '접속불가', error: '페이지를 열 수 없음' }
    // 포트폴리오 페이지가 아닌 홈이면 메뉴에서 찾아 이동
    if (!learned?.url && !site.pp) {
      const pu = await findPortfolioUrl(page)
      if (pu && pu !== url) { const u2 = await openFirst(page, [pu]); if (u2) url = u2 }
    }
    await expand(page)
    const cands = await page.evaluate(collectInPage)
    const r = pickNames(cands, known, learned?.sig)
    return { status: r.names.length ? 'ok' : '목록없음', url, ...r }
  } catch (e) {
    return { status: '오류', error: String(e.message || e).slice(0, 200) }
  } finally { await ctx.close() }
}

async function main() {
  const sites = await readJson(SITES, [])
  const pub = await readJson(PUB, null)
  if (!pub) throw new Error(`${PUB} 없음`)
  const state = await readJson(STATE, {})
  // rows: [firmIdx, name, sector, year, state, logoDomain, firstSeen, lastSeen, auto]
  for (const r of pub.rows) { if (r[6] == null) r[6] = '2026-10-29'; if (r[7] == null) r[7] = '2026-10-29'; if (r[8] == null) r[8] = 0 }
  pub.cols = ['firm', 'company', 'sector', 'year', 'state', 'logoDomain', 'firstSeen', 'lastSeen', 'auto']
  const fIdx = new Map(pub.firms.map((f, i) => [f.n, i]))

  let todo = sites
  if (args.only) todo = todo.filter((s) => s.firm.includes(args.only))
  if (args.limit) todo = todo.slice(0, Number(args.limit))

  const changes = { run_at: new Date().toISOString(), date: TODAY, checked: 0, ok: 0, added: [], suspicious: [], errors: [] }
  const browser = await chromium.launch()
  let cursor = 0
  async function worker() {
    while (cursor < todo.length) {
      const site = todo[cursor++]
      const fi = fIdx.get(site.firm)
      if (fi == null) continue
      const firm = pub.firms[fi]
      const mine = pub.rows.filter((r) => r[0] === fi)
      const known = new Set(mine.filter((r) => !r[5]).map((r) => normName(r[1])))
      const res = await crawlSite(browser, site, known, state[site.firm])
      changes.checked++
      firm.chk = TODAY
      if (res.status !== 'ok') {
        changes.errors.push({ firm: site.firm, status: res.status, error: res.error || '' })
        console.log(`✗ ${site.firm}: ${res.status} ${res.error || ''}`)
        continue
      }
      const names = res.names
      // 구조 변경 의심: 지난번의 절반 미만
      if (known.size >= 10 && names.length < known.size * 0.5) {
        changes.suspicious.push({ firm: site.firm, reason: `추출 ${names.length}건 < 기존 ${known.size}건의 절반`, url: res.url })
        firm.st = '수집이상'
        delete state[site.firm] // 다음 주에 다시 학습
        console.log(`? ${site.firm}: 구조 변경 의심 (${names.length}/${known.size})`)
        continue
      }
      changes.ok++
      const mode = res.mode === 'learned' ? (state[site.firm]?.mode || 'learned') : res.mode // 자동 추출로 학습한 규칙은 계속 '자동'으로 표시
      const auto = mode === 'auto' ? 1 : 0
      const seen = new Set()
      for (const n of names) {
        const k = normName(n.name); seen.add(k)
        const row = mine.find((r) => normName(r[1]) === k)
        if (row) { row[7] = TODAY; continue }
        pub.rows.push([fi, n.name, '', '', '', n.isDom ? 1 : 0, TODAY, TODAY, auto])
        changes.added.push({ firm: site.firm, name: n.name, auto })
      }
      state[site.firm] = { url: res.url, sig: res.sig, mode, at: TODAY }
      firm.st = auto ? '자동수집(검토 필요)' : '수집완료'
      firm.pp = res.url
      firm.cnt = pub.rows.filter((r) => r[0] === fi).length
      console.log(`✓ ${site.firm}: ${names.length}건 (${res.mode})`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  await browser.close()

  pub.generated_at = new Date().toISOString()
  pub.source = '운용사 공식 홈페이지 포트폴리오 페이지 (주간 자동 수집)'
  await mkdir('data', { recursive: true })
  await writeFile(PUB, JSON.stringify(pub))
  await writeFile(STATE, JSON.stringify(state, null, 1))
  // 변경 이력은 최근 12회만 보관
  const prevCh = await readJson(CHANGES, { runs: [] })
  const runs = [changes, ...(prevCh.runs || [])].slice(0, 12)
  await writeFile(CHANGES, JSON.stringify({ runs }))
  console.log(`완료: 확인 ${changes.checked} · 성공 ${changes.ok} · 신규 ${changes.added.length} · 이상 ${changes.suspicious.length} · 실패 ${changes.errors.length}`)
  if (changes.ok === 0) process.exitCode = 1
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
