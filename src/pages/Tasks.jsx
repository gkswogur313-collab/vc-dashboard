import { useData } from '../useData.js'

export default function Tasks() {
  const { data: todos } = useData('todos.json')
  const open = (todos || []).filter((t) => !t.완료)
  const done = (todos || []).filter((t) => t.완료)

  return (
    <div>
      <p className="section-intro">
        To Do List — 우선순위 · 완료 처리 · 진행도 · 메모.
        (다음 단계에서 모달 추가·수정, 우선순위 필터, 완료 처리 기능을 붙입니다.)
      </p>

      <div className="cards">
        <div className="card">
          <h2>✅ 진행 중 ({open.length})</h2>
          {open.length === 0 ? <div className="list-empty">할 일이 없습니다.</div> : open.map((t) => (
            <div key={t.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span className="badge">{t.우선순위}</span>
              <span>{t.제목}</span>
              <span className="muted" style={{ marginLeft: 'auto' }}>{t.기한}</span>
            </div>
          ))}
        </div>
        <div className="card">
          <h2>🏁 완료 ({done.length})</h2>
          {done.length === 0 ? <div className="list-empty">완료 항목이 없습니다.</div> : done.map((t) => (
            <div key={t.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)', opacity: 0.65 }}>
              <span>✔</span>
              <span style={{ textDecoration: 'line-through' }}>{t.제목}</span>
              <span className="muted" style={{ marginLeft: 'auto' }}>{t.기한}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
