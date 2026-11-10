// JH Weekly Report 검증 + 계산 구역 채우기 + index.json 갱신
// 사용: node scripts/weekly/validate.mjs public/data/weekly/<id>.json
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { buildBase } from './collect.mjs'

const file = process.argv[2]
if (!file) { console.error('사용: node scripts/weekly/validate.mjs <JSON>'); process.exit(1) }
const w = JSON.parse(await readFile(file, 'utf-8'))
const errs = []
const need = (c, m) => { if (!c) errs.push(m) }
need(/^\d{4}-\d{2}-\d{2}$/.test(w.id || ''), 'id(주 시작일) 필요')
need(Array.isArray(w.한눈에) && w.한눈에.length >= 3 && w.한눈에.length <= 5, '한눈에 3~5줄')
const R = w.레이더 || {}
need(Array.isArray(R.top) && R.top.length <= 5, '레이더.top 최대 5건')
const CATS = ['자금조달', '규제정책', '기술제품', '회수', '인력조직']
R.카테고리 = R.카테고리 || {}
let total = 0
for (const c of CATS) { R.카테고리[c] = R.카테고리[c] || []; need(R.카테고리[c].length <= 4, `레이더.${c} 최대 4건`); total += R.카테고리[c].length }
need(total <= 15, '레이더 카테고리 합계 최대 15건')
need(!R.인사이트 || R.인사이트.length <= 5, '인사이트 5줄 이내')
const 주목 = w.펀딩?.주목 || []
need(주목.length <= 10, '펀딩.주목 최대 10건')

const refs = new Map((w.refs || []).map((r) => [r.n, r]))
for (const r of w.refs || []) { need(/^https?:\/\//.test(r.링크 || ''), `refs ${r.n} 링크 필요`); need(!/news\.google\.com/.test(r.링크 || ''), `refs ${r.n}: 구글 뉴스 중계 링크 대신 언론사 원문 주소`) }
const txt = JSON.stringify({ a: w.한눈에, b: R, c: 주목 })
for (const m of txt.matchAll(/\[(\d+)\]/g)) need(refs.has(+m[1]), `출처 [${m[1]}] 가 refs에 없음`)
if (errs.length) { console.error('검증 실패:\n - ' + [...new Set(errs)].join('\n - ')); process.exit(1) }

// 계산 구역은 항상 최신 데이터로 다시 채운다(손으로 쓴 값이 섞이지 않게)
const base = await buildBase(w.id)
w.기간 = base.기간
w.산업트래킹 = base.산업트래킹
w.IPO = base.IPO
w.IPO기간 = base.IPO기간
w.펀딩 = { ...base.펀딩, 주목 }
w.generated_at = w.generated_at || new Date().toISOString()
await writeFile(file, JSON.stringify(w, null, 1))

const dir = 'public/data/weekly'
const list = []
for (const f of (await readdir(dir)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))) {
  let x; try { x = JSON.parse(await readFile(`${dir}/${f}`, 'utf-8')) } catch { continue }
  list.push({ id: x.id, 기간: x.기간, generated_at: x.generated_at, headline: (x.한눈에?.[0] || '').replace(/\s*\[\d+\]/g, ''), docx: `briefs/weekly/${x.id}.docx` })
}
list.sort((a, z) => z.id.localeCompare(a.id))
await writeFile(`${dir}/index.json`, JSON.stringify({ updated_at: new Date().toISOString(), weeks: list }, null, 1))
console.log(`검증 통과 · 레이더 top ${R.top.length}·카테고리 ${total}건 · IPO ${w.IPO.length} · 펀딩 ${w.펀딩.건수}(주목 ${주목.length}) · 목록 ${list.length}주`)
