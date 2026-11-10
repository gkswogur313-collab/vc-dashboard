import { useEffect, useState } from 'react'
import Modal from './Modal.jsx'
import { toBullets } from '../lib/bullets.js'

// IPO 단계별 보고서 팝업 — public/data/ipo-reports/<file>.json
// 단계: 심사청구 · 심사승인 · 상장. 각 시점에 자동 추가(scripts/fetch-ipo-reports.py) → 뉴스 기반 요약은 Claude 예약 작업이 채움.
// 상장 단계에는 DART 증권신고서의 영위사업·요약재무정보가 함께 들어간다.

const BASE = import.meta.env.BASE_URL
const STAGES = ['청구', '승인', '상장']
const NAME = { 청구: '심사청구', 승인: '심사승인', 상장: '상장' }
const range = (a, b) => (a ? (b && b !== a ? `${a} ~ ${b.slice(5)}` : a) : '')
// "(1,234)" "△1,234" 같은 손실 표기는 파랑 — 국내 관례(상승·이익 빨강 / 하락·손실 파랑)
const isNeg = (v) => /^\s*[(△−-]/.test(String(v || ''))

export function IpoReportButtons({ info }) {
  const [open, setOpen] = useState(false)
  if (!info) return null
  return (
    <span className="ipr-btns">
      <button className="ipr-btn" onClick={() => setOpen(true)} title={`보고서 단계: ${info.단계.map((s) => NAME[s]).join(' → ')}`}>
        📄 <span className={'ipr-stage ipr-stage-' + info.현재단계}>{NAME[info.현재단계]}</span>
      </button>
      <a className="ipr-btn" href={`${BASE}briefs/ipo/${info.file}.docx`} download={`IPO보고서_${info.file}.docx`} aria-label="워드로 받기">⬇ 워드</a>
      {open && <IpoReportModal info={info} onClose={() => setOpen(false)} />}
    </span>
  )
}

function IpoReportModal({ info, onClose }) {
  const [rep, setRep] = useState(null)
  const [err, setErr] = useState('')
  const [st, setSt] = useState(info.현재단계)
  useEffect(() => {
    fetch(`${BASE}data/ipo-reports/${info.file}.json`)
      .then((r) => { if (!r.ok) throw new Error(`보고서 로드 실패 (${r.status})`); return r.json() })
      .then(setRep).catch((e) => setErr(e.message))
  }, [info.file])

  return (
    <Modal onClose={onClose}>
      <div className="ipr">
        <div className="ipr-top">
          <div>
            <div className="muted" style={{ fontSize: 12 }}>IPO 단계별 보고서</div>
            <h2>{rep?.회사명 || info.file}</h2>
          </div>
          <button className="btn-ghost" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        {err && <div className="list-empty">{err}</div>}
        {!rep && !err && <div className="list-empty">불러오는 중…</div>}
        {rep && (
          <>
            <Common rep={rep} />
            <div className="ipr-tabs" role="tablist">
              {STAGES.map((s) => {
                const has = !!rep.단계?.[s]
                return (
                  <button key={s} role="tab" aria-selected={st === s} disabled={!has}
                    className={'ipr-tab' + (st === s ? ' active' : '') + (has ? '' : ' off')} onClick={() => has && setSt(s)}>
                    {NAME[s]}{has ? <span className="ipr-tab-date">{rep.단계[s].기준일?.slice(5)}</span> : <span className="ipr-tab-date">—</span>}
                  </button>
                )
              })}
            </div>
            {rep.단계?.[st] && <Stage st={st} v={rep.단계[st]} />}
          </>
        )}
      </div>
    </Modal>
  )
}

function KV({ rows }) {
  const r = rows.filter(([, v]) => v)
  if (!r.length) return null
  return <dl className="ipr-kv">{r.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
}

function Common({ rep }) {
  const g = rep.공모 || {}
  const ci = rep.회사정보
  return (
    <>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>{rep.시장} · 현재 단계 {NAME[rep.현재단계]} · 갱신 {rep.updated_at?.slice(0, 10)}</div>
      <h4>공모 개요</h4>
      <KV rows={[['심사청구', g.청구일], ['심사승인', g.승인일], ['수요예측', range(g.수요예측시작, g.수요예측종료)], ['청약', range(g.청약시작, g.청약종료)],
        ['상장(예정)', g.상장일 || g.상장예정일], ['확정공모가', g.확정공모가 && `${g.확정공모가}원`], ['공모금액', g.공모금액 && `${g.공모금액}백만원`], ['주관사', g.주관사]]} />
      <h4>회사 정보 <span className="muted" style={{ fontWeight: 500 }}>DART 기업개황</span></h4>
      {ci ? (
        <KV rows={[['정식 명칭', ci.정식명칭], ['대표자', ci.대표자], ['설립일', ci.설립일], ['결산월', ci.결산월], ['주소', ci.주소],
          ['홈페이지', ci.홈페이지 && <a href={/^https?:/.test(ci.홈페이지) ? ci.홈페이지 : `http://${ci.홈페이지}`} target="_blank" rel="noreferrer" className="lp-link">{ci.홈페이지} ↗</a>]]} />
      ) : <p className="muted">DART에서 회사 정보를 찾지 못했습니다.</p>}
    </>
  )
}

// "문장 [1]" → 텍스트 + 출처 칩(누르면 기사 새 탭)
function Cited({ text, refs }) {
  const parts = []; let last = 0
  for (const m of String(text).matchAll(/\s*\[(\d+)\]/g)) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const r = refs.get(+m[1])
    parts.push(r?.링크
      ? <a key={m.index} className="wb-cite" href={r.링크} target="_blank" rel="noreferrer">{m[1]}<span className="wb-tip"><b>{r.매체}</b>{r.날짜 ? ` · ${r.날짜}` : ''}<span className="wb-tip-title">{r.제목}</span></span></a>
      : <sup key={m.index} className="wb-cite wb-cite-miss">[{m[1]}]</sup>)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

function Stage({ st, v }) {
  const s = v.요약
  const refs = new Map((s?.refs || []).map((r) => [r.n, r]))
  const f = v.실적
  return (
    <div className="ipr-stagebox">
      {s ? (
        <>
          {s.한줄 && <p className="ipr-lead"><Cited text={s.한줄} refs={refs} /></p>}
          {s.영위사업 && <><h4>영위사업 <span className="muted" style={{ fontWeight: 500 }}>{st === '상장' ? '증권신고서·기사 종합' : '기사 기반'}</span></h4><ul className="ipr-bul">{toBullets(s.영위사업).map((b, i) => <li key={i}><Cited text={b} refs={refs} /></li>)}</ul></>}
          {s.포인트?.length > 0 && <><h4>주요 포인트</h4><ul className="ipr-news">{s.포인트.map((p, i) => <li key={i}><Cited text={p} refs={refs} /></li>)}</ul></>}
        </>
      ) : <div className="ipr-wait">뉴스 기반 요약은 매일 아침 자동으로 작성됩니다. (작성 대기 중)</div>}

      {st === '상장' && (
        <>
          {v.영위사업DART ? (
            <details className="ipr-raw" open={!s}>
              <summary>증권신고서 '사업의 개요' 원문 발췌</summary>
              <ul className="ipr-bul">{toBullets(v.영위사업DART).map((b, i) => <li key={i}>{b}</li>)}</ul>
            </details>
          ) : <p className="muted">증권신고서에서 사업 내용을 추출하지 못했습니다.</p>}
          <h4>실적 <span className="muted" style={{ fontWeight: 500 }}>증권신고서 요약재무정보{f ? ` · ${f.기준} · 단위 ${f.단위}` : ''}</span></h4>
          {f?.행?.length ? (
            <div className="ipr-fin">
              <table className="tbl">
                <thead><tr>{f.머리.map((h, i) => <th key={i} className={i ? 'r' : ''}>{i === 0 ? '구분' : h}</th>)}</tr></thead>
                <tbody>{f.행.map((r, i) => (
                  <tr key={i}>{r.slice(0, f.머리.length).map((x, j) => <td key={j} className={j ? 'r' : ''} style={j && isNeg(x) ? { color: '#4f7ef0' } : undefined}>{x}</td>)}</tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className="muted">요약재무정보 표를 찾지 못했습니다.</p>}
          {v.증권신고서 && <p className="ipr-src" style={{ borderTop: 0, marginTop: 6, paddingTop: 0 }}>DART 원문: <a href={v.증권신고서.링크} target="_blank" rel="noreferrer" className="lp-link">{v.증권신고서.보고서명} (접수 {v.증권신고서.접수일}) ↗</a></p>}
        </>
      )}

      <h4>{s?.refs?.length ? '출처' : '수집된 기사'} <span className="muted" style={{ fontWeight: 500 }}>{s?.refs?.length ? '' : '최근 30일'}</span></h4>
      {(s?.refs?.length ? s.refs : v.기사 || []).length ? (
        <ol className="ipr-news">{(s?.refs?.length ? s.refs : v.기사).map((a, i) => (
          <li key={i}><a href={a.링크} target="_blank" rel="noreferrer" className="lp-link">{a.제목}</a><span className="muted"> · {a.매체} {a.날짜}</span></li>
        ))}</ol>
      ) : <p className="muted">수집된 기사가 없습니다.</p>}
      {v.메모?.length > 0 && <div className="ipr-src">참고: {v.메모.join(' / ')}</div>}
    </div>
  )
}
