// 스타트업 펀딩 List 크롤러 (GitHub Actions)
// 출처: 스타트업레시피 투자 리포트 https://startuprecipe.co.kr/invest?m_year=YYYY (연도별 SSR 표)
// 사실 데이터(일자·기업명·분야·투자금·단계·투자사)만 수집해 대시보드 자체 UI로 표시.
// 표 원문 디자인은 복제하지 않음. 월별 투자합계(공개금액, 억원)도 계산해 추이 차트에 사용.
// 의존성 없음(Node 20 내장 fetch + 정규식 파싱). → public/data/funding.json

import fs from 'fs'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const BASE = 'https://startuprecipe.co.kr/invest'
const START_YEAR = 2017
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------- HTML 파싱 ----------
const decodeEnt = (s) => (s || '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
const stripTags = (s) => decodeEnt(String(s || '').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()

// id="example" 표의 tbody 행들을 [일자,기업명,분야,투자금,단계,투자사] 배열로
export function parseRows(html) {
  const ti = html.indexOf('id="example"')
  if (ti < 0) return []
  const end = html.slice(ti).indexOf('</table>')
  const region = end < 0 ? html.slice(ti) : html.slice(ti, ti + end)
  const bi = region.search(/<tbody/i)
  const body = bi < 0 ? region : region.slice(bi)
  const rows = []
  for (const m of body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => stripTags(c[1]))
    if (cells.length < 6) continue
    const [date, name, sector, amount, stage, investors] = cells
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue // 헤더/잡행 방어
    rows.push([date, name, sector, amount, stage, investors])
  }
  return rows
}

// "3억원" / "1억5000만원" / "비공개" → 억원 단위 숫자(공개 아니면 null)
export function amountToEok(s) {
  const t = String(s || '').replace(/[, ]/g, '')
  if (!t || /비공개|미공개|비공/.test(t)) return null
  let eok = 0, matched = false
  const em = t.match(/([\d.]+)억/)
  if (em) { eok += parseFloat(em[1]); matched = true }
  const mm = t.match(/([\d.]+)만/)
  if (mm) { eok += parseFloat(mm[1]) / 10000; matched = true }
  if (!matched) {
    const wm = t.match(/([\d.]+)원/) // 원 단위만 있는 예외
    if (wm) { eok += parseFloat(wm[1]) / 1e8; matched = true }
  }
  return matched ? +eok.toFixed(4) : null
}

async function getHtml(url) {
  for (let t = 0; t < 3; t++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } })
      if (res.ok) return await res.text()
    } catch (e) { /* 재시도 */ }
    await sleep(500 * (t + 1))
  }
  return null
}

async function main() {
  const nowYear = new Date().getFullYear()
  const years = []
  for (let y = START_YEAR; y <= nowYear; y++) years.push(y)

  const all = []
  const monthly = {}      // { year: [12] 억원 합계 }
  const monthlyCount = {} // { year: [12] 공개+비공개 전체 건수 }
  const seen = new Set()

  for (const y of years) {
    const html = await getHtml(`${BASE}?m_year=${y}`)
    if (!html) { console.log(`  ${y}: 로드 실패`); continue }
    const rows = parseRows(html)
    const mt = new Array(12).fill(0)
    const mc = new Array(12).fill(0)
    let disclosed = 0
    for (const r of rows) {
      const key = r.join('|')
      if (seen.has(key)) continue // 연도 경계 중복 방어
      seen.add(key)
      const mi = parseInt(r[0].slice(5, 7), 10) - 1
      if (mi >= 0 && mi < 12) {
        mc[mi] += 1
        const eok = amountToEok(r[3])
        if (eok != null) { mt[mi] += eok; disclosed += 1 }
      }
      all.push(r)
    }
    monthly[y] = mt.map((v) => +v.toFixed(2))
    monthlyCount[y] = mc
    console.log(`  ${y}: ${rows.length}건 (공개금액 ${disclosed})`)
    await sleep(300)
  }

  all.sort((a, b) => (b[0]).localeCompare(a[0]))

  const data = {
    generated_at: new Date().toISOString(),
    source: 'StartupRecipe',
    source_url: 'https://startuprecipe.co.kr/invest',
    cols: ['date', 'name', 'sector', 'amount', 'stage', 'investors'],
    years,
    monthly,
    monthlyCount,
    count: all.length,
    items: all,
  }
  fs.mkdirSync('public/data', { recursive: true })
  fs.writeFileSync('public/data/funding.json', JSON.stringify(data))
  console.log(`완료: ${all.length}건 → public/data/funding.json`)
}

if (process.argv[1] && process.argv[1].endsWith('fetch-funding.mjs')) main()
