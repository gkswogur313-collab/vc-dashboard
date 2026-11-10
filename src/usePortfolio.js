import { useState, useEffect } from 'react'

// 운용 펀드 + 포트폴리오(투자기업) 저장소 — 브라우저 localStorage 모듈 스토어(구독 방식).
// 딜과 동일하게 화면 간 실시간 공유. (향후 구글 시트/토큰 저장 연동 여지)

function makeStore(KEY, SEED) {
  let store
  try { const raw = localStorage.getItem(KEY); store = raw ? JSON.parse(raw) : SEED } catch (e) { store = SEED }
  const listeners = new Set()
  const set = (next) => {
    store = next
    try { localStorage.setItem(KEY, JSON.stringify(store)) } catch (e) { /* 무시 */ }
    listeners.forEach((l) => l(store))
  }
  return { get: () => store, listeners, set }
}
const genId = () => 'id' + Date.now() + Math.random().toString(36).slice(2, 6)

// ---------- 펀드 ----------
const FUND_SEED = [
  { id: 'f1', 펀드명: '예시 1호 벤처투자조합', 결성금액: '30000', 투자금액: '12000', 결성일: '2023-05-01', 만기일: '2031-04-30', 기준수익률: '8%', 관리보수: '2.0%', 성과보수: '20%', 보고주기: '분기', 메모: '' },
]
const fundStore = makeStore('vc_funds', FUND_SEED)
export const newFund = () => ({ id: genId(), 펀드명: '', 결성금액: '', 투자금액: '', 결성일: '', 만기일: '', 기준수익률: '', 관리보수: '', 성과보수: '', 보고주기: '', 메모: '' })

export function useFunds() {
  const [items, setItems] = useState(fundStore.get())
  useEffect(() => { const l = (s) => setItems(s); fundStore.listeners.add(l); setItems(fundStore.get()); return () => { fundStore.listeners.delete(l) } }, [])
  const upsert = (it) => { const cur = fundStore.get(); fundStore.set(cur.some((x) => x.id === it.id) ? cur.map((x) => (x.id === it.id ? it : x)) : [...cur, it]) }
  const remove = (id) => fundStore.set(fundStore.get().filter((x) => x.id !== id))
  return { items, upsert, remove }
}

// ---------- 포트폴리오(투자기업) ----------
const blankLeg = () => ({ 금액: '', 주식수: '', 단가: '', value: '', 일자: '' })
const PF_SEED = [
  { id: 'p1', 기업명: '예시 AI스타트업', 조합명: '예시 1호', 뉴스검색어: '', inv: { 금액: '1000', 주식수: '5000', 단가: '200000', value: '200억', 일자: '2024-03-15' }, exit: blankLeg(), 메모: '' },
]
const pfStore = makeStore('vc_portfolio', PF_SEED)
export const newPortfolio = () => ({ id: genId(), 기업명: '', 조합명: '', 뉴스검색어: '', inv: blankLeg(), exit: blankLeg(), 메모: '' })

export function usePortfolio() {
  const [items, setItems] = useState(pfStore.get())
  useEffect(() => { const l = (s) => setItems(s); pfStore.listeners.add(l); setItems(pfStore.get()); return () => { pfStore.listeners.delete(l) } }, [])
  const upsert = (it) => { const cur = pfStore.get(); pfStore.set(cur.some((x) => x.id === it.id) ? cur.map((x) => (x.id === it.id ? it : x)) : [...cur, it]) }
  const remove = (id) => pfStore.set(pfStore.get().filter((x) => x.id !== id))
  return { items, upsert, remove }
}
