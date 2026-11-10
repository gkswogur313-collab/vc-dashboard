import { useState, useEffect } from 'react'

export default function Settings() {
  const [token, setToken] = useState('')
  const [saved, setSaved] = useState(false)
  const [hasToken, setHasToken] = useState(false)

  useEffect(() => {
    try { setHasToken(!!localStorage.getItem('gh_token')) } catch (e) { /* 무시 */ }
  }, [])

  const save = () => {
    try {
      if (token.trim()) {
        localStorage.setItem('gh_token', token.trim())
        setHasToken(true); setToken(''); setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } catch (e) { alert('이 브라우저에서는 저장할 수 없습니다.') }
  }
  const clear = () => {
    try { localStorage.removeItem('gh_token'); setHasToken(false) } catch (e) { /* 무시 */ }
  }

  return (
    <div>
      <p className="section-intro">
        GitHub 토큰 관리 · 테마 · 데이터 백업/복원. 토큰은 <strong>이 브라우저에만</strong> 저장되며
        저장소에 커밋되거나 외부로 전송되지 않습니다.
      </p>

      <div className="card" style={{ marginBottom: 16, maxWidth: 620 }}>
        <h2>🔑 GitHub 저장용 토큰</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          데이터(data/*.json)를 GitHub에 커밋해 영구 저장할 때 사용합니다. Personal Access Token을 입력하세요.
          현재 상태: {hasToken ? <span className="badge">저장됨</span> : <span className="muted">미저장</span>}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ghp_..."
            style={{ flex: 1, minWidth: 220, padding: '10px 12px', borderRadius: 10,
              border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)' }}
          />
          <button className="theme-btn" style={{ margin: 0 }} onClick={save}>{saved ? '✓ 저장됨' : '저장'}</button>
          {hasToken && <button className="theme-btn" style={{ margin: 0 }} onClick={clear}>삭제</button>}
        </div>
      </div>

      <div className="card" style={{ maxWidth: 620 }}>
        <h2>🎨 테마 · 💾 데이터</h2>
        <p className="muted">테마(라이트/다크)는 좌측 하단(모바일은 우측 상단) 버튼으로 전환하며 자동 저장됩니다.</p>
        <p className="muted" style={{ marginTop: 8 }}>
          데이터 백업/복원(data/*.json 내보내기·불러오기)은 다음 단계에서 추가합니다.
        </p>
      </div>
    </div>
  )
}
