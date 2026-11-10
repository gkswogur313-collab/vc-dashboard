import { NavLink, useLocation } from 'react-router-dom'
import { SECTIONS } from '../nav.js'
import { useTheme } from '../theme.js'

export default function Layout({ children }) {
  const { theme, toggle } = useTheme()
  const location = useLocation()
  const current = SECTIONS.find((s) => s.path === location.pathname) || SECTIONS[0]

  return (
    <div className="app">
      {/* 데스크톱: 좌측 사이드바 */}
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">📊</span>
          <span className="brand-text">VC Dashboard</span>
        </div>
        <nav className="side-nav">
          {SECTIONS.map((s) => (
            <NavLink
              key={s.path}
              to={s.path}
              end={s.path === '/'}
              className={({ isActive }) => 'side-link' + (isActive ? ' active' : '')}
            >
              <span className="ico">{s.icon}</span>
              <span className="lbl">{s.label}</span>
            </NavLink>
          ))}
        </nav>
        <button className="theme-btn" onClick={toggle} aria-label="테마 전환">
          {theme === 'dark' ? '☀️ 라이트' : '🌙 다크'}
        </button>
      </aside>

      {/* 본문 */}
      <div className="content">
        <header className="topbar">
          <h1 className="page-title">
            <span className="ico">{current.icon}</span> {current.label}
          </h1>
          <button className="theme-btn compact" onClick={toggle} aria-label="테마 전환">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </header>
        <main className="main">{children}</main>
      </div>

      {/* 모바일: 하단 탭바 */}
      <nav className="bottom-nav">
        {SECTIONS.map((s) => (
          <NavLink
            key={s.path}
            to={s.path}
            end={s.path === '/'}
            className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}
          >
            <span className="ico">{s.icon}</span>
            <span className="tab-lbl">{s.short}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
