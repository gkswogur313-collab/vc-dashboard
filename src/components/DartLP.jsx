import { useState, useMemo, Fragment } from 'react'
import { useData } from '../useData.js'
import SortTh from './SortTh.jsx'
import { DOWN, eok, signColor, dartUrl, exportXlsx, today, BAD_OPINIONS, FREEZE_BOX, FREEZE_CSS, makeCmp } from './dartShared.js'

// 잠재 LP — 감사보고서 주석에 벤처투자조합·신기술사업투자조합 등 출자 내역이 있는 기업
// 데이터: public/data/dart-lp.json (크롤러 scripts/fetch-dart-screener.py)
// - funds: [[조합명, 금액(억원, 장부금액·취득원가 중 큰 값 · 본문에서만 찾은 건 null)], ...]
// 정렬(나래비): 드롭다운 또는 표 머리글 클릭. 머리글을 다시 누르면 높은 순 ↔ 낮은 순.

const ROW_CAP = 400
const SORTS = [
  ['n_funds', '출자 조합 수순'],
  ['total', '출자 합계순'],
  ['rev', '매출순'],
  ['ni', '순이익순'],
  ['assets', '자산순'],
  ['equity', '자본순'],
  ['cash', '보유 현금순'],
]
const num = (s) => (s === '' || isNaN(Number(s)) ? null : Number(s))
const byFunds = (x, y) => y.n_funds - x.n_funds

export default function DartLP() {
  const { data } = useData('dart-lp.json')
  const [q, setQ] = useState('')
  const [sector, setSector] = useState('전체')
  const [minFunds, setMinFunds] = useState('1')
  const [totalMin, setTotalMin] = useState('')
  const [assetsMin, setAssetsMin] = useState('')
  const [hideStartup, setHideStartup] = useState(false)
  const [cleanOnly, setCleanOnly] = useState(false)
  const [sort, setSort] = useState('n_funds')
  const [dir, setDir] = useState('desc')
  const [open, setOpen] = useState(null)
  const onSort = (k) => {
    if (k === sort) setDir(dir === 'desc' ? 'asc' : 'desc')
    else { setSort(k); setDir('desc') }
  }
  const th = { sort, dir, onSort }

  const rows = useMemo(() => {
    if (!data?.items || !data?.cols) return []
    return data.items.map((r) => Object.fromEntries(data.cols.map((c, i) => [c, r[i]])))
  }, [data])

  const sectors = useMemo(() => {
    const cnt = {}
    rows.forEach((r) => { if (r.sector) cnt[r.sector] = (cnt[r.sector] || 0) + 1 })
    return Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])
  }, [rows])

  const view = useMemo(() => {
    const kw = q.trim().toLowerCase()
    const tMin = num(totalMin), aMin = num(assetsMin), fMin = Number(minFunds)
    const out = rows.filter((r) => {
      if (sector !== '전체' && r.sector !== sector) return false
      if (r.n_funds < fMin) return false
      if (tMin !== null && !(r.total >= tMin)) return false
      if (aMin !== null && !(r.assets >= aMin)) return false
      if (hideStartup && r.startup) return false
      if (cleanOnly && r.opinion !== '적정') return false
      if (kw) {
        const hay = (r.name + ' ' + r.sector + ' ' + r.funds.map((f) => f[0]).join(' ')).toLowerCase()
        if (!hay.includes(kw)) return false
      }
      return true
    })
    out.sort(makeCmp(sort, dir, undefined, byFunds))
    return out
  }, [rows, q, sector, minFunds, totalMin, assetsMin, hideStartup, cleanOnly, sort, dir])

  const doExport = () => {
    const header = ['순위', '기업명', '업종', 'KSIC', '설립연도', '사업연도', '매출(억)', '자산(억)', '순이익(억)', '자본(억)', '현금(억)', '감사의견',
      '출자 조합 수', '출자 합계(억)', '출자 조합', '스타트업 여부', '홈페이지', 'DART 원문']
    const sheet1 = view.map((r, i) => [i + 1, r.name, r.sector, r.ksic, r.est, r.fy, r.rev, r.assets, r.ni, r.equity, r.cash, r.opinion || '',
      r.n_funds, r.total, r.funds.map((f) => f[0] + (f[1] ? ` (${f[1]}억)` : '')).join(', '), r.startup ? 'Y' : '', r.url, dartUrl(r.rcept_no)])
    const sheet2 = view.flatMap((r) => r.funds.map((f) => [r.name, r.sector, f[0], f[1], r.fy, dartUrl(r.rcept_no)]))
    exportXlsx(`공시분석_잠재LP_${today()}`, [
      { name: '잠재 LP', header, rows: sheet1 },
      { name: '조합별 출자', header: ['기업명', '업종', '조합명', '금액(억)', '사업연도', 'DART 원문'], rows: sheet2 },
    ])
  }

  if (!data) return <div className="card"><div className="list-empty">잠재 LP 데이터를 불러오는 중…</div></div>
  const cov = data.coverage || {}
  if (!rows.length) {
    return (
      <div className="card">
        <div className="list-empty">
          아직 잠재 LP 데이터가 없습니다.<br />
          스타트업 분석이 끝난 뒤 다른 외감 기업들의 최신 감사보고서를 읽으며 채워집니다
          {cov.lp_needed ? ` (진행 ${(cov.lp_done || 0).toLocaleString()} / ${cov.lp_needed.toLocaleString()}사)` : ''}.
        </div>
      </div>
    )
  }

  const updated = data.generated_at ? new Date(data.generated_at).toLocaleDateString('ko-KR') : ''
  const shown = view.slice(0, ROW_CAP)
  const progress = cov.lp_needed ? Math.round((cov.lp_done / cov.lp_needed) * 100) : 0
  const R = { textAlign: 'right' }

  return (
    <div className="card">
      <div className="lp-bar" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <strong style={{ fontSize: 15 }}>잠재 LP</strong>
        <span className="muted" style={{ fontSize: 12.5 }}>
          조합 출자 내역이 있는 외감 비상장 기업 {rows.length.toLocaleString()}사 · 표시 {view.length.toLocaleString()}사
        </span>
        <span style={{ flex: 1 }} />
        <span className="muted" style={{ fontSize: 12.5 }}>{updated ? `갱신 ${updated}` : ''}</span>
        <button className="chip" onClick={doExport} style={{ fontSize: 12 }} disabled={!view.length}>⬇ 엑셀 ({view.length.toLocaleString()}건)</button>
      </div>
      {!cov.backfill_done && (
        <div className="muted" style={{ fontSize: 12, margin: '-4px 0 10px' }}>
          ⏳ 감사보고서 확인 중 · {(cov.lp_done || 0).toLocaleString()} / {(cov.lp_needed || 0).toLocaleString()}사 ({progress}%). 매일 이어서 채워집니다.
        </div>
      )}

      <div className="lp-bar" style={{ flexWrap: 'wrap', gap: 8 }}>
        <input className="pl-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 기업명·조합명(운용사) 검색…" />
        <select value={sector} onChange={(e) => setSector(e.target.value)} aria-label="업종">
          <option value="전체">업종: 전체</option>
          {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={minFunds} onChange={(e) => setMinFunds(e.target.value)} aria-label="출자 조합 수">
          {[1, 2, 3, 5].map((n) => <option key={n} value={n}>조합 {n}개 이상</option>)}
        </select>
        <label className="muted" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          출자 합계(억) ≥ <input type="number" value={totalMin} onChange={(e) => setTotalMin(e.target.value)} style={{ width: 64, padding: '4px 6px', fontSize: 12 }} />
        </label>
        <label className="muted" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          자산(억) ≥ <input type="number" value={assetsMin} onChange={(e) => setAssetsMin(e.target.value)} style={{ width: 72, padding: '4px 6px', fontSize: 12 }} />
        </label>
        <select value={sort} onChange={(e) => { setSort(e.target.value); setDir('desc') }} aria-label="정렬 기준">
          {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button className="tab-btn" style={{ padding: '4px 11px', fontSize: 12 }} title="높은 순 ↔ 낮은 순"
          onClick={() => setDir(dir === 'desc' ? 'asc' : 'desc')}>{dir === 'desc' ? '높은 순 ▼' : '낮은 순 ▲'}</button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        <button className={'tab-btn' + (hideStartup ? ' active' : '')} style={{ padding: '4px 11px', fontSize: 12 }}
          onClick={() => setHideStartup(!hideStartup)}>스타트업 제외</button>
        <button className={'tab-btn' + (cleanOnly ? ' active' : '')} style={{ padding: '4px 11px', fontSize: 12 }}
          onClick={() => setCleanOnly(!cleanOnly)}>감사의견 적정만</button>
      </div>

      <style>{FREEZE_CSS}</style>
      <div style={FREEZE_BOX}>
        <table className="tbl tbl-grid dart-freeze" style={{ minWidth: 1060 }}>
          <thead><tr>
            <th style={{ width: 40, textAlign: 'center' }}>#</th>
            <th>기업명</th>
            <th style={{ width: 62 }}>FY</th>
            <SortTh k="rev" {...th} style={{ width: 84, ...R }}>매출</SortTh>
            <SortTh k="assets" {...th} style={{ width: 84, ...R }}>자산</SortTh>
            <SortTh k="ni" {...th} style={{ width: 84, ...R }}>순이익</SortTh>
            <SortTh k="cash" {...th} style={{ width: 92, ...R }} title="현금및현금성자산 (최신 사업연도 감사보고서) · 눌러서 정렬">보유 현금</SortTh>
            <SortTh k="n_funds" {...th} style={{ width: 72, textAlign: 'center' }}>조합 수</SortTh>
            <SortTh k="total" {...th} style={{ width: 92, ...R }}>출자 합계</SortTh>
            <th>출자 조합</th>
          </tr></thead>
          <tbody>
            {shown.map((r, i) => {
              const isOpen = open === r.corp_code
              return (
                <Fragment key={r.corp_code}>
                  <tr onClick={() => setOpen(isOpen ? null : r.corp_code)} style={{ cursor: 'pointer' }}>
                    <td style={{ textAlign: 'center', fontSize: 12 }} className="muted">{i + 1}</td>
                    <td style={{ minWidth: 160 }}>
                      <span className="muted" style={{ fontSize: 11, marginRight: 4 }}>{isOpen ? '▾' : '▸'}</span>
                      <a href={dartUrl(r.rcept_no)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ fontWeight: 600 }}>{r.name}</a>
                      {r.startup && <span className="badge" style={{ marginLeft: 6, fontSize: 10.5 }}>스타트업</span>}
                      <div className="muted" style={{ fontSize: 11.5 }}>
                        {r.sector || '업종 미상'}{r.est ? ` · ${r.est}년 설립` : ''}
                        {BAD_OPINIONS.includes(r.opinion) && <span style={{ color: DOWN }}> · 감사의견 {r.opinion}</span>}
                      </div>
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>{r.fy}</td>
                    <td style={{ ...R, whiteSpace: 'nowrap' }}>{eok(r.rev)}</td>
                    <td style={{ ...R, whiteSpace: 'nowrap' }}>{eok(r.assets)}</td>
                    <td style={{ ...R, whiteSpace: 'nowrap', color: signColor(r.ni) }}>{eok(r.ni)}</td>
                    <td style={{ ...R, whiteSpace: 'nowrap' }}>{eok(r.cash)}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{r.n_funds}</td>
                    <td style={{ ...R, whiteSpace: 'nowrap' }}>{r.total ? eok(r.total) : '—'}</td>
                    <td style={{ fontSize: 12, maxWidth: 300 }}>
                      {r.funds.slice(0, 2).map((f) => f[0]).join(', ')}
                      {r.funds.length > 2 && <span className="muted"> 외 {r.funds.length - 2}</span>}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={10} style={{ background: 'var(--accent-weak, rgba(59,130,246,.06))' }}>
                        <table className="tbl" style={{ fontSize: 12, maxWidth: 560 }}>
                          <thead><tr><th>조합명</th><th style={R}>금액</th></tr></thead>
                          <tbody>
                            {r.funds.map((f) => (
                              <tr key={f[0]}><td>{f[0]}</td><td style={R}>{f[1] ? eok(f[1]) : <span className="muted">본문 언급</span>}</td></tr>
                            ))}
                          </tbody>
                        </table>
                        {r.url && <a className="muted" style={{ fontSize: 12 }} href={/^https?:/.test(r.url) ? r.url : `http://${r.url}`} target="_blank" rel="noreferrer">홈페이지 ↗</a>}
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
          화면에는 상위 {ROW_CAP}건만 표시 · 엑셀에는 전체 {view.length.toLocaleString()}건이 같은 순서로 들어갑니다.
        </div>
      )}
      <div className="muted" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.6 }}>
        기업별 최신 감사보고서 주석(투자자산·출자금)에서 조합명을 찾은 결과입니다. 금액은 장부금액·취득원가 중 큰 값이며, 본문에서만 언급된 조합은 금액 없이 표시합니다.
        조합명 검색으로 특정 운용사(GP)의 조합에 출자한 기업을 찾을 수 있습니다. 상장사는 포함되지 않습니다. 표 머리글을 누르면 그 항목으로 줄 세웁니다.
      </div>
    </div>
  )
}
