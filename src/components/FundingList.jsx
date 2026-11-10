import { useState, useMemo } from 'react'
import { useData } from '../useData.js'

// 펀딩 List — 스타트업레시피 투자 리포트(사실 데이터)를 대시보드 자체 UI로 표시.
// 데이터: public/data/funding.json (크롤러 scripts/fetch-funding.mjs).
//  - cols: [date,name,sector,amount,stage,investors]
//  - items: 위 순서의 배열들(최신순)
//  - monthly: { 연도: [12] 억원 공개투자 합계 }
// 연/월 필터 · 검색 · 월별 투자추이 차트 + 표.

const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']
const won = (v) => (v || '').replace(/\s+/g, ' ').trim()
const fmtEok = (n) => {
  if (!n) return '0억'
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '조'
  if (n >= 100) return Math.round(n).toLocaleString() + '억'
  return (Math.round(n * 10) / 10).toLocaleString() + '억'
}
const ROW_CAP = 500

export default function FundingList() {
  const { data } = useData('funding.json')
  const [year, setYear] = useState(null)
  const [month, setMonth] = useState('전체') // '전체' | 0..11
  const [q, setQ] = useState('')
  const [stage, setStage] = useState('전체')

  const cols = data?.cols || ['date', 'name', 'sector', 'amount', 'stage', 'investors']
  const idx = useMemo(() => Object.fromEntries(cols.map((c, i) => [c, i])), [cols])
  const years = data?.years ? [...data.years].sort((a, b) => b - a) : []
  const curYear = year ?? years[0] ?? null
  const updated = data?.generated_at ? new Date(data.generated_at).toLocaleDateString('ko-KR') : null
  const stages = useMemo(() => {
    if (!data?.items) return []
    const cnt = {}
    data.items.forEach((r) => { const st = r[idx.stage]; if (st) cnt[st] = (cnt[st] || 0) + 1 })
    return Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])
  }, [data, idx])

  const monthly = (data?.monthly && curYear != null) ? (data.monthly[curYear] || []) : []
  const maxMonthly = Math.max(1, ...monthly)

  const view = useMemo(() => {
    if (!data?.items) return []
    const kw = q.trim().toLowerCase()
    return data.items.filter((r) => {
      const d = r[idx.date] || ''
      if (curYear != null && d.slice(0, 4) !== String(curYear)) return false
      if (month !== '전체' && (parseInt(d.slice(5, 7), 10) - 1) !== month) return false
      if (stage !== '전체' && r[idx.stage] !== stage) return false
      if (kw) {
        const hay = (r[idx.name] + ' ' + r[idx.sector] + ' ' + r[idx.investors]).toLowerCase()
        if (!hay.includes(kw)) return false
      }
      return true
    })
  }, [data, curYear, month, stage, q, idx])

  if (!data) return <div className="card"><div className="list-empty">펀딩 데이터를 불러오는 중…</div></div>
  if (!data.items || !data.items.length) {
    return <div className="card"><div className="list-empty">아직 펀딩 데이터가 없습니다. 워크플로(fetch-funding) 실행 후 표시됩니다.</div></div>
  }

  const shown = view.slice(0, ROW_CAP)
  const yearTotal = monthly.reduce((a, b) => a + b, 0)

  return (
    <div className="card">
      <div className="lp-bar" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <strong style={{ fontSize: 15 }}>펀딩 List</strong>
        <span className="muted" style={{ fontSize: 12.5 }}>
          {curYear}년 공개 투자합계 {fmtEok(yearTotal)} · 총 {view.length.toLocaleString()}건
        </span>
        <span style={{ flex: 1 }} />
        <span className="muted" style={{ fontSize: 12.5 }}>{updated ? `갱신 ${updated}` : ''}</span>
        <a className="chip" href="https://startuprecipe.co.kr/invest" target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>출처: 스타트업레시피 ↗</a>
      </div>

      {/* 연도 선택 */}
      <div className="tabs" style={{ gap: 6, marginBottom: 12 }}>
        {years.map((y) => (
          <button key={y} onClick={() => { setYear(y); setMonth('전체') }}
            className={'tab-btn' + (y === curYear ? ' active' : '')}
            style={{ padding: '5px 12px', fontSize: 12.5 }}>
            {y}
          </button>
        ))}
      </div>

      {/* 월별 투자 추이 차트 */}
      {monthly.length === 12 && (
        <div style={{ margin: '2px 0 14px' }}>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>
            {curYear} 월별 스타트업 투자 추이 (공개 투자금 합계 · 단위: 억원) — 막대를 눌러 해당 월만 보기
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120, padding: '0 2px' }}>
            {monthly.map((v, m) => {
              const active = month === m
              const h = Math.max(2, Math.round((v / maxMonthly) * 108))
              return (
                <div key={m} onClick={() => setMonth(active ? '전체' : m)}
                  title={`${MONTHS[m]}: ${fmtEok(v)}`}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', minWidth: 0 }}>
                  <div style={{ fontSize: 9.5, color: active ? 'var(--accent, #3b82f6)' : 'var(--muted, #8a94a6)', marginBottom: 2, whiteSpace: 'nowrap' }}>
                    {v >= 1 ? fmtEok(v) : ''}
                  </div>
                  <div style={{
                    width: '100%', height: h, borderRadius: '3px 3px 0 0',
                    background: active ? 'var(--accent, #3b82f6)' : 'var(--accent-weak, rgba(59,130,246,.45))',
                    transition: 'height .2s',
                  }} />
                  <div style={{ fontSize: 10, color: active ? 'var(--accent, #3b82f6)' : 'var(--muted, #8a94a6)', marginTop: 3 }}>{m + 1}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 필터 */}
      <div className="lp-bar" style={{ flexWrap: 'wrap', gap: 8 }}>
        <input className="pl-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 기업·분야·투자사 검색…" />
        <select value={month} onChange={(e) => setMonth(e.target.value === '전체' ? '전체' : Number(e.target.value))} aria-label="월">
          <option value="전체">월: 전체</option>
          {MONTHS.map((mm, m) => <option key={m} value={m}>{mm}</option>)}
        </select>
        <select value={stage} onChange={(e) => setStage(e.target.value)} aria-label="단계">
          <option value="전체">단계: 전체</option>
          {stages.map((st) => <option key={st} value={st}>{st}</option>)}
        </select>
      </div>

      {/* 표 */}
      <div className="scroll-box" style={{ '--scroll-h': 'max(300px, calc(100vh - 520px))' }}>
        <table className="tbl tbl-grid" style={{ minWidth: 640 }}>
          <thead><tr>
            <th style={{ width: 96 }}>일자</th>
            <th>기업명</th>
            <th>분야</th>
            <th style={{ width: 92, textAlign: 'right' }}>투자금</th>
            <th style={{ width: 92 }}>단계</th>
            <th>투자사</th>
          </tr></thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i}>
                <td style={{ whiteSpace: 'nowrap', color: 'var(--muted, #8a94a6)' }}>{(r[idx.date] || '').slice(2)}</td>
                <td style={{ fontWeight: 600 }}>{r[idx.name]}</td>
                <td>{r[idx.sector]}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{won(r[idx.amount]) || '—'}</td>
                <td><span className="muted">{r[idx.stage] || '—'}</span></td>
                <td>{r[idx.investors]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {view.length > ROW_CAP && (
        <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
          상위 {ROW_CAP}건만 표시 중 · 외 {(view.length - ROW_CAP).toLocaleString()}건. 월 필터나 검색으로 좁혀 보세요.
        </div>
      )}
    </div>
  )
}
