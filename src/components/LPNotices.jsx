import { useState, useMemo } from 'react'

// 출자사업 공고 — KVIC(모태펀드)·KVCA(출자공고) 두 소스를 각 사이트의 분류 그대로 보여준다.
// 데이터: public/data/lp-notices.json (GitHub Actions 크롤러가 갱신).

const pad = (n) => String(n).padStart(2, '0')
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

// KVIC 카테고리별 색
const CAT_COLOR = {
  출자계획: '#4f7ef0', 설명회: '#14b8a6', 질의응답: '#a855f7', 접수현황: '#f59e0b',
  서류결과: '#0ea5e9', '1차결과': '#eab308', 선정결과: '#22c55e', 기타항목: '#94a3b8',
}

export default function LPNotices({ lp }) {
  const [src, setSrc] = useState('kvic')
  const [cat, setCat] = useState('전체')
  const [q, setQ] = useState('')

  const kvic = lp?.kvic || {}
  const kvca = lp?.kvca || {}
  const kvicItems = kvic.items || []
  const kvcaItems = kvca.items || []
  const cats = ['전체', ...(kvic.categories || [])]
  const today = todayStr()

  const kvicView = useMemo(() => kvicItems.filter((n) => {
    if (cat !== '전체' && n.카테고리 !== cat) return false
    if (q && !(n.제목 || '').toLowerCase().includes(q.toLowerCase())) return false
    return true
  }), [kvicItems, cat, q])

  const kvcaView = useMemo(() => kvcaItems.filter((n) => {
    if (!q) return true
    const t = `${n.공고명} ${n.LP명}`.toLowerCase()
    return t.includes(q.toLowerCase())
  }), [kvcaItems, q])

  const pending = !lp || lp.mode === 'pending' || (kvicItems.length === 0 && kvcaItems.length === 0)
  const updated = lp?.generated_at ? new Date(lp.generated_at).toLocaleString('ko-KR', { hour12: false }) : null

  return (
    <div>
      <div className="lp-head">
        <div className="tabs" style={{ marginBottom: 0 }}>
          <button className={'tab-btn' + (src === 'kvic' ? ' active' : '')} onClick={() => { setSrc('kvic'); setQ('') }}>
            KVIC 모태펀드 <span className="kan-count">{kvicItems.length}</span>
          </button>
          <button className={'tab-btn' + (src === 'kvca' ? ' active' : '')} onClick={() => { setSrc('kvca'); setQ('') }}>
            KVCA 출자공고 <span className="kan-count">{kvcaItems.length}</span>
          </button>
        </div>
        <a className="linklike" href={(src === 'kvic' ? kvic.url : kvca.url) || '#'} target="_blank" rel="noreferrer">원문 사이트 ↗</a>
      </div>

      {updated && <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>최근 갱신: {updated} · 매일 자동 수집</div>}

      {pending ? (
        <div className="card"><div className="list-empty">
          아직 수집 전입니다. GitHub Actions의 <strong>fetch-lp-notices</strong> 워크플로를 한 번 실행하면 공고가 채워집니다.
        </div></div>
      ) : src === 'kvic' ? (
        <div className="card">
          <div className="lp-bar">
            <div className="lp-cats">
              {cats.map((c) => (
                <button key={c} className={'lp-cat' + (cat === c ? ' active' : '')} onClick={() => setCat(c)}>{c}</button>
              ))}
            </div>
            <input className="pl-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 제목 검색..." />
          </div>
          <div className="scroll-box" style={{ '--scroll-h': 'max(280px, calc(50vh - 120px))' }}>
            <table className="tbl">
              <thead><tr><th style={{ width: 60 }}>번호</th><th style={{ width: 90 }}>구분</th><th>제목</th><th style={{ width: 108 }}>날짜</th></tr></thead>
              <tbody>
                {kvicView.map((n) => (
                  <tr key={n.no}>
                    <td className="muted">{n.no}</td>
                    <td><span className="badge" style={{ background: (CAT_COLOR[n.카테고리] || '#94a3b8') + '22', color: CAT_COLOR[n.카테고리] || '#94a3b8' }}>{n.카테고리 || '-'}</span></td>
                    <td><a href={n.링크} target="_blank" rel="noreferrer" className="lp-link">{n.첨부 ? '📎 ' : ''}{n.제목}</a></td>
                    <td className="muted">{n.날짜}</td>
                  </tr>
                ))}
                {kvicView.length === 0 && <tr><td colSpan={4} className="muted" style={{ textAlign: 'center' }}>해당 공고가 없습니다.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>{kvicView.length}건 표시 · 전체 {kvicItems.length}건</div>
        </div>
      ) : (
        <div className="card">
          <div className="lp-bar">
            <span className="muted" style={{ fontSize: 12.5 }}>기관·공고명으로 검색</span>
            <input className="pl-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 LP·공고명 검색..." />
          </div>
          <div className="scroll-box" style={{ '--scroll-h': 'max(280px, calc(50vh - 120px))' }}>
            <table className="tbl">
              <thead><tr><th style={{ width: 56 }}>번호</th><th>LP명</th><th>공고명</th><th style={{ width: 96 }}>공고일</th><th style={{ width: 96 }}>신청기한</th><th style={{ width: 100 }}>선정(예정)</th><th style={{ width: 100 }}>결성기한</th></tr></thead>
              <tbody>
                {kvcaView.map((n) => {
                  const open = n.신청기한 && n.신청기한 >= today
                  return (
                    <tr key={n.no}>
                      <td className="muted">{n.no}</td>
                      <td>{n.LP명}</td>
                      <td>
                        <a href={n.링크} target="_blank" rel="noreferrer" className="lp-link">{n.공고명}</a>
                        {n.신청기한 && <span className={'badge ' + (open ? 'lp-open' : 'lp-closed')} style={{ marginLeft: 8 }}>{open ? '접수중' : '마감'}</span>}
                      </td>
                      <td className="muted">{n.공고일}</td>
                      <td className="muted">{n.신청기한 || '—'}</td>
                      <td className="muted">{n.선정예정일 || '—'}</td>
                      <td className="muted">{n.결성기한 || '—'}</td>
                    </tr>
                  )
                })}
                {kvcaView.length === 0 && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center' }}>해당 공고가 없습니다.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>{kvcaView.length}건 표시 · 전체 {kvcaItems.length}건</div>
        </div>
      )}
    </div>
  )
}
