import { useState, useMemo, useEffect } from 'react'
import { useData } from '../useData.js'
import CandleChart from '../components/CandleChart.jsx'
import MiniChart from '../components/MiniChart.jsx'

const RET_COLS = [['1M', '1M'], ['3M', '3M'], ['6M', '6M'], ['12M', '12M']]
const RANGES = [['3M', 63], ['6M', 126], ['1Y', 252], ['전체', Infinity]]
const UP = '#e5484d'
const DN = '#3d7bf0'
const col = (v) => (v > 0 ? UP : v < 0 ? DN : 'var(--text-dim)')
const sign = (v) => (v > 0 ? '+' : '')
const pctCell = (v) => (v === null || v === undefined)
  ? <span className="muted">–</span>
  : <span style={{ color: col(v) }}>{sign(v)}{Number(v).toFixed(1)}%</span>
const won = (v) => (v == null ? '–' : Number(v).toLocaleString('ko-KR'))

export default function PostIPO() {
  const { data, error } = useData('post-ipo.json')
  const [sel, setSel] = useState(0)
  const [range, setRange] = useState(126)
  const [sort, setSort] = useState({ key: '상장일', dir: 'desc' })
  const [q, setQ] = useState('')
  const [market, setMarket] = useState('전체')
  const [year, setYear] = useState(String(new Date().getFullYear())) // 기본은 올해 — 해가 바뀌면 자동으로 새 연도(예: 2027)
  const [candles, setCandles] = useState([])
  const [cLoading, setCLoading] = useState(false)

  const curCode = data?.items?.[sel]?.code
  const curMkt = data?.items?.[sel]?.시장 === 'KQ' ? 'KOSDAQ' : 'KOSPI'
  const curFrom = data?.items?.[sel]?.상장일 || ''
  // 선택 종목의 캔들을 /api/ohlc로 실시간 조회 (전체 종목 캔들을 번들하지 않음)
  useEffect(() => {
    if (!curCode) { setCandles([]); return }
    let alive = true; setCLoading(true)
    fetch(`/api/ohlc?code=${encodeURIComponent(curCode)}&market=${curMkt}&from=${curFrom}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setCandles((d && d.candles) || []) })
      .catch(() => { if (alive) setCandles([]) })
      .finally(() => { if (alive) setCLoading(false) })
    return () => { alive = false }
  }, [curCode, curMkt, curFrom])

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase()
    const items = (data?.items || [])
      .map((x, i) => ({ ...x, _i: i }))
      .filter((x) => !kw || (x.회사명 || '').toLowerCase().includes(kw) || (x.code || '').toLowerCase().includes(kw))
      .filter((x) => (market === '전체' || x.시장 === market) && (year === '전체' || (x.상장일 || '').startsWith(year)))
    const dir = sort.dir === 'asc' ? 1 : -1
    const getK = (r) => {
      if (sort.key === '회사명') return r.회사명 || ''
      if (sort.key === '상장일') return r.상장일 || ''
      if (sort.key === '확정공모가') return r.확정공모가 || 0
      if (sort.key === '시초가') return r.시초가 || 0
      if (['1M', '3M', '6M', '12M'].includes(sort.key)) return r.returns?.[sort.key] ?? -Infinity
      return ''
    }
    return items.sort((a, b) => {
      const av = getK(a), bv = getK(b)
      return (typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv), 'ko')) * dir
    })
  }, [data, sort, q, market, year])

  if (error) return <div className="card" style={{ borderColor: 'var(--bad)' }}><span style={{ color: 'var(--bad)' }}>데이터 로드 오류: {error}</span></div>
  if (!data) return <div className="card"><div className="list-empty">Post-IPO 데이터를 불러오는 중…</div></div>

  const items = data.items || []
  const cur = items[sel] || items[0]
  const shownCandles = range === Infinity ? candles : candles.slice(-range)

  const Th = ({ label, k, alignR }) => {
    const active = sort.key === k
    return (
      <th className={'th-sort' + (active ? ' active' : '') + (alignR ? ' r' : '')}
          onClick={() => setSort((s) => ({ key: k, dir: s.key === k && s.dir === 'desc' ? 'asc' : 'desc' }))}>
        {label}<span className="sort-ind">{active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </th>
    )
  }

  return (
    <div>
      {/* 상단: 선택 종목 캔들차트 */}
      <div className="card km-card">
        <div className="km-card-head">
          <h2>📈 {cur?.회사명} <span className="muted" style={{ fontSize: 12.5, fontWeight: 400 }}>{cur?.시장} · {cur?.code} · 상장 {cur?.상장일}</span></h2>
          <div className="km-subtabs">
            {RANGES.map(([lb, v]) => (
              <button key={lb} className={'km-subtab' + (range === v ? ' active' : '')} onClick={() => setRange(v)}>{lb}</button>
            ))}
          </div>
        </div>
        {cLoading ? (
          <div className="list-empty" style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>차트를 불러오는 중…</div>
        ) : shownCandles.length < 2 ? (
          <div className="list-empty" style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>차트 데이터가 없습니다. (배포 환경에서 조회됩니다)</div>
        ) : (
          <CandleChart candles={shownCandles} height={320} />
        )}
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          확정공모가 {won(cur?.확정공모가)} · 시초가 {won(cur?.시초가)} · 캔들: 빨강 양봉 / 파랑 음봉 · 아래 목록에서 종목을 클릭하면 차트가 바뀝니다.
        </div>
      </div>

      {/* 하단: Post-IPO 종목 리스트 (최근 3년, 스팩 제외) */}
      <div className="card km-card">
        <div className="km-card-head">
          <h2>🆕 Post-IPO 종목 <span className="kan-count">{rows.length}/{items.length}</span></h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input className="pl-search" style={{ maxWidth: 220 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 종목명·코드 검색..." />
            <select className="pi-sel" value={market} onChange={(e) => setMarket(e.target.value)} aria-label="시장">
              {['전체', 'KS', 'KQ'].map((m) => <option key={m} value={m}>{m === '전체' ? '시장: 전체' : m}</option>)}
            </select>
            <select className="pi-sel" value={year} onChange={(e) => setYear(e.target.value)} aria-label="상장 연도">
              <option value="전체">연도: 전체</option>
              {[...new Set([String(new Date().getFullYear()), ...(data?.items || []).map((x) => (x.상장일 || '').slice(0, 4)).filter(Boolean)])].sort().reverse().map((y) => <option key={y} value={y}>{y}년</option>)}
            </select>
            <span className="muted" style={{ fontSize: 12 }}>최근 3년 · 스팩 제외</span>
          </div>
        </div>
        <div className="scroll-box" style={{ '--scroll-h': 'max(300px, calc(100vh - 620px))' }}>
          <table className="tbl tbl-grid">
            <thead>
              <tr>
                <Th label="종목명" k="회사명" />
                <th>시장</th>
                <Th label="상장일" k="상장일" />
                <Th label="확정공모가" k="확정공모가" alignR />
                <Th label="시초가" k="시초가" alignR />
                {RET_COLS.map(([lb, k]) => <Th key={k} label={lb} k={k} alignR />)}
                <th className="r">최근 90일</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} onClick={() => setSel(r._i)} style={{ cursor: 'pointer' }}
                    className={r._i === sel ? 'pi-active' : ''}>
                  <td><strong>{r.회사명}</strong> <span className="muted" style={{ fontSize: 11 }}>{r.code}</span></td>
                  <td>{r.시장}</td>
                  <td className="muted">{r.상장일}</td>
                  <td className="r">{won(r.확정공모가)}</td>
                  <td className="r">{won(r.시초가)}</td>
                  {RET_COLS.map(([lb, k]) => <td key={k} className="r">{pctCell(r.returns?.[k])}</td>)}
                  <td className="r" style={{ width: 120, minWidth: 120 }}>
                    <div style={{ width: 110 }}>
                      <MiniChart series={[{ data: r.spark || [], color: (r.spark && r.spark.at(-1) >= r.spark[0]) ? UP : DN }]} height={30} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>상장후 수익률(1M·3M·6M·12M)은 {data.base} 기준 · 행 클릭 → 위 캔들차트 전환 · 헤더 클릭 정렬</div>
      </div>
    </div>
  )
}
