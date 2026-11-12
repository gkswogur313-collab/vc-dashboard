import { useEffect, useMemo, useState } from 'react'
import { useData } from '../useData.js'
import { tagTitle } from '../../scripts/industry/tags.mjs'
import WeeklyBrief from './WeeklyBrief.jsx'
import SemiBriefing from './SemiBriefing.jsx'

// 산업 트래킹 — 국내 연구기관·협회·기업 리포트 게시판 목록을 한곳에 모아 보여준다.
// 데이터: public/data/industry.json (scripts/fetch-industry.mjs, GitHub Actions 매일 갱신).
// 대분류 테마는 게시판 단위(엑셀 '사이트' 시트), 세부 테마는 제목 키워드로 자동 태깅.
// 해외 IP에서 막히는 게시판(SK하이닉스 등)은 엣지 함수 /api/industry-kr 결과를 화면에서 실시간 병합.

const THEME_COLOR = {
  '반도체': '#4f7ef0',
  '통신·ICT 일반': '#0ea5e9',
  'AI·소프트웨어·데이터': '#a855f7',
  '과학기술·첨단산업 전반': '#14b8a6',
  '바이오·헬스케어': '#22c55e',
  '에너지·배터리·모빌리티': '#f59e0b',
  '소재·부품·디스플레이·로봇·제조': '#ef7d57',
  '우주·항공·국방·양자': '#64748b',
  '기업·금융권 연구소': '#eab308',
}
const PERIODS = [
  { k: 'all', label: '전체 기간' },
  { k: '7', label: '최근 7일' },
  { k: '30', label: '최근 30일' },
  { k: '90', label: '최근 3개월' },
  { k: '365', label: '최근 1년' },
]
const PAGE = 200

const daysAgo = (n) => {
  const d = new Date(Date.now() - n * 86400000)
  return d.toISOString().slice(0, 10)
}

const TAB_KEY = 'industry-tab'
const readTab = () => { try { return localStorage.getItem(TAB_KEY) || 'brief' } catch { return 'list' } }

// 상단 탭: 주간 브리핑 / 반도체 브리핑 / 리포트 목록 (마지막으로 본 탭 기억)
export default function IndustryTracking() {
  const [tab, setTab] = useState(readTab)
  const pick = (t) => { setTab(t); try { localStorage.setItem(TAB_KEY, t) } catch { /* 저장 불가 환경 무시 */ } }
  return (
    <div>
      <div className="tabs">
        <button className={'tab-btn' + (tab === 'brief' ? ' active' : '')} onClick={() => pick('brief')}>📋 주간 브리핑</button>
        <button className={'tab-btn' + (tab === 'semi' ? ' active' : '')} onClick={() => pick('semi')}>🔬 반도체 브리핑</button>
        <button className={'tab-btn' + (tab === 'list' ? ' active' : '')} onClick={() => pick('list')}>📄 리포트 목록</button>
      </div>
      {tab === 'brief' ? <WeeklyBrief /> : tab === 'semi' ? <SemiBriefing /> : <ReportList />}
    </div>
  )
}

function ReportList() {
  const { data: base, error } = useData('industry.json')
  const [live, setLive] = useState(null)
  useEffect(() => {
    let alive = true
    fetch('/api/industry-kr').then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive && d) setLive(d) }).catch(() => {})
    return () => { alive = false }
  }, [])

  // 정적(매일 크롤) + 엣지(실시간) 병합 — 같은 id는 하나로, 엣지에서 성공한 게시판은 상태를 '정상'으로
  const data = useMemo(() => {
    if (!base || !live) return base
    const seen = new Set(base.items.map((i) => i.id))
    const add = live.items.filter((i) => !seen.has(i.id)).map((i) => ({ ...i, 세부: tagTitle(i.제목) }))
    const items = [...base.items, ...add].sort((a, b) => (b.날짜 || '').localeCompare(a.날짜 || ''))
    const liveSrc = new Map(live.sources.filter((s) => s.ok).map((s) => [s.id, s]))
    const sources = base.sources.map((s) => (liveSrc.has(s.id) && !s.ok
      ? { ...s, ok: true, error: '', count: items.filter((i) => i.src === s.id).length, via: '엣지' }
      : s))
    return { ...base, items, sources, count: items.length }
  }, [base, live])
  const [theme, setTheme] = useState('전체')
  const [sub, setSub] = useState('전체')
  const [org, setOrg] = useState('전체')
  const [period, setPeriod] = useState('all')
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [showSrc, setShowSrc] = useState(false)

  const items = data?.items || []
  const sources = data?.sources || []
  const themes = data?.themes || Object.keys(THEME_COLOR)

  const subs = useMemo(() => {
    const cnt = new Map()
    for (const it of items) {
      if (theme !== '전체' && it.테마 !== theme) continue
      for (const s of it.세부 || []) cnt.set(s, (cnt.get(s) || 0) + 1)
    }
    return [...cnt.entries()].sort((a, b) => b[1] - a[1])
  }, [items, theme])

  const orgs = useMemo(() => {
    const set = new Set()
    for (const it of items) if (theme === '전체' || it.테마 === theme) set.add(it.기관)
    return [...set].sort((a, b) => a.localeCompare(b, 'ko'))
  }, [items, theme])

  const view = useMemo(() => {
    const from = period === 'all' ? '' : daysAgo(Number(period))
    const qq = q.trim().toLowerCase()
    return items.filter((it) => {
      if (theme !== '전체' && it.테마 !== theme) return false
      if (sub !== '전체' && !(it.세부 || []).includes(sub)) return false
      if (org !== '전체' && it.기관 !== org) return false
      if (from && (!it.날짜 || it.날짜 < from)) return false
      if (qq && !`${it.제목} ${it.기관} ${it.게시판 || ''}`.toLowerCase().includes(qq)) return false
      return true
    })
  }, [items, theme, sub, org, period, q])

  const reset = (fn) => (v) => { fn(v); setLimit(PAGE) }
  const pickTheme = (t) => { setTheme(t); setSub('전체'); setOrg('전체'); setLimit(PAGE) }

  const updated = data?.generated_at ? new Date(data.generated_at).toLocaleString('ko-KR', { hour12: false }) : null
  const okCount = sources.filter((s) => s.ok).length
  const pending = !data || items.length === 0

  return (
    <div>
      <div className="lp-head">
        <div className="muted" style={{ fontSize: 12.5 }}>
          {updated ? <>최근 갱신: {updated} · 매일 자동 수집 · </> : null}
          게시판 {okCount}/{sources.length}곳 수집
          <button className="linklike" style={{ marginTop: 0, marginLeft: 8 }} onClick={() => setShowSrc((v) => !v)}>
            {showSrc ? '수집 현황 닫기' : '수집 현황 보기'}
          </button>
        </div>
      </div>

      {showSrc && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="scroll-box" style={{ '--scroll-h': '320px', minHeight: 0 }}>
            <table className="tbl">
              <thead><tr><th>기관</th><th>게시판</th><th className="r">건수</th><th>상태</th></tr></thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.url}>
                    <td>{s.기관}</td>
                    <td><a className="lp-link" href={s.url} target="_blank" rel="noreferrer">{s.게시판 || '게시판'} ↗</a></td>
                    <td className="r">{s.count}</td>
                    <td><span className={'src-chip ' + (s.ok ? 'ok' : 'bad')}>{s.ok ? '정상' : (s.error || '실패')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {error && !data ? (
        <div className="card"><div className="list-empty">데이터를 불러오지 못했습니다: {error}</div></div>
      ) : pending ? (
        <div className="card"><div className="list-empty">
          아직 수집 전입니다. GitHub Actions의 <strong>fetch-industry</strong> 워크플로가 실행되면 리포트 목록이 채워집니다.
        </div></div>
      ) : (
        <div className="card">
          <div className="lp-cats" style={{ marginBottom: 10 }}>
            {['전체', ...themes].map((t) => (
              <button key={t} className={'lp-cat' + (theme === t ? ' active' : '')} onClick={() => pickTheme(t)}>{t}</button>
            ))}
          </div>
          <div className="lp-bar">
            <select value={sub} onChange={(e) => reset(setSub)(e.target.value)} aria-label="세부 테마">
              <option value="전체">세부 테마 전체</option>
              {subs.map(([s, n]) => <option key={s} value={s}>{s} ({n})</option>)}
            </select>
            <select value={org} onChange={(e) => reset(setOrg)(e.target.value)} aria-label="기관">
              <option value="전체">기관 전체</option>
              {orgs.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <select value={period} onChange={(e) => reset(setPeriod)(e.target.value)} aria-label="기간">
              {PERIODS.map((p) => <option key={p.k} value={p.k}>{p.label}</option>)}
            </select>
            <input className="pl-search" value={q} onChange={(e) => reset(setQ)(e.target.value)} placeholder="🔎 제목·기관 검색..." />
          </div>

          <div className="scroll-box" style={{ '--scroll-h': 'max(320px, calc(100vh - 300px))' }}>
            <table className="tbl it-tbl">
              <thead><tr><th style={{ width: 100 }}>발간일</th><th style={{ width: 210 }}>테마</th><th style={{ width: 170 }}>기관</th><th>제목</th></tr></thead>
              <tbody>
                {view.slice(0, limit).map((it) => {
                  const c = THEME_COLOR[it.테마] || '#94a3b8'
                  return (
                    <tr key={it.id}>
                      <td className="muted">{it.날짜 || '—'}</td>
                      <td className="it-theme">
                        <span className="badge" style={{ background: c + '22', color: c }}>{it.테마}</span>
                        {(it.세부 || []).map((s) => (
                          <button key={s} className="it-sub" onClick={() => { setSub(s); setLimit(PAGE) }} title={`'${s}'만 보기`}>{s}</button>
                        ))}
                      </td>
                      <td className="it-org">{it.기관}{it.게시판 ? <div className="it-board">{it.게시판}</div> : null}</td>
                      <td className="it-title"><a href={it.링크} target="_blank" rel="noreferrer" className="lp-link">{it.제목}</a></td>
                    </tr>
                  )
                })}
                {view.length === 0 && <tr><td colSpan={4} className="muted" style={{ textAlign: 'center' }}>조건에 맞는 자료가 없습니다.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 8, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>{Math.min(limit, view.length).toLocaleString()}건 표시 · 조건 일치 {view.length.toLocaleString()}건 · 전체 {items.length.toLocaleString()}건</span>
            {view.length > limit && <button className="btn-ghost" style={{ padding: '5px 12px' }} onClick={() => setLimit((l) => l + PAGE)}>더 보기</button>}
          </div>
        </div>
      )}
    </div>
  )
}
