import { useState, useEffect } from 'react'
import { useTodos } from '../useTodos.js'
import { sheetInfo, connect, subscribe } from '../googleSync.js'

// To Do 위젯 (홈·캘린더 공용).
// 체크박스 → 완료(줄긋기) · 내용 더블클릭 → 수정 · 삭제(×)는 완료 항목에서만 활성화.
// 우측 상단 "☁️ 동기화" → 구글 시트 연동(딜과 같은 시트를 공유). 연동하면 폰·PC 간 동기화됨.
export default function TodoList() {
  const { todos, add, toggle, remove, update } = useTodos()
  const [input, setInput] = useState('')
  const [editing, setEditing] = useState(null)
  const [editText, setEditText] = useState('')
  const [sync, setSync] = useState(sheetInfo())
  const [busy, setBusy] = useState(false)

  useEffect(() => subscribe(setSync), [])

  const submit = (e) => { e.preventDefault(); add(input); setInput('') }
  const startEdit = (t) => { setEditing(t.id); setEditText(t.text) }
  const commitEdit = () => { if (editing) { update(editing, editText); setEditing(null) } }
  const doConnect = async () => {
    setBusy(true)
    try { await connect() } catch (e) { /* 팝업 취소 등은 무시 */ }
    setBusy(false)
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h2 style={{ marginBottom: 0 }}>✅ To Do List</h2>
        {sync.connected ? (
          <span className="muted" style={{ fontSize: 12 }} title="구글 시트와 동기화 중 (폰·PC 공유)">☁️ 동기화됨</span>
        ) : (
          <button className="chip" onClick={doConnect} disabled={busy} title="구글 시트에 연동하면 폰·PC 간 동기화됩니다">
            {busy ? '연결 중…' : '☁️ 동기화'}
          </button>
        )}
      </div>
      <div className="scroll-list" style={{ marginTop: 12 }}>
        {todos.length === 0 ? (
          <div className="list-empty">할 일을 추가해 보세요.</div>
        ) : (
          todos.map((t) => (
            <div key={t.id} className="todo-row">
              <input type="checkbox" checked={t.done} onChange={() => toggle(t.id)} />
              {editing === t.id ? (
                <input
                  className="todo-edit"
                  value={editText}
                  autoFocus
                  onChange={(e) => setEditText(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(null) }}
                />
              ) : (
                <span className={t.done ? 'todo-done' : ''} onDoubleClick={() => startEdit(t)} title="더블클릭하여 수정">{t.text}</span>
              )}
              <button
                className="todo-del"
                onClick={() => remove(t.id)}
                disabled={!t.done}
                title={t.done ? '삭제' : '완료 처리한 항목만 삭제할 수 있어요'}
                aria-label="삭제"
              >×</button>
            </div>
          ))
        )}
      </div>
      <form className="todo-add" onSubmit={submit}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="할 일 추가..." />
        <button type="submit" className="chip">추가</button>
      </form>
    </div>
  )
}
