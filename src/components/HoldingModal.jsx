import { useState, useRef, useEffect } from 'react'
import Modal from './Modal.jsx'
import { lookupTicker, lookupByCode, searchLocal } from '../tickers.js'
import { loadTickerBundle, searchBundle, lookupBundleByName, lookupBundleByCode } from '../tickerBundle.js'

// 시장 select 옵션 보정
const mktOpt = (m) => (['KOSPI', 'KOSDAQ', 'US'].includes(m) ? m : '기타')

// 보유 종목 편집 모달 — 종목명·티커 실시간 검색(네이버+야후) + 내장목록 즉시 채움.
export default function HoldingModal({ item, onSave, onClose, onDelete, isNew }) {
  const [f, setF] = useState(() => ({ ...item }))
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(null) // 'name' | 'ticker' | null
  const [searching, setSearching] = useState(false)
  const timer = useRef(null)
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))

  // 국내 전체 종목 목록(tickers-kr.json) 1회 로드 → 로컬 검색 커버리지 확대
  useEffect(() => { loadTickerBundle() }, [])

  // 코드+시장 기준 중복 제거
  const merge = (...lists) => {
    const seen = new Set(); const out = []
    for (const r of [].concat(...lists)) { const k = r.code + '|' + r.market; if (!seen.has(k)) { seen.add(k); out.push(r) } }
    return out
  }

  // 검색 — 내장목록 + 국내 전체목록(로컬) 즉시 노출 + 원격(네이버·야후) 병합
  const runSearch = (v, field) => {
    clearTimeout(timer.current)
    if (!v.trim()) { setResults([]); setOpen(null); return }
    const local = merge(searchLocal(v), searchBundle(v))
    setResults(local); setOpen(local.length > 0 ? field : null) // 즉시 로컬 후보
    setSearching(true)
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/stock-search?q=${encodeURIComponent(v)}`).then((res) => (res.ok ? res.json() : null))
        const remote = (r && r.results) || []
        const all = merge(local, remote)
        setResults(all); setOpen(all.length > 0 ? field : null)
      } catch (e) { /* 로컬 결과 유지 */ } finally { setSearching(false) }
    }, 220)
  }

  // 종목명 입력 → 내장/전체목록에서 정확히 일치하면 즉시 채움 + 검색
  const onName = (v) => {
    const hit = lookupTicker(v) || lookupBundleByName(v)
    setF((s) => (hit ? { ...s, 종목: v, 티커: hit.code, 시장: hit.market } : { ...s, 종목: v }))
    runSearch(v, 'name')
  }
  // 티커 입력 → 내장/전체목록에서 종목명·시장 채움 + 검색
  const onTicker = (v) => {
    const hit = lookupByCode(v) || lookupBundleByCode(v)
    setF((s) => (hit ? { ...s, 티커: v, 종목: hit.name, 시장: hit.market } : { ...s, 티커: v }))
    runSearch(v, 'ticker')
  }

  const pick = (r) => {
    setF((s) => ({ ...s, 종목: r.name, 티커: r.code, 시장: mktOpt(r.market) }))
    setResults([]); setOpen(null)
  }

  const save = () => { if (!f.종목.trim()) { alert('종목명을 입력하세요.'); return } onSave(f) }

  const Dropdown = () => (
    <div className="hm-search-dd">
      {results.map((r) => (
        <div key={r.code + r.market} className="hm-search-item" onMouseDown={() => pick(r)}>
          <span>{r.name}</span>
          <span className="code">{r.code} · {mktOpt(r.market)}</span>
        </div>
      ))}
    </div>
  )

  return (
    <Modal onClose={onClose}>
        <h2 style={{ marginBottom: 4 }}>{isNew ? '보유 종목 추가' : '보유 종목 편집'}</h2>

        <div className="modal-row">
          <div className="hm-search">
            <label>종목명 <span className="muted" style={{ fontSize: 11 }}>{searching ? '검색 중…' : '(검색)'}</span></label>
            <input
              value={f.종목}
              onChange={(e) => onName(e.target.value)}
              onFocus={() => results.length > 0 && open === 'name' && setOpen('name')}
              onBlur={() => setTimeout(() => setOpen(null), 150)}
              placeholder="종목명 검색 (예: 삼성, 엔비디아)"
              autoComplete="off"
            />
            {open === 'name' && <Dropdown />}
          </div>
          <div className="hm-search">
            <label>티커 <span className="muted" style={{ fontSize: 11 }}>(검색)</span></label>
            <input
              value={f.티커}
              onChange={(e) => onTicker(e.target.value)}
              onBlur={() => setTimeout(() => setOpen(null), 150)}
              placeholder="티커 검색 (예: 005930, NVDA)"
              autoComplete="off"
            />
            {open === 'ticker' && <Dropdown />}
          </div>
        </div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>종목명이나 티커를 일부만 입력하면 후보가 뜨고, 고르면 나머지·시장이 자동으로 채워집니다.</div>

        <div className="modal-row3">
          <div>
            <label>시장</label>
            <select value={f.시장} onChange={(e) => set('시장', e.target.value)}>
              <option value="KOSPI">KOSPI</option>
              <option value="KOSDAQ">KOSDAQ</option>
              <option value="US">US</option>
              <option value="기타">기타</option>
            </select>
          </div>
          <div><label>수량</label><input value={f.수량} onChange={(e) => set('수량', e.target.value)} placeholder="예: 100" /></div>
          <div><label>평단 (매입단가)</label><input value={f.평단} onChange={(e) => set('평단', e.target.value)} placeholder="예: 72000" /></div>
        </div>

        <label>뉴스 검색어 (별칭, 쉼표로 여러 개 · 선택)</label>
        <input value={f.뉴스검색어 || ''} onChange={(e) => set('뉴스검색어', e.target.value)} placeholder="예: NVIDIA → 엔비디아 (뉴스 매칭용)" />

        <label style={{ marginTop: 12 }}>메모</label>
        <textarea rows={2} value={f.메모} onChange={(e) => set('메모', e.target.value)} placeholder="메모" />

        <div className="modal-actions">
          {!isNew && <button className="btn-danger" onClick={() => onDelete(f.id)}>삭제</button>}
          <button className="btn-ghost" onClick={onClose}>취소</button>
          <button className="btn-primary" onClick={save}>저장</button>
        </div>
    </Modal>
  )
}
