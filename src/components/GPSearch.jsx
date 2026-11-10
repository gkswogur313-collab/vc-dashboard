import { useState, useMemo } from 'react'

// GP 검색 — DIVA(diva.kvca.or.kr) 항목별공시 3종을 GP명으로 검색 + 헤더 클릭 정렬.
// 데이터: public/data/diva.json (GitHub Actions 크롤러가 갱신).
const CAP = 200 // 화면 렌더 상한

const DIVA_URL = {
  invst: 'http://diva.kvca.or.kr/div/dii/DivItmInvstPrfmInq',
  fs: 'http://diva.kvca.or.kr/div/dii/DivItmFsInq',
  asso: 'http://diva.kvca.or.kr/div/dii/DivItmAssoInq',
}

// ---- 정렬 유틸 ----
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/[^0-9.-]/g, '')); return isNaN(n) ? -Infinity : n }
function sortRows(rows, sort, cols) {
  const col = cols[sort.key]
  if (!col) return rows
  const dir = sort.dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const va = col.get(a), vb = col.get(b)
    const c = col.type === 'num' ? num(va) - num(vb) : String(va || '').localeCompare(String(vb || ''), 'ko')
    return c * dir
  })
}
function Th({ label, k, sort, setSort, ...rest }) {
  const active = sort.key === k
  const ind = active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'
  return (
    <th {...rest} className={'th-sort' + (active ? ' active' : '')}
        onClick={() => setSort((s) => ({ key: k, dir: s.key === k && s.dir === 'asc' ? 'desc' : 'asc' }))}>
      {label}<span className="sort-ind">{ind}</span>
    </th>
  )
}
const useSort = (key, dir = 'desc') => useState({ key, dir })

export default function GPSearch({ diva }) {
  const [sub, setSub] = useState('invst')
  const [q, setQ] = useState('')

  // 투자실적: 새 형태({types,periods,data})면 구분·기간 드롭다운, 옛 형태({items})면 그대로.
  const invstBlock = diva?.invst || {}
  const invstNew = invstBlock.data && Object.keys(invstBlock.data).length > 0
  // 기간 순서 명시: YTD(올해 누적) 먼저, 그다음 연도 내림차순 (JS 객체의 숫자키 자동정렬 회피)
  const invPeriods = invstBlock.periods
    ? Object.entries(invstBlock.periods).sort((a, b) => (a[0] === 'YTD' ? -1 : b[0] === 'YTD' ? 1 : Number(b[0]) - Number(a[0])))
    : []
  const invTypes = invstBlock.types && Object.keys(invstBlock.types).length ? invstBlock.types : { P: '투자' }
  const [invTp, setInvTp] = useState('P')
  const [invPeriod, setInvPeriod] = useState('')
  const effPeriod = invPeriod || invPeriods[0]?.[0] || ''
  const invst = invstNew ? (invstBlock.data[`${invTp}|${effPeriod}`] || []) : (invstBlock.items || [])
  const fs = diva?.fs?.items || []
  const asso = diva?.asso?.items || []
  const pending = !diva || !diva.generated_at || (invst.length + fs.length + asso.length === 0)
  const updated = diva?.generated_at ? new Date(diva.generated_at).toLocaleDateString('ko-KR') : null

  const kw = q.trim().toLowerCase()
  const byName = (arr) => (kw ? arr.filter((x) => (x.회사명 || '').toLowerCase().includes(kw)) : arr)
  const invstV = useMemo(() => byName(invst), [invst, kw])
  const fsV = useMemo(() => byName(fs), [fs, kw])
  const assoV = useMemo(() => byName(asso), [asso, kw])

  const curCount = { invst: invstV.length, fs: fsV.length, asso: assoV.length }[sub]

  const TABS = [
    { key: 'invst', label: '투자실적', meta: invstNew ? '' : (diva?.invst?.period ? `기준 ${diva.invst.period}` : '') },
    { key: 'fs', label: '재무제표', meta: diva?.fs?.year ? `${diva.fs.year} 결산` : '' },
    { key: 'asso', label: '조합현황', meta: diva?.asso?.count ? `${diva.asso.count}개 조합` : '' },
  ]
  const curMeta = TABS.find((t) => t.key === sub)?.meta

  return (
    <div>
      <div className="lp-head">
        <div className="tabs" style={{ marginBottom: 0 }}>
          {TABS.map((t) => (
            <button key={t.key} className={'tab-btn' + (sub === t.key ? ' active' : '')} onClick={() => setSub(t.key)}>{t.label}</button>
          ))}
        </div>
        <a className="linklike" href={DIVA_URL[sub]} target="_blank" rel="noreferrer">DIVA 원문 ↗</a>
      </div>

      <div className="lp-bar">
        <input className="pl-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 GP(운용사)명 검색..." />
        {sub === 'invst' && invstNew && (
          <>
            <select value={invTp} onChange={(e) => setInvTp(e.target.value)} aria-label="구분">
              {Object.entries(invTypes).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select value={effPeriod} onChange={(e) => setInvPeriod(e.target.value)} aria-label="기간">
              {invPeriods.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </>
        )}
        <span className="muted" style={{ fontSize: 12.5 }}>
          {curMeta}{curMeta ? ' · ' : ''}{updated ? `갱신 ${updated}` : ''}
        </span>
      </div>

      {pending ? (
        <div className="card"><div className="list-empty">
          아직 수집 전입니다. GitHub Actions의 <strong>fetch-diva</strong> 워크플로를 한 번 실행하면 공시가 채워집니다.
        </div></div>
      ) : (
        <div className="card">
          {curCount === 0 ? (
            <div className="list-empty">{kw ? '해당 GP의 공시가 없습니다.' : '데이터가 없습니다.'}</div>
          ) : (
            <>
              <div className="scroll-box">
                {sub === 'invst' && <InvstTable rows={invstV} />}
                {sub === 'fs' && <FsTable rows={fsV} />}
                {sub === 'asso' && <AssoTable rows={assoV} />}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                {Math.min(curCount, CAP)}건 표시{curCount > CAP ? ` (전체 ${curCount}건 중 상위 ${CAP} — GP명으로 좁혀 보세요)` : ''}
                {' · 헤더를 클릭해 정렬'}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const Num = ({ v }) => <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }} className="muted">{v || '—'}</td>
const RIGHT = { textAlign: 'right' }

const INVST_COLS = {
  회사명: { type: 'text', get: (r) => r.회사명 },
  고유_업체수: { type: 'num', get: (r) => r.고유계정?.업체수 },
  고유_금액: { type: 'num', get: (r) => r.고유계정?.금액 },
  조합_업체수: { type: 'num', get: (r) => r.조합?.업체수 },
  조합_금액: { type: 'num', get: (r) => r.조합?.금액 },
  합계_업체수: { type: 'num', get: (r) => r.합계?.업체수 },
  합계_금액: { type: 'num', get: (r) => r.합계?.금액 },
}
function InvstTable({ rows }) {
  const [sort, setSort] = useSort('합계_금액')
  const sorted = useMemo(() => sortRows(rows, sort, INVST_COLS).slice(0, CAP), [rows, sort])
  const p = { sort, setSort }
  return (
    <table className="tbl tbl-grid tbl-invst">
      <thead>
        <tr>
          <Th label="회사명" k="회사명" rowSpan={2} {...p} />
          <th colSpan={2}>고유계정</th><th colSpan={2}>조합</th><th colSpan={2}>합계</th>
        </tr>
        <tr>
          <Th label="업체수" k="고유_업체수" style={RIGHT} {...p} /><Th label="금액(원)" k="고유_금액" style={RIGHT} {...p} />
          <Th label="업체수" k="조합_업체수" style={RIGHT} {...p} /><Th label="금액(원)" k="조합_금액" style={RIGHT} {...p} />
          <Th label="업체수" k="합계_업체수" style={RIGHT} {...p} /><Th label="금액(원)" k="합계_금액" style={RIGHT} {...p} />
        </tr>
      </thead>
      <tbody>
        {sorted.map((r, i) => (
          <tr key={i}>
            <td><strong>{r.회사명}</strong></td>
            <Num v={r.고유계정?.업체수} /><Num v={r.고유계정?.금액} />
            <Num v={r.조합?.업체수} /><Num v={r.조합?.금액} />
            <Num v={r.합계?.업체수} /><Num v={r.합계?.금액} />
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const FS_COLS = {
  회사명: { type: 'text', get: (r) => r.회사명 },
  재원: { type: 'text', get: (r) => r.재원 },
  결산월: { type: 'num', get: (r) => r.결산월 },
  회계기준: { type: 'text', get: (r) => r.회계기준 },
  재무구분: { type: 'text', get: (r) => r.재무구분 },
  자산: { type: 'num', get: (r) => r.자산 },
  창업투자자산: { type: 'num', get: (r) => r.창업투자자산 },
  부채: { type: 'num', get: (r) => r.부채 },
  자본금: { type: 'num', get: (r) => r.자본금 },
  자본: { type: 'num', get: (r) => r.자본 },
}
function FsTable({ rows }) {
  const [sort, setSort] = useSort('자산')
  const sorted = useMemo(() => sortRows(rows, sort, FS_COLS).slice(0, CAP), [rows, sort])
  const p = { sort, setSort }
  return (
    <table className="tbl tbl-grid">
      <thead><tr>
        <Th label="회사명" k="회사명" {...p} /><Th label="재원" k="재원" {...p} /><Th label="결산월" k="결산월" {...p} />
        <Th label="회계기준" k="회계기준" {...p} /><Th label="재무구분" k="재무구분" {...p} />
        <Th label="자산" k="자산" style={RIGHT} {...p} /><Th label="창업투자자산" k="창업투자자산" style={RIGHT} {...p} />
        <Th label="부채" k="부채" style={RIGHT} {...p} /><Th label="자본금" k="자본금" style={RIGHT} {...p} /><Th label="자본" k="자본" style={RIGHT} {...p} />
      </tr></thead>
      <tbody>
        {sorted.map((r, i) => (
          <tr key={i}>
            <td><strong>{r.회사명}</strong></td><td className="muted">{r.재원}</td><td className="muted">{r.결산월}</td>
            <td className="muted">{r.회계기준}</td><td className="muted">{r.재무구분}</td>
            <Num v={r.자산} /><Num v={r.창업투자자산} /><Num v={r.부채} /><Num v={r.자본금} /><Num v={r.자본} />
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const ASSO_COLS = {
  회사명: { type: 'text', get: (r) => r.회사명 },
  조합명: { type: 'text', get: (r) => r.조합명 },
  등록일: { type: 'text', get: (r) => r.등록일 },
  결성총액: { type: 'num', get: (r) => r.결성총액 },
  만기일: { type: 'text', get: (r) => r.만기일 },
  투자분야구분: { type: 'text', get: (r) => r.투자분야구분 },
  목적구분: { type: 'text', get: (r) => r.목적구분 },
  지원구분: { type: 'text', get: (r) => r.지원구분 },
}
function AssoTable({ rows }) {
  const [sort, setSort] = useSort('등록일')
  const sorted = useMemo(() => sortRows(rows, sort, ASSO_COLS).slice(0, CAP), [rows, sort])
  const p = { sort, setSort }
  return (
    <table className="tbl tbl-grid">
      <thead><tr>
        <Th label="회사명" k="회사명" {...p} /><Th label="조합명" k="조합명" {...p} /><Th label="등록일" k="등록일" {...p} />
        <Th label="결성총액(원)" k="결성총액" style={RIGHT} {...p} /><Th label="만기일" k="만기일" {...p} />
        <Th label="투자분야" k="투자분야구분" {...p} /><Th label="목적" k="목적구분" {...p} /><Th label="지원" k="지원구분" {...p} />
      </tr></thead>
      <tbody>
        {sorted.map((r, i) => (
          <tr key={i}>
            <td><strong>{r.회사명}</strong></td><td>{r.조합명}</td><td className="muted">{r.등록일}</td>
            <Num v={r.결성총액} /><td className="muted">{r.만기일}</td>
            <td className="muted">{r.투자분야구분}</td><td className="muted">{r.목적구분}</td><td className="muted">{r.지원구분}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
