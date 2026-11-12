// 반도체 주간 브리핑 — 대상 주(월~일, KST)의 후보 자료를 모은다.
// 사용: node scripts/semi/collect.mjs [주 시작일 YYYY-MM-DD]   (생략 시 '지난주 월요일')
// 출력: tmp/semi-candidates.json
//   · items: ① 피드(public/data/semi/feed.json — 전문지·뉴스레터·구글 뉴스) ② 산업 트래킹 반도체 리포트(public/data/industry.json)
//     id는 refs에 그대로 쓴다(피드 'F-…', 산업 트래킹은 원래 id).
//   · keywords: 밸류체인 구간별 등장 건수(이번 주 vs 지난주) — 숫자는 스크립트가 계산(브리핑에 그대로 사용)
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { tagSemi } from './tags.mjs'

const KST = 9 * 3600e3
function lastMonday() {
  const d = new Date(Date.now() + KST); const dow = (d.getUTCDay() + 6) % 7
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow - 7)).toISOString().slice(0, 10)
}
const addDays = (s, n) => new Date(Date.parse(s + 'T00:00:00Z') + n * 86400e3).toISOString().slice(0, 10)
const from = process.argv[2] || lastMonday()
const to = addDays(from, 6)
const pFrom = addDays(from, -7); const pTo = addDays(from, -1)

const SEMI_KW = /반도체|웨이퍼|파운드리|메모리|D램|DRAM|낸드|NAND|HBM|EUV|패키징|팹리스|소부장|칩|semiconductor|chip|foundry|wafer|lithograph/i

let feed = { items: [], sources: [] }
try { feed = JSON.parse(await readFile('public/data/semi/feed.json', 'utf-8')) } catch { console.warn('경고: feed.json 없음 — fetch-semi 워크플로가 아직 안 돌았다') }
const ind = JSON.parse(await readFile('public/data/industry.json', 'utf-8'))
let texts = {}
try { texts = JSON.parse(await readFile('data/industry-text.json', 'utf-8')).items || {} } catch { /* 없음 */ }

const inRange = (d, a, b) => d && d.slice(0, 10) >= a && d.slice(0, 10) <= b
const pickFeed = (a, b) => feed.items.filter((i) => inRange(i.날짜, a, b)).map((i) => ({
  id: `F-${i.id}`, 출처구분: '피드', 분류: i.분류, 매체: i.매체, 제목: i.제목, 링크: i.링크, 날짜: i.날짜,
  구간: tagSemi(`${i.제목} ${i.요약 || ''}`), 구글경유: !!i.구글경유, 본문: i.요약 || '', PDF: '',
}))
const pickInd = (a, b) => ind.items.filter((i) => (i.테마 === '반도체' || SEMI_KW.test(i.제목)) && inRange(i.날짜 || i.수집일, a, b)).map((i) => {
  const t = texts[i.id] || {}
  return {
    id: i.id, 출처구분: '산업트래킹', 분류: '연구기관·기업', 매체: i.기관, 제목: i.제목, 링크: i.링크, 날짜: i.날짜,
    구간: tagSemi(i.제목), 구글경유: false, 본문: [i.요약 ? `[초록] ${i.요약}` : '', t.page || ''].filter(Boolean).join('\n').slice(0, 6000), PDF: (t.pdf || '').slice(0, 12000),
  }
})
const cur = [...pickFeed(from, to), ...pickInd(from, to)]
const prev = [...pickFeed(pFrom, pTo), ...pickInd(pFrom, pTo)]
const count = (arr) => { const m = {}; for (const i of arr) for (const t of i.구간) m[t] = (m[t] || 0) + 1; return m }
const c1 = count(cur); const c0 = count(prev)
const keywords = Object.keys({ ...c1, ...c0 }).map((tag) => ({ tag, count: c1[tag] || 0, prev: c0[tag] || 0 }))
  .filter((k) => k.count > 0).sort((a, b) => b.count - a.count)

// 구간이 하나도 안 걸린(반도체와 거리가 먼) 피드 글은 뒤로 보낸다
cur.sort((a, b) => (b.구간.length > 0) - (a.구간.length > 0) || (b.날짜 || '').localeCompare(a.날짜 || ''))
const out = {
  id: from, 기간: { from, to }, 자료수: cur.length, 지난주자료수: prev.length, keywords,
  피드상태: (feed.sources || []).map(({ 매체, ok, error }) => ({ 매체, ok, error })),
  items: cur.map((i) => ({ ...i, 원문확보: (i.본문 || '').length + (i.PDF || '').length > 300 })),
}
await mkdir('tmp', { recursive: true })
await writeFile('tmp/semi-candidates.json', JSON.stringify(out, null, 1))
const by = {}; for (const i of cur) by[i.분류] = (by[i.분류] || 0) + 1
console.log(`대상 주 ${from} ~ ${to} · 후보 ${cur.length}건 (지난주 ${prev.length}건) · ${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(' · ')} → tmp/semi-candidates.json`)
