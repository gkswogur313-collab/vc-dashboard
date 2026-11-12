import { useEffect, useMemo, useRef, useState } from 'react'
import { useData } from '../useData.js'

// 산업 트래킹 › 반도체 브리핑
//  · 위: 반도체 교과서 — public/data/semi/textbook.json (화면에서 장별 열람) + public/briefs/semi/textbook.docx (워드)
//  · 아래: 반도체 주간 브리핑 — public/data/semi/index.json + weekly/<주 시작일>.json, 워드 public/briefs/semi/<id>.docx
// 매주 월요일 Claude 예약 작업이 브리핑을 쓰고 교과서 15장(최신 기술동향)을 갱신한다. 작성 규칙: scripts/semi/GUIDE.md
// 본문의 [n]은 출처 번호 → 누르면 원문이 새 탭으로 열린다.

const BASE = import.meta.env.BASE_URL
const fmtRange = (g) => (g ? `${g.from.replace(/-/g, '.')} ~ ${g.to.slice(5).replace('-', '.')}` : '')
const SEG_ICON = { '소재': '🧪', '부품': '🔩', '장비': '🛠️', '메모리': '💾', '파운드리·로직': '🏭', '패키징·테스트': '📦', '설계·AI칩': '🧠', '정책·공급망': '🏛️' }

function Cite({ n, refs, prefix = '' }) {
  const r = refs.get(n)
  if (!r) return <sup className="wb-cite wb-cite-miss">[{n}]</sup>
  return (
    <a className="wb-cite" href={r.링크} target="_blank" rel="noreferrer" aria-label={`출처 ${prefix}${n}: ${r.매체 || ''} ${r.제목}`}>
      {prefix}{n}
      <span className="wb-tip" role="tooltip">
        <b>{r.매체}</b>{r.날짜 ? ` · ${r.날짜}` : ''}
        <span className="wb-tip-title">{r.제목}</span>
      </span>
    </a>
  )
}

// "문장 [1][2]" → 텍스트 + 출처 칩
export function T({ text, refs, prefix }) {
  const s = String(text || '')
  const parts = []
  let last = 0
  for (const m of s.matchAll(/\s*\[(\d+)\]/g)) {
    if (m.index > last) parts.push(s.slice(last, m.index))
    parts.push(<Cite key={m.index} n={+m[1]} refs={refs} prefix={prefix} />)
    last = m.index + m[0].length
  }
  if (last < s.length) parts.push(s.slice(last))
  return <>{parts}</>
}

export default function SemiBriefing() {
  const [openCh, setOpenCh] = useState(null) // 교과서 열람 중인 장 id (null이면 닫힘)
  const bookRef = useRef(null)
  const openChapter = (id) => {
    setOpenCh(id)
    setTimeout(() => bookRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }
  return (
    <div className="wb sb">
      <div ref={bookRef}><Textbook openCh={openCh} setOpenCh={setOpenCh} /></div>
      <h3 className="wb-sec">🗓️ 반도체 주간 브리핑 <span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>소재·부품·장비부터 칩·정책까지 · 매주 월요일 발행</span></h3>
      <SemiWeekly onOpenChapter={openChapter} />
    </div>
  )
}

// ───────────────────────── 교과서 ─────────────────────────
function Textbook({ openCh, setOpenCh }) {
  const { data: tb, error } = useData('semi/textbook.json')
  const refs = useMemo(() => new Map((tb?.refs || []).map((r) => [r.n, r])), [tb])
  const chapters = tb?.장 || []
  const idx = chapters.findIndex((c) => c.id === openCh)

  if (error) return <div className="card"><div className="list-empty">교과서를 불러오지 못했습니다: {error}</div></div>
  if (!tb) return <div className="card"><div className="list-empty">불러오는 중…</div></div>

  const last = tb.개정이력?.[0]
  const parts = []
  for (const c of chapters) { const p = parts.find((x) => x.name === c.파트); if (p) p.items.push(c); else parts.push({ name: c.파트, items: [c] }) }

  return (
    <div className="card sb-book">
      <div className="sb-book-head">
        <div className="sb-book-icon" aria-hidden>📘</div>
        <div className="sb-book-meta">
          <div className="sb-book-title">{tb.제목} <span className="sb-ver">v{tb.버전}</span></div>
          <div className="muted" style={{ fontSize: 12.5 }}>{tb.부제}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            {tb.updated_at} 갱신 · {chapters.length}개 장 · 매주 월요일 브리핑을 반영해 자동 갱신
            {last ? <> · 최근 개정: {last.내용.replace(/\s*—.*$/, '').slice(0, 40)}</> : null}
          </div>
        </div>
        <div className="sb-book-btns">
          <button className="btn-ghost" onClick={() => setOpenCh(openCh ? null : chapters[0]?.id)}>{openCh ? '닫기' : '📖 열람'}</button>
          <a className="btn-primary wb-dl" href={`${BASE}briefs/semi/textbook.docx`} download={`반도체_교과서_v${tb.버전}.docx`}>⬇ 워드로 받기</a>
        </div>
      </div>

      {!openCh && (
        <div className="sb-toc-grid">
          {parts.map((p) => (
            <div key={p.name} className="sb-toc-part">
              <div className="sb-toc-pname">{p.name}</div>
              {p.items.map((c) => (
                <button key={c.id} className="sb-toc-item" onClick={() => setOpenCh(c.id)}>
                  <span className="sb-toc-no">{c.번호}</span>{c.제목}{c.자동갱신 && <span className="sb-live">자동 갱신</span>}
                </button>
              ))}
            </div>
          ))}
          <div className="sb-toc-part">
            <div className="sb-toc-pname">부록</div>
            <button className="sb-toc-item" onClick={() => setOpenCh('appendix')}><span className="sb-toc-no">A</span>꾸준히 볼 자료처</button>
            <button className="sb-toc-item" onClick={() => setOpenCh('history')}><span className="sb-toc-no">B</span>개정 이력</button>
          </div>
        </div>
      )}

      {openCh && (
        <div className="sb-reader">
          <nav className="sb-side" aria-label="교과서 목차">
            <select className="sb-side-sel" value={openCh} onChange={(e) => setOpenCh(e.target.value)} aria-label="장 선택">
              {chapters.map((c) => <option key={c.id} value={c.id}>{c.번호}장. {c.제목}</option>)}
              <option value="appendix">부록. 꾸준히 볼 자료처</option>
              <option value="history">개정 이력</option>
            </select>
            <div className="sb-side-list">
              {parts.map((p) => (
                <div key={p.name}>
                  <div className="sb-side-part">{p.name}</div>
                  {p.items.map((c) => <button key={c.id} className={'sb-side-item' + (c.id === openCh ? ' active' : '')} onClick={() => setOpenCh(c.id)}>{c.번호}. {c.제목}</button>)}
                </div>
              ))}
              <div className="sb-side-part">부록</div>
              <button className={'sb-side-item' + (openCh === 'appendix' ? ' active' : '')} onClick={() => setOpenCh('appendix')}>꾸준히 볼 자료처</button>
              <button className={'sb-side-item' + (openCh === 'history' ? ' active' : '')} onClick={() => setOpenCh('history')}>개정 이력</button>
            </div>
          </nav>
          <article className="sb-article">
            {openCh === 'appendix' ? <Appendix ap={tb.부록} /> : openCh === 'history' ? <History tb={tb} /> : idx >= 0 ? <Chapter ch={chapters[idx]} refs={refs} updated={tb.updated_at} /> : null}
            <div className="sb-pager">
              <button className="btn-ghost" disabled={idx <= 0} onClick={() => setOpenCh(chapters[idx - 1].id)}>‹ 이전 장</button>
              <button className="btn-ghost" disabled={idx < 0 || idx >= chapters.length - 1} onClick={() => setOpenCh(chapters[idx + 1].id)}>다음 장 ›</button>
            </div>
          </article>
        </div>
      )}
    </div>
  )
}

function Chapter({ ch, refs, updated }) {
  const used = useMemo(() => {
    const s = new Set(); for (const m of JSON.stringify(ch).matchAll(/\[(\d+)\]/g)) s.add(+m[1]); return [...s].sort((a, b) => a - b)
  }, [ch])
  return (
    <>
      <div className="sb-ch-part">{ch.파트}</div>
      <h2 className="sb-ch-title">{ch.번호}장. {ch.제목}</h2>
      {ch.자동갱신 && <div className="sb-live-note">이 장은 매주 반도체 브리핑을 반영해 갱신됩니다 · 마지막 갱신 {updated}</div>}
      <p className="sb-lead">{ch.요약}</p>
      {ch.절.map((s, i) => (
        <section key={i} className="sb-sec">
          <h3>{s.제목}</h3>
          {s.본문.map((p, j) => <p key={j}><T text={p} refs={refs} /></p>)}
          {s.표 && (
            <div className="sb-tbl-wrap">
              <table className="tbl sb-tbl">
                <thead><tr>{s.표.머리.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>{s.표.행.map((r, k) => <tr key={k}>{r.map((x, m) => <td key={m}><T text={x} refs={refs} /></td>)}</tr>)}</tbody>
              </table>
              {s.표.주 && <div className="muted sb-tbl-note"><T text={s.표.주} refs={refs} /></div>}
            </div>
          )}
          {s.관전포인트?.length > 0 && <div className="sb-watch"><b>관전 포인트</b><ul>{s.관전포인트.map((x, k) => <li key={k}>{x}</li>)}</ul></div>}
        </section>
      ))}
      {ch.핵심정리?.length > 0 && <div className="sb-box sb-box-sum"><h4>핵심 정리</h4><ul className="wb-list">{ch.핵심정리.map((x, i) => <li key={i}><T text={x} refs={refs} /></li>)}</ul></div>}
      {ch.체크포인트?.length > 0 && <div className="sb-box sb-box-vc"><h4>심사역 체크포인트</h4><ul className="wb-list">{ch.체크포인트.map((x, i) => <li key={i}><T text={x} refs={refs} /></li>)}</ul></div>}
      {ch.용어?.length > 0 && (
        <div className="sb-terms">
          <h4>용어</h4>
          <dl>{ch.용어.map((u) => <div key={u.용어}><dt>{u.용어}</dt><dd>{u.뜻}</dd></div>)}</dl>
        </div>
      )}
      {used.length > 0 && (
        <div className="sb-ch-refs">
          <h4>이 장의 출처</h4>
          <ol className="wb-refs">{used.map((n) => { const r = refs.get(n); return r ? <li key={n} value={n}><a className="lp-link" href={r.링크} target="_blank" rel="noreferrer">{r.제목}</a><span className="muted"> · {r.매체} {r.날짜}</span></li> : null })}</ol>
        </div>
      )}
    </>
  )
}

function Appendix({ ap }) {
  if (!ap) return null
  return (
    <>
      <h2 className="sb-ch-title">{ap.제목}</h2>
      <p className="sb-lead">{ap.설명}</p>
      {ap.그룹.map((g) => (
        <section key={g.이름} className="sb-sec">
          <h3>{g.이름}</h3>
          <ul className="sb-links">{g.항목.map((x) => <li key={x.링크}><a className="lp-link" href={x.링크} target="_blank" rel="noreferrer">{x.이름} ↗</a>{x.설명 && <span className="muted"> — {x.설명}</span>}</li>)}</ul>
        </section>
      ))}
    </>
  )
}

function History({ tb }) {
  return (
    <>
      <h2 className="sb-ch-title">개정 이력</h2>
      <p className="sb-lead">매주 반도체 주간 브리핑을 반영해 15장(최신 기술동향)을 중심으로 고쳐 씁니다.</p>
      <div className="sb-tbl-wrap">
        <table className="tbl sb-tbl">
          <thead><tr><th style={{ width: 100 }}>날짜</th><th style={{ width: 60 }}>버전</th><th>내용</th></tr></thead>
          <tbody>{tb.개정이력.map((x, i) => <tr key={i}><td className="muted">{x.날짜}</td><td>v{x.버전}</td><td>{x.내용}</td></tr>)}</tbody>
        </table>
      </div>
    </>
  )
}

// ───────────────────────── 주간 브리핑 ─────────────────────────
function SemiWeekly({ onOpenChapter }) {
  const { data: index, error } = useData('semi/index.json')
  const weeks = index?.weeks || []
  const [sel, setSel] = useState('')
  const id = sel || weeks[0]?.id || ''
  const [w, setW] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!id) return
    let alive = true
    setW(null); setErr('')
    fetch(`${BASE}data/semi/weekly/${id}.json`)
      .then((r) => { if (!r.ok) throw new Error(`브리핑 로드 실패 (${r.status})`); return r.json() })
      .then((d) => { if (alive) setW(d) })
      .catch((e) => { if (alive) setErr(e.message) })
    return () => { alive = false }
  }, [id])
  const idx = weeks.findIndex((x) => x.id === id)

  if (error || (index && weeks.length === 0)) return <div className="card"><div className="list-empty">아직 발행된 반도체 브리핑이 없습니다. 매주 월요일 오전에 지난주 브리핑이 올라옵니다.</div></div>
  if (!index) return <div className="card"><div className="list-empty">불러오는 중…</div></div>

  return (
    <>
      <div className="wb-bar">
        <div className="wb-nav">
          <button className="btn-ghost wb-step" disabled={idx >= weeks.length - 1} onClick={() => setSel(weeks[idx + 1].id)} aria-label="이전 주">‹</button>
          <select value={id} onChange={(e) => setSel(e.target.value)} aria-label="주차 선택">
            {weeks.map((x, i) => <option key={x.id} value={x.id}>{fmtRange(x.기간)}{i === 0 ? ' (최신)' : ''}</option>)}
          </select>
          <button className="btn-ghost wb-step" disabled={idx <= 0} onClick={() => setSel(weeks[idx - 1].id)} aria-label="다음 주">›</button>
        </div>
        <a className="btn-primary wb-dl" href={`${BASE}briefs/semi/${id}.docx`} download={`반도체_주간브리핑_${id}.docx`}>⬇ 워드로 받기</a>
      </div>
      {err && <div className="card"><div className="list-empty">{err}</div></div>}
      {!w && !err && <div className="card"><div className="list-empty">불러오는 중…</div></div>}
      {w && <SemiWeeklyBody w={w} onOpenChapter={onOpenChapter} />}
    </>
  )
}

const CH_NAME = { ch01: '1장', ch02: '2장', ch03: '3장', ch04: '4장', ch05: '5장', ch06: '6장', ch07: '7장', ch08: '8장', ch09: '9장', ch10: '10장', ch11: '11장', ch12: '12장', ch13: '13장', ch14: '14장', ch15: '15장' }

// 주간 브리핑 본문 — 반도체 브리핑 탭과 JH Weekly Report ③에서 같이 쓴다 (prefix: 출처 번호 앞 글자, JH Weekly 안에서는 'S')
export function SemiWeeklyBody({ w, onOpenChapter, prefix = '' }) {
  const refs = useMemo(() => new Map((w?.refs || []).map((r) => [r.n, r])), [w])
  const maxKw = Math.max(1, ...(w?.키워드 || []).map((k) => Math.max(k.count, k.prev)))
  const P = (t) => <T text={t} refs={refs} prefix={prefix} />
  return (
    <>
      <div className="card wb-hero">
        <div className="wb-meta">{fmtRange(w.기간)} · 자료 {w.자료수}건 검토</div>
        <h2>이번 주 한눈에</h2>
        <ul className="wb-list">{w.한눈에.map((t, i) => <li key={i}>{P(t)}</li>)}</ul>
      </div>

      {w.숫자?.length > 0 && (
        <div className="sb-nums">
          {w.숫자.map((x, i) => (
            <div className="card sb-num" key={i}>
              <div className="sb-num-label">{x.지표}</div>
              <div className="sb-num-val">{x.값}</div>
              <div className="sb-num-desc">{P(x.설명)}</div>
            </div>
          ))}
        </div>
      )}

      <h3 className="wb-sec">🔗 밸류체인별 시그널</h3>
      <div className="sb-chain">
        {w.밸류체인.map((g) => (
          <div className="card sb-seg" key={g.구간}>
            <div className="sb-seg-head"><span aria-hidden>{SEG_ICON[g.구간] || '•'}</span> {g.구간}</div>
            {g.시그널.map((s, i) => (
              <div className="sb-sig" key={i}>
                <div className="sb-sig-title">{s.제목}</div>
                <p>{P(s.내용)}</p>
                {s.함의 && <p className="wr-so"><b>그래서 →</b> {P(s.함의)}</p>}
              </div>
            ))}
          </div>
        ))}
      </div>

      {w.국내기업?.length > 0 && (
        <>
          <h3 className="wb-sec">🇰🇷 국내 소부장·반도체 기업 동향</h3>
          <div className="card">
            <div className="sb-tbl-wrap">
              <table className="tbl sb-tbl sb-co">
                <thead><tr><th>기업</th><th>구분</th><th>내용</th></tr></thead>
                <tbody>{w.국내기업.map((x, i) => <tr key={i}><td><b>{x.기업}</b></td><td className="muted">{x.구분}</td><td>{P(x.내용)}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <h3 className="wb-sec">🔬 기술 노트</h3>
      <div className="wb-study">
        {w.기술노트.map((s, i) => (
          <div className="card wb-topic" key={i}>
            <div className="wb-topic-no">NOTE {i + 1}</div>
            <h2>{s.주제}</h2>
            <p>{P(s.설명)}</p>
            {s.교과서 && (onOpenChapter
              ? <button className="linklike" onClick={() => onOpenChapter(s.교과서)}>📘 교과서 {CH_NAME[s.교과서] || s.교과서}에서 더 보기 →</button>
              : <a className="linklike" href="#/industry">📘 교과서 {CH_NAME[s.교과서] || s.교과서}에서 더 보기 →</a>)}
          </div>
        ))}
      </div>

      {w.정독?.length > 0 && (
        <>
          <h3 className="wb-sec">📚 정독 추천</h3>
          <div className="wb-top">
            {w.정독.map((x, i) => {
              const r = refs.get(x.ref)
              if (!r) return null
              return (
                <a className="card wb-top-card" key={i} href={r.링크} target="_blank" rel="noreferrer">
                  <div className="wb-rank">{i + 1}</div>
                  <div className="wb-top-org">{r.매체}{r.날짜 ? ` · ${r.날짜}` : ''}</div>
                  <div className="wb-top-title">{r.제목}</div>
                  <p>{x.이유}</p>
                </a>
              )
            })}
          </div>
        </>
      )}

      {w.교과서반영?.length > 0 && (
        <div className="card sb-box sb-box-sum" style={{ marginTop: 14 }}>
          <h4>📘 이번 주 교과서 반영</h4>
          <ul className="wb-list">{w.교과서반영.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      )}

      {w.키워드?.length > 0 && (
        <>
          <h3 className="wb-sec">📊 밸류체인 구간별 언급 흐름</h3>
          <div className="card">
            <div className="wb-kw">
              {w.키워드.map((k) => (
                <div className="wb-kw-row" key={k.tag}>
                  <span>{k.tag}</span>
                  <div className="wb-kw-bars">
                    <div className="wb-kw-bar now" style={{ width: `${(k.count / maxKw) * 100}%` }} />
                    <div className="wb-kw-bar prev" style={{ width: `${(k.prev / maxKw) * 100}%` }} />
                  </div>
                  <span className="wb-kw-num">{k.count}<span className="muted" style={{ fontWeight: 500 }}> / {k.prev}</span></span>
                </div>
              ))}
            </div>
            <div className="wb-kw-legend"><span className="wb-kw-dot now" />이번 주 <span className="wb-kw-dot prev" />지난주 · 제목 기준 자동 분류</div>
          </div>
        </>
      )}

      <h3 className="wb-sec">출처 <span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>{w.refs.length}건</span></h3>
      <div className="card">
        <ol className="wb-refs">{w.refs.map((r) => (
          <li key={r.n} value={r.n}>{prefix && <span className="muted">{prefix}{r.n}. </span>}<a href={r.링크} target="_blank" rel="noreferrer" className="lp-link">{r.제목}</a><span className="muted"> · {r.매체} {r.날짜}</span></li>
        ))}</ol>
        {w.메모 && <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>{w.메모}</p>}
      </div>
    </>
  )
}
