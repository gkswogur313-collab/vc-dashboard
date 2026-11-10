// IPO 단계별 보고서 — 요약 대기 목록 / 형식 검사
// 사용: node scripts/ipo-report-pending.mjs           → 요약이 필요한 (회사, 단계) 목록과 기사 수
//       node scripts/ipo-report-pending.mjs --check   → 작성된 요약의 출처 번호·refs 일치, 남은 대기 확인
import { readFile, readdir } from 'node:fs/promises'

const DIR = 'public/data/ipo-reports'
const check = process.argv.includes('--check')
const errs = []
let pending = 0
for (const f of (await readdir(DIR)).filter((f) => f.endsWith('.json') && f !== 'index.json')) {
  const rep = JSON.parse(await readFile(`${DIR}/${f}`, 'utf-8'))
  for (const [st, v] of Object.entries(rep.단계 || {})) {
    if (v.요약필요) {
      pending++
      if (!check) console.log(`- ${rep.회사명} [${st}] 기준일 ${v.기준일} · 기사 ${v.기사?.length || 0}건${v.증권신고서 ? ' · 증권신고서 있음' : ''} → ${DIR}/${f}`)
      continue
    }
    if (!check || !v.요약) continue
    const refs = new Set((v.요약.refs || []).map((r) => r.n))
    const text = JSON.stringify({ a: v.요약.한줄, b: v.요약.영위사업, c: v.요약.포인트 })
    for (const m of text.matchAll(/\[(\d+)\]/g)) if (!refs.has(+m[1])) errs.push(`${rep.회사명} [${st}] 출처 [${m[1]}] 가 refs에 없음`)
    for (const r of v.요약.refs || []) if (!/^https?:\/\//.test(r.링크 || '')) errs.push(`${rep.회사명} [${st}] refs ${r.n} 링크 없음`)
    if (!v.요약.한줄 || !v.요약.영위사업 || (Array.isArray(v.요약.영위사업) && !v.요약.영위사업.length)) errs.push(`${rep.회사명} [${st}] 한줄·영위사업 필요`)
    if (typeof v.요약.영위사업 === 'string') errs.push(`${rep.회사명} [${st}] 영위사업은 항목 배열로 작성`)
  }
}
if (check) {
  if (errs.length) { console.error('형식 오류:\n - ' + errs.join('\n - ')); process.exit(1) }
  console.log(`형식 통과 · 남은 요약 대기 ${pending}단계`)
} else console.log(`요약 대기 ${pending}단계`)
