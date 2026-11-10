// 세컨더리·소싱 ↔ 공시분석 연결 공용 로직
// 데이터:
//  - dart-index.json : 감사보고서 후보 중 투자 흔적(VC 주주·RCPS·투자유치)이 있거나 소싱 데이터에 이름이 있는 회사 전체
//                      (fetch-dart-screener 크롤러가 생성 — 화면용 dart-screener.json의 상위 4,000건 제한 없음)
//  - dart-alias.json : 이름 연결 수동 보정표 { map: { "소싱 회사명": "DART 고유번호(corp_code)" 또는 null(연결 끊기) } }
//  - diva.json       : DIVA 조합현황(조합명 → 운용사·만기일)
import { rate } from './dartShared.js'

// ---- 회사명 정규화(표기 차이 흡수: ㈜·주식회사·Inc. 등 제거, 공백·기호·대소문자 무시) ----
export function normName(s) {
  return String(s || '')
    .replace(/\(로고.*?\)/g, '')
    .replace(/㈜|\(주\)|주식회사|\(유\)|유한회사|유한책임회사/g, '')
    .replace(/,?\s*(inc|co|ltd|corp|corporation|limited|llc|l\.l\.c)\.?(?=\s|$|\/)/gi, '')
    .replace(/[\s.,()'"·\-_/&]/g, '')
    .toLowerCase()
}

// ---- 조합명 정규화('제1호'↔'1호', '…투자조합'↔'…펀드' 등 꼬리 표기 차이 흡수) ----
export function normFund(s) {
  return String(s || '')
    .replace(/㈜|\(주\)|주식회사|\(유\)|유한회사|유한책임회사|합자회사/g, '')
    .replace(/[\s.,()'"·\-_/&*]/g, '')
    .toLowerCase()
    .replace(/제(?=\d)/g, '')
    .replace(/(벤처투자조합|신기술사업투자조합|신기술투자조합|투자조합|조합|사모투자합자회사|펀드|fund|lp)$/, '')
}
// 감사보고서 주주표에 나오지만 투자 조합이 아닌 것
const NOT_FUND = /우리사주|협동조합|생활협동|노동조합/

const TODAY = new Date()
const monthsBetween = (a, b) => (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())

// 사업연도("2025.12") 결산일
export function fyEnd(fy) {
  const m = /^(\d{4})\.(\d{1,2})/.exec(fy || '')
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]), 0) // 그 달 말일
}

// 유동성 = 현금및현금성자산 + 단기금융상품(원문을 다시 읽어 확인된 회사만 — liq)
export const liquidity = (r) => (r?.cash === null || r?.cash === undefined ? null : r.cash + (r.liq ? r.stfi || 0 : 0))

// 결산 기준 런웨이(개월) = 유동성 ÷ 월 영업손실. null = 계산 불가, Infinity = 영업흑자
export function runwayAtFy(r) {
  const L = liquidity(r)
  if (!r || r.op === null || r.op === undefined || L === null) return null
  if (r.op >= 0) return Infinity
  return Math.round((L / (-r.op)) * 12)
}
// 현재 추정 런웨이 = 결산 기준 런웨이 − 결산 후 지난 개월 수. 0 이하 = 소진 추정(그 사이 자금 조달했을 가능성)
export function runway(r) {
  const m = runwayAtFy(r)
  if (m === null || m === Infinity) return m
  const end = fyEnd(r.fy)
  return m - (end ? Math.max(0, monthsBetween(end, TODAY)) : 0)
}
export function runwayLabel(m) {
  if (m === null || m === undefined) return '—'
  if (m === Infinity) return '흑자'
  if (m <= 0) return '소진 추정'
  return `${m}개월`
}

// dart-index.json → 행 객체 + 등급·런웨이
export function parseIndex(data) {
  if (!data?.items || !data?.cols) return []
  return data.items.map((a) => {
    const o = Object.fromEntries(data.cols.map((c, i) => [c, a[i]]))
    const g = o.lite ? { grade: null, why: [] } : rate(o)
    return { ...o, grade: g.grade, why: g.why, runway: runway(o), runwayFy: runwayAtFy(o), lastRaise: (o.raises || []).slice(-1)[0] || null }
  })
}

// 소싱·DIVA·공시를 잇는 색인
export function buildDartLinks(indexData, aliasData, diva) {
  const rows = parseIndex(indexData)
  const byName = new Map()
  const byCode = new Map()
  for (const r of rows) {
    byCode.set(r.corp_code, r)
    const k = normName(r.name)
    if (k && !byName.has(k)) byName.set(k, r)
  }
  // 수동 보정 — 소싱 이름 → corp_code(또는 null이면 연결 끊기)
  const alias = new Map(Object.entries(aliasData?.map || {}).map(([k, v]) => [normName(k), v]))
  const lookup = (name) => {
    const k = normName(name)
    if (alias.has(k)) { const code = alias.get(k); return code ? byCode.get(String(code)) || null : null }
    return byName.get(k) || null
  }

  // DIVA 조합명 → 조합
  const funds = new Map()
  for (const a of diva?.asso?.items || []) {
    const k = normFund(a.조합명)
    if (k && !funds.has(k)) funds.set(k, a)
  }
  // 감사보고서 주주 조합 → 조합(DIVA) 연결, 조합별 주주 확인 회사
  const holders = new Map() // normFund(조합명) → [row]
  for (const r of rows) {
    r.funds = (r.vc || []).filter((n) => !NOT_FUND.test(n)).map((n) => {
      const a = funds.get(normFund(n)) || null
      if (a) {
        const k = normFund(a.조합명)
        if (!holders.has(k)) holders.set(k, [])
        holders.get(k).push(r)
      }
      return { name: n, asso: a }
    })
  }
  return { rows, byName, byCode, lookup, funds, holders }
}

// 주주 조합 중 기간 안에 만기가 오는(또는 이미 지난) 조합
export function expiringFunds(r, months = 24) {
  if (!r?.funds) return []
  const until = new Date(TODAY); until.setMonth(until.getMonth() + months)
  const u = until.toISOString().slice(0, 10)
  return r.funds.filter((f) => f.asso?.만기일 && f.asso.만기일 <= u).sort((a, b) => (a.asso.만기일 < b.asso.만기일 ? -1 : 1))
}
