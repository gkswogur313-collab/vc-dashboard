// JH Weekly Report — 대상 주(월~일, KST)의 '계산 가능한' 부분을 모은다
// 사용: node scripts/weekly/collect.mjs [주 시작일 YYYY-MM-DD]   (생략 시 지난주 월요일)
// 출력: tmp/weekly-base.json
//   · 산업트래킹: 같은 주 주간 브리핑(public/data/briefs/<id>.json) 요약
//   · IPO: 전주(대상 주)+금주(리포트 발행 주)에 심사청구·심사승인·수요예측·상장이 있는 종목(스팩 제외) + 단계별 보고서 한줄
//     각 행에 주('전주'|'금주') 표시. 금주 행은 공시된 일정(예정) 기준
//   · 펀딩: 그 주 신규 펀딩 목록(public/data/funding.json) + 공개 금액 합계
// Claude는 이 파일을 읽고 레이더(vc-news)·한눈에·주목 딜 요약만 쓴다 → scripts/weekly/GUIDE.md
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const KST = 9 * 3600e3
const addDays = (s, n) => new Date(Date.parse(s + 'T00:00:00Z') + n * 86400e3).toISOString().slice(0, 10)
function lastMonday() {
  const d = new Date(Date.now() + KST); const dow = (d.getUTCDay() + 6) % 7
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow - 7)).toISOString().slice(0, 10)
}
const readJson = async (p, fb = null) => { try { return JSON.parse(await readFile(p, 'utf-8')) } catch { return fb } }

export async function buildBase(from) {
  const to = addDays(from, 6)
  const inW = (d) => !!d && d >= from && d <= to

  // 1) 산업 트래킹 주간 브리핑
  const b = await readJson(`public/data/briefs/${from}.json`)
  const refOf = (n) => b?.refs?.find((r) => r.n === n)
  const 산업트래킹 = b ? {
    id: b.id, 기간: b.기간, 리포트수: b.리포트수,
    한눈에: (b.한눈에 || []).map((t) => t.replace(/\s*\[\d+\]/g, '')),
    기술스터디: (b.기술스터디 || []).map((s) => ({ 주제: s.주제, 한줄요약: (s.한줄요약 || '').replace(/\s*\[\d+\]/g, '') })),
    정독TOP3: (b.정독TOP3 || []).map((t) => { const r = refOf(t.ref) || {}; return { 제목: r.제목, 기관: r.기관, 날짜: r.날짜, 링크: r.링크 } }),
  } : null

  // 2) IPO — 전주(대상 주) + 금주(발행 주)의 단계 변화·일정
  const ipoTo = addDays(from, 13)
  const inIpo = (d) => !!d && d >= from && d <= ipoTo
  const weekOf = (d) => (d < addDays(from, 7) ? '전주' : '금주')
  const ipo = await readJson('public/data/ipo.json', { items: [] })
  const idx = (await readJson('public/data/ipo-reports/index.json', { reports: {} })).reports || {}
  const SPAC = /스팩|기업인수목적|SPAC/i
  const IPO = []
  for (const r of ipo.items) {
    if (SPAC.test(r.회사명)) continue
    const ev = []
    if (inIpo(r.청구일)) ev.push(['청구', r.청구일])
    if (inIpo(r.승인일) && !/철회|미승인|만료/.test(r.심사상태 || '')) ev.push(['승인', r.승인일])
    const ds = r.수요예측시작, de = r.수요예측종료 || r.수요예측시작
    if (ds && ds <= ipoTo && de >= from) ev.push(['수요예측', ds < from ? from : ds, ds, de])
    const lst = r.상장일 || r.상장예정일
    if (inIpo(lst)) ev.push(['상장', lst])
    if (!ev.length) continue
    const info = idx[r.회사명]
    let 한줄 = ''
    if (info) {
      const rep = await readJson(`public/data/ipo-reports/${info.file}.json`)
      const st = [...ev].reverse().map(([s]) => s).find((s) => rep?.단계?.[s]?.요약) || ['상장', '승인', '청구'].find((s) => rep?.단계?.[s]?.요약)
      한줄 = (rep?.단계?.[st]?.요약?.한줄 || '').replace(/\s*\[\d+\]/g, '')
    }
    for (const [단계, 날짜, 시작, 종료] of ev) {
      const row = { 주: weekOf(날짜), 회사명: r.회사명, 시장: r.시장, 단계, 날짜, 주관사: r.주관사 || '', 공모금액: r.공모금액 || '', 한줄, 보고서: info?.file || '' }
      if (단계 === '수요예측') { row.기간 = 시작 === 종료 ? 시작 : `${시작}~${종료}`; if (r.확정공모가 && r.확정공모가 !== '-') row.확정공모가 = r.확정공모가 }
      IPO.push(row)
    }
  }
  IPO.sort((a, z) => a.날짜.localeCompare(z.날짜) || a.회사명.localeCompare(z.회사명, 'ko'))

  // 3) 신규 펀딩 — [date, name, sector, amount, stage, investors]
  const f = await readJson('public/data/funding.json', { items: [] })
  const rows = (f.items || []).filter((x) => inW(x[0])).map(([날짜, 기업, 분야, 금액, 단계, 투자사]) => ({ 날짜, 기업, 분야, 금액, 단계, 투자사 }))
  const 억 = (s) => {
    const t = String(s || '').replace(/,/g, '')
    const jo = t.match(/([\d.]+)\s*조/); const eok = t.match(/([\d.]+)\s*억/)
    return (jo ? parseFloat(jo[1]) * 10000 : 0) + (eok ? parseFloat(eok[1]) : 0)
  }
  const 펀딩 = { 건수: rows.length, 공개합계억: Math.round(rows.reduce((a, r) => a + 억(r.금액), 0)), 목록: rows.sort((a, z) => 억(z.금액) - 억(a.금액) || z.날짜.localeCompare(a.날짜)) }

  return { id: from, 기간: { from, to }, IPO기간: { from, to: ipoTo }, 산업트래킹, IPO, 펀딩 }
}

if (process.argv[1]?.endsWith('collect.mjs')) {
  const from = process.argv[2] || lastMonday()
  const base = await buildBase(from)
  await mkdir('tmp', { recursive: true })
  await writeFile('tmp/weekly-base.json', JSON.stringify(base, null, 1))
  console.log(`대상 주 ${base.기간.from} ~ ${base.기간.to} (IPO ~${base.IPO기간.to}) · 산업브리핑 ${base.산업트래킹 ? '있음' : '없음'} · IPO ${base.IPO.length}건 · 펀딩 ${base.펀딩.건수}건(공개 ${base.펀딩.공개합계억}억) → tmp/weekly-base.json`)
}
