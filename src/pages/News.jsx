import { useState, useEffect, useMemo } from 'react'
import { usePortfolio } from '../usePortfolio.js'
import { useHoldings } from '../useHoldings.js'

// 카테고리 키워드 (소문자 기준으로 제목 매칭)
const CATS = [
  { key: '투자', kws: ['투자', '회수', '엑싯', 'exit', '세컨더리', '구주거래', '구주인수', '구주매각', '투자유치'] },
  { key: '상장&IPO', kws: ['상장', 'ipo'] },
  { key: 'M&A', kws: ['m&a', '인수', '합병', '인수합병'] },
  { key: 'VC', kws: ['벤처기업', '스타트업', '모태펀드', '성장금융'] },
  { key: '정책/규제', kws: ['중기부', '중소벤처기업부', '벤처투자촉진법', '벤처투자법'] },
]
const TABS = ['Overview', '전체', '투자', '상장&IPO', 'M&A', 'VC', '정책/규제']

// 서버(중복제거)와 동일한 키 규칙으로 클라이언트에서도 병합·중복제거
const newsKey = (t) => (t || '').toLowerCase().replace(/[^가-힣a-z0-9]/g, '').slice(0, 40)
function dedupeMerge(arr) {
  const seen = new Set(); const out = []
  for (const a of arr) { const k = newsKey(a.제목); if (!k || seen.has(k)) continue; seen.add(k); out.push(a) }
  return out
}

function Article({ a }) {
  return (
    <div className="news-row">
      <a href={a.링크} target="_blank" rel="noreferrer" className="news-title" title={a.제목}>{a.제목}</a>
      <span className="news-meta">{a.출처}{a.출처 && a.날짜 ? ' · ' : ''}{a.날짜}</span>
    </div>
  )
}

// Overview 전용: 제목만(최대 2줄), 출처·날짜 없음
function OvTitle({ a }) {
  return (
    <a href={a.링크} target="_blank" rel="noreferrer" className="news-ov-title" title={a.제목}>{a.제목}</a>
  )
}

export default function News() {
  const [tab, setTab] = useState('Overview')
  const [q, setQ] = useState('')
  const [articles, setArticles] = useState([])
  const [sources, setSources] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 뉴스 포트폴리오 = VC 포트폴리오 기업(usePortfolio, 편집 시 자동 반영) + Market 보유종목(holdings)
  // 각 종목은 {label(표시명), terms(검색어들 = 이름 + 뉴스검색어 별칭)}. 예: NVIDIA + '엔비디아'.
  const { items: pfCos } = usePortfolio()
  const { items: holdings } = useHoldings()
  // Deal = VC 포트폴리오 기업 / 상장주식 = Market 보유종목. 각각 {label, terms(이름+별칭)}.
  const buildEntries = (arr, nameKey) => {
    const mk = (label, alias) => ({ label, terms: [label, ...String(alias || '').split(',')].map((s) => s.trim()).filter(Boolean) })
    const seen = new Set()
    return arr.map((x) => mk(x[nameKey], x.뉴스검색어)).filter((e) => e.label && (seen.has(e.label) ? false : (seen.add(e.label), true)))
  }
  const dealEntries = useMemo(() => buildEntries(pfCos, '기업명'), [pfCos])
  const stockEntries = useMemo(() => buildEntries(holdings || [], '종목'), [holdings])
  const pfEntries = useMemo(() => [...dealEntries, ...stockEntries], [dealEntries, stockEntries])
  const allTerms = useMemo(() => [...new Set(pfEntries.flatMap((e) => e.terms))], [pfEntries])
  const namesKey = allTerms.join(',')
  const matchTerms = (제목, terms) => { const t = (제목 || '').toLowerCase(); return terms.some((k) => t.includes(k.toLowerCase())) }

  const load = (fresh) => {
    setLoading(true); setError('')
    // 네이버·매체(실시간, 엣지 함수) + 구글(GitHub Actions 사전수집 정적 파일)을 병렬로 받아 병합
    const api = fetch(`/api/news?portfolio=${encodeURIComponent(namesKey)}${fresh ? '&fresh=1' : ''}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`뉴스 로드 실패 (${r.status})`))))
    const google = fetch(`${import.meta.env.BASE_URL}data/news-google.json${fresh ? `?t=${Date.now()}` : ''}`)
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
    Promise.all([api, google])
      .then(([d, g]) => {
        const apiArts = d.articles || []
        const gArts = g && Array.isArray(g.articles) ? g.articles : []
        const cutoff = Date.now() - 14 * 86400000 // 최근 2주
        const merged = dedupeMerge([...apiArts, ...gArts])
          .filter((a) => !a.ts || a.ts >= cutoff)
          .sort((a, b) => (b.ts || 0) - (a.ts || 0))
        // 구글 소스 상태칩: 파일 없음=아직 수집 전, 12h 초과 미갱신=갱신 지연
        const gOk = gArts.length > 0
        const gStale = g && g.generated_at && (Date.now() - Date.parse(g.generated_at)) > 12 * 3600000
        const gSource = { name: '구글', ok: gOk, count: gArts.length, error: gOk ? (gStale ? '갱신 지연' : '') : '아직 수집 전' }
        setArticles(merged)
        setSources([...(d.sources || []), gSource])
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }
  // 포트폴리오·보유종목 로딩이 끝난 뒤 한 번만 요청 (빈 포트폴리오로 먼저 캐시를 굳히는 이중요청 방지)
  const ready = Array.isArray(holdings)
  useEffect(() => { if (ready) load() }, [namesKey, ready]) // eslint-disable-line

  const searched = useMemo(
    () => articles.filter((a) => !q || a.제목.toLowerCase().includes(q.toLowerCase())),
    [articles, q]
  )

  const catList = (key) => {
    if (key === '전체') return searched
    if (key === '포트폴리오') return searched.filter((a) => matchTerms(a.제목, allTerms))
    const c = CATS.find((x) => x.key === key)
    return searched.filter((a) => c.kws.some((k) => a.제목.toLowerCase().includes(k)))
  }

  const OVERVIEW_CATS = ['전체', ...CATS.map((c) => c.key)]

  return (
    <div>
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={'tab-btn' + (tab === t ? ' active' : '')} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <div className="pipeline-bar">
        <input className="pl-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 제목으로 검색..." />
        <button className="btn-ghost" onClick={() => load(true)} disabled={loading}>{loading ? '불러오는 중…' : '🔄 새로고침'}</button>
        <span className="muted" style={{ fontSize: 12.5 }}>최근 2주 · {articles.length}건</span>
      </div>

      {sources.length > 0 && (
        <div className="source-status">
          {sources.map((s) => (
            <span key={s.name} className={'src-chip ' + (s.ok ? 'ok' : 'bad')} title={s.error}>
              {s.ok ? '●' : '○'} {s.name}{s.ok ? ` ${s.count}` : (s.error ? ` (${s.error})` : ' 실패')}
            </span>
          ))}
        </div>
      )}

      {loading ? (
        <div className="card"><div className="list-empty">뉴스를 불러오는 중…</div></div>
      ) : error ? (
        <div className="card" style={{ borderColor: 'var(--bad)' }}>
          <span style={{ color: 'var(--bad)' }}>오류: {error}</span>
          <div className="muted" style={{ marginTop: 6, fontSize: 12.5 }}>일시적인 오류일 수 있어요. 잠시 후 새로고침하거나, 계속되면 알려주세요.</div>
        </div>
      ) : tab === 'Overview' ? (
        <div className="cards news-overview">
          {OVERVIEW_CATS.map((cat) => {
            const list = catList(cat)
            return (
              <div key={cat} className="card">
                <h2>📰 {cat} <span className="kan-count">{list.length}</span></h2>
                {list.length === 0 ? (
                  <div className="list-empty">기사가 없습니다.</div>
                ) : (
                  list.slice(0, 5).map((a, i) => <OvTitle key={a.링크 + '@' + i} a={a} />)
                )}
                {list.length > 5 && <button className="linklike" onClick={() => setTab(cat)}>더보기 ({list.length}) →</button>}
              </div>
            )
          })}
        </div>
      ) : tab === '포트폴리오' ? (
        (dealEntries.length === 0 && stockEntries.length === 0) ? (
          <div className="card"><div className="list-empty">포트폴리오·보유 종목이 없습니다. (VC 포트폴리오 · Market 보유종목)</div></div>
        ) : (
          <div>
            {[{ title: '🤝 Deal', entries: dealEntries, empty: 'VC 포트폴리오 기업이 없습니다.' },
              { title: '📈 상장주식', entries: stockEntries, empty: '보유 종목이 없습니다.' }].map((grp) => (
              <div key={grp.title} className="card km-card">
                <h2>{grp.title} <span className="kan-count">{grp.entries.length}</span></h2>
                {grp.entries.length === 0 ? (
                  <div className="list-empty">{grp.empty}</div>
                ) : (
                  <div className="news-pf-grid">
                    {grp.entries.map((e) => {
                      const list = searched.filter((a) => matchTerms(a.제목, e.terms))
                      return (
                        <div key={e.label} className="news-pf-item">
                          <h3>📌 {e.label} <span className="kan-count">{list.length}</span></h3>
                          <div className="news-pf-list">
                            {list.length === 0
                              ? <div className="list-empty">관련 뉴스가 없습니다.</div>
                              : list.map((a, i) => <Article key={a.링크 + '@' + i} a={a} />)}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="card">
          <h2>📰 {tab} <span className="kan-count">{catList(tab).length}</span></h2>
          {catList(tab).length === 0 ? (
            <div className="list-empty">해당 기사가 없습니다.</div>
          ) : (
            catList(tab).map((a, i) => <Article key={a.링크 + '@' + i} a={a} />)
          )}
        </div>
      )}
    </div>
  )
}
