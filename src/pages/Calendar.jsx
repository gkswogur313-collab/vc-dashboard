import { useState } from 'react'
import { useCalendar } from '../CalendarContext.jsx'
import TodoList from '../components/TodoList.jsx'
import { fmtTime } from '../googleCalendar.js'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const pad = (n) => String(n).padStart(2, '0')
const keyOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`
const dowClass = (i) => (i === 0 ? 'dow-sun' : i === 6 ? 'dow-sat' : '')

export default function Calendar() {
  const { connected, events, loading, error, connect, disconnect } = useCalendar()
  const now = new Date()
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() })

  const byDay = {}
  for (const e of events) {
    const k = (e.일시 || '').slice(0, 10)
    if (!k) continue
    ;(byDay[k] = byDay[k] || []).push(e)
  }
  for (const k in byDay) byDay[k].sort((a, b) => (a.일시 || '').localeCompare(b.일시 || ''))

  const todayKey = keyOf(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEvents = byDay[todayKey] || []

  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
  const weekDays = Array.from({ length: 7 }, (_, i) =>
    new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)
  )

  const first = new Date(view.y, view.m, 1)
  const startPad = first.getDay()
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < startPad; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const prevMonth = () => setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))
  const nextMonth = () => setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))
  const goToday = () => setView({ y: now.getFullYear(), m: now.getMonth() })

  if (!connected) {
    return (
      <div>
        <p className="section-intro">
          구글 캘린더를 연결해 개인 미팅·마감·투자 일정을 한 곳에서 봅니다. (일정은 브라우저에서만 불러오며 저장소에 저장되지 않습니다.)
        </p>
        <div className="subnav">
          <button className="chip" onClick={connect} style={{ cursor: 'pointer' }}>🔗 구글 캘린더 연결</button>
        </div>
        {error && <div className="card" style={{ borderColor: 'var(--bad)' }}><span style={{ color: 'var(--bad)' }}>오류: {error}</span></div>}
        <div className="card"><div className="list-empty">위의 "구글 캘린더 연결"을 누르면 일정이 표시됩니다.</div></div>
      </div>
    )
  }

  return (
    <div>
      <div className="subnav">
        <a className="chip" href="https://calendar.google.com" target="_blank" rel="noreferrer">📝 캘린더 수정</a>
        <button className="chip" onClick={disconnect} style={{ cursor: 'pointer' }}>🔌 연결 해제</button>
        {loading && <span className="chip">불러오는 중…</span>}
      </div>
      {error && <div className="card" style={{ marginBottom: 16, borderColor: 'var(--bad)' }}><span style={{ color: 'var(--bad)' }}>오류: {error}</span></div>}

      {/* 1) 오늘 일정 + To Do List (2단) */}
      <div className="cal-top">
        <div className="card">
          <h2>📅 오늘 일정 <span className="badge">{todayKey}</span></h2>
          {todayEvents.length === 0 ? (
            <div className="list-empty">오늘 등록된 일정이 없습니다.</div>
          ) : (
            <div className="scroll-list">
              {todayEvents.map((e) => (
                <div key={e.id} className="ev-row">
                  <span className="badge">{fmtTime(e)}</span>
                  <span title={e.제목}>{e.제목}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <TodoList />
      </div>

      {/* 2) 이번 주 — 일정 표시 + 스크롤 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2>🗓️ 이번 주</h2>
        <div className="week-strip">
          {weekDays.map((d, i) => {
            const k = keyOf(d.getFullYear(), d.getMonth(), d.getDate())
            const evs = byDay[k] || []
            return (
              <div key={k} className={'week-cell' + (k === todayKey ? ' today' : '')}>
                <div className="wd-head">
                  <span className={'wd ' + dowClass(i)}>{WEEKDAYS[i]}</span>
                  <span className="wd-date">{d.getDate()}</span>
                </div>
                <div className="wd-list">
                  {evs.map((e) => (
                    <div key={e.id} className="wev" title={e.제목}>{e.종일 ? '' : fmtTime(e) + ' '}{e.제목}</div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 3) 월간 — 각 칸 스크롤 */}
      <div className="card">
        <div className="cal-head">
          <h2>🗓️ {view.y}년 {view.m + 1}월</h2>
          <div className="cal-nav">
            <button className="chip" onClick={prevMonth} style={{ cursor: 'pointer' }}>◀</button>
            <button className="chip" onClick={goToday} style={{ cursor: 'pointer' }}>오늘</button>
            <button className="chip" onClick={nextMonth} style={{ cursor: 'pointer' }}>▶</button>
          </div>
        </div>
        <div className="month-head">
          {WEEKDAYS.map((w, i) => <div key={w} className={dowClass(i)}>{w}</div>)}
        </div>
        <div className="month-grid">
          {cells.map((d, idx) => {
            if (d === null) return <div key={idx} className="day-cell empty" />
            const k = keyOf(view.y, view.m, d)
            const evs = byDay[k] || []
            const dow = idx % 7
            return (
              <div key={idx} className={'day-cell' + (k === todayKey ? ' today' : '') + (evs.length ? ' has-ev' : '')}>
                <div className={'day-num ' + dowClass(dow)}>{d}</div>
                <div className="day-evs">
                  {evs.map((e) => (
                    <span key={e.id} className="ev-chip" title={e.제목}>{e.종일 ? '' : fmtTime(e) + ' '}{e.제목}</span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
