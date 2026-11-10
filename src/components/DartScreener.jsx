import { useState, useMemo, Fragment } from 'react'
import { useData } from '../useData.js'
import DartLP from './DartLP.jsx'
import SortTh from './SortTh.jsx'
import {
  DOWN, eok, signColor, pct, dartUrl, rate, hasVC, exportXlsx, today, FREEZE_BOX, FREEZE_CSS,
  GRADES, GRADE_STYLE, RATING_RULES, BAD_OPINIONS, makeCmp, margin,
} from './dartShared.js'
import { normName } from './sourcingLink.js'

// 공시분석 — OpenDART 외감 감사보고서 기반 스타트업 스크리너 + 잠재 LP
// 데이터: public/data/dart-screener.json, dart-lp.json (크롤러 scripts/fetch-dart-screener.py)
// - cols: 컬럼명 배열, items: 같은 순서의 배열(점수순). 금액 단위는 억원.
// - hist: 기업별 연도 이력 [[fy, rev, op, ni, cash, invest, opinion], ...] (최대 6개년)
// invest(투자자본) = 주식발행초과금 + 상환전환우선주 부채
// 정렬(나래비): 드롭다운 또는 표 머리글 클릭. 머리글을 다시 누르면 높은 순 ↔ 낮은 순.

const ROW_CAP = 400

const SIGNALS = [
  { key: 'rcps', label: 'RCPS·우선주' },
  { key: 'raised', label: '최근 투자유치' },
  { key: 'vc', label: 'VC 주주' },
  { key: 'growth', label: '매출 YoY +50%' },
  { key: 'cagr', label: '매출 CAGR +30%' },
  { key: 'src', label: '소싱 데이터 있음' },
]

// 세컨더리·소싱 데이터(운용사 홈페이지 포트폴리오 + 투자 라운드 뉴스)와 이름으로 연결
function useSourcingMap() {
  const { data: pf } = useData('vc-portfolio.json')
  const { data: funding } = useData('funding.json')
  const { data: alias } = useData('dart-alias.json')
  return useMemo(() => {
    if (!pf && !funding) return null
    const m = new Map()
    const get = (k) => { if (!m.has(k)) m.set(k, { firms: new Set(), last: null }); return m.get(k) }
    for (const r of pf?.rows || []) { if (r[5]) continue; const k = normName(r[1]); if (k) get(k).firms.add(pf.firms[r[0]]?.n) }
    for (const [date, name, , amount, stage] of funding?.items || []) {
      const k = normName(name)
      if (!k || stage === '지원금') continue
      const e = get(k)
      if (!e.last || e.last.date < date) e.last = { date, stage, amount }
    }
    // 수동 보정표: 소싱 이름 → corp_code(null이면 연결 끊기)
    const byCode = new Map(), blocked = new Set()
    for (const [name, code] of Object.entries(alias?.map || {})) {
      const k = normName(name)
      if (code) { if (m.has(k)) byCode.set(String(code), m.get(k)); blocked.add(k) } else blocked.add(k)
    }
    return (r) => byCode.get(r.corp_code) || (blocked.has(normName(r.name)) ? null : m.get(normName(r.name)) || null)
  }, [pf, funding, alias])
}
const SORTS = [
  ['grade', '레이팅순'],
  ['score', '점수순'],
  ['rev', '매출순'],
  ['op', '영업이익순'],
  ['opm', '영업이익률순'],
  ['op_g', '영업이익 YoY순'],
  ['ni', '순이익순'],
  ['nim', '순이익률순'],
  ['ni_g', '순이익 YoY순'],
  ['rev_g', '매출 YoY순'],
  ['cagr', '매출 CAGR순'],
  ['cash', '현금순'],
  ['assets', '자산순'],
  ['equity', '자본순'],
  ['invest', '투자자본순'],
  ['clean_years', '감사의견 적정 연속순'],
  ['est', '설립연도순'],
  ['rcept_dt', '최근 제출순'],
]
const EMPTY_ADV = {
  grades: [],
  revMin: '', revMax: '', yoyMin: '',
  opProfit: '전체', opMin: '', opmMin: '', opYoyMin: '',
  niProfit: '전체', niMin: '', nimMin: '', niYoyMin: '',
  cashMin: '', opinion: '전체', clean: '전체', vc: '전체',
}
// 적정 연속 — IPO 심사에는 적정 3개년이 필요하므로, 1·2회(진입 직전) 구간을 따로 고를 수 있게 한다
const CLEAN_OPTS = [
  ['전체', '무관'],
  ['1', '1회'],
  ['2', '2회 (IPO 직전)'],
  ['1-2', '1~2회'],
  ['3+', '3회 이상'],
  ['0', '0회 (최신 비적정·미확인)'],
]
const cleanMatch = (n, v) => {
  n = n || 0
  if (v === '1') return n === 1
  if (v === '2') return n === 2
  if (v === '1-2') return n === 1 || n === 2
  if (v === '3+') return n >= 3
  if (v === '0') return n === 0
  return true
}
// 직전 연도 대비 증감률. 영업이익·순이익은 전년이 적자일 수 있어 |전년| 기준으로 계산한다
// (예: -10 → +5 는 +150%). 전년 값이 없거나 0이면 계산하지 않는다.
const isNil = (v) => v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v))
const growth = (cur, prev) => (isNil(cur) || isNil(prev) || prev === 0 ? null : Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10)
const prevHist = (r) => {
  const y = parseInt(String(r.fy || '').slice(0, 4), 10)
  if (!y) return null
  return (r.hist || []).find((h) => parseInt(String(h[0]).slice(0, 4), 10) === y - 1) || null
}
const num = (s) => (s === '' || s === null || s === undefined || isNaN(Number(s)) ? null : Number(s))
// 정렬값: 레이팅은 S가 가장 높게(-인덱스), 나머지는 필드값 그대로
const sortVal = (r, k) => (k === 'grade' ? -r.gradeIdx : r[k])
const byScore = (x, y) => (y.score ?? 0) - (x.score ?? 0)

export function Spark({ hist }) {
  const vals = (hist || []).map((h) => h[1]).filter((v) => v !== null && v !== undefined)
  if (vals.length < 2) return <span className="muted">—</span>
  const max = Math.max(1, ...vals.map((v) => Math.max(0, v)))
  const W = 8, G = 3, H = 22
  return (
    <svg width={vals.length * (W + G)} height={H} role="img" aria-label="매출 추이">
      {vals.map((v, i) => {
        const h = Math.max(2, Math.round((Math.max(0, v) / max) * H))
        return <rect key={i} x={i * (W + G)} y={H - h} width={W} height={h} rx={1.5}
          fill={i === vals.length - 1 ? 'var(--accent, #3b82f6)' : 'var(--accent-weak, rgba(59,130,246,.4))'} />
      })}
    </svg>
  )
}

export const Grade = ({ g, title }) => (
  <span className="badge" title={title} style={{ fontWeight: 800, minWidth: 22, textAlign: 'center', display: 'inline-block', ...GRADE_STYLE[g] }}>{g}</span>
)

const Num = ({ label, value, onChange, w = 72 }) => (
  <label className="muted" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
    {label}
    <input type="number" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)}
      style={{ width: w, padding: '4px 6px', fontSize: 12 }} />
  </label>
)

// 상세 필터 한 줄 — 항목명 + 조건들. 좁은 화면에서는 자연스럽게 줄바꿈된다
const AdvRow = ({ title, children }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', alignItems: 'center' }}>
    <strong style={{ fontSize: 12, minWidth: 58 }}>{title}</strong>
    {children}
  </div>
)
const PL = ({ value, onChange }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)} style={{ fontSize: 12 }} aria-label="흑자·적자">
    <option>전체</option><option>흑자</option><option>적자</option>
  </select>
)

export default function DartScreener() {
  const [sub, setSub] = useState('startup')
  return (
    <div>
      <div className="tabs" style={{ marginBottom: 10 }}>
        <button className={'tab-btn' + (sub === 'startup' ? ' active' : '')} onClick={() => setSub('startup')}>스타트업 스크리너</button>
        <button className={'tab-btn' + (sub === 'lp' ? ' active' : '')} onClick={() => setSub('lp')}>잠재 LP</button>
      </div>
      {sub === 'startup' ? <StartupScreener /> : <DartLP />}
    </div>
  )
}

function StartupScreener() {
  const { data } = useData('dart-screener.json')
  const srcOf = useSourcingMap()
  const [q, setQ] = useState('')
  const [sector, setSector] = useState('전체')
  const [age, setAge] = useState('전체')
  const [sig, setSig] = useState({})
  const [hideGc, setHideGc] = useState(false)
  const [sort, setSort] = useState('grade')
  const [dir, setDir] = useState('desc')
  const [open, setOpen] = useState(null)
  const [adv, setAdv] = useState(EMPTY_ADV)
  const [showAdv, setShowAdv] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const setA = (k) => (v) => setAdv({ ...adv, [k]: v })
  const onSort = (k) => {
    if (k === sort) setDir(dir === 'desc' ? 'asc' : 'desc')
    else { setSort(k); setDir('desc') }
  }
  const th = { sort, dir, onSort }

  const rows = useMemo(() => {
    if (!data?.items || !data?.cols) return []
    return data.items.map((r) => {
      const o = Object.fromEntries(data.cols.map((c, i) => [c, r[i]]))
      const { grade, why } = rate(o)
      const p = prevHist(o)
      return {
        ...o, grade, why, gradeIdx: GRADES.indexOf(grade), src: srcOf ? srcOf(o) : null,
        opm: margin(o.op, o.rev), nim: margin(o.ni, o.rev),
        op_g: p ? growth(o.op, p[2]) : null, ni_g: p ? growth(o.ni, p[3]) : null,
      }
    })
  }, [data, srcOf])

  const sectors = useMemo(() => {
    const cnt = {}
    rows.forEach((r) => { if (r.sector) cnt[r.sector] = (cnt[r.sector] || 0) + 1 })
    return Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])
  }, [rows])

  const cleanCount = useMemo(() => {
    const c = {}
    CLEAN_OPTS.forEach(([v]) => { c[v] = rows.filter((r) => cleanMatch(r.clean_years, v)).length })
    return c
  }, [rows])

  const gradeCount = useMemo(() => {
    const c = {}
    rows.forEach((r) => { c[r.grade] = (c[r.grade] || 0) + 1 })
    return c
  }, [rows])

  const thisYear = new Date().getFullYear()
  const view = useMemo(() => {
    const kw = q.trim().toLowerCase()
    const a = Object.fromEntries(
      ['revMin', 'revMax', 'yoyMin', 'opMin', 'opmMin', 'opYoyMin', 'niMin', 'nimMin', 'niYoyMin', 'cashMin']
        .map((k) => [k, num(adv[k])]),
    )
    const out = rows.filter((r) => {
      if (sector !== '전체' && r.sector !== sector) return false
      if (age !== '전체' && thisYear - r.est > Number(age)) return false
      if (hideGc && r.gc) return false
      if (sig.rcps && !r.rcps) return false
      if (sig.raised && !r.raised) return false
      if (sig.vc && !(r.vc && r.vc.length)) return false
      if (sig.growth && !(r.rev_g >= 50)) return false
      if (sig.cagr && !(r.cagr >= 30)) return false
      if (sig.src && !r.src) return false
      // 상세 필터
      if (adv.grades.length && !adv.grades.includes(r.grade)) return false
      // 값이 없는 기업은 해당 조건을 걸면 빠진다 (null >= n 은 false가 되도록 isNil로 막는다)
      const ge = (v, m) => m === null || (!isNil(v) && v >= m)
      if (!ge(r.rev, a.revMin)) return false
      if (a.revMax !== null && !(!isNil(r.rev) && r.rev <= a.revMax)) return false
      if (!ge(r.rev_g, a.yoyMin)) return false
      if (adv.opProfit === '흑자' && !(!isNil(r.op) && r.op >= 0)) return false
      if (adv.opProfit === '적자' && !(!isNil(r.op) && r.op < 0)) return false
      if (!ge(r.op, a.opMin)) return false
      if (!ge(r.opm, a.opmMin)) return false
      if (!ge(r.op_g, a.opYoyMin)) return false
      if (adv.niProfit === '흑자' && !(!isNil(r.ni) && r.ni >= 0)) return false
      if (adv.niProfit === '적자' && !(!isNil(r.ni) && r.ni < 0)) return false
      if (!ge(r.ni, a.niMin)) return false
      if (!ge(r.nim, a.nimMin)) return false
      if (!ge(r.ni_g, a.niYoyMin)) return false
      if (!ge(r.cash, a.cashMin)) return false
      if (adv.opinion === '적정' && r.opinion !== '적정') return false
      if (adv.opinion === '비적정' && !BAD_OPINIONS.includes(r.opinion)) return false
      if (!cleanMatch(r.clean_years, adv.clean)) return false
      if (adv.vc === '있음' && !hasVC(r)) return false
      if (adv.vc === '없음' && hasVC(r)) return false
      if (kw) {
        const hay = (r.name + ' ' + r.sector + ' ' + (r.vc || []).join(' ')).toLowerCase()
        if (!hay.includes(kw)) return false
      }
      return true
    })
    out.sort(makeCmp(sort, dir, sortVal, byScore))
    return out
  }, [rows, q, sector, age, sig, hideGc, sort, dir, adv, thisYear])

  const advCount = Object.entries(adv).filter(([k, v]) => (Array.isArray(v) ? v.length : v !== EMPTY_ADV[k])).length
  const sortLabel = (SORTS.find(([k]) => k === sort) || [])[1] || ''

  const doExport = () => {
    const years = Array.from(new Set(view.flatMap((r) => (r.hist || []).map((h) => h[0])))).sort()
    const header = ['순위', '레이팅', '레이팅 근거', '점수', '기업명', '업종', 'KSIC', '설립연도', '사업연도', '매출(억)', '매출 YoY(%)', '매출 CAGR(%)',
      '영업이익(억)', '영업이익률(%)', '영업이익 YoY(%)', '순이익(억)', '순이익률(%)', '순이익 YoY(%)', '자산(억)', '자본(억)', '조정자본(억)', '현금(억)', '주식발행초과금(억)', 'RCPS 부채(억)', '투자자본(억)', '투자유치 추정연도', 'RCPS·우선주', 'VC 주주',
      '감사의견', '적정 연속(회)', '계속기업 불확실성', '자본잠식', '감사인', '홈페이지', 'DART 원문',
      ...years.map((y) => `매출 ${y}`), ...years.map((y) => `영업이익 ${y}`), ...years.map((y) => `감사의견 ${y}`)]
    const rowsOut = view.map((r, i) => {
      const hm = Object.fromEntries((r.hist || []).map((h) => [h[0], h]))
      return [i + 1, r.grade, r.why.join(', '), r.score, r.name, r.sector, r.ksic, r.est, r.fy, r.rev, r.rev_g, r.cagr,
        r.op, r.opm, r.op_g, r.ni, r.nim, r.ni_g, r.assets, r.equity, r.equity_adj, r.cash, r.premium, r.rcps_liab, r.invest, r.raise_year, r.rcps ? 'Y' : '', (r.vc || []).join(', '),
        r.opinion || '', r.clean_years || 0, r.gc ? 'Y' : '', r.impaired ? 'Y' : '', r.auditor, r.url, dartUrl(r.rcept_no),
        ...years.map((y) => hm[y]?.[1] ?? ''), ...years.map((y) => hm[y]?.[2] ?? ''), ...years.map((y) => hm[y]?.[6] ?? '')]
    })
    exportXlsx(`공시분석_스타트업_${today()}`, [{ name: '스타트업', header, rows: rowsOut }])
  }

  if (!data) return <div className="card"><div className="list-empty">공시분석 데이터를 불러오는 중…</div></div>
  if (!rows.length) {
    return (
      <div className="card">
        <div className="list-empty">
          아직 공시분석 데이터가 없습니다.<br />
          첫 수집이 끝나면 표시됩니다. (워크플로 fetch-dart-screener)
        </div>
      </div>
    )
  }

  const cov = data.coverage || {}
  const updated = data.generated_at ? new Date(data.generated_at).toLocaleDateString('ko-KR') : ''
  const shown = view.slice(0, ROW_CAP)
  const progress = cov.docs_needed ? Math.round((cov.docs_done / cov.docs_needed) * 100) : 0
  const R = { textAlign: 'right' }

  return (
    <div className="card">
      <div className="lp-bar" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <strong style={{ fontSize: 15 }}>스타트업 스크리너</strong>
        <span className="muted" style={{ fontSize: 12.5 }}>
          외감 비상장 · {data.filters?.est_min}년 이후 설립 · 최근 {data.filters?.lookback_years || 5}년 · 분석 {(cov.latest_done || 0).toLocaleString()} / 후보 {(cov.candidates || 0).toLocaleString()}사 · 표시 {view.length.toLocaleString()}사
        </span>
        <span style={{ flex: 1 }} />
        <span className="muted" style={{ fontSize: 12.5 }}>{updated ? `갱신 ${updated}` : ''}</span>
        <button className="chip" onClick={doExport} style={{ fontSize: 12 }} disabled={!view.length}>⬇ 엑셀 ({view.length.toLocaleString()}건)</button>
      </div>
      {!cov.backfill_done && (
        <div className="muted" style={{ fontSize: 12, margin: '-4px 0 10px' }}>
          ⏳ {data.filters?.lookback_years || 5}년치 수집 중 · 원문 {(cov.docs_done || 0).toLocaleString()} / {(cov.docs_needed || 0).toLocaleString()}건 ({progress}%).
          하루 한도만큼 매일 이어서 채워지며, 최신 연도가 먼저 채워집니다.
        </div>
      )}

      {/* 레이팅 분포 — 누르면 해당 등급만 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 10 }}>
        {GRADES.map((g) => {
          const on = adv.grades.includes(g)
          return (
            <button key={g} onClick={() => setA('grades')(on ? adv.grades.filter((x) => x !== g) : [...adv.grades, g])}
              className={'tab-btn' + (on ? ' active' : '')} style={{ padding: '3px 10px', fontSize: 12, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <Grade g={g} /> {(gradeCount[g] || 0).toLocaleString()}
            </button>
          )
        })}
        <button className="linklike" style={{ fontSize: 12 }} onClick={() => setShowRules(!showRules)}>레이팅 기준 {showRules ? '▴' : '▾'}</button>
      </div>
      {showRules && (
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.8, margin: '-2px 0 10px', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8 }}>
          {RATING_RULES.map(([g, t]) => <div key={g}><Grade g={g} /> {t}</div>)}
          <div style={{ marginTop: 4 }}>고성장 = 매출 YoY 50%↑ 또는 CAGR 40%↑ · 성장 = YoY 20%↑ 또는 CAGR 20%↑ · 투자검증 = RCPS·우선주, VC 주주, 투자유치 중 하나 · 재무안정 = 영업흑자 또는 현금 ≥ 1년치 영업손실</div>
        </div>
      )}

      <div className="lp-bar" style={{ flexWrap: 'wrap', gap: 8 }}>
        <input className="pl-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 기업·업종·VC 주주 검색…" />
        <select value={sector} onChange={(e) => setSector(e.target.value)} aria-label="업종">
          <option value="전체">업종: 전체</option>
          {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={age} onChange={(e) => setAge(e.target.value)} aria-label="업력">
          <option value="전체">업력: 전체</option>
          <option value="5">5년 이내</option>
          <option value="8">8년 이내</option>
          <option value="12">12년 이내</option>
        </select>
        <select value={sort} onChange={(e) => { setSort(e.target.value); setDir('desc') }} aria-label="정렬 기준">
          {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button className="tab-btn" style={{ padding: '4px 11px', fontSize: 12 }} title="높은 순 ↔ 낮은 순"
          onClick={() => setDir(dir === 'desc' ? 'asc' : 'desc')}>{dir === 'desc' ? '높은 순 ▼' : '낮은 순 ▲'}</button>
        <button className={'tab-btn' + (showAdv || advCount ? ' active' : '')} style={{ padding: '4px 11px', fontSize: 12 }}
          onClick={() => setShowAdv(!showAdv)}>상세 필터{advCount ? ` · ${advCount}` : ''} {showAdv ? '▴' : '▾'}</button>
      </div>

      {showAdv && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', marginBottom: 10, border: '1px solid var(--border)', borderRadius: 8 }}>
          <AdvRow title="매출액">
            <Num label="(억) ≥" value={adv.revMin} onChange={setA('revMin')} />
            <Num label="≤" value={adv.revMax} onChange={setA('revMax')} />
            <Num label="YoY(%) ≥" value={adv.yoyMin} onChange={setA('yoyMin')} w={60} />
          </AdvRow>
          <AdvRow title="영업이익">
            <PL value={adv.opProfit} onChange={setA('opProfit')} />
            <Num label="(억) ≥" value={adv.opMin} onChange={setA('opMin')} />
            <Num label="이익률(%) ≥" value={adv.opmMin} onChange={setA('opmMin')} w={60} />
            <Num label="YoY(%) ≥" value={adv.opYoyMin} onChange={setA('opYoyMin')} w={60} />
          </AdvRow>
          <AdvRow title="순이익">
            <PL value={adv.niProfit} onChange={setA('niProfit')} />
            <Num label="(억) ≥" value={adv.niMin} onChange={setA('niMin')} />
            <Num label="이익률(%) ≥" value={adv.nimMin} onChange={setA('nimMin')} w={60} />
            <Num label="YoY(%) ≥" value={adv.niYoyMin} onChange={setA('niYoyMin')} w={60} />
          </AdvRow>
          <AdvRow title="현금·감사">
            <Num label="현금(억) ≥" value={adv.cashMin} onChange={setA('cashMin')} />
            <label className="muted" style={{ fontSize: 12 }}>최신 감사의견{' '}
              <select value={adv.opinion} onChange={(e) => setA('opinion')(e.target.value)}>
                <option value="전체">전체</option><option value="적정">적정만</option><option value="비적정">한정·부적정·의견거절</option>
              </select>
            </label>
            <label className="muted" style={{ fontSize: 12 }} title="최신 사업연도부터 거꾸로 '적정'이 끊기지 않고 이어진 횟수. IPO 심사는 적정 3개년이 필요하므로 2회 기업이 진입 직전 구간입니다.">적정 연속{' '}
              <select value={adv.clean} onChange={(e) => setA('clean')(e.target.value)}>
                {CLEAN_OPTS.map(([v, l]) => <option key={v} value={v}>{l} · {(cleanCount[v] || 0).toLocaleString()}사</option>)}
              </select>
            </label>
            <label className="muted" style={{ fontSize: 12 }}>VC 기투자{' '}
              <select value={adv.vc} onChange={(e) => setA('vc')(e.target.value)}>
                <option>전체</option><option>있음</option><option>없음</option>
              </select>
            </label>
          </AdvRow>
          <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.6, width: '100%' }}>
            YoY는 직전 사업연도 대비입니다. 영업이익·순이익 YoY는 전년이 적자일 수 있어 전년 값의 절댓값을 기준으로 계산합니다(예: −10억 → +5억 = +150%). 조건을 건 항목의 값이 없는 기업은 결과에서 빠집니다.
          </div>
          <button className="linklike" style={{ fontSize: 12 }} onClick={() => setAdv(EMPTY_ADV)}>초기화</button>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {SIGNALS.map((s) => (
          <button key={s.key} className={'tab-btn' + (sig[s.key] ? ' active' : '')}
            style={{ padding: '4px 11px', fontSize: 12 }}
            onClick={() => setSig({ ...sig, [s.key]: !sig[s.key] })}>{s.label}</button>
        ))}
        <button className={'tab-btn' + (hideGc ? ' active' : '')} style={{ padding: '4px 11px', fontSize: 12 }}
          onClick={() => setHideGc(!hideGc)}>계속기업 불확실성 제외</button>
      </div>

      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
        {sortLabel.replace(/순$/, '')} {dir === 'desc' ? '높은 순' : '낮은 순'}으로 정렬 · 표 머리글을 누르면 그 항목으로 줄 세우고, 한 번 더 누르면 순서가 뒤집힙니다. 값이 없는 기업은 맨 아래에 둡니다.
      </div>

      <style>{FREEZE_CSS}</style>
      <div style={FREEZE_BOX}>
        <table className="tbl tbl-grid dart-freeze" style={{ minWidth: 1260 }}>
          <thead><tr>
            <th style={{ width: 40, textAlign: 'center' }}>#</th>
            <SortTh k="grade" {...th} style={{ width: 50, textAlign: 'center' }}>등급</SortTh>
            <SortTh k="score" {...th} style={{ width: 52, textAlign: 'center' }}>점수</SortTh>
            <th>기업명</th>
            <th style={{ width: 62 }}>FY</th>
            <SortTh k="rev" {...th} style={{ width: 84, ...R }}>매출</SortTh>
            <th style={{ width: 72 }}>매출 추이</th>
            <SortTh k="rev_g" {...th} style={{ width: 66, ...R }}>YoY</SortTh>
            <SortTh k="cagr" {...th} style={{ width: 70, ...R }}>CAGR</SortTh>
            <SortTh k="op" {...th} style={{ width: 90, ...R }}>영업이익</SortTh>
            <SortTh k="opm" {...th} style={{ width: 90, ...R }} title="영업이익 ÷ 매출 · 눌러서 정렬">영업이익률</SortTh>
            <SortTh k="ni" {...th} style={{ width: 84, ...R }}>순이익</SortTh>
            <SortTh k="cash" {...th} style={{ width: 80, ...R }}>현금</SortTh>
            <th style={{ width: 70 }}>감사의견</th>
            <th>시그널</th>
            <th>VC 주주</th>
          </tr></thead>
          <tbody>
            {shown.map((r, i) => {
              const isOpen = open === r.corp_code
              return (
                <Fragment key={r.corp_code}>
                  <tr onClick={() => setOpen(isOpen ? null : r.corp_code)} style={{ cursor: 'pointer' }}>
                    <td style={{ textAlign: 'center', fontSize: 12 }} className="muted">{i + 1}</td>
                    <td style={{ textAlign: 'center' }}><Grade g={r.grade} title={r.why.join(' · ')} /></td>
                    <td style={{ textAlign: 'center' }} className="muted">{r.score}</td>
                    <td style={{ minWidth: 150 }}>
                      <span className="muted" style={{ fontSize: 11, marginRight: 4 }}>{isOpen ? '▾' : '▸'}</span>
                      <a href={dartUrl(r.rcept_no)} target="_blank" rel="noreferrer"
                        onClick={(e) => e.stopPropagation()} style={{ fontWeight: 600 }}>{r.name}</a>
                      <div className="muted" style={{ fontSize: 11.5 }}>{r.sector || '업종 미상'} · {r.est}년 설립</div>
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>{r.fy}</td>
                    <td style={{ ...R, whiteSpace: 'nowrap' }}>{eok(r.rev)}</td>
                    <td><Spark hist={r.hist} /></td>
                    <td style={{ ...R, whiteSpace: 'nowrap', color: signColor(r.rev_g) }}>{pct(r.rev_g)}</td>
                    <td style={{ ...R, whiteSpace: 'nowrap', color: signColor(r.cagr) }}>{pct(r.cagr)}</td>
                    <td style={{ ...R, whiteSpace: 'nowrap', color: signColor(r.op) }}>{eok(r.op)}</td>
                    <td style={{ ...R, whiteSpace: 'nowrap', color: signColor(r.opm) }}>{r.opm === null ? '—' : r.opm + '%'}</td>
                    <td style={{ ...R, whiteSpace: 'nowrap', color: signColor(r.ni) }}>{eok(r.ni)}</td>
                    <td style={{ ...R, whiteSpace: 'nowrap' }}>{eok(r.cash)}</td>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                      <span style={BAD_OPINIONS.includes(r.opinion) ? { color: DOWN, fontWeight: 700 } : undefined}>{r.opinion || '—'}</span>
                      {r.clean_years > 0 && <span className="muted" title={`적정 ${r.clean_years}회 연속`} style={r.clean_years === 2 ? { fontWeight: 700 } : undefined}> · {r.clean_years}회</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.rcps && <span className="badge">RCPS</span>}
                        {r.raise_year && <span className="badge" style={r.raised ? { fontWeight: 700 } : undefined}>투자유치 {r.raise_year}</span>}
                        {r.gc && <span className="badge" style={{ color: DOWN }}>계속기업⚠</span>}
                        {r.impaired && <span className="badge" style={{ color: DOWN }}>자본잠식</span>}
                        {r.src && <span className="badge" title="세컨더리·소싱 데이터(운용사 홈페이지·투자 뉴스)에 있는 회사">소싱{r.src.last ? ` · ${r.src.last.date.slice(0, 7)} ${r.src.last.stage || ''}` : r.src.firms.size ? ` · 운용사 ${r.src.firms.size}` : ''}</span>}
                      </div>
                    </td>
                    <td style={{ fontSize: 12, maxWidth: 220 }}>
                      {(r.vc || []).slice(0, 2).join(', ')}
                      {r.vc && r.vc.length > 2 && <span className="muted"> 외 {r.vc.length - 2}</span>}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={16} style={{ background: 'var(--accent-weak, rgba(59,130,246,.06))' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start', padding: '4px 2px' }}>
                          <div className="scroll-box">
                            <table className="tbl" style={{ fontSize: 12, minWidth: 540 }}>
                              <thead><tr>
                                <th>사업연도</th>
                                <th style={R}>매출</th>
                                <th style={R}>영업이익</th>
                                <th style={R}>영업이익률</th>
                                <th style={R}>순이익</th>
                                <th style={R}>현금</th>
                                <th style={R} title="주식발행초과금 + 상환전환우선주 부채">투자자본</th>
                                <th>감사의견</th>
                              </tr></thead>
                              <tbody>
                                {(r.hist || []).slice().reverse().map((h) => {
                                  const m = margin(h[2], h[1])
                                  return (
                                    <tr key={h[0]}>
                                      <td className="muted">{h[0]}</td>
                                      <td style={R}>{eok(h[1])}</td>
                                      <td style={{ ...R, color: signColor(h[2]) }}>{eok(h[2])}</td>
                                      <td style={{ ...R, color: signColor(m) }}>{m === null ? '—' : m + '%'}</td>
                                      <td style={{ ...R, color: signColor(h[3]) }}>{eok(h[3])}</td>
                                      <td style={R}>{eok(h[4])}</td>
                                      <td style={R}>{eok(h[5])}</td>
                                      <td style={BAD_OPINIONS.includes(h[6]) ? { color: DOWN } : undefined}>{h[6] || '—'}</td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                          <div className="muted" style={{ fontSize: 12, lineHeight: 1.8 }}>
                            <Grade g={r.grade} /> {r.why.join(' · ') || '해당 신호 없음'}<br />
                            감사인: {r.auditor || '—'}<br />
                            자산 {eok(r.assets)} · 자본 {eok(r.equity)}{r.rcps_liab ? ` · RCPS 부채 ${eok(r.rcps_liab)} (조정자본 ${eok(r.equity_adj)})` : ''}<br />
                            {r.vc && r.vc.length > 0 && <>VC 주주: {r.vc.join(', ')}<br /></>}
                            {r.src && <>세컨더리·소싱: 홈페이지 포트폴리오 운용사 {r.src.firms.size}곳{r.src.firms.size ? ` (${[...r.src.firms].slice(0, 4).join(', ')}${r.src.firms.size > 4 ? ' 외' : ''})` : ''}
                              {r.src.last && ` · 마지막 라운드 ${r.src.last.date} ${r.src.last.stage || ''} ${r.src.last.amount || ''}`} · <a href="#/sourcing">소싱 화면 ↗</a><br /></>}
                            {r.url && <a href={/^https?:/.test(r.url) ? r.url : `http://${r.url}`} target="_blank" rel="noreferrer">홈페이지 ↗</a>}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      {view.length > ROW_CAP && (
        <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
          화면에는 상위 {ROW_CAP}건만 표시 · 외 {(view.length - ROW_CAP).toLocaleString()}건. 엑셀 내보내기에는 전체 {view.length.toLocaleString()}건이 같은 순서로 들어갑니다.
        </div>
      )}
      <div className="muted" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.6 }}>
        점수 = RCPS·우선주 20 + 최근 2년 내 투자유치(투자자본 = 주발초 + RCPS 부채 급증) 20 + VC 주주 15 + 매출 YoY(최대 20) + 매출 CAGR(최대 10) + 업력(최대 10) + 매출 100억↑ 5 − 계속기업 불확실성 10.
        행을 누르면 연도별 재무·감사의견이 펼쳐집니다. 금액·감사의견은 감사보고서 원문을 자동으로 읽은 값이라 일부 틀릴 수 있으니, 관심 기업은 기업명을 눌러 원문으로 확인하세요.
      </div>
    </div>
  )
}
