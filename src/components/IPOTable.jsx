import { useState, useMemo } from 'react'
import { useData } from '../useData.js'
import { IpoReportButtons } from './IpoReport.jsx'

// IPO 파이프라인 — KIND 3단계(예비심사·공모·상장)를 회사명으로 병합한 종목별 1행.
// 단계 칸에 날짜를 넣고 진행도에 따라 색: 완료(초록)/진행중(강조)/예정(옅음)/없음(빈칸).
// 2020년부터 전체 표시(현재 ~1,000건). 안전장치용 상한만 넉넉히 둠.
const CAP = 5000

const pad = (n) => String(n).padStart(2, '0')
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const md = (d) => (d ? d.slice(5).replace('-', '.') : '')
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/[^0-9.-]/g, '')); return isNaN(n) ? -Infinity : n }
// 데이터에 옛 표기(유가/코스닥)가 남아 있어도 화면엔 KS/KQ로 (크롤러 재수집 전에도 일관 표시)
const mkt = (s) => (s === '유가' || s === '유가증권' ? 'KS' : s === '코스닥' ? 'KQ' : s || '')

// 단계 정의: 각 행에서 표시값·정렬키·진행상태(색) 산출
const STAGES = [
  { key: '심사청구', get: (r) => r.청구일 },
  { key: '심사승인', get: (r) => r.승인일 },
  { key: '신고서', get: (r) => r.신고서제출일 },
  { key: '수요예측', range: (r) => [r.수요예측시작, r.수요예측종료] },
  { key: '청약', range: (r) => [r.청약시작, r.청약종료] },
  { key: '납입', get: (r) => r.납입일 },
  { key: '상장', get: (r) => r.상장일 || r.상장예정일, planned: (r) => !r.상장일 && r.상장예정일 },
]

function cellFor(st, r, T) {
  // KIND '승인일'은 심사 결과일 — 철회·미승인이면 승인이 아니라 그 결과로 표시
  if (st.key === '심사승인' && r.승인일 && /철회|미승인|만료/.test(r.심사상태 || '')) {
    const lab = /미승인/.test(r.심사상태) ? '미승인' : /만료/.test(r.심사상태) ? '만료' : '철회'
    return { txt: `${lab} ${md(r.승인일)}`, cls: 'miss', full: `${r.심사상태} (${r.승인일})` }
  }
  if (st.range) {
    const [s, e] = st.range(r)
    if (!s) return { txt: '', cls: '', full: '' }
    const cls = e < T ? 'done' : s <= T ? 'now' : 'soon'
    const txt = e && e !== s ? `${md(s)}~${md(e).slice(3)}` : md(s)
    return { txt, cls, full: `${s} ~ ${e}` }
  }
  const d = st.get(r)
  if (!d) return { txt: '', cls: '', full: '' }
  const cls = d < T ? 'done' : d === T ? 'now' : 'soon'
  const planned = st.planned && st.planned(r)
  // 상장예정일이 지났는데 실제 상장일이 없으면 '예정'이 아니라 '미확인'(철회·연기 가능)으로 표시
  if (planned && d < T) return { txt: md(d) + '?', cls: 'miss', full: `${d} (예정일 경과 · 상장 확인 안 됨: 철회·연기 가능)` }
  return { txt: md(d) + (planned ? '*' : ''), cls: planned ? 'soon' : cls, full: d + (planned ? ' (예정)' : '') }
}

const refDate = (r) => r.상장일 || r.상장예정일 || r.청약시작 || r.신고서제출일 || r.승인일 || r.청구일 || ''

function Th({ label, k, sort, setSort, ...rest }) {
  const active = sort.key === k
  return (
    <th {...rest} className={'th-sort' + (active ? ' active' : '')}
        onClick={() => setSort((s) => ({ key: k, dir: s.key === k && s.dir === 'asc' ? 'desc' : 'asc' }))}>
      {label}<span className="sort-ind">{active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
    </th>
  )
}

export default function IPOTable() {
  const { data: ipo } = useData('ipo.json')
  const { data: reports } = useData('ipo-reports/index.json') // 상장 7일 이내 종목 보고서 목록(없으면 null)
  const [q, setQ] = useState('')
  const [market, setMarket] = useState('전체')
  const [status, setStatus] = useState('전체')
  const [year, setYear] = useState(String(new Date().getFullYear())) // 종목이 많아 기본은 올해 — 해가 바뀌면 자동으로 새 연도(예: 2027)
  const [sort, setSort] = useState({ key: 'ref', dir: 'desc' })

  const items = ipo?.items || []
  const T = todayStr()
  const pending = !ipo || !ipo.generated_at || items.length === 0
  const updated = ipo?.generated_at ? new Date(ipo.generated_at).toLocaleDateString('ko-KR') : null

  const isListed = (r) => r.상장일 && r.상장일 <= T
  const years = useMemo(() => [...new Set([String(new Date().getFullYear()), ...items.map((r) => (refDate(r) || '').slice(0, 4)).filter(Boolean)])].sort().reverse(), [items])
  const view = useMemo(() => {
    const kw = q.trim().toLowerCase()
    let arr = items.filter((r) => {
      if (market !== '전체' && mkt(r.시장) !== market) return false
      if (year !== '전체' && (refDate(r) || '').slice(0, 4) !== year) return false
      if (status === '진행중' && isListed(r)) return false
      if (status === '상장완료' && !isListed(r)) return false
      if (kw && !(r.회사명 || '').toLowerCase().includes(kw)) return false
      return true
    })
    const dir = sort.dir === 'asc' ? 1 : -1
    const getK = (r) => {
      if (sort.key === 'ref') return refDate(r)
      if (sort.key === '회사명') return r.회사명 || ''
      if (sort.key === '공모금액' || sort.key === '확정공모가') return null // 숫자
      const st = STAGES.find((s) => s.key === sort.key)
      if (st) return st.range ? (st.range(r)[0] || '') : (st.get(r) || '')
      return ''
    }
    arr = [...arr].sort((a, b) => {
      if (sort.key === '공모금액') return (num(a.공모금액) - num(b.공모금액)) * dir
      if (sort.key === '확정공모가') return (num(a.확정공모가) - num(b.확정공모가)) * dir
      return String(getK(a)).localeCompare(String(getK(b)), 'ko') * dir
    })
    return arr
  }, [items, q, market, status, year, sort, T])

  if (pending) {
    return <div className="card"><div className="list-empty">
      아직 수집 전입니다. GitHub Actions의 <strong>fetch-ipo</strong> 워크플로를 한 번 실행하면 채워집니다.
    </div></div>
  }

  const p = { sort, setSort }
  return (
    <div className="card">
      <div className="lp-bar">
        <input className="pl-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 종목명 검색..." />
        <select value={market} onChange={(e) => setMarket(e.target.value)} aria-label="시장">
          {['전체', 'KS', 'KQ'].map((m) => <option key={m} value={m}>{m === '전체' ? '시장: 전체' : m}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(e.target.value)} aria-label="연도">
          <option value="전체">연도: 전체</option>
          {years.map((y) => <option key={y} value={y}>{y}년</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="상태">
          {['전체', '진행중', '상장완료'].map((s) => <option key={s} value={s}>{s === '전체' ? '상태: 전체' : s}</option>)}
        </select>
        <span className="muted" style={{ fontSize: 12.5 }}>{updated ? `갱신 ${updated}` : ''}</span>
      </div>

      <div className="scroll-box">
        <table className="tbl tbl-grid ipo-tbl">
          <thead><tr>
            <Th label="회사명" k="회사명" {...p} />
            <th>시장</th>
            {STAGES.map((s) => <Th key={s.key} label={s.key} k={s.key} style={{ textAlign: 'center' }} {...p} />)}
            <Th label="확정공모가" k="확정공모가" style={{ textAlign: 'right' }} {...p} />
            <Th label="공모금액(백만)" k="공모금액" style={{ textAlign: 'right' }} {...p} />
            <th>주관사</th>
            <th style={{ textAlign: 'center' }} title="상장 7일 이내 종목만 매일 자동 작성">보고서</th>
          </tr></thead>
          <tbody>
            {view.slice(0, CAP).map((r, i) => {
              const yr = (refDate(r) || '').slice(0, 4)
              return (
                <tr key={i}>
                  <td><strong>{r.회사명}</strong>{yr && <span className="ipo-yr">{yr}</span>}</td>
                  <td className="muted">{mkt(r.시장)}</td>
                  {STAGES.map((st) => {
                    const c = cellFor(st, r, T)
                    return <td key={st.key} className={'ipo-cell' + (c.cls ? ' ipo-' + c.cls : '')} title={c.full}>{c.txt || '·'}</td>
                  })}
                  <td style={{ textAlign: 'right' }} className="muted">{r.확정공모가 || '—'}</td>
                  <td style={{ textAlign: 'right' }} className="muted">{r.공모금액 || '—'}</td>
                  <td className="muted">{r.주관사}</td>
                  <td style={{ textAlign: 'center' }}><IpoReportButtons info={reports?.reports?.[r.회사명]} /></td>
                </tr>
              )
            })}
            {view.length === 0 && <tr><td colSpan={13} className="muted" style={{ textAlign: 'center' }}>해당 종목이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        {Math.min(view.length, CAP)}종목 표시{view.length > CAP ? ` (전체 ${view.length} 중 상위 ${CAP})` : ''} · 단계 칸: <span className="ipo-lg ipo-done">완료</span> <span className="ipo-lg ipo-now">진행중</span> <span className="ipo-lg ipo-soon">예정</span> <span className="ipo-lg ipo-miss">미확인</span> · 헤더 클릭 정렬
      </div>
    </div>
  )
}
