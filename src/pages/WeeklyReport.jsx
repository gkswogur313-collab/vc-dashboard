import { useEffect, useMemo, useState } from 'react'
import { useData } from '../useData.js'
import { BriefBody } from '../components/WeeklyBrief.jsx'
import { SemiWeeklyBody } from '../components/SemiBriefing.jsx'

// JH Weekly Report — 매주 월요일 Claude 예약 작업이 만드는 종합 주간 리포트
// ① 업계 뉴스 레이더(vc-news) ② 산업 트래킹 주간 브리핑 ③ IPO(전주·금주 — 심사청구·심사승인·수요예측·상장) ④ 신규 펀딩(+주목 딜 뉴스 요약)
// 데이터: public/data/weekly/index.json + <주 시작일>.json · 워드: public/briefs/weekly/<id>.docx · 작성 규칙: scripts/weekly/GUIDE.md

const BASE = import.meta.env.BASE_URL
const fmt = (g) => (g ? `${g.from.replace(/-/g, '.')} ~ ${g.to.slice(5).replace('-', '.')}` : '')
const CATS = ['자금조달', '규제정책', '기술제품', '회수', '인력조직']
const STAGE = { 청구: '심사청구', 승인: '심사승인', 수요예측: '수요예측', 상장: '상장' }
const addDaysStr = (s, n) => new Date(Date.parse(s + 'T00:00:00Z') + n * 86400e3).toISOString().slice(0, 10)
const md = (d) => (d || '').slice(5).replace('-', '/')
const ipoDate = (x) => (x.기간 ? x.기간.split('~').map(md).join('~') : md(x.날짜))

function Cite({ n, refs }) {
  const r = refs.get(n)
  if (!r) return <sup className="wb-cite wb-cite-miss">[{n}]</sup>
  return (
    <a className="wb-cite" href={r.링크} target="_blank" rel="noreferrer">
      {n}<span className="wb-tip" role="tooltip"><b>{r.매체}</b>{r.날짜 ? ` · ${r.날짜}` : ''}<span className="wb-tip-title">{r.제목}</span></span>
    </a>
  )
}
function T({ text, refs }) {
  const s = String(text || ''); const out = []; let last = 0
  for (const m of s.matchAll(/\s*\[(\d+)\]/g)) {
    if (m.index > last) out.push(s.slice(last, m.index))
    out.push(<Cite key={m.index} n={+m[1]} refs={refs} />)
    last = m.index + m[0].length
  }
  if (last < s.length) out.push(s.slice(last))
  return <>{out}</>
}

export default function WeeklyReport() {
  const { data: index, error } = useData('weekly/index.json')
  const weeks = index?.weeks || []
  const [sel, setSel] = useState('')
  const id = sel || weeks[0]?.id || ''
  const [w, setW] = useState(null)
  const [err, setErr] = useState('')
  const [showAllFunding, setShowAllFunding] = useState(false)
  const [brief, setBrief] = useState(null)
  const [semi, setSemi] = useState(null)

  useEffect(() => {
    if (!id) return
    let alive = true
    setW(null); setErr(''); setShowAllFunding(false)
    fetch(`${BASE}data/weekly/${id}.json`)
      .then((r) => { if (!r.ok) throw new Error(`리포트 로드 실패 (${r.status})`); return r.json() })
      .then((d) => { if (alive) setW(d) })
      .catch((e) => { if (alive) setErr(e.message) })
    // ② 산업 트래킹 — 같은 주 주간 브리핑 원본을 그대로 불러와 보여 준다(요약하지 않음)
    setBrief(null)
    fetch(`${BASE}data/briefs/${id}.json`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive) setBrief(d) }).catch(() => {})
    // ③ 반도체 브리핑 — 같은 주 반도체 주간 브리핑 원본(출처 번호는 S1, S2…)
    setSemi(null)
    fetch(`${BASE}data/semi/weekly/${id}.json`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive) setSemi(d) }).catch(() => {})
    return () => { alive = false }
  }, [id])

  const refs = useMemo(() => new Map((w?.refs || []).map((r) => [r.n, r])), [w])
  const idx = weeks.findIndex((x) => x.id === id)

  if (error || (index && !weeks.length)) {
    return <div className="card"><div className="list-empty">아직 발행된 JH Weekly Report가 없습니다. 매주 월요일 오전에 지난주 리포트가 올라옵니다.</div></div>
  }
  if (!index) return <div className="card"><div className="list-empty">불러오는 중…</div></div>

  const R = w?.레이더 || {}
  const F = w?.펀딩 || {}
  const list = showAllFunding ? F.목록 || [] : (F.목록 || []).slice(0, 15)

  return (
    <div className="wb wr">
      <div className="wb-bar">
        <div className="wb-nav">
          <button className="btn-ghost wb-step" disabled={idx >= weeks.length - 1} onClick={() => setSel(weeks[idx + 1].id)} aria-label="이전 주">‹</button>
          <select value={id} onChange={(e) => setSel(e.target.value)} aria-label="주차 선택">
            {weeks.map((x, i) => <option key={x.id} value={x.id}>{fmt(x.기간)}{i === 0 ? ' (최신)' : ''}</option>)}
          </select>
          <button className="btn-ghost wb-step" disabled={idx <= 0} onClick={() => setSel(weeks[idx - 1].id)} aria-label="다음 주">›</button>
        </div>
        <a className="btn-primary wb-dl" href={`${BASE}briefs/weekly/${id}.docx`} download={`JH_Weekly_Report_${id}.docx`}>⬇ 워드로 받기</a>
      </div>

      {err && <div className="card"><div className="list-empty">{err}</div></div>}
      {!w && !err && <div className="card"><div className="list-empty">불러오는 중…</div></div>}

      {w && (
        <>
          <div className="card wb-hero">
            <div className="wb-meta">{fmt(w.기간)} · 업계 레이더 · 산업 트래킹 · 반도체 · IPO {w.IPO?.length || 0}건(전주·금주) · 신규 펀딩 {F.건수 || 0}건</div>
            <h2>이번 주 한눈에</h2>
            <ul className="wb-list">{(w.한눈에 || []).map((s, i) => <li key={i}><T text={s} refs={refs} /></li>)}</ul>
          </div>

          <h3 className="wb-sec">📡 ① 업계 뉴스 레이더</h3>
          {R.top?.length > 0 && (
            <div className="wr-top">
              {R.top.map((x, i) => (
                <div className="card wr-sig" key={i}>
                  <div className="wr-sig-no">TOP {i + 1}</div>
                  <h4 className="wr-sig-title">{x.제목}</h4>
                  <p><T text={x.사실} refs={refs} /></p>
                  {x.그래서우리는 && <p className="wr-so"><b>그래서 우리는 →</b> <T text={x.그래서우리는} refs={refs} /></p>}
                  <div className="wr-tags">{[x.확실성, x.영향, x.시간축].filter(Boolean).map((t) => <span key={t} className={'wr-tag' + (t === '단독출처' ? ' warn' : '')}>{t}</span>)}</div>
                </div>
              ))}
            </div>
          )}
          <div className="card">
            <div className="wr-cats">
              {CATS.map((c) => (
                <div key={c} className="wr-cat">
                  <h4>{c}</h4>
                  {(R.카테고리?.[c] || []).length ? (
                    <ul className="wb-list">{R.카테고리[c].map((x, i) => (
                      <li key={i}>
                        <b>{x.제목}</b> <T text={x.사실} refs={refs} />
                        {x.함의 && <span className="wr-imp"> → <T text={x.함의} refs={refs} /></span>}
                        <span className="muted" style={{ fontSize: 11.5 }}> {x.날짜}{x.확실성 === '단독출처' ? ' · 단독출처' : ''}</span>
                      </li>
                    ))}</ul>
                  ) : <p className="muted" style={{ fontSize: 13 }}>해당 없음</p>}
                </div>
              ))}
            </div>
            {R.인사이트?.length > 0 && (
              <div className="wr-insight"><h4>주간 인사이트</h4><ul className="wb-list">{R.인사이트.map((s, i) => <li key={i}><T text={s} refs={refs} /></li>)}</ul></div>
            )}
          </div>

          <h3 className="wb-sec">🏭 ② 산업 트래킹 주간 브리핑 <a className="linklike" style={{ marginTop: 0 }} href="#/industry">산업 트래킹 탭 →</a></h3>
          <div className="wr-brief">
            {brief ? <BriefBody brief={brief} /> : <div className="card"><p className="muted">이 주의 주간 브리핑이 없습니다.</p></div>}
          </div>

          <h3 className="wb-sec">🔬 ③ 반도체 주간 브리핑 <a className="linklike" style={{ marginTop: 0 }} href="#/industry">반도체 브리핑 탭 →</a></h3>
          <div className="wr-brief sb">
            {semi ? <SemiWeeklyBody w={semi} prefix="S" /> : <div className="card"><p className="muted">이 주의 반도체 브리핑이 없습니다.</p></div>}
          </div>

          <h3 className="wb-sec">📅 ④ IPO 전주·금주 <span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>심사청구 · 심사승인 · 수요예측 · 상장 (스팩 제외 · 금주는 공시 일정 기준)</span> <a className="linklike" style={{ marginTop: 0 }} href="#/ipo">IPO 탭 →</a></h3>
          <div className="card">
            {w.IPO?.length ? (
              <div className="scroll-box" style={{ '--scroll-h': '480px', minHeight: 0 }}>
                <table className="tbl wr-tbl">
                  <thead><tr><th>날짜</th><th>단계</th><th>회사</th><th>시장</th><th>주관사</th><th>한줄</th></tr></thead>
                  {['전주', '금주'].map((wk) => {
                    const rows = w.IPO.filter((x) => (x.주 || '전주') === wk)
                    const range = wk === '전주' ? w.기간 : (w.IPO기간 ? { from: addDaysStr(w.기간.to, 1), to: w.IPO기간.to } : null)
                    if (wk === '금주' && !w.IPO기간) return null
                    return (
                      <tbody key={wk}>
                        <tr className="wr-ipo-wk"><td colSpan={6}><b>{wk}</b> <span className="muted">{range ? `${md(range.from)}~${md(range.to)}` : ''}{wk === '금주' ? ' · 예정' : ''} · {rows.length}건</span></td></tr>
                        {rows.length ? rows.map((x, i) => (
                          <tr key={i}>
                            <td className="muted">{ipoDate(x)}</td>
                            <td><span className={'ipr-stage ipr-stage-' + x.단계}>{STAGE[x.단계]}</span></td>
                            <td><b>{x.회사명}</b></td>
                            <td className="muted">{x.시장}</td>
                            <td className="muted">{x.주관사}</td>
                            <td className="wr-wrap">{x.한줄 || <span className="muted">—</span>}</td>
                          </tr>
                        )) : <tr><td colSpan={6} className="muted">해당 없음</td></tr>}
                      </tbody>
                    )
                  })}
                </table>
              </div>
            ) : <p className="muted">해당 없음</p>}
          </div>

          <h3 className="wb-sec">💰 ⑤ 신규 펀딩 <span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>{F.건수 || 0}건 · 공개 금액 합계 약 {(F.공개합계억 || 0).toLocaleString()}억원</span> <a className="linklike" style={{ marginTop: 0 }} href="#/deals">Deal Market →</a></h3>
          {F.주목?.length > 0 && (
            <div className="wr-deals">
              {F.주목.map((x, i) => (
                <div className="card wr-deal" key={i}>
                  <div className="wr-deal-head"><b>{x.기업}</b><span className="wr-deal-amt">{x.금액}</span></div>
                  <div className="muted" style={{ fontSize: 12 }}>{[x.분야, x.단계].filter(Boolean).join(' · ')}</div>
                  {x.투자사 && <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>투자사: {x.투자사}</div>}
                  <ul className="wb-list" style={{ marginTop: 8, fontSize: 13 }}>{(x.내용 || []).map((s, j) => <li key={j}><T text={s} refs={refs} /></li>)}</ul>
                </div>
              ))}
            </div>
          )}
          <div className="card">
            <div className="scroll-box" style={{ '--scroll-h': '480px', minHeight: 0 }}>
              <table className="tbl wr-tbl">
                <thead><tr><th>날짜</th><th>기업</th><th>분야</th><th className="r">금액</th><th>단계</th><th>투자사</th></tr></thead>
                <tbody>{list.map((x, i) => (
                  <tr key={i}><td className="muted">{x.날짜.slice(5)}</td><td><b>{x.기업}</b></td><td className="wr-wrap">{x.분야}</td><td className="r">{x.금액}</td><td className="muted">{x.단계}</td><td className="wr-wrap muted">{x.투자사}</td></tr>
                ))}</tbody>
              </table>
            </div>
            {(F.목록 || []).length > 15 && <button className="linklike" onClick={() => setShowAllFunding((v) => !v)}>{showAllFunding ? '접기' : `전체 ${F.목록.length}건 보기`}</button>}
          </div>

          {w.refs?.length > 0 && (
            <>
              <h3 className="wb-sec">출처 <span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>{w.refs.length}건</span></h3>
              <div className="card">
                <ol className="wb-refs">{w.refs.map((r) => (
                  <li key={r.n} value={r.n}><a href={r.링크} target="_blank" rel="noreferrer" className="lp-link">{r.제목}</a><span className="muted"> · {r.매체} {r.날짜}</span></li>
                ))}</ol>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
