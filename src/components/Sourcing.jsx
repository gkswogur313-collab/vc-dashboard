import { useState, useMemo, Fragment } from 'react'
import { useData } from '../useData.js'
import { Grade, Spark } from './DartScreener.jsx'
import { eok, pct, signColor, dartUrl, DOWN, GRADES } from './dartShared.js'
import { normName, normFund, buildDartLinks, expiringFunds, runwayLabel } from './sourcingLink.js'

export { normName }

// 세컨더리·소싱 — 구주(세컨더리) 매도 제안 / 신주 투자 의향 확인 대상 발굴.
// 데이터:
//  - vc-portfolio.json : 운용사 홈페이지 포트폴리오(운용사×회사). 2026-10 1차 수집본.
//  - diva.json         : DIVA 조합현황(조합 만기일) — fetch-diva 워크플로가 매일 갱신.
//  - funding.json      : 스타트업 투자 라운드(일자·단계·금액·투자사) — fetch-funding 워크플로가 매일 갱신.
//  - dart-index.json   : 공시분석(감사보고서) 연결용 — 재무·등급·주주 조합. fetch-dart-screener 워크플로가 생성.
//  - dart-alias.json   : 이름 연결 수동 보정표.

const CAP = 150
const BASE_DATE = '2026-10-29' // 최초 수집일 — 이후 주간 크롤러가 새로 찾은 포트폴리오에 '신규' 표시
const TODAY = new Date()
const NOWRAP = { whiteSpace: 'nowrap', display: 'inline-block' }

const EXITED = /exit|ipo|m&a|상장|회수|exited|past|kospi|kosdaq|코스닥|코스피|nasdaq|매각/i
const toEok = (won) => { const n = Number(String(won || '').replace(/[^0-9]/g, '')); return n ? n / 1e8 : 0 }
const fmtEok = (v) => (v ? `${Math.round(v).toLocaleString('ko-KR')}억` : '—')
const monthsSince = (d) => { if (!d) return null; const t = new Date(d); return Math.floor((TODAY - t) / (30.44 * 864e5)) }
const addMonths = (m) => { const d = new Date(TODAY); d.setMonth(d.getMonth() + m); return d.toISOString().slice(0, 10) }

function useIndex(pf, diva, funding, tickers, postIpo, ipo, dIdx, alias) {
  return useMemo(() => {
    if (!pf) return null
    const firms = pf.firms
    // 회사별 투자 운용사(홈페이지 기준)
    const comp = new Map() // norm -> {name, sector, firms:Set, exited:bool, logo:bool}
    const byFirm = firms.map(() => [])
    for (const r of pf.rows) {
      const [fi, name, sector, year, state, logo] = r
      byFirm[fi].push(r)
      if (logo) continue
      const k = normName(name)
      if (!k) continue
      let c = comp.get(k)
      if (!c) { c = { key: k, name, sector: '', firms: new Set(), exited: false, rounds: [] }; comp.set(k, c) }
      c.firms.add(fi)
      if (!c.sector && sector) c.sector = sector
      if (state && EXITED.test(state)) c.exited = true
    }
    // 라운드(funding.json) — 회사명으로 연결, 홈페이지에 없는 회사도 신주 후보로 포함
    const rounds = funding?.items || []
    for (const it of rounds) {
      const [date, name, sector, amount, stage, investors] = it
      const k = normName(name)
      if (!k) continue
      let c = comp.get(k)
      if (!c) { c = { key: k, name, sector: sector || '', firms: new Set(), exited: false, rounds: [] }; comp.set(k, c) }
      if (!c.sector && sector) c.sector = sector
      c.rounds.push({ date, amount, stage, investors })
    }
    // 상장사(KRX 전 종목 + 최근 상장) / 상장 절차 진행 중(예심 청구~상장 예정)
    const listed = new Set([...(Array.isArray(tickers) ? tickers : []).map((t) => normName(t.name)), ...(postIpo?.items || []).map((x) => normName(x.회사명))])
    const inIpo = new Set((ipo?.items || []).map((x) => normName(x.회사명)))
    for (const c of comp.values()) {
      c.listed = listed.has(c.key)
      c.inIpo = !c.listed && inIpo.has(c.key)
      c.rounds.sort((a, b) => (a.date < b.date ? 1 : -1))
      c.last = c.rounds.find((r) => r.stage !== '지원금') || null
      c.lastAny = c.rounds[0] || null
    }
    // 운용사별 조합(DIVA) — 공동GP 표기("○○ 키움인베스트먼트")도 잡도록 포함 관계로 매칭
    const asso = diva?.asso?.items || []
    const assoN = asso.map((a) => ({ ...a, _n: normName(a.회사명), _eok: toEok(a.결성총액) }))
    const fundsByFirm = firms.map((f) => {
      const n = normName(f.n)
      if (n.length < 3) return []
      return assoN.filter((a) => a._n === n || a._n.includes(n))
    })
    // 공시(감사보고서) 연결 — 재무·등급·주주 조합, 감사보고서로 찾은 운용사, 뉴스에 없는 증자
    const links = dIdx ? buildDartLinks(dIdx, alias, diva) : null
    const firmNorms = firms.map((f) => normName(f.n))
    let dartMatched = 0
    for (const c of comp.values()) {
      c.dart = links ? links.lookup(c.name) : null
      if (c.dart) dartMatched++
      const hp = [...c.firms].map((i) => firmNorms[i]).filter((n) => n.length >= 3)
      const gps = new Map()
      for (const f of c.dart?.funds || []) {
        const g = f.asso?.회사명
        if (!g) continue
        const gn = normName(g)
        if (hp.some((n) => gn === n || gn.includes(n))) continue // 홈페이지에서 이미 잡힌 운용사
        gps.set(gn, g)
      }
      c.gpExtra = [...gps.values()]
      c.vcN = c.firms.size + c.gpExtra.length
      // 마지막 투자 시점 — 뉴스 라운드와 감사보고서 증자(투자자본 급증 연도) 중 늦은 쪽
      const lr = c.dart?.lastRaise || null
      const roundY = c.last ? Number(c.last.date.slice(0, 4)) : null
      c.hidden = lr && (!roundY || roundY < lr) ? lr : null
      if (c.last && !c.hidden) { c.tDate = c.last.date; c.tSrc = 'round' }
      else if (c.hidden) { c.tDate = `${c.hidden}-07-01`; c.tSrc = 'dart' } // 연도만 알 수 있어 연중(7월)으로 근사
      else { c.tDate = null; c.tSrc = null }
      c.exp = expiringFunds(c.dart, 24)
    }
    const linkedCodes = new Set([...comp.values()].filter((c) => c.dart).map((c) => c.dart.corp_code))
    return { firms, comp, byFirm, fundsByFirm, roundsCount: rounds.length, assoCount: asso.length, links, dartMatched, linkedCodes, listed }
  }, [pf, diva, funding, tickers, postIpo, ipo, dIdx, alias])
}

export default function Sourcing() {
  const { data: pf, error } = useData('vc-portfolio.json')
  const { data: diva } = useData('diva.json')
  const { data: funding } = useData('funding.json')
  const { data: tickers } = useData('tickers-kr.json')
  const { data: postIpo } = useData('post-ipo.json')
  const { data: ipo } = useData('ipo.json')
  const { data: dIdx } = useData('dart-index.json')
  const { data: alias } = useData('dart-alias.json')
  const idx = useIndex(pf, diva, funding, tickers, postIpo, ipo, dIdx, alias)
  const [sub, setSub] = useState('secondary')

  const TABS = [
    { key: 'secondary', label: '구주 후보' },
    { key: 'primary', label: '신주 후보' },
    { key: 'discover', label: '공시 발굴' },
    { key: 'search', label: '포트폴리오사 검색' },
  ]
  return (
    <div>
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={'tab-btn' + (sub === t.key ? ' active' : '')} onClick={() => setSub(t.key)}>{t.label}</button>
        ))}
      </div>
      {error && <div className="card"><div className="list-empty">포트폴리오 데이터를 불러오지 못했습니다: {error}</div></div>}
      {!idx && !error && <div className="card"><div className="list-empty">불러오는 중…</div></div>}
      {idx && sub === 'secondary' && <Secondary idx={idx} />}
      {idx && sub === 'primary' && <Primary idx={idx} />}
      {idx && sub === 'discover' && <Discover idx={idx} />}
      {idx && sub === 'search' && <Search idx={idx} />}
      {idx && (
        <div className="muted src-note">
          출처: 운용사 홈페이지 포트폴리오 {pf.rows.length.toLocaleString()}건(운용사 {pf.firms.filter((f) => f.cnt).length}곳, {pf.generated_at.slice(0, 10)} 수집) ·
          DIVA 조합 {idx.assoCount.toLocaleString()}개{diva?.generated_at ? `(${new Date(diva.generated_at).toLocaleDateString('ko-KR')} 갱신)` : ''} ·
          투자 라운드 {idx.roundsCount.toLocaleString()}건{funding?.generated_at ? `(${new Date(funding.generated_at).toLocaleDateString('ko-KR')} 갱신)` : ''} ·
          감사보고서 연결 {idx.links ? `${idx.links.rows.length.toLocaleString()}사 중 소싱 회사 ${idx.dartMatched.toLocaleString()}곳 연결` : '불러오는 중'}{dIdx?.generated_at ? `(${new Date(dIdx.generated_at).toLocaleDateString('ko-KR')} 생성)` : ''}
        </div>
      )}
    </div>
  )
}

function LastRound({ c }) {
  const r = c?.last
  const hid = c?.hidden ? <span className="badge" style={{ marginLeft: 4, ...NOWRAP }} title="뉴스 라운드 기록보다 늦은 연도에 감사보고서상 투자자본(주식발행초과금+RCPS 부채)이 크게 늘었습니다">공시상 {c.hidden} 증자</span> : null
  if (!r) return hid ? <span>{hid}</span> : <span className="muted">기록 없음</span>
  return <span>{r.date.slice(0, 7)} · {r.stage || '—'} · {r.amount || '—'}{hid}</span>
}

// 공시 재무 한 칸 — 등급 · 매출 · 성장률
function DartCell({ r }) {
  if (!r) return <span className="muted sm">—</span>
  return (
    <span style={{ whiteSpace: 'nowrap', fontSize: 12.5 }}>
      {r.grade && <Grade g={r.grade} title={r.why.join(' · ')} />} {eok(r.rev)}
      {r.rev_g !== null && r.rev_g !== undefined && <span style={{ color: signColor(r.rev_g) }}> {pct(r.rev_g)}</span>}
      <span className="muted"> ({r.fy})</span>
    </span>
  )
}

function RunwayCell({ r }) {
  if (!r) return <span className="muted">—</span>
  const m = r.runway
  const style = m !== null && m !== Infinity && m < 12 ? { color: DOWN, fontWeight: 700 } : undefined
  const tip = `결산(${r.fy}) 기준 ${runwayLabel(r.runwayFy)} → 지금 추정 ${runwayLabel(m)}. 유동성 = 현금성자산${r.liq ? ' + 단기금융상품' : '(단기금융상품 미확인 — 실제보다 짧게 나올 수 있음)'} ÷ 월 영업손실`
  return <span style={{ whiteSpace: 'nowrap', ...style }} title={tip}>{runwayLabel(m)}{r.liq || m === Infinity ? '' : <span className="muted sm">*</span>}</span>
}

// 펼침 — 감사보고서 재무·신호·주주 조합
function DartDetail({ r, c }) {
  if (!r) {
    return (
      <div className="muted sm" style={{ lineHeight: 1.7 }}>
        공시분석(감사보고서)에서 이 회사를 찾지 못했습니다. 외부감사 대상이 아닌 소규모 회사이거나, 이름 표기가 달라 연결되지 않았을 수 있습니다.
        {c?.rounds?.length > 0 && <Rounds rounds={c.rounds} />}
      </div>
    )
  }
  const exp = expiringFunds(r, 24)
  const sig = []
  if (r.runway !== null && r.runway !== Infinity && r.runway < 12) sig.push(r.runway <= 0 ? '현금 소진 추정 — 그 사이 자금 조달했는지 확인 필요' : `추정 런웨이 ${r.runway}개월 — 다음 라운드 임박`)
  if (c?.hidden) sig.push(`뉴스에 없는 ${c.hidden}년 증자(감사보고서상 투자자본 급증)`)
  if (r.gc) sig.push('계속기업 불확실성 — 위험 신호이자 브릿지 투자 협상력')
  if (r.impaired) sig.push('자본잠식(RCPS 부채 반영 후)')
  if (exp.length) sig.push(`주주 조합 ${exp.length}개가 2년 내 만기 — 신주+구주 묶음 제안 가능`)
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
      {r.hist?.length > 0 ? (
        <div className="scroll-box" style={{ maxWidth: '100%' }}>
          <table className="tbl" style={{ fontSize: 12, minWidth: 320 }}>
            <thead><tr><th>사업연도</th><th style={{ textAlign: 'right' }}>매출</th><th style={{ textAlign: 'right' }}>영업이익</th><th style={{ textAlign: 'right' }}>현금</th></tr></thead>
            <tbody>
              {r.hist.slice().reverse().map((h) => (
                <tr key={h[0]}>
                  <td className="muted">{h[0]}</td>
                  <td style={{ textAlign: 'right' }}>{eok(h[1])}</td>
                  <td style={{ textAlign: 'right', color: signColor(h[2]) }}>{eok(h[2])}</td>
                  <td style={{ textAlign: 'right' }}>{eok(h[3])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="muted sm">{r.fy} 매출 {eok(r.rev)} · 순이익 {eok(r.ni)} · 현금 {eok(r.cash)}<br />(설립연도 필터 밖 회사라 연도별 이력 없이 최신 요약만 있습니다)</div>
      )}
      <div style={{ fontSize: 12.5, lineHeight: 1.75, minWidth: 220, flex: 1 }}>
        <div>
          {r.grade && <><Grade g={r.grade} /> {r.why.join(' · ') || '해당 신호 없음'} · </>}
          {r.hist?.length > 1 && <Spark hist={r.hist} />} 런웨이 <RunwayCell r={r} />
          <span className="muted"> (결산 기준 {runwayLabel(r.runwayFy)} · 현금 {eok(r.cash)}{r.liq ? ` + 단기금융상품 ${eok(r.stfi || 0)}` : ''} · 영업이익 {eok(r.op)})</span>
          {r.opinion && <span className="muted"> · 감사의견 {r.opinion}</span>}
        </div>
        {sig.length > 0 && <ul style={{ margin: '4px 0', paddingLeft: 18 }}>{sig.map((x, i) => <li key={i}>{x}</li>)}</ul>}
        {r.funds?.length > 0 && (
          <div style={{ marginTop: 4 }}>
            <strong>감사보고서 주주 조합 {r.funds.length}개</strong>
            {r.funds.map((f, i) => {
              const soon = f.asso && exp.includes(f)
              return (
                <div key={i} className="muted" style={{ fontSize: 12 }}>
                  · {f.name}{f.asso ? ` — ${f.asso.회사명} · 만기 ${f.asso.만기일}` : ' — DIVA 미등록(신기술조합·해외펀드 등)'}
                  {soon && <span className="warn-txt"> 만기 임박</span>}
                </div>
              )
            })}
          </div>
        )}
        {c?.rounds?.length > 0 && <Rounds rounds={c.rounds} />}
        <div style={{ marginTop: 4 }}>
          <a href={dartUrl(r.rcept_no)} target="_blank" rel="noreferrer">감사보고서 원문 ↗</a>
          {r.url && <> · <a href={/^https?:/.test(r.url) ? r.url : `http://${r.url}`} target="_blank" rel="noreferrer">홈페이지 ↗</a></>}
        </div>
      </div>
    </div>
  )
}

function Rounds({ rounds }) {
  return (
    <div style={{ marginTop: 4 }}>
      <strong style={{ fontSize: 12.5 }}>투자 라운드(뉴스) {rounds.length}건</strong>
      {rounds.slice(0, 4).map((x, i) => (
        <div key={i} className="muted" style={{ fontSize: 12 }}>· {x.date} · {x.stage || '—'} · {x.amount || '—'}{x.investors ? ` · ${x.investors}` : ''}</div>
      ))}
    </div>
  )
}

// ───────────────────────── 구주 후보 ─────────────────────────
function Secondary({ idx }) {
  const [months, setMonths] = useState(24)
  const [includePast, setIncludePast] = useState(true)
  const [q, setQ] = useState('')
  const [onlyPf, setOnlyPf] = useState(false)
  const [onlyHeld, setOnlyHeld] = useState(false)
  const [open, setOpen] = useState(null)
  const until = addMonths(months)
  const todayS = TODAY.toISOString().slice(0, 10)

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase()
    const out = []
    idx.firms.forEach((f, i) => {
      if (kw && !f.n.toLowerCase().includes(kw)) return
      const funds = idx.fundsByFirm[i].filter((a) => a.만기일 && a.만기일 <= until && (includePast || a.만기일 >= todayS))
      if (!funds.length) return
      const pfRows = idx.byFirm[i].filter((r) => !(r[4] && EXITED.test(r[4])))
      if (onlyPf && !pfRows.length) return
      // 감사보고서 주주표에 이 만기 조합이 나오는 회사 = 조합 단위로 보유가 확인된 구주
      const held = new Map()
      for (const a of funds) for (const d of idx.links?.holders.get(normFund(a.조합명)) || []) {
        if (!held.has(d.corp_code)) held.set(d.corp_code, { d, funds: [] })
        held.get(d.corp_code).funds.push(a)
      }
      if (onlyHeld && !held.size) return
      out.push({
        i, f, funds, held,
        eok: funds.reduce((s, a) => s + a._eok, 0),
        first: funds.map((a) => a.만기일).sort()[0],
        pf: pfRows,
      })
    })
    return out.sort((a, b) => b.eok - a.eok)
  }, [idx, until, includePast, q, onlyPf, onlyHeld, todayS])

  return (
    <div>
      <div className="card section-intro-card">
        <div className="muted">
          만기가 다가온 조합을 가진 운용사는 회수(구주 매각) 압력이 커집니다. 기간 안에 만기가 오는 조합의 결성총액이 큰 순서로 보여주고,
          운용사를 누르면 조합과 아직 엑싯하지 않은 포트폴리오(홈페이지 기준)가 펼쳐집니다.
          '주주 확인'은 감사보고서 주주 명단에 그 만기 조합이 직접 나오는 회사로, 조합 단위로 보유가 확인된 구주입니다.
        </div>
      </div>
      <div className="lp-bar">
        <input className="pl-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 운용사명 검색..." />
        <select value={months} onChange={(e) => setMonths(Number(e.target.value))} aria-label="만기 기간">
          {[6, 12, 18, 24, 36].map((m) => <option key={m} value={m}>{m}개월 내 만기</option>)}
        </select>
        <label className="pl-check"><input type="checkbox" checked={includePast} onChange={(e) => setIncludePast(e.target.checked)} /> 만기 지난 조합 포함</label>
        <label className="pl-check"><input type="checkbox" checked={onlyPf} onChange={(e) => setOnlyPf(e.target.checked)} /> 포트폴리오 있는 곳만</label>
        <label className="pl-check"><input type="checkbox" checked={onlyHeld} onChange={(e) => setOnlyHeld(e.target.checked)} /> 주주 확인 회사 있는 곳만</label>
        <span className="muted" style={{ fontSize: 12.5 }}>{rows.length}개 운용사</span>
      </div>
      <div className="card">
        {rows.length === 0 ? <div className="list-empty">조건에 맞는 운용사가 없습니다.</div> : (
          <div className="scroll-box">
            <table className="tbl tbl-grid">
              <thead><tr>
                <th>운용사</th><th style={{ textAlign: 'right' }}>만기 조합</th><th style={{ textAlign: 'right' }}>결성총액 합계</th>
                <th>가장 빠른 만기</th><th style={{ textAlign: 'right' }}>포트폴리오(엑싯 제외)</th><th style={{ textAlign: 'right' }} title="감사보고서 주주 명단에 만기 조합이 나오는 회사 수">주주 확인</th>
              </tr></thead>
              <tbody>
                {rows.slice(0, CAP).map((r) => (
                  <Fragment key={r.i}>
                    <tr className="row-click" onClick={() => setOpen(open === r.i ? null : r.i)}>
                      <td><strong>{open === r.i ? '▾ ' : '▸ '}{r.f.n}</strong> <span className="muted sm">{r.f.t}</span></td>
                      <td style={{ textAlign: 'right' }}>{r.funds.length}</td>
                      <td style={{ textAlign: 'right' }}>{fmtEok(r.eok)}</td>
                      <td className={r.first < todayS ? 'warn-txt' : ''}>{r.first}{r.first < todayS ? ' (경과)' : ''}</td>
                      <td style={{ textAlign: 'right' }}>{r.pf.length ? r.pf.length : <span className="muted">{r.f.st === '수집완료' || r.f.st === '일부수집' ? 0 : '미수집'}</span>}</td>
                      <td style={{ textAlign: 'right' }}>{r.held.size ? <strong>{r.held.size}</strong> : <span className="muted">—</span>}</td>
                    </tr>
                    {open === r.i && (
                      <tr className="detail-row"><td colSpan={6}><FirmDetail r={r} idx={idx} /></td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > CAP && <div className="muted sm" style={{ marginTop: 8 }}>상위 {CAP}곳만 표시 — 검색으로 좁혀 보세요.</div>}
      </div>
    </div>
  )
}

function FirmDetail({ r, idx }) {
  const [q, setQ] = useState('')
  const kw = normName(q)
  const heldCodes = r.held
  const pf = r.pf
    .map((x) => {
      const c = idx.comp.get(normName(x[1]))
      return { name: x[1], sector: x[2], state: x[4], logo: x[5], first: x[6], auto: x[8], c, held: c?.dart ? heldCodes.get(c.dart.corp_code) : null }
    })
    .filter((x) => !kw || normName(x.name).includes(kw) || normName(x.sector).includes(kw))
    .sort((a, b) => {
      if (!!a.held !== !!b.held) return a.held ? -1 : 1 // 만기 조합 보유가 확인된 회사 먼저
      const x = a.c?.tDate || '9999', y = b.c?.tDate || '9999'; return x < y ? -1 : x > y ? 1 : 0 // 마지막 투자가 오래된 순(구주 우선), 기록 없는 회사는 뒤로
    })
  const pfCodes = new Set(pf.map((x) => x.c?.dart?.corp_code).filter(Boolean))
  const heldOutside = [...heldCodes.values()].filter((h) => !pfCodes.has(h.d.corp_code))
  return (
    <div className="firm-detail">
      <div className="fd-sec">
        <div className="fd-title">만기 조합 {r.funds.length}개</div>
        <div className="fd-funds">
          {r.funds.sort((a, b) => (a.만기일 < b.만기일 ? -1 : 1)).map((a, i) => {
            const hs = idx.links?.holders.get(normFund(a.조합명)) || []
            return (
              <div key={i} className="fd-fund">
                <span>{a.조합명}</span><span className="muted">만기 {a.만기일} · {fmtEok(a._eok)} · {a.투자분야구분}</span>
                {hs.length > 0 && <span style={{ flexBasis: '100%', fontSize: 12.5 }}>주주 확인: {hs.map((d) => d.name).join(', ')}</span>}
              </div>
            )
          })}
        </div>
      </div>
      {heldOutside.length > 0 && (
        <div className="fd-sec">
          <div className="fd-title">홈페이지에 없지만 감사보고서로 확인된 보유 회사 {heldOutside.length}곳</div>
          <div className="sc-chips">
            {heldOutside.map((h) => (
              <a key={h.d.corp_code} className="chip" href={dartUrl(h.d.rcept_no)} target="_blank" rel="noreferrer" title={h.funds.map((a) => a.조합명).join(', ')}>
                {h.d.grade && <Grade g={h.d.grade} />} {h.d.name} · 매출 {eok(h.d.rev)}
              </a>
            ))}
          </div>
        </div>
      )}
      <div className="fd-sec">
        <div className="fd-title">
          포트폴리오 {r.pf.length}곳 <span className="muted sm">(주주 확인 회사 먼저, 그다음 마지막 투자가 오래된 순 — 주주 확인이 없는 회사는 운용사 전체 기준)</span>
          {r.f.hp && <a className="linklike sm" href={r.f.pp || r.f.hp} target="_blank" rel="noreferrer"> 홈페이지 ↗</a>}
        </div>
        {r.pf.length === 0 ? <div className="muted sm">홈페이지에서 포트폴리오를 수집하지 못한 운용사입니다({r.f.st}).</div> : (
          <>
            <input className="pl-search" style={{ margin: '6px 0' }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="회사명·분야로 좁히기" />
            <div className="scroll-box fd-scroll">
              <table className="tbl">
                <thead><tr><th>회사</th><th>분야(사이트)</th><th>마지막 라운드</th><th>공시 재무</th><th>공동 투자 운용사</th></tr></thead>
                <tbody>
                  {pf.slice(0, 300).map((x, i) => (
                    <tr key={i}>
                      <td><strong>{x.name}</strong>{x.held ? <span className="badge" style={{ marginLeft: 6, fontWeight: 700, ...NOWRAP }} title={x.held.funds.map((a) => a.조합명).join(', ')}>만기 조합 주주 확인</span> : null}{x.logo ? <span className="muted sm"> (로고 링크)</span> : null}{x.auto ? <span className="muted sm"> (자동수집)</span> : null}{x.first && x.first > BASE_DATE ? <span className="badge" style={{ marginLeft: 6, ...NOWRAP }}>신규 {x.first.slice(5)}</span> : null}</td>
                      <td className="muted">{x.sector || '—'}</td>
                      <td className="muted"><LastRound c={x.c} /></td>
                      <td><DartCell r={x.c?.dart} /></td>
                      <td className="muted">{x.c ? x.c.vcN : 1}곳{x.c?.listed ? ' · 상장' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ───────────────────────── 신주 후보 ─────────────────────────
const STAGE_GROUPS = {
  all: { label: '전체 단계', re: null },
  early: { label: '시드·프리A', re: /시드|seed|프리|pre/i },
  a: { label: '시리즈A', re: /시리즈\s*a(?!\w)|series\s*a/i },
  b: { label: '시리즈B 이상', re: /시리즈\s*[b-z]|series\s*[b-z]|pre-ipo|프리ipo|브릿지|bridge/i },
}
const PSORTS = {
  vc: '검증순(투자 운용사 많은 순)',
  runway: '런웨이 짧은 순',
  growth: '매출 성장률 높은 순',
  grade: '공시 등급 순',
  old: '마지막 투자 오래된 순',
}
const gradeIdx = (g) => (g ? GRADES.indexOf(g) : 99)
function Primary({ idx }) {
  const [minM, setMinM] = useState(12)
  const [maxM, setMaxM] = useState(30)
  const [minVc, setMinVc] = useState(2)
  const [stage, setStage] = useState('all')
  const [q, setQ] = useState('')
  const [noRound, setNoRound] = useState(false)
  const [exclIpo, setExclIpo] = useState(false)
  const [onlyDart, setOnlyDart] = useState(false)
  const [shortRun, setShortRun] = useState(false)
  const [gradeA, setGradeA] = useState(false)
  const [expSoon, setExpSoon] = useState(false)
  const [sort, setSort] = useState('vc')
  const [open, setOpen] = useState(null)

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase()
    const re = STAGE_GROUPS[stage].re
    const out = []
    for (const c of idx.comp.values()) {
      if (c.exited || c.listed) continue
      if (exclIpo && c.inIpo) continue
      if (c.vcN < minVc) continue
      if (kw && !(c.name.toLowerCase().includes(kw) || (c.sector || '').toLowerCase().includes(kw))) continue
      const d = c.dart
      if (onlyDart && !d) continue
      if (shortRun && !(d && d.runway !== null && d.runway !== Infinity && d.runway < 12)) continue
      if (gradeA && !(d?.grade === 'S' || d?.grade === 'A')) continue
      if (expSoon && !c.exp.length) continue
      if (!c.tDate) { if (noRound) out.push({ c, m: null }); continue }
      const m = monthsSince(c.tDate)
      if (m < minM || m > maxM) continue
      if (re && !(c.tSrc === 'round' && re.test(c.last.stage || ''))) continue
      out.push({ c, m })
    }
    const val = {
      vc: (x) => -x.c.vcN,
      runway: (x) => { const r = x.c.dart?.runway; return r === null || r === undefined ? 1e9 : r === Infinity ? 1e8 : r },
      growth: (x) => { const g = x.c.dart?.rev_g; return g === null || g === undefined ? 1e9 : -g },
      grade: (x) => gradeIdx(x.c.dart?.grade),
      old: (x) => (x.m === null ? 1e9 : -x.m),
    }[sort]
    return out.sort((a, b) => val(a) - val(b) || b.c.vcN - a.c.vcN || (b.m ?? -1) - (a.m ?? -1))
  }, [idx, minM, maxM, minVc, stage, q, noRound, exclIpo, onlyDart, shortRun, gradeA, expSoon, sort])

  const linked = rows.filter((x) => x.c.dart).length
  return (
    <div>
      <div className="card section-intro-card">
        <div className="muted">
          마지막 투자 후 일정 기간이 지나 다음 라운드를 준비할 시점의 회사입니다. 투자한 운용사가 많을수록(검증된 회사) 위에 옵니다.
          투자 운용사는 운용사 홈페이지와 감사보고서 주주 명단(조합 → 운용사)을 합쳐 셉니다. 마지막 투자는 뉴스 라운드와 감사보고서상 증자 연도 중 늦은 쪽을 씁니다.
          상장사와 홈페이지에 엑싯 표시가 있는 회사는 뺐고, 상장 절차가 진행 중인 회사는 'IPO 진행' 표시가 붙습니다. 행을 누르면 감사보고서 재무·주주 조합이 펼쳐집니다.
        </div>
      </div>
      <div className="lp-bar">
        <input className="pl-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 회사명·분야 키워드..." />
        <select value={minM} onChange={(e) => setMinM(Number(e.target.value))} aria-label="최소 경과">
          {[0, 6, 12, 18, 24].map((m) => <option key={m} value={m}>마지막 투자 {m}개월 이상</option>)}
        </select>
        <select value={maxM} onChange={(e) => setMaxM(Number(e.target.value))} aria-label="최대 경과">
          {[18, 24, 30, 36, 48, 120].map((m) => <option key={m} value={m}>{m === 120 ? '상한 없음' : `${m}개월 이하`}</option>)}
        </select>
        <select value={minVc} onChange={(e) => setMinVc(Number(e.target.value))} aria-label="투자 운용사 수">
          {[1, 2, 3, 5].map((n) => <option key={n} value={n}>투자 운용사 {n}곳 이상</option>)}
        </select>
        <select value={stage} onChange={(e) => setStage(e.target.value)} aria-label="단계">
          {Object.entries(STAGE_GROUPS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="정렬">
          {Object.entries(PSORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="pl-check"><input type="checkbox" checked={noRound} onChange={(e) => setNoRound(e.target.checked)} /> 투자 기록 없는 회사 포함</label>
        <label className="pl-check"><input type="checkbox" checked={exclIpo} onChange={(e) => setExclIpo(e.target.checked)} /> 상장 절차 진행 중 제외</label>
      </div>
      <div className="lp-bar">
        <span className="muted" style={{ fontSize: 12.5, fontWeight: 700 }}>공시 조건</span>
        <label className="pl-check"><input type="checkbox" checked={onlyDart} onChange={(e) => setOnlyDart(e.target.checked)} /> 공시 연결된 회사만</label>
        <label className="pl-check"><input type="checkbox" checked={shortRun} onChange={(e) => setShortRun(e.target.checked)} /> 런웨이 12개월 미만</label>
        <label className="pl-check"><input type="checkbox" checked={gradeA} onChange={(e) => setGradeA(e.target.checked)} /> 등급 A 이상</label>
        <label className="pl-check"><input type="checkbox" checked={expSoon} onChange={(e) => setExpSoon(e.target.checked)} /> 주주 조합 2년 내 만기(신주+구주)</label>
        <span className="muted" style={{ fontSize: 12.5 }}>{rows.length.toLocaleString()}곳 · 공시 연결 {linked.toLocaleString()}곳</span>
      </div>
      <div className="card">
        {rows.length === 0 ? <div className="list-empty">조건에 맞는 회사가 없습니다.</div> : (
          <div className="scroll-box">
            <table className="tbl" style={{ minWidth: 980 }}>
              <thead><tr>
                <th>회사</th><th>분야</th><th>마지막 투자</th><th style={{ textAlign: 'right' }}>경과</th>
                <th>공시 재무(등급·매출·YoY)</th><th style={{ textAlign: 'right' }}>런웨이</th><th>투자 운용사</th>
              </tr></thead>
              <tbody>
                {rows.slice(0, CAP).map(({ c, m }) => {
                  const names = [...[...c.firms].map((i) => idx.firms[i].n), ...c.gpExtra]
                  const isOpen = open === c.key
                  return (
                    <Fragment key={c.key}>
                      <tr className="row-click" onClick={() => setOpen(isOpen ? null : c.key)}>
                        <td>
                          <strong>{isOpen ? '▾ ' : '▸ '}{c.name}</strong>
                          {c.inIpo && <span className="badge" style={{ marginLeft: 6, ...NOWRAP }}>IPO 진행</span>}
                          {c.exp.length > 0 && <span className="badge" style={{ marginLeft: 6, ...NOWRAP }} title={c.exp.map((f) => `${f.asso.조합명} (${f.asso.만기일})`).join(', ')}>주주 조합 만기 {c.exp[0].asso.만기일.slice(0, 7)}</span>}
                          {c.dart?.gc && <span className="badge" style={{ marginLeft: 6, color: DOWN, ...NOWRAP }}>계속기업⚠</span>}
                        </td>
                        <td className="muted">{c.sector || c.dart?.sector || '—'}</td>
                        <td className="muted"><LastRound c={c} /></td>
                        <td style={{ textAlign: 'right' }}>{m == null ? '—' : `${m}개월`}{c.tSrc === 'dart' && m != null ? <span className="muted sm"> (공시)</span> : null}</td>
                        <td><DartCell r={c.dart} /></td>
                        <td style={{ textAlign: 'right' }}><RunwayCell r={c.dart} /></td>
                        <td className="muted wrap" title={names.join(', ')}>
                          {c.vcN}곳 · {names.slice(0, 3).join(', ')}{names.length > 3 ? ' 외' : ''}
                          {c.gpExtra.length > 0 && <span className="sm" title={`감사보고서로 찾은 운용사: ${c.gpExtra.join(', ')}`}> (공시 +{c.gpExtra.length})</span>}
                        </td>
                      </tr>
                      {isOpen && <tr className="detail-row"><td colSpan={7}><div className="firm-detail"><DartDetail r={c.dart} c={c} /></div></td></tr>}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > CAP && <div className="muted sm" style={{ marginTop: 8 }}>상위 {CAP}곳만 표시 — 키워드·조건으로 좁혀 보세요.</div>}
        <div className="muted sm" style={{ marginTop: 8, lineHeight: 1.6 }}>
          런웨이 = (현금성자산 + 단기금융상품) ÷ 월 영업손실 − 결산 후 지난 개월 수. 감사보고서는 1년에 한 번(4~6월) 나오므로 그 사이 조달한 자금은 반영되지 않습니다.
          * 표시는 단기금융상품을 아직 확인하지 못해 현금성자산만으로 계산한 값(실제보다 짧게 나올 수 있음)입니다.
          공시는 외부감사 대상 회사만 있어 초기 회사는 대부분 연결되지 않습니다. 이름이 잘못 연결된 회사는 dart-alias.json에서 바로잡을 수 있습니다.
        </div>
      </div>
    </div>
  )
}

// ───────────────────────── 공시 발굴 ─────────────────────────
// 감사보고서에 투자 흔적(VC 주주 조합·RCPS·투자유치)이 있는데 소싱 데이터(홈페이지·뉴스)에는 없는 회사
const DGRADES = { sa: 'S·A 등급', sab: 'B 등급 이상', all: '전체 등급(F 제외)' }
function Discover({ idx }) {
  const [q, setQ] = useState('')
  const [g, setG] = useState('sab')
  const [recent, setRecent] = useState(true)
  const [shortRun, setShortRun] = useState(false)
  const [expSoon, setExpSoon] = useState(false)
  const [open, setOpen] = useState(null)
  const thisYear = TODAY.getFullYear()

  const rows = useMemo(() => {
    if (!idx.links) return []
    const kw = q.trim().toLowerCase()
    const ok = { sa: ['S', 'A'], sab: ['S', 'A', 'B'], all: ['S', 'A', 'B', 'C'] }[g]
    return idx.links.rows.filter((r) => {
      if (r.lite || idx.linkedCodes.has(r.corp_code) || idx.listed.has(normName(r.name))) return false
      if (!(r.funds.length || r.rcps || r.lastRaise)) return false
      if (!ok.includes(r.grade)) return false
      if (recent && !(r.lastRaise && thisYear - r.lastRaise <= 2)) return false
      if (shortRun && !(r.runway !== null && r.runway !== Infinity && r.runway < 12)) return false
      if (expSoon && !expiringFunds(r, 24).length) return false
      if (kw && !(r.name.toLowerCase().includes(kw) || (r.sector || '').toLowerCase().includes(kw))) return false
      return true
    }).sort((a, b) => gradeIdx(a.grade) - gradeIdx(b.grade) || (b.rev_g ?? -1e9) - (a.rev_g ?? -1e9))
  }, [idx, q, g, recent, shortRun, expSoon, thisYear])

  if (!idx.links) return <div className="card"><div className="list-empty">공시 데이터를 불러오는 중…</div></div>
  return (
    <div>
      <div className="card section-intro-card">
        <div className="muted">
          감사보고서에 VC 주주 조합·상환전환우선주·투자유치(투자자본 급증) 흔적이 있는데, 운용사 홈페이지·투자 뉴스에는 잡히지 않은 회사입니다.
          아직 시장에 덜 알려진 신주 후보로 볼 수 있습니다. 상장사는 뺐고, 등급이 높고 매출 성장률이 높은 순으로 보여줍니다.
        </div>
      </div>
      <div className="lp-bar">
        <input className="pl-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 회사명·업종 키워드..." />
        <select value={g} onChange={(e) => setG(e.target.value)} aria-label="등급">
          {Object.entries(DGRADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="pl-check"><input type="checkbox" checked={recent} onChange={(e) => setRecent(e.target.checked)} /> 최근 2년 내 투자유치</label>
        <label className="pl-check"><input type="checkbox" checked={shortRun} onChange={(e) => setShortRun(e.target.checked)} /> 런웨이 12개월 미만</label>
        <label className="pl-check"><input type="checkbox" checked={expSoon} onChange={(e) => setExpSoon(e.target.checked)} /> 주주 조합 2년 내 만기</label>
        <span className="muted" style={{ fontSize: 12.5 }}>{rows.length.toLocaleString()}곳</span>
      </div>
      <div className="card">
        {rows.length === 0 ? <div className="list-empty">조건에 맞는 회사가 없습니다.</div> : (
          <div className="scroll-box">
            <table className="tbl" style={{ minWidth: 900 }}>
              <thead><tr>
                <th>회사</th><th>업종</th><th>공시 재무(등급·매출·YoY)</th><th>최근 투자유치</th>
                <th style={{ textAlign: 'right' }}>런웨이</th><th>주주 조합(운용사)</th>
              </tr></thead>
              <tbody>
                {rows.slice(0, CAP).map((r) => {
                  const isOpen = open === r.corp_code
                  const gps = [...new Set(r.funds.map((f) => f.asso?.회사명 || f.name))]
                  return (
                    <Fragment key={r.corp_code}>
                      <tr className="row-click" onClick={() => setOpen(isOpen ? null : r.corp_code)}>
                        <td><strong>{isOpen ? '▾ ' : '▸ '}{r.name}</strong> <span className="muted sm">{r.est}년 설립</span>{r.rcps && <span className="badge" style={{ marginLeft: 6, ...NOWRAP }}>RCPS</span>}</td>
                        <td className="muted">{r.sector || '—'}</td>
                        <td><DartCell r={r} /></td>
                        <td className="muted">{r.lastRaise ? `${r.lastRaise}년` : '—'}</td>
                        <td style={{ textAlign: 'right' }}><RunwayCell r={r} /></td>
                        <td className="muted wrap" title={gps.join(', ')}>{gps.length ? `${gps.slice(0, 2).join(', ')}${gps.length > 2 ? ` 외 ${gps.length - 2}` : ''}` : '—'}</td>
                      </tr>
                      {isOpen && <tr className="detail-row"><td colSpan={6}><div className="firm-detail"><DartDetail r={r} /></div></td></tr>}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > CAP && <div className="muted sm" style={{ marginTop: 8 }}>상위 {CAP}곳만 표시 — 키워드·조건으로 좁혀 보세요.</div>}
      </div>
    </div>
  )
}

// ───────────────────────── 포트폴리오사 검색 ─────────────────────────
function Search({ idx }) {
  const [q, setQ] = useState('')
  const kw = normName(q)
  const rows = useMemo(() => {
    if (kw.length < 2) return []
    const out = []
    for (const c of idx.comp.values()) if (c.key.includes(kw) || normName(c.sector).includes(kw)) out.push(c)
    return out.sort((a, b) => b.firms.size - a.firms.size).slice(0, 60)
  }, [idx, kw])
  return (
    <div>
      <div className="lp-bar">
        <input className="pl-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 회사명 또는 분야 (2글자 이상)" autoFocus />
        <span className="muted" style={{ fontSize: 12.5 }}>{kw.length < 2 ? '' : `${rows.length}곳${rows.length === 60 ? ' (상위 60)' : ''}`}</span>
      </div>
      {kw.length >= 2 && rows.length === 0 && <div className="card"><div className="list-empty">찾는 회사가 없습니다. 한글/영문 표기를 바꿔 검색해 보세요.</div></div>}
      <div className="search-cards">
        {rows.map((c) => (
          <div key={c.key} className="card sc-card">
            <div className="sc-head">
              <strong>{c.name}</strong>
              {c.listed && <span className="badge">상장</span>}
              {c.inIpo && <span className="badge">IPO 진행</span>}
              {c.exited && !c.listed && <span className="badge">엑싯 표시</span>}
              <span className="muted sm">{c.sector}</span>
            </div>
            <div className="sc-sec"><span className="sc-lbl">홈페이지 기준 투자 운용사 {c.firms.size}곳</span>
              <div className="sc-chips">{[...c.firms].map((i) => <span key={i} className="chip">{idx.firms[i].n}</span>)}</div>
            </div>
            {c.dart && (
              <div className="sc-sec"><span className="sc-lbl">공시(감사보고서) — 런웨이 <RunwayCell r={c.dart} /></span>
                <DartCell r={c.dart} /> <a className="sm" href={dartUrl(c.dart.rcept_no)} target="_blank" rel="noreferrer">원문 ↗</a>
                {c.gpExtra.length > 0 && <div className="muted sm">감사보고서로 찾은 운용사: {c.gpExtra.join(', ')}</div>}
              </div>
            )}
            {c.rounds.length > 0 && (
              <div className="sc-sec"><span className="sc-lbl">투자 라운드 {c.rounds.length}건</span>
                {c.rounds.slice(0, 6).map((r, i) => (
                  <div key={i} className="sc-round"><span>{r.date}</span><span>{r.stage || '—'}</span><span>{r.amount || '—'}</span><span className="muted wrap">{r.investors || ''}</span></div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
