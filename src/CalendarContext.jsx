import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { connectGoogle, getValidToken, refreshGoogleSilently, fetchEvents, disconnectGoogle, hasOptedIn } from './googleCalendar.js'

// 구글 캘린더 연결 상태·일정을 앱 전역에서 공유 (홈 "오늘 일정" ↔ 캘린더 페이지 동일 소스)
// 연결은 localStorage에 기억되고, 토큰 만료 시 팝업 없이 자동 재발급된다.
const Ctx = createContext(null)

export function CalendarProvider({ children }) {
  const [connected, setConnected] = useState(() => hasOptedIn())
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // 유효 토큰 확보 → 일정 로드. 401이면 한 번 조용히 재발급 후 재시도.
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const tk = await getValidToken()
      if (!tk) { setConnected(false); return }
      setConnected(true)
      try {
        setEvents(await fetchEvents(tk))
      } catch (e) {
        if (/401|만료/.test(e.message || '')) {
          const tk2 = await refreshGoogleSilently().catch(() => null)
          if (tk2) { setEvents(await fetchEvents(tk2)); return }
          disconnectGoogle(); setConnected(false)
          setError('구글 세션이 만료되어 다시 연결이 필요합니다.')
        } else {
          setError(e.message)
        }
      }
    } catch (e) {
      // 조용한 재발급 실패(동의 철회·로그아웃 등) → 재연결 필요
      disconnectGoogle(); setConnected(false)
    } finally {
      setLoading(false)
    }
  }, [])

  // 시작 시: 이전에 연결했었다면 자동으로(팝업 없이) 일정 로드
  useEffect(() => { if (hasOptedIn()) load() }, [load])

  // 연결 중에는 45분마다 자동 갱신(토큰 1시간 만료 전에 미리 새로고침)
  useEffect(() => {
    if (!connected) return
    const id = setInterval(() => load(), 45 * 60 * 1000)
    return () => clearInterval(id)
  }, [connected, load])

  const connect = useCallback(async () => {
    setError(null)
    try {
      await connectGoogle()
      setConnected(true)
      load()
    } catch (e) {
      setError(e.message || '연결에 실패했습니다.')
    }
  }, [load])

  const disconnect = useCallback(() => {
    disconnectGoogle()
    setConnected(false)
    setEvents([])
  }, [])

  return (
    <Ctx.Provider value={{ connected, events, loading, error, connect, disconnect }}>
      {children}
    </Ctx.Provider>
  )
}

export const useCalendar = () => useContext(Ctx)
