// 주간 브리핑 검증 + 목록(index.json) 갱신
// 사용: node scripts/brief/validate.mjs public/data/briefs/<id>.json
// · 필수 항목·개수 확인, 본문의 [n] 출처 번호가 모두 refs에 있는지, refs의 리포트 id가 수집 목록에 있는지 확인
// · refs의 기관·제목·날짜·링크는 수집 목록 값으로 덮어써 오타·환각 링크를 막는다
// · 통과하면 public/data/briefs/index.json 을 다시 만든다(최신순)
import { readFile, writeFile, readdir } from 'node:fs/promises'

const file = process.argv[2]
if (!file) { console.error('사용: node scripts/brief/validate.mjs <브리핑 JSON>'); process.exit(1) }
const b = JSON.parse(await readFile(file, 'utf-8'))
const all = new Map(JSON.parse(await readFile('public/data/industry.json', 'utf-8')).items.map((i) => [i.id, i]))
const errs = []
const need = (cond, msg) => { if (!cond) errs.push(msg) }

need(/^\d{4}-\d{2}-\d{2}$/.test(b.id || ''), 'id(주 시작일 YYYY-MM-DD) 필요')
need(b.기간?.from && b.기간?.to, '기간.from/to 필요')
need(Array.isArray(b.한눈에) && b.한눈에.length >= 3 && b.한눈에.length <= 5, '한눈에: 3~5줄')
need(Array.isArray(b.기술스터디) && b.기술스터디.length >= 2 && b.기술스터디.length <= 3, '기술스터디: 2~3개')
need(Array.isArray(b.업계동향) && b.업계동향.length >= 3 && b.업계동향.length <= 6, '업계동향: 테마 3~6개')
for (const g of b.업계동향 || []) need(Array.isArray(g.시그널) && g.시그널.length >= 1 && g.시그널.length <= 4, `업계동향 '${g.테마}': 시그널 1~4개`)
for (const s of b.기술스터디 || []) need(!s.핵심포인트 || (s.핵심포인트.length >= 2 && s.핵심포인트.length <= 6), `기술스터디 '${s.주제}': 핵심포인트 2~6개`)
need(Array.isArray(b.정독TOP3) && b.정독TOP3.length === 3, '정독TOP3: 정확히 3개')
need(Array.isArray(b.refs) && b.refs.length > 0, 'refs 필요')

// refs 정규화
const refs = new Map()
for (const r of b.refs || []) {
  const it = all.get(r.id)
  if (!it) { errs.push(`refs[${r.n}] 리포트 id ${r.id} 가 수집 목록에 없음`); continue }
  if (refs.has(r.n)) errs.push(`refs 번호 ${r.n} 중복`)
  refs.set(r.n, { n: r.n, id: it.id, 기관: it.기관, 게시판: it.게시판 || '', 제목: it.제목, 날짜: it.날짜, 링크: it.링크, 원문확인: r.원문확인 !== false })
}
b.refs = [...refs.values()].sort((a, z) => a.n - z.n)

// 본문의 [n] 확인
const texts = []
const walk = (v, path) => {
  if (typeof v === 'string') texts.push([path, v])
  else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`))
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'refs' && k !== '키워드') walk(x, `${path}.${k}`)
}
walk(b, '')
const used = new Set()
for (const [p, t] of texts) for (const m of t.matchAll(/\[(\d+)\]/g)) { const n = +m[1]; used.add(n); if (!refs.has(n)) errs.push(`${p}: 출처 [${n}] 가 refs에 없음`) }
for (const s of b.기술스터디 || []) need(/\[\d+\]/.test(JSON.stringify(s)), `기술스터디 '${s.주제}': 출처 번호 없음`)
for (const t of b.정독TOP3 || []) need(refs.has(t.ref), `정독TOP3 ref ${t.ref} 가 refs에 없음`)
for (const t of b.정독TOP3 || []) used.add(t.ref)
for (const s of b.기술스터디 || []) for (const n of s.더읽을거리 || []) { used.add(n); need(refs.has(n), `더읽을거리 ${n} 가 refs에 없음`) }
const unused = b.refs.filter((r) => !used.has(r.n)).map((r) => r.n)
if (unused.length) console.warn(`경고: 본문에서 쓰지 않은 출처 ${unused.join(', ')} (그대로 둠)`)

if (errs.length) { console.error('검증 실패:\n - ' + errs.join('\n - ')); process.exit(1) }
b.generated_at = b.generated_at || new Date().toISOString()
await writeFile(file, JSON.stringify(b, null, 1))

// index.json 재생성
const dir = 'public/data/briefs'
const list = []
for (const f of (await readdir(dir)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))) {
  let x
  try { x = JSON.parse(await readFile(`${dir}/${f}`, 'utf-8')) } catch { console.warn(`경고: ${f} 읽기 실패 — 목록에서 제외`); continue }
  list.push({ id: x.id, 기간: x.기간, generated_at: x.generated_at, 리포트수: x.리포트수, headline: (x.한눈에?.[0] || '').replace(/\s*\[\d+\]/g, ''), docx: `briefs/${x.id}.docx` })
}
list.sort((a, z) => z.id.localeCompare(a.id))
await writeFile(`${dir}/index.json`, JSON.stringify({ updated_at: new Date().toISOString(), briefs: list }, null, 1))
console.log(`검증 통과 · 출처 ${b.refs.length}건 · 브리핑 목록 ${list.length}주`)
