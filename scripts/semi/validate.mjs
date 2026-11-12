// 반도체 주간 브리핑 검증 + 목록(index.json) 갱신
// 사용: node scripts/semi/validate.mjs public/data/semi/weekly/<id>.json
// · 필수 항목·개수 확인, 본문의 [n]이 모두 refs에 있는지 확인
// · refs 두 가지: {n, id} → 수집 목록(피드 'F-…' / 산업 트래킹 id)에서 매체·제목·날짜·링크를 채운다(환각 링크 방지)
//                {n, 제목, 매체, 날짜, 링크} → 웹 검색으로 찾은 외부 자료(SEMI 보도자료·IR 등). 링크는 https 필수
// · 통과하면 public/data/semi/index.json 을 다시 만든다(최신순)
import { readFile, writeFile, readdir } from 'node:fs/promises'

export const SEGS = ['소재', '부품', '장비', '메모리', '파운드리·로직', '패키징·테스트', '설계·AI칩', '정책·공급망']
const file = process.argv[2]
if (!file) { console.error('사용: node scripts/semi/validate.mjs <브리핑 JSON>'); process.exit(1) }
const b = JSON.parse(await readFile(file, 'utf-8'))
let feed = { items: [] }
try { feed = JSON.parse(await readFile('public/data/semi/feed.json', 'utf-8')) } catch { /* 없음 */ }
const ind = JSON.parse(await readFile('public/data/industry.json', 'utf-8'))
const all = new Map([
  ...feed.items.map((i) => [`F-${i.id}`, { 매체: i.매체, 제목: i.제목, 날짜: i.날짜, 링크: i.링크, 구분: i.분류 }]),
  ...ind.items.map((i) => [i.id, { 매체: i.기관, 제목: i.제목, 날짜: i.날짜, 링크: i.링크, 구분: '연구기관·기업' }]),
])
const errs = []
const need = (c, m) => { if (!c) errs.push(m) }

need(/^\d{4}-\d{2}-\d{2}$/.test(b.id || ''), 'id(주 시작일 YYYY-MM-DD) 필요')
need(b.기간?.from && b.기간?.to, '기간.from/to 필요')
need(Array.isArray(b.한눈에) && b.한눈에.length >= 3 && b.한눈에.length <= 5, '한눈에: 3~5줄')
need(!b.숫자 || (Array.isArray(b.숫자) && b.숫자.length <= 6), '숫자: 0~6개')
for (const x of b.숫자 || []) need(x.지표 && x.값 && /\[\d+\]/.test(x.설명 || ''), `숫자 '${x.지표}': 지표·값·설명([n]) 필요`)
need(Array.isArray(b.밸류체인) && b.밸류체인.length >= 3 && b.밸류체인.length <= 8, '밸류체인: 구간 3~8개')
for (const g of b.밸류체인 || []) {
  need(SEGS.includes(g.구간), `밸류체인 구간명 '${g.구간}' — ${SEGS.join('/')} 중 하나`)
  need(Array.isArray(g.시그널) && g.시그널.length >= 1 && g.시그널.length <= 4, `밸류체인 '${g.구간}': 시그널 1~4개`)
  for (const s of g.시그널 || []) need(s.제목 && /\[\d+\]/.test(s.내용 || ''), `밸류체인 '${g.구간}': 시그널마다 제목·내용([n]) 필요`)
}
need(Array.isArray(b.기술노트) && b.기술노트.length >= 1 && b.기술노트.length <= 2, '기술노트: 1~2개')
for (const s of b.기술노트 || []) need(s.주제 && /\[\d+\]/.test(s.설명 || '') && /^ch\d{2}$/.test(s.교과서 || ''), `기술노트 '${s.주제}': 주제·설명([n])·교과서(chNN) 필요`)
need(!b.국내기업 || b.국내기업.length <= 10, '국내기업: 0~10개')
for (const x of b.국내기업 || []) need(x.기업 && /\[\d+\]/.test(x.내용 || ''), `국내기업 '${x.기업}': 내용([n]) 필요`)
need(!b.정독 || b.정독.length <= 3, '정독: 0~3개')
need(Array.isArray(b.refs) && b.refs.length > 0, 'refs 필요')

const refs = new Map()
for (const r of b.refs || []) {
  if (refs.has(r.n)) errs.push(`refs 번호 ${r.n} 중복`)
  if (r.id) {
    const it = all.get(r.id)
    if (!it) { errs.push(`refs[${r.n}] id ${r.id} 가 수집 목록에 없음`); continue }
    refs.set(r.n, { n: r.n, id: r.id, ...it })
  } else {
    if (!(r.제목 && r.매체 && /^https:\/\//.test(r.링크 || ''))) { errs.push(`refs[${r.n}] 외부 자료는 제목·매체·https 링크 필요`); continue }
    refs.set(r.n, { n: r.n, 제목: r.제목, 매체: r.매체, 날짜: r.날짜 || '', 링크: r.링크, 구분: r.구분 || '웹 검색' })
  }
}
b.refs = [...refs.values()].sort((a, z) => a.n - z.n)

const texts = []
const walk = (v, p) => {
  if (typeof v === 'string') texts.push([p, v])
  else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}[${i}]`))
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!['refs', '키워드'].includes(k)) walk(x, `${p}.${k}`)
}
walk(b, '')
const used = new Set()
for (const [p, t] of texts) for (const m of t.matchAll(/\[(\d+)\]/g)) { const n = +m[1]; used.add(n); if (!refs.has(n)) errs.push(`${p}: 출처 [${n}] 가 refs에 없음`) }
for (const x of b.정독 || []) { used.add(x.ref); need(refs.has(x.ref), `정독 ref ${x.ref} 가 refs에 없음`) }
const unused = b.refs.filter((r) => !used.has(r.n)).map((r) => r.n)
if (unused.length) console.warn(`경고: 본문에서 쓰지 않은 출처 ${unused.join(', ')} (그대로 둠)`)

if (errs.length) { console.error('검증 실패:\n - ' + errs.join('\n - ')); process.exit(1) }
b.generated_at = b.generated_at || new Date().toISOString()
await writeFile(file, JSON.stringify(b, null, 1))

const dir = 'public/data/semi/weekly'
const list = []
for (const f of (await readdir(dir)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))) {
  let x
  try { x = JSON.parse(await readFile(`${dir}/${f}`, 'utf-8')) } catch { console.warn(`경고: ${f} 읽기 실패 — 목록에서 제외`); continue }
  list.push({ id: x.id, 기간: x.기간, generated_at: x.generated_at, 자료수: x.자료수, headline: (x.한눈에?.[0] || '').replace(/\s*\[\d+\]/g, ''), docx: `briefs/semi/${x.id}.docx` })
}
list.sort((a, z) => z.id.localeCompare(a.id))
await writeFile('public/data/semi/index.json', JSON.stringify({ updated_at: new Date().toISOString(), weeks: list }, null, 1))
console.log(`검증 통과 · 출처 ${b.refs.length}건 · 반도체 브리핑 목록 ${list.length}주`)
