// 주간 브리핑 — 대상 주(월~일, KST)의 리포트 후보를 뽑는다.
// 사용: node scripts/brief/collect.mjs [주 시작일 YYYY-MM-DD]   (생략 시 '지난주 월요일')
// 출력: tmp/brief-candidates.json  — Claude가 이 파일을 읽고 원문을 확인해 브리핑을 쓴다.
//   · items: 대상 주 발간 리포트(발간일 기준). 발간일이 월 단위(YYYY-MM)·연도뿐인 항목은 그 주에 처음 수집된 경우만 포함.
//   · keywords: 세부 테마 등장 횟수(이번 주 vs 지난주) — 숫자는 스크립트가 계산(브리핑에 그대로 사용)
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const KST = 9 * 3600e3
const ymd = (t) => new Date(t + KST).toISOString().slice(0, 10)
function lastMonday() {
  const now = Date.now() + KST
  const d = new Date(now); const dow = (d.getUTCDay() + 6) % 7 // 월=0
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow - 7)).toISOString().slice(0, 10)
}
const addDays = (s, n) => new Date(Date.parse(s + 'T00:00:00Z') + n * 86400e3).toISOString().slice(0, 10)

const from = process.argv[2] || lastMonday()
const to = addDays(from, 6)
const pFrom = addDays(from, -7); const pTo = addDays(from, -1)

const data = JSON.parse(await readFile('public/data/industry.json', 'utf-8'))
// 매일 수집된 본문·PDF 앞부분 텍스트(scripts/fetch-industry-text.mjs) — 없으면 빈 값
let texts = {}
try { texts = JSON.parse(await readFile('data/industry-text.json', 'utf-8')).items || {} } catch { /* 없음 */ }
const inRange = (it, a, b) => {
  const d = it.날짜 || ''
  if (d.length === 10) return d >= a && d <= b
  return (it.수집일 || '') >= a && (it.수집일 || '') <= b && (!d || d.slice(0, 7) >= a.slice(0, 7)) // 월·연 단위 발간일
}
const items = data.items.filter((i) => inRange(i, from, to))
const prev = data.items.filter((i) => inRange(i, pFrom, pTo))
const count = (arr) => { const m = {}; for (const i of arr) for (const t of i.세부 || []) m[t] = (m[t] || 0) + 1; return m }
const cur = count(items); const pc = count(prev)
const keywords = Object.keys({ ...cur, ...pc }).map((t) => ({ tag: t, count: cur[t] || 0, prev: pc[t] || 0 }))
  .filter((k) => k.count > 0).sort((a, b) => b.count - a.count || b.count - b.prev - (a.count - a.prev))

const out = {
  id: from, 기간: { from, to }, 리포트수: items.length, 지난주리포트수: prev.length,
  keywords,
  items: items.sort((a, b) => (b.날짜 || '').localeCompare(a.날짜 || ''))
    .map(({ id, 테마, 세부, 기관, 게시판, 날짜, 제목, 링크 }) => {
      const t = texts[id] || {}
      const raw = data.items.find((x) => x.id === id) || {}
      const 본문 = [raw.요약 ? `[초록] ${raw.요약}` : '', t.page || ''].filter(Boolean).join('\n'); const PDF = t.pdf || ''
      return { id, 테마, 세부, 기관, 게시판, 날짜, 제목, 링크, 원문확보: 본문.length + PDF.length > 400, 본문, PDF }
    }),
}
await mkdir('tmp', { recursive: true })
await writeFile('tmp/brief-candidates.json', JSON.stringify(out, null, 1))
const got = out.items.filter((i) => i.원문확보).length
console.log(`대상 주 ${from} ~ ${to} · 리포트 ${items.length}건 (지난주 ${prev.length}건) · 원문 텍스트 확보 ${got}건 → tmp/brief-candidates.json`)
