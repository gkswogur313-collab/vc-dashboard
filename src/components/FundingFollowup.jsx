import { useState, useMemo, Fragment } from 'react'
import { useData } from '../useData.js'
import { normName, DartCell, RunwayCell, DartDetail } from './Sourcing.jsx'
import { buildDartLinks, expiringFunds, runwayLabel } from './sourcingLink.js'
import { exportXlsx, today, dartUrl } from './dartShared.js'

// 신주 후보(펀딩 기반) — 펀딩 List(funding.json)를 기업별로 묶어 '마지막 투자 이후 경과 기간'을 보여준다.
// 다음 라운드를 준비할 시점의 기업을 찾는 용도. 상장사(국내 전 종목·최근 상장)는 기본 제외.
//  - funding.json cols: [date,name,sector,amount,stage,investors]
// 공시분석 연결: dart-index.json(감사보고서) + dart-alias.json(이름 보정) + diva.json(주주 조합 만기) — 세컨더리·소싱과 같은 로직.
// 행 클릭 → 감사보고서 재무·등급·런웨이·주주 조합 펼침. '엑셀' 버튼 → 현재 필터 결과 전체(표시 상한 무관) 내보내기.

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
  const { data: dIdx } = useData('dart-index.json')
  const { data: alias } = useData('dart-alias.json')
  const { data: diva } = useData('diva.json')
  const [open, setOpen] = useState(null)
  const [audit, setAudit] = useState('all') // 감사보고서: all | yes | no
  const [busy, setBusy] = useState(false)
  const links = useMemo(() => (dIdx ? buildDartLinks(dIdx, alias, diva) : null), [dIdx, alias, diva])
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
        rounds: c.rounds,
        dart: links ? links.lookup(last[ix.name]) : null,
      })
    }
    return out
  }, [data, ix, tickers, postIpo, ipo, noGrant, links])

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
      if (audit === 'yes' && !c.dart) return false
      if (audit === 'no' && c.dart) return false
      if (c.elapsed < lo || c.elapsed > hi) return false
      if (stage !== '전체' && c.last[ix.stage] !== stage) return false
      if (kw) {
        const hay = (c.name + ' ' + c.sector + ' ' + c.last[ix.investors]).toLowerCase()
        if (!hay.includes(kw)) return false
      }
      return true
    })
    const dir = sort.dir === 'asc' ? 1 : -1
    const val = { audit: (c) => (c.dart ? 0 : 1), elapsed: (c) => c.elapsed, name: (c) => c.name, n: (c) => c.n, date: (c) => c.last[ix.date] }[sort.key]
    return rows.sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * dir })
  }, [companies, q, range, stage, exclListed, audit, sort, ix])

  // 엑셀 — 시트1: 기업별(펀딩 + 공시 재무), 시트2: 라운드 내역
  const download = async () => {
    setBusy(true)
    try {
      const n = (v) => (v === null || v === undefined ? '' : v)
      const header = ['마지막 투자일', '경과(개월)', '기업명', '분야', '투자금', '단계', '투자사', '라운드 수', '상장·IPO',
        '감사보고서', '등급', '등급 근거', '사업연도', '매출(억)', '매출 YoY(%)', '영업이익(억)', '순이익(억)', '현금(억)',
        '추정 런웨이', '감사의견', '계속기업 불확실성', '주주 조합', '2년 내 만기 조합', '감사보고서', '홈페이지']
      const rows = view.map((c) => {
        const d = c.dart
        const exp = d ? expiringFunds(d, 24) : []
        return [c.last[ix.date], c.elapsed, c.name, c.sector, won(c.last[ix.amount]), c.last[ix.stage] || '', c.last[ix.investors] || '', c.n,
          c.listed ? '상장' : c.inIpo ? 'IPO 진행' : '',
          d ? `있음(${d.fy})` : '없음', d ? n(d.grade) : '', d ? d.why.join(' · ') : '', d ? n(d.fy) : '', d ? n(d.rev) : '', d ? n(d.rev_g) : '',
          d ? n(d.op) : '', d ? n(d.ni) : '', d ? n(d.cash) : '', d ? runwayLabel(d.runway) : '', d ? n(d.opinion) : '', d?.gc ? 'Y' : '',
          d ? (d.funds || []).map((f) => f.name).join(', ') : '', exp.map((f) => `${f.asso.조합명}(${f.asso.만기일})`).join(', '),
          d ? dartUrl(d.rcept_no) : '', d?.url || '']
      })
      const rHeader = ['기업명', '투자일', '단계', '투자금', '투자사', '분야']
      const rRows = view.flatMap((c) => c.rounds.map((r) => [c.name, r[ix.date], r[ix.stage] || '', won(r[ix.amount]), r[ix.investors] || '', r[ix.sector] || '']))
      await exportXlsx(`신주후보_${RANGES[range][0].replace(/[~\s]/g, '')}_${today()}`, [
        { name: '신주 후보', header, rows },
        { name: '라운드 내역', header: rHeader, rows: rRows },
      ])
    } finally { setBusy(false) }
  }

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
        <button className="chip" style={{ fontSize: 12 }} onClick={download} disabled={busy || !view.length} title="현재 필터 결과 전체를 엑셀로 받습니다(표시 상한 없음)">
          {busy ? '만드는 중…' : `⬇ 엑셀 (${view.length.toLocaleString()}건)`}
        </button>
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
        <select value={audit} onChange={(e) => setAudit(e.target.value)} aria-label="감사보고서">
          <option value="all">감사보고서: 전체</option>
          <option value="yes">감사보고서 있음</option>
          <option value="no">감사보고서 없음</option>
        </select>
        <span className="muted" style={{ fontSize: 12.5 }}>{links ? `감사보고서 있음 ${view.filter((c) => c.dart).length.toLocaleString()}곳 / 없음 ${view.filter((c) => !c.dart).length.toLocaleString()}곳 · 행을 누르면 공시분석 재무가 펼쳐집니다` : '공시 데이터 불러오는 중…'}</span>
      </div>

      <div className="scroll-box" style={{ '--scroll-h': 'max(300px, calc(100vh - 360px))' }}>
        <table className="tbl tbl-grid" style={{ minWidth: 1080 }}>
          <thead><tr>
            <Th k="date" label="마지막 투자일" style={{ width: 104 }} />
            <Th k="elapsed" label="경과" style={{ width: 104 }} />
            <Th k="name" label="기업명" />
            <Th k="audit" label="감사보고서" style={{ width: 96 }} />
            <th>분야</th>
            <th style={{ width: 92, textAlign: 'right' }}>투자금</th>
            <th style={{ width: 92 }}>단계</th>
            <th>투자사</th>
            <Th k="n" label="라운드" style={{ width: 70, textAlign: 'right' }} />
            <th>공시 재무(등급·매출·YoY)</th>
            <th style={{ width: 84, textAlign: 'right' }}>런웨이</th>
          </tr></thead>
          <tbody>
            {shown.map((c) => { const isOpen = open === c.key; return (
              <Fragment key={c.key}>
              <tr className="row-click" onClick={() => setOpen(isOpen ? null : c.key)}>
                <td style={{ whiteSpace: 'nowrap', color: 'var(--muted, #8a94a6)' }}>{(c.last[ix.date] || '').slice(2)}</td>
                <td style={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{fmtElapsed(c.elapsed)}</td>
                <td style={{ fontWeight: 600 }}>
                  <span className="muted">{isOpen ? '▾ ' : '▸ '}</span>{c.name}
                  {c.listed && <span className="badge" style={{ marginLeft: 6 }}>상장</span>}
                  {!c.listed && c.inIpo && <span className="badge" style={{ marginLeft: 6 }}>IPO 진행</span>}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {c.dart
                    ? <a className="badge" href={dartUrl(c.dart.rcept_no)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="감사보고서 원문 열기" style={{ color: 'var(--good, #16a34a)', textDecoration: 'none' }}>있음 · {c.dart.fy}</a>
                    : (links ? <span className="muted" style={{ fontSize: 12 }}>없음</span> : <span className="muted">…</span>)}
                </td>
                <td>{c.sector}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{won(c.last[ix.amount]) || '—'}</td>
                <td><span className="muted">{c.last[ix.stage] || '—'}</span></td>
                <td>{c.last[ix.investors]}</td>
                <td style={{ textAlign: 'right' }} className="muted">{c.n}</td>
                <td><DartCell r={c.dart} /></td>
                <td style={{ textAlign: 'right' }}><RunwayCell r={c.dart} /></td>
              </tr>
              {isOpen && (
                <tr className="detail-row"><td colSpan={11}><div className="firm-detail">
                  <DartDetail r={c.dart} c={{ rounds: c.rounds.map((r) => ({ date: r[ix.date], stage: r[ix.stage], amount: won(r[ix.amount]), investors: r[ix.investors] })) }} />
                </div></td></tr>
              )}
              </Fragment>
            ) })}
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
