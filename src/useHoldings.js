import { useState, useEffect } from 'react'

// 보유 종목 저장소 — VC 포트폴리오/딜과 동일한 localStorage 모듈 스토어(구독 방식).
// 편집 시 뉴스 포트폴리오·홈 지표에 실시간 반영.
// 수익률(일/주/월/분기/연/YTD)은 시세 연동 단계에서 티커 기준으로 채움.

const KEY = 'vc_holdings'
const SEED = [
  { id: 'h1', 종목: '삼성전자', 티커: '005930', 시장: 'KOSPI', 수량: 100, 평단: 72000, 뉴스검색어: '', 메모: '' },
  { id: 'h2', 종목: 'NVIDIA', 티커: 'NVDA', 시장: 'US', 수량: 10, 평단: 118.5, 뉴스검색어: '엔비디아', 메모: 'AI 반도체' },
]

let store
try { const raw = localStorage.getItem(KEY); store = raw ? JSON.parse(raw) : SEED } catch (e) { store = SEED }
const listeners = new Set()
const setStore = (next) => {
  store = next
  try { localStorage.setItem(KEY, JSON.stringify(store)) } catch (e) { /* 무시 */ }
  listeners.forEach((l) => l(store))
}
const genId = () => 'h' + Date.now() + Math.random().toString(36).slice(2, 6)

export const newHolding = () => ({ id: genId(), 종목: '', 티커: '', 시장: 'KOSPI', 수량: '', 평단: '', 뉴스검색어: '', 메모: '' })

export function useHoldings() {
  const [items, setItems] = useState(store)
  useEffect(() => {
    const l = (s) => setItems(s)
    listeners.add(l); setItems(store)
    return () => { listeners.delete(l) }
  }, [])
  const upsert = (it) => setStore(store.some((x) => x.id === it.id) ? store.map((x) => (x.id === it.id ? it : x)) : [...store, it])
  const remove = (id) => setStore(store.filter((x) => x.id !== id))
  return { items, upsert, remove }
}
