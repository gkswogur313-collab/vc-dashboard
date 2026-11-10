import { useState, useMemo } from 'react'
import { useData } from '../useData.js'
import { normName } from './Sourcing.jsx'

// 신주 후보(펀딩 기반) — 펀딩 List(funding.json)를 기업별로 묶어 '마지막 투자 이후 경과 기간'을 보여준다.
// 다음 라운드를 준비할 시점의 기업을 찾는 용도. 상장사(국내 전 종목·최근 상장)는 기본 제외.
//  - funding.json cols: [date,name,sector,amount,stage,investors]

const ROW_CAP = 500
const TODAY = new Date()
const won = (v) => (v || '').replace(/\s+/g, ' ').trim()
const monthsSince = (d) => Math.floor((TODAY - new Date(d)) / (30.44 * 864e5))
const fmtElapsed = (m) => (m < 12 ? `${m}개월` : `${Math.floor(m / 12)}년${m % 12 ? ` ${m % 12}개월` : ''}`)
const GRANT = /지원금|팁스|tips|프리팁스|선정/i

const RANGES = {
  '0-12': ['1년 미만', 0, 11],
  '12-24': ['1~2년', 12, 23],
  '18-30': ['1년 6개월~2년 6개월', 18, 30],
  '24-36': ['2~3년', 24, 35],
  '36-60': ['3~5년', 36, 59],
  '60-999': ['5년 이상', 60, 9999],
  all: ['전체 기간', 0, 9999],
}

export default function FundingFollowup() {
  const { data } = useData('funding.json')
  const { data: tickers } = useData('tickers-kr.json')
  const { data: postIpo } = useData('post-ipo.json')
  const { data: ipo } = useData('ipo.json')
  const [q, setQ] = useState('')
  const [range, setRange] = useState('18-30')
  const [stage, setStage] = useState('전체')
  const [noGrant, setNoGrant] = useState(true)
  const [exclListed, setExclListed] = useState(true)
  const [sort, setSort] = useState({ key: 'elapsed', dir: 'asc' })

  const cols = data?.cols || ['date', 'name', 'sector', 'amount', 'stage', 'investors']
  const ix = useMemo(() => Object.fromEntries(cols.map((c, i) => [c, i])), [cols])

  // 기업별 묶음: 마지막 투자(지원금 제외 여부 반영) + 라운드 수
  const companies = useMemo(() => {
    if (!data?.items) return []
    const listed = new Set([...(Array.isArray(tickers) ? tickers : []).map((t) => normName(t.name)), ...(postIpo?.items || []).map((x) => normName(x.회사명))])
    const inIpo = new Set((ipo?.items || []).map((x) => normName(x.회사명)))
    const m = new Map()
    for (const r of data.items) {
      const k = normName(r[ix.name])
      if (!k) continue
      let c = m.get(k)
      if (!c) { c = { key: k, rounds: [] }; m.set(k, c) }
      c.rounds.push(r)
    }
    const out = []
    for (const c of m.values()) {
      c.rounds.sort((a, b) => (a[ix.date] < b[ix.date] ? 1 : -1))
      const pool = noGrant ? c.rounds.filter((r) => !GRANT.test(r[ix.stage] || '')) : c.rounds
      const last = pool[0]
      if (!last) continue
      out.push({
        key: c.key, last, n: pool.length,
        name: last[ix.name], sector: last[ix.sector] || c.rounds.find((r) => r[ix.sector])?.[ix.sector] || '',
        elapsed: monthsSince(last[ix.date]),
        listed: listed.has(c.key), inIpo: inIpo.has(c.key),
      })
    }
    return out
  }, [data, ix, tickers, postIpo, ipo, noGrant])

  const stages = useMemo(() => {
    const cnt = {}
    companies.forEach((c) => { const s = c.last[ix.stage]; if (s) cnt[s] = (cnt[s] || 0) + 1 })
    return Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])
  }, [companies, ix])

  const view = useMemo(() => {
    const kw = q.trim().toLowerCase()
    const [, lo, hi] = RANGES[range]
    const rows = companies.filter((c) => {
      if (exclListed && c.listed) return false
      if (c.elapsed < lo || c.elapsed > hi) return false
      if (stage !== '전체' && c.last[ix.stage] !== stage) return false
      if (kw) {
        const hay = (c.name + ' ' + c.sector + ' ' + c.last[ix.investors]).toLowerCase()
        if (!hay.includes(kw)) return false
      }
      return true
    })
    const dir = sort.dir === 'asc' ? 1 : -1
    const val = { elapsed: (c) => c.elapsed, name: (c) => c.name, n: (c) => c.n, date: (c) => c.last[ix.date] }[sort.key]
    return rows.sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * dir })
  }, [companies, q, range, stage, exclListed, sort, ix])

  if (!data) return <div className="card"><div className="list-empty">펀딩 데이터를 불러오는 중…</div></div>
  if (!data.items?.length) return <div className="card"><div className="list-empty">아직 펀딩 데이터가 없습니다. 워크플로(fetch-funding) 실행 후 표시됩니다.</div></div>

  const updated = data.generated_at ? new Date(data.generated_at).toLocaleDateString('ko-KR') : null
  const shown = view.slice(0, ROW_CAP)
  const Th = ({ k, label, style }) => (
    <th style={style} className={'th-sort' + (sort.key === k ? ' active' : '')}
      onClick={() => setSort((s) => ({ key: k, dir: s.key === k && s.dir === 'asc' ? 'desc' : 'asc' }))}>
      {label}<span className="sort-ind">{sort.key === k ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
    </th>
  )

  return (
    <div className="card">
      <div className="lp-bar" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <strong style={{ fontSize: 15 }}>신주 후보</strong>
        <span className="muted" style={{ fontSize: 12.5 }}>
          펀딩 List를 기업별로 묶어 마지막 투자 이후 경과 기간을 봅니다 · {view.length.toLocaleString()}개 기업
        </span>
        <span style={{ flex: 1 }} />
        <span className="muted" style={{ fontSize: 12.5 }}>{updated ? `갱신 ${updated}` : ''}</span>
      </div>

      <div className="lp-bar" style={{ flexWrap: 'wrap', gap: 8 }}>
        <input className="pl-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 기업·분야·투자사 검색…" />
        <select value={range} onChange={(e) => setRange(e.target.value)} aria-label="마지막 투자 이후 경과">
          {Object.entries(RANGES).map(([k, [l]]) => <option key={k} value={k}>경과: {l}</option>)}
        </select>
        <select value={stage} onChange={(e) => setStage(e.target.value)} aria-label="마지막 단계">
          <option value="전체">마지막 단계: 전체</option>
          {stages.map((st) => <option key={st} value={st}>{st}</option>)}
        </select>
        <label className="pl-check"><input type="checkbox" checked={noGrant} onChange={(e) => setNoGrant(e.target.checked)} /> 지원금·팁스 선정은 투자에서 제외</label>
        <label className="pl-check"><input type="checkbox" checked={exclListed} onChange={(e) => setExclListed(e.target.checked)} /> 상장사 제외</label>
      </div>

      <div className="scroll-box" style={{ '--scroll-h': 'max(300px, calc(100vh - 360px))' }}>
        <table className="tbl tbl-grid" style={{ minWidth: 760 }}>
          <thead><tr>
            <Th k="date" label="마지막 투자일" style={{ width: 104 }} />
            <Th k="elapsed" label="경과" style={{ width: 104 }} />
            <Th k="name" label="기업명" />
            <th>분야</th>
            <th style={{ width: 92, textAlign: 'right' }}>투자금</th>
            <th style={{ width: 92 }}>단계</th>
            <th>투자사</th>
            <Th k="n" label="라운드" style={{ width: 70, textAlign: 'right' }} />
          </tr></thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.key}>
                <td style={{ whiteSpace: 'nowrap', color: 'var(--muted, #8a94a6)' }}>{(c.last[ix.date] || '').slice(2)}</td>
                <td style={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{fmtElapsed(c.elapsed)}</td>
                <td style={{ fontWeight: 600 }}>
                  {c.name}
                  {c.listed && <span className="badge" style={{ marginLeft: 6 }}>상장</span>}
                  {!c.listed && c.inIpo && <span className="badge" style={{ marginLeft: 6 }}>IPO 진행</span>}
                </td>
                <td>{c.sector}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{won(c.last[ix.amount]) || '—'}</td>
                <td><span className="muted">{c.last[ix.stage] || '—'}</span></td>
                <td>{c.last[ix.investors]}</td>
                <td style={{ textAlign: 'right' }} className="muted">{c.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {view.length > ROW_CAP && (
        <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
          상위 {ROW_CAP}건만 표시 중 · 외 {(view.length - ROW_CAP).toLocaleString()}건. 경과 기간·단계·검색으로 좁혀 보세요.
        </div>
      )}
    </div>
  )
}
