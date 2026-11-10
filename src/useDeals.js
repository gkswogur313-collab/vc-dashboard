import { useState, useEffect } from 'react'
import {
  registerFeature, init,
  connect as gsConnect, syncNow as gsSync, disconnect as gsDisconnect,
  sheetInfo as gsSheetInfo, readTab, writeTab,
} from './googleSync.js'

// 딜 파이프라인 단계 (순서대로)
export const STAGES = ['발굴/접수', '초도 검토', '미팅', 'RFI', 'IC&제안서', 'LP모집', '종결']

const KEY = 'vc_deals'
const emptyStages = () => STAGES.reduce((o, s) => ((o[s] = ''), o), {})

const SEED = [
  {
    id: 'd1', 회사명: '예시 AI스타트업', 섹터: 'AI/SaaS', 라운드: 'Series A / 30억', 밸류: '200억',
    메모: 'IR 미팅 완료, 재무 검토 중', driveUrl: '', dropDate: '', dropReason: '',
    stages: { ...emptyStages(), '발굴/접수': '2026-06-20', '초도 검토': '2026-07-01', '미팅': '2026-07-10' },
  },
  {
    id: 'd2', 회사명: '예시 바이오', 섹터: '바이오/헬스', 라운드: 'Pre-A / 15억', 밸류: '80억',
    메모: '창업자 소개 받음', driveUrl: '', dropDate: '', dropReason: '',
    stages: { ...emptyStages(), '발굴/접수': '2026-07-15' },
  },
  {
    id: 'd3', 회사명: '예시 핀테크', 섹터: '핀테크', 라운드: 'Series B / 80억', 밸류: '600억',
    메모: 'IC 상정 예정', driveUrl: '', dropDate: '', dropReason: '',
    stages: { ...emptyStages(), '발굴/접수': '2026-05-10', '초도 검토': '2026-05-20', '미팅': '2026-06-01', 'RFI': '2026-06-15', 'IC&제안서': '2026-07-01' },
  },
]

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch (e) { /* 무시 */ }
  return SEED
}

let store = load()
const listeners = new Set()
function setStore(next) {
  store = next
  try { localStorage.setItem(KEY, JSON.stringify(store)) } catch (e) { /* 무시 */ }
  listeners.forEach((l) => l(store))
}

// 카드가 위치할 단계 = 날짜가 입력된 가장 마지막(진행된) 단계. DROP 날짜 있으면 'DROP'.
export function currentStage(deal) {
  if (deal.dropDate) return 'DROP'
  let cur = STAGES[0]
  for (const s of STAGES) {
    if (deal.stages && deal.stages[s]) cur = s
  }
  return cur
}

// ── 구글 시트(공유 'Deals' 탭) 매핑 ────────────────────────
const COLS = ['id', '회사명', '섹터', '라운드', '밸류', '메모', 'driveUrl', ...STAGES, 'dropDate', 'dropReason']

function dealToRow(d) {
  return [d.id, d.회사명 || '', d.섹터 || '', d.라운드 || '', d.밸류 || '', d.메모 || '', d.driveUrl || '',
    ...STAGES.map((s) => (d.stages && d.stages[s]) || ''), d.dropDate || '', d.dropReason || '']
}
function rowToDeal(row) {
  const o = {}
  COLS.forEach((c, i) => { o[c] = row[i] != null ? String(row[i]) : '' })
  const stages = {}
  STAGES.forEach((s) => { stages[s] = o[s] || '' })
  return {
    id: o.id || 'd' + Date.now() + Math.random().toString(36).slice(2, 5),
    회사명: o.회사명, 섹터: o.섹터, 라운드: o.라운드, 밸류: o.밸류, 메모: o.메모, driveUrl: o.driveUrl,
    dropDate: o.dropDate, dropReason: o.dropReason, stages,
  }
}

// 시트 → 로컬
async function pullDeals() {
  const rows = await readTab('Deals')
  if (!rows) return
  const data = rows.slice(1).filter((r) => r && r[1]).map(rowToDeal) // 헤더 제외 + 회사명 있는 행만
  setStore(data)
}
// 로컬 → 시트 (변경 시 호출; 미연동이면 내부에서 아무 것도 안 함)
function pushDeals() {
  writeTab('Deals', [COLS, ...store.map(dealToRow)]).catch((e) => console.warn('딜 시트 저장 실패:', e.message))
}

registerFeature({ pull: pullDeals, push: pushDeals })

// 저장/삭제 시 로컬 반영 + 시트에 반영(연동된 경우)
export function upsertDeal(deal) {
  const exists = store.some((d) => d.id === deal.id)
  setStore(exists ? store.map((d) => (d.id === deal.id ? deal : d)) : [...store, deal])
  pushDeals()
}
export function removeDeal(id) {
  setStore(store.filter((d) => d.id !== id))
  pushDeals()
}

// VC 화면이 쓰던 이름 그대로 유지(내부 구현만 공용 동기화로 교체)
export function sheetInfo() { return gsSheetInfo() }
export async function connectSheet() { return gsConnect() }
export async function pullSheet() { await gsSync() }
export function disconnectSheet() { gsDisconnect() }

export function useDeals() {
  const [deals, setDeals] = useState(store)
  useEffect(() => {
    const l = (s) => setDeals(s)
    listeners.add(l)
    setDeals(store)
    return () => { listeners.delete(l) }
  }, [])
  return { deals, upsert: upsertDeal, remove: removeDeal }
}

export function newDeal() {
  return {
    id: 'd' + Date.now() + Math.random().toString(36).slice(2, 5),
    회사명: '', 섹터: '', 라운드: '', 밸류: '', 메모: '', driveUrl: '', dropDate: '', dropReason: '',
    stages: emptyStages(),
  }
}

// 앱 로드 시 자동 재동기화(모든 기능 등록 후 실행되도록 다음 틱에).
setTimeout(() => { init() }, 0)
