import { useState, useEffect } from 'react'
import { registerFeature, init, readTab, writeTab } from './googleSync.js'

// To Do 목록 — 모듈 단위 공유 저장소(브라우저 localStorage) + 구글 시트('Todos' 탭) 동기화.
// 여러 화면(홈 타일, 홈 위젯, 캘린더 위젯)에서 같은 상태를 실시간 공유하도록 구독 방식 사용.
const KEY = 'vc_todos'
const SEED = [
  { id: 't1', text: '예시: 딜 재무자료 검토', done: false },
  { id: 't2', text: '예시: 포트폴리오사 월간 업데이트', done: false },
  { id: 't3', text: '예시: 관심 종목 리서치 노트', done: true },
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

// ── 구글 시트('Todos' 탭) 동기화 ──────────────────────────
function todoToRow(t) { return [t.id, t.text || '', t.done ? '1' : ''] }
function rowToTodo(r) { return { id: String(r[0]), text: r[1] != null ? String(r[1]) : '', done: r[2] === '1' || r[2] === 'TRUE' || r[2] === true } }

async function pullTodos() {
  const rows = await readTab('Todos')
  if (!rows) return
  const data = rows.slice(1).filter((r) => r && r[0]).map(rowToTodo) // 헤더 제외 + id 있는 행만
  setStore(data)
}
function pushTodos() {
  writeTab('Todos', [['id', 'text', 'done'], ...store.map(todoToRow)]).catch((e) => console.warn('To Do 시트 저장 실패:', e.message))
}

registerFeature({ pull: pullTodos, push: pushTodos })

export function useTodos() {
  const [todos, setTodos] = useState(store)

  useEffect(() => {
    const l = (s) => setTodos(s)
    listeners.add(l)
    setTodos(store)
    return () => { listeners.delete(l) }
  }, [])

  const add = (text) => {
    const t = (text || '').trim()
    if (!t) return
    const id = 'id' + Date.now() + Math.random().toString(36).slice(2, 6)
    setStore([...store, { id, text: t, done: false }]); pushTodos()
  }
  const toggle = (id) => { setStore(store.map((x) => (x.id === id ? { ...x, done: !x.done } : x))); pushTodos() }
  const remove = (id) => { setStore(store.filter((x) => x.id !== id)); pushTodos() }
  const update = (id, text) => { const t = (text || '').trim(); if (!t) return; setStore(store.map((x) => (x.id === id ? { ...x, text: t } : x))); pushTodos() }

  return { todos, add, toggle, remove, update }
}

// 앱 로드 시 자동 재동기화(모든 기능 등록 후 실행되도록 다음 틱에).
setTimeout(() => { init() }, 0)
