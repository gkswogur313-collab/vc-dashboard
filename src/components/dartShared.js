// 공시분석 공용 — 숫자 표기, 레이팅 규칙, 엑셀 내보내기
// 국내 관례: 증가 = 빨강, 감소 = 파랑.

export const UP = '#e5484d'
export const DOWN = '#3b82f6'

export const eok = (v) => {
  if (v === null || v === undefined) return '—'
  const a = Math.abs(v)
  const s = a >= 10000 ? (a / 10000).toFixed(1).replace(/\.0$/, '') + '조' : (a >= 100 ? Math.round(a).toLocaleString() : a.toLocaleString()) + '억'
  return (v < 0 ? '-' : '') + s
}
export const signColor = (v) => (v === null || v === undefined || v === 0 ? undefined : v > 0 ? UP : DOWN)
export const pct = (v) => (v === null || v === undefined ? '—' : (v > 0 ? '+' : '') + Math.round(v) + '%')
export const dartUrl = (rno) => `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rno}`

export const BAD_OPINIONS = ['한정', '부적정', '의견거절']

// ── 레이팅 규칙 (초안 — 기준을 바꾸려면 이 함수만 고치면 됨) ──────────────
// F : 결격 — 최신 감사의견 부적정·의견거절, 계속기업 불확실성, 완전자본잠식(조정자본 < 0)
// 조정자본 = 자본총계 + 상환전환우선주 부채 (RCPS를 부채로 잡은 스타트업이 잠식으로 오판되지 않도록)
// (한정의견은 초도감사 기업에 흔해서 F로 보지 않고, 근거에 표시만 한다)
// S : 고성장 + 투자검증 + 재무안정 + 매출 50억↑ + 감사의견 적정 2년 연속↑
// A : 고성장 + 투자검증 또는 성장 + 투자검증 + 재무안정
// B : 성장 또는 투자검증
// C : 그 외
// 고성장 = 매출 YoY ≥ 50% 또는 CAGR ≥ 40% 성장 = YoY ≥ 20% 또는 CAGR ≥ 20%
// 투자검증 = RCPS·우선주, VC 주주, 투자유치(투자자본 = 주식발행초과금 + RCPS 부채 급증) 중 하나
// 재무안정 = 영업흑자, 또는 영업적자여도 현금이 1년치 영업손실 이상
export const RATING_RULES = [
  ['S', '고성장 + 투자검증 + 재무안정 + 매출 50억↑ + 감사의견 적정 2년 연속↑'],
  ['A', '고성장 + 투자검증, 또는 성장 + 투자검증 + 재무안정'],
  ['B', '성장 또는 투자검증'],
  ['C', '해당 신호 없음'],
  ['F', '감사의견 부적정·의견거절, 계속기업 불확실성, 완전자본잠식(RCPS 부채 반영) (한정의견은 초도감사에 흔해 제외)'],
]
export const F_OPINIONS = ['부적정', '의견거절'] // 레이팅 F 사유가 되는 감사의견
export const GRADES = ['S', 'A', 'B', 'C', 'F']
export const GRADE_STYLE = {
  S: { background: '#7c3aed', color: '#fff' },
  A: { background: '#2563eb', color: '#fff' },
  B: { background: '#0d9488', color: '#fff' },
  C: { background: 'rgba(148,163,184,.35)', color: 'inherit' },
  F: { background: 'rgba(148,163,184,.15)', color: '#94a3b8' },
}

export function rate(r) {
  const why = []
  if (F_OPINIONS.includes(r.opinion)) why.push(`감사의견 ${r.opinion}`)
  if (r.gc) why.push('계속기업 불확실성')
  const eq = r.equity_adj ?? r.equity
  if (eq !== null && eq !== undefined && eq < 0) why.push('완전자본잠식')
  if (why.length) return { grade: 'F', why }
  if (r.opinion === '한정') why.push('감사의견 한정(등급 미반영)')

  const strong = (r.rev_g ?? -1) >= 50 || (r.cagr ?? -1) >= 40
  const growth = strong || (r.rev_g ?? -1) >= 20 || (r.cagr ?? -1) >= 20
  const validated = !!(r.rcps || (r.vc && r.vc.length) || r.raised)
  const stable = r.op === null || r.op === undefined ? false : r.op >= 0 || (r.cash !== null && r.cash !== undefined && r.cash >= -r.op)
  const scale = (r.rev ?? 0) >= 50
  const clean = (r.clean_years ?? 0) >= 2
  if (strong) why.push('고성장'); else if (growth) why.push('성장')
  if (validated) why.push('투자검증')
  if (stable) why.push('재무안정')
  if (scale) why.push('매출 50억↑')
  if (clean) why.push(`적정 ${r.clean_years}년 연속`)

  let grade = 'C'
  if (strong && validated && stable && scale && clean) grade = 'S'
  else if ((strong && validated) || (growth && validated && stable)) grade = 'A'
  else if (growth || validated) grade = 'B'
  return { grade, why }
}

export const hasVC = (r) => !!((r.vc && r.vc.length) || r.rcps || r.raise_year)

// ── 정렬(나래비) — key 기준 dir('desc' 높은 순 / 'asc' 낮은 순). 값이 없는 기업은 방향과 무관하게 항상 맨 아래 ──
// get(row, key): 정렬값을 꺼내는 함수(기본 row[key]) · tie(x, y): 값이 같을 때 쓸 보조 비교
const isBlank = (v) => v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v))
export function makeCmp(key, dir, get = (r, k) => r[k], tie) {
  const s = dir === 'asc' ? 1 : -1
  return (x, y) => {
    const a = get(x, key), b = get(y, key)
    const na = isBlank(a), nb = isBlank(b)
    if (na || nb) return na === nb ? (tie ? tie(x, y) : 0) : na ? 1 : -1
    const c = typeof a === 'string' || typeof b === 'string' ? String(a).localeCompare(String(b)) : a - b
    return c ? c * s : (tie ? tie(x, y) : 0)
  }
}
// 영업이익률(%) — 매출이 0 이하이면 계산하지 않음
export const margin = (op, rev) => (isBlank(op) || isBlank(rev) || rev <= 0 ? null : Math.round((op / rev) * 1000) / 10)

// ── 엑셀 내보내기 — SheetJS를 필요할 때만 불러오고, 실패하면 CSV로 대신 받는다 ──
// sheets: [{ name, header: [...], rows: [[...], ...] }]
export async function exportXlsx(filename, sheets) {
  try {
    const XLSX = await import(/* @vite-ignore */ 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs')
    const wb = XLSX.utils.book_new()
    for (const s of sheets) {
      const ws = XLSX.utils.aoa_to_sheet([s.header, ...s.rows])
      ws['!cols'] = s.header.map((h) => ({ wch: Math.min(40, Math.max(8, String(h).length * 2 + 2)) }))
      XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31))
    }
    XLSX.writeFile(wb, filename + '.xlsx')
  } catch (e) {
    const s = sheets[0]
    const esc = (v) => {
      const t = v === null || v === undefined ? '' : String(v)
      return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t
    }
    const csv = [s.header, ...s.rows].map((r) => r.map(esc).join(',')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename + '.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }
}

export const today = () => new Date().toISOString().slice(0, 10)

// ── 틀고정: 표를 화면 높이 안에서 스크롤시키고, 머리글 행은 위에 붙여 둔다 ──
// (가로 스크롤 상자 안에서는 페이지 스크롤 기준 sticky가 동작하지 않으므로 표 상자 자체를 세로로도 스크롤시킨다)
export const FREEZE_BOX = { overflow: 'auto', maxHeight: 'calc(100vh - 140px)', minHeight: 240 }
export const FREEZE_CSS = '.dart-freeze > thead > tr > th { position: sticky; top: 0; z-index: 3; background: var(--surface-2); box-shadow: inset 0 -1px 0 var(--border); }'
