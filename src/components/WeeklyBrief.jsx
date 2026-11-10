import { useEffect, useMemo, useState } from 'react'
import { useData } from '../useData.js'

// 산업 트래킹 › 주간 브리핑 — 매주 월요일 Claude 예약 작업이 만든 브리핑(기술 스터디·업계 동향).
// 데이터: public/data/briefs/index.json(주차 목록) + public/data/briefs/<주 시작일>.json
// 워드: public/briefs/<주 시작일>.docx  · 작성 규칙: scripts/brief/GUIDE.md
// 본문의 [n]은 출처 번호 → 누르면 원문 리포트가 새 탭으로 열린다.

const fmtRange = (g) => (g ? `${g.from.replace(/-/g, '.')} ~ ${g.to.slice(5).replace('-', '.')}` : '')

function Cite({ n, refs }) {
  const r = refs.get(n)
  if (!r) return <sup className="wb-cite wb-cite-miss">[{n}]</sup>
  return (
    <a className="wb-cite" href={r.링크} target="_blank" rel="noreferrer" aria-label={`출처 ${n}: ${r.기관} ${r.제목}`}>
      {n}
      <span className="wb-tip" role="tooltip">
        <b>{r.기관}</b>{r.날짜 ? ` · ${r.날짜}` : ''}
        <span className="wb-tip-title">{r.제목}</span>
        {r.원문확인 === false && <span className="wb-tip-note">원문 확인 못함 · 제목 기준</span>}
      </span>
    </a>
  )
}

// "문장 [1][2]" → 텍스트 + 출처 칩
function T({ text, refs }) {
  const parts = []
  let last = 0
  for (const m of String(text).matchAll(/\s*\[(\d+)\]/g)) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    parts.push(<Cite key={m.index} n={+m[1]} refs={refs} />)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

export default function WeeklyBrief() {
  const { data: index, error } = useData('briefs/index.json')
  const briefs = index?.briefs || []
  const [sel, setSel] = useState('')
  const id = sel || briefs[0]?.id || ''
  const [brief, setBrief] = useState(null)
  const [loadErr, setLoadErr] = useState('')

  useEffect(() => {
    if (!id) return
    let alive = true
    setBrief(null); setLoadErr('')
    fetch(`${import.meta.env.BASE_URL}data/briefs/${id}.json`)
      .then((r) => { if (!r.ok) throw new Error(`브리핑 로드 실패 (${r.status})`); return r.json() })
      .then((d) => { if (alive) setBrief(d) })
      .catch((e) => { if (alive) setLoadErr(e.message) })
    return () => { alive = false }
  }, [id])

  const idx = briefs.findIndex((b) => b.id === id)

  if (error || (index && briefs.length === 0)) {
    return <div className="card"><div className="list-empty">아직 발행된 주간 브리핑이 없습니다. 매주 월요일 오전 7시에 지난주 브리핑이 올라옵니다.</div></div>
  }
  if (!index) return <div className="card"><div className="list-empty">불러오는 중…</div></div>

  return (
    <div className="wb">
      <div className="wb-bar">
        <div className="wb-nav">
          <button className="btn-ghost wb-step" disabled={idx >= briefs.length - 1} onClick={() => setSel(briefs[idx + 1].id)} aria-label="이전 주">‹</button>
          <select value={id} onChange={(e) => setSel(e.target.value)} aria-label="주차 선택">
            {briefs.map((b, i) => <option key={b.id} value={b.id}>{fmtRange(b.기간)}{i === 0 ? ' (최신)' : ''}</option>)}
          </select>
          <button className="btn-ghost wb-step" disabled={idx <= 0} onClick={() => setSel(briefs[idx - 1].id)} aria-label="다음 주">›</button>
        </div>
        <a className="btn-primary wb-dl" href={`${import.meta.env.BASE_URL}briefs/${id}.docx`} download={`산업트래킹_주간브리핑_${id}.docx`}>⬇ 워드로 받기</a>
      </div>

      {loadErr && <div className="card"><div className="list-empty">{loadErr}</div></div>}
      {!brief && !loadErr && <div className="card"><div className="list-empty">불러오는 중…</div></div>}

      {brief && <BriefBody brief={brief} />}
    </div>
  )
}


// 브리핑 본문 — 산업 트래킹 탭과 JH Weekly Report ②에서 같이 쓴다
export function BriefBody({ brief }) {
  const refs = useMemo(() => new Map((brief?.refs || []).map((r) => [r.n, r])), [brief])
  const maxKw = Math.max(1, ...(brief?.키워드 || []).map((k) => Math.max(k.count, k.prev)))
  return (
    <>
          <div className="card wb-hero">
            <div className="wb-meta">{fmtRange(brief.기간)} · 리포트 {brief.리포트수}건 검토</div>
            <h2>이번 주 한눈에</h2>
            <ul className="wb-list">{brief.한눈에.map((t, i) => <li key={i}><T text={t} refs={refs} /></li>)}</ul>
          </div>

          <h3 className="wb-sec">🔬 기술 스터디</h3>
          <div className="wb-study">
            {brief.기술스터디.map((s, i) => (
              <div className="card wb-topic" key={i}>
                <div className="wb-topic-no">STUDY {i + 1}</div>
                <h2>{s.주제}</h2>
                {s.한줄요약 && <p className="wb-lead"><T text={s.한줄요약} refs={refs} /></p>}
                {s.무엇인가 && <><h4>무엇인가</h4><p><T text={s.무엇인가} refs={refs} /></p></>}
                {s.왜지금 && <><h4>왜 지금</h4><p><T text={s.왜지금} refs={refs} /></p></>}
                {s.핵심포인트?.length > 0 && <><h4>핵심 포인트</h4><ul className="wb-list">{s.핵심포인트.map((t, j) => <li key={j}><T text={t} refs={refs} /></li>)}</ul></>}
                {s.밸류체인 && <><h4>밸류체인·주요 플레이어</h4><p><T text={s.밸류체인} refs={refs} /></p></>}
                {s.더읽을거리?.length > 0 && (
                  <div className="wb-more">
                    <h4>더 읽을 리포트</h4>
                    {s.더읽을거리.map((n) => { const r = refs.get(n); return r ? <a key={n} href={r.링크} target="_blank" rel="noreferrer" className="wb-more-link">📄 {r.제목} <span>{r.기관}</span></a> : null })}
                  </div>
                )}
              </div>
            ))}
          </div>

          <h3 className="wb-sec">📡 업계 동향</h3>
          <div className="card">
            <div className="wb-trends">
              {brief.업계동향.map((g, i) => (
                <div key={i} className="wb-trend">
                  <h4>{g.테마}</h4>
                  <ul className="wb-list">{g.시그널.map((t, j) => <li key={j}><T text={t} refs={refs} /></li>)}</ul>
                </div>
              ))}
            </div>
          </div>

          <h3 className="wb-sec">📌 정독 추천 TOP 3</h3>
          <div className="wb-top">
            {brief.정독TOP3.map((t, i) => {
              const r = refs.get(t.ref)
              if (!r) return null
              return (
                <a key={i} className="card wb-top-card" href={r.링크} target="_blank" rel="noreferrer">
                  <div className="wb-rank">{i + 1}</div>
                  <div className="wb-top-org">{r.기관}{r.날짜 ? ` · ${r.날짜}` : ''}</div>
                  <div className="wb-top-title">{r.제목} ↗</div>
                  <p>{t.이유}</p>
                  {t.읽는포인트?.length > 0 && <ul className="wb-list">{t.읽는포인트.map((x, j) => <li key={j}>{x}</li>)}</ul>}
                </a>
              )
            })}
          </div>

          {brief.키워드?.length > 0 && (
            <>
              <h3 className="wb-sec">🏷️ 키워드 흐름 <span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>세부 테마 등장 건수 · 이번 주 vs 지난주</span></h3>
              <div className="card wb-kw">
                {brief.키워드.slice(0, 12).map((k) => (
                  <div className="wb-kw-row" key={k.tag}>
                    <span className="wb-kw-tag">{k.tag}</span>
                    <span className="wb-kw-bars">
                      <span className="wb-kw-bar now" style={{ width: `${(k.count / maxKw) * 100}%` }} />
                      <span className="wb-kw-bar prev" style={{ width: `${(k.prev / maxKw) * 100}%` }} />
                    </span>
                    <span className="wb-kw-num">{k.count}<span className="muted"> / {k.prev}</span></span>
                  </div>
                ))}
                <div className="wb-kw-legend"><span className="wb-kw-dot now" />이번 주 <span className="wb-kw-dot prev" />지난주</div>
              </div>
            </>
          )}

          <h3 className="wb-sec">출처 <span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>{brief.refs.length}건</span></h3>
          <div className="card">
            <ol className="wb-refs">
              {brief.refs.map((r) => (
                <li key={r.n} value={r.n}>
                  <a href={r.링크} target="_blank" rel="noreferrer" className="lp-link">{r.제목}</a>
                  <span className="muted"> · {r.기관}{r.날짜 ? ` · ${r.날짜}` : ''}{r.원문확인 === false ? ' · 원문 확인 못함' : ''}</span>
                </li>
              ))}
            </ol>
            {brief.메모 && <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>{brief.메모}</div>}
          </div>
    </>
  )
}
