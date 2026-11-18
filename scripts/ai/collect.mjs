// AI 주간 브리핑 — 대상 주(월~일, KST)의 후보 자료를 모은다.
// 사용: node scripts/ai/collect.mjs [주 시작일 YYYY-MM-DD]   (생략 시 '지난주 월요일')
// 출력: tmp/ai-candidates.json
//   · items: ① 피드(public/data/ai/feed.json — 전문지·뉴스레터·기업 블로그·구글 뉴스) ② 산업 트래킹 AI 리포트(public/data/industry.json)
//     id는 refs에 그대로 쓴다(피드 'A-…', 산업 트래킹은 원래 id).
//   · keywords: 레이어별 등장 건수(이번 주 vs 지난주) — 숫자는 스크립트가 계산(브리핑에 그대로 사용)
//   · 반도체브리핑: 같은 주 반도체 브리핑이 이미 있으면 그 시그널 제목 목록(중복 회피용)
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { tagAi, tagAiCross } from './tags.mjs'

const KST = 9 * 3600e3
function lastMonday() {
  const d = new Date(Date.now() + KST); const dow = (d.getUTCDay() + 6) % 7
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow - 7)).toISOString().slice(0, 10)
}
const addDays = (s, n) => new Date(Date.parse(s + 'T00:00:00Z') + n * 86400e3).toISOString().slice(0, 10)
const from = process.argv[2] || lastMonday()
const to = addDays(from, 6)
const pFrom = addDays(from, -7); const pTo = addDays(from, -1)

let feed = { items: [], sources: [] }
try { feed = JSON.parse(await readFile('public/data/ai/feed.json', 'utf-8')) } catch { console.warn('경고: feed.json 없음 — fetch-ai 워크플로가 아직 안 돌았다') }
const ind = JSON.parse(await readFile('public/data/industry.json', 'utf-8'))
let texts = {}
try { texts = JSON.parse(await readFile('data/industry-text.json', 'utf-8')).items || {} } catch { /* 없음 */ }
let semi = null
try { semi = JSON.parse(await readFile(`public/data/semi/weekly/${from}.json`, 'utf-8')) } catch { /* 아직 없음 */ }

const inRange = (d, a, b) => d && d.slice(0, 10) >= a && d.slice(0, 10) <= b
const isAiInd = (i) => (i.세부 || []).some((t) => t === 'AI' || t === '피지컬 AI·로봇' || t === '데이터·클라우드') || i.테마 === 'AI·소프트웨어·데이터'
const pickFeed = (a, b) => feed.items.filter((i) => inRange(i.날짜, a, b)).map((i) => {
  const s = `${i.제목} ${i.요약 || ''}`
  return { id: `A-${i.id}`, 출처구분: '피드', 분류: i.분류, 매체: i.매체, 제목: i.제목, 링크: i.링크, 날짜: i.날짜, 레이어: tagAi(s), 태그: tagAiCross(s), 구글경유: !!i.구글경유, 본문: i.요약 || '', PDF: '' }
})
const pickInd = (a, b) => ind.items.filter((i) => isAiInd(i) && inRange(i.날짜 || i.수집일, a, b)).map((i) => {
  const t = texts[i.id] || {}
  return {
    id: i.id, 출처구분: '산업트래킹', 분류: '연구기관·기업', 매체: i.기관, 제목: i.제목, 링크: i.링크, 날짜: i.날짜,
    레이어: tagAi(`${i.제목} ${i.요약 || ''}`), 태그: tagAiCross(i.제목), 구글경유: false,
    본문: [i.요약 ? `[초록] ${i.요약}` : '', t.page || ''].filter(Boolean).join('\n').slice(0, 6000), PDF: (t.pdf || '').slice(0, 12000),
  }
})
const cur = [...pickFeed(from, to), ...pickInd(from, to)]
const prev = [...pickFeed(pFrom, pTo), ...pickInd(pFrom, pTo)]
const count = (arr) => { const m = {}; for (const i of arr) for (const t of [...i.레이어, ...i.태그]) m[t] = (m[t] || 0) + 1; return m }
const c1 = count(cur); const c0 = count(prev)
const keywords = Object.keys({ ...c1, ...c0 }).map((tag) => ({ tag, count: c1[tag] || 0, prev: c0[tag] || 0 }))
  .filter((k) => k.count > 0).sort((a, b) => b.count - a.count)

cur.sort((a, b) => (b.레이어.length > 0) - (a.레이어.length > 0) || (b.날짜 || '').localeCompare(a.날짜 || ''))
const out = {
  id: from, 기간: { from, to }, 자료수: cur.length, 지난주자료수: prev.length, keywords,
  피드상태: (feed.sources || []).map(({ 매체, ok, error }) => ({ 매체, ok, error })),
  반도체브리핑: semi ? (semi.밸류체인 || []).flatMap((g) => g.시그널.map((s) => `[${g.구간}] ${s.제목}`)) : null,
  items: cur.map((i) => ({ ...i, 원문확보: (i.본문 || '').length + (i.PDF || '').length > 300 })),
}
await mkdir('tmp', { recursive: true })
await writeFile('tmp/ai-candidates.json', JSON.stringify(out, null, 1))
const by = {}; for (const i of cur) by[i.분류] = (by[i.분류] || 0) + 1
console.log(`대상 주 ${from} ~ ${to} · 후보 ${cur.length}건 (지난주 ${prev.length}건) · ${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(' · ')}${semi ? ' · 같은 주 반도체 브리핑 있음' : ''} → tmp/ai-candidates.json`)
