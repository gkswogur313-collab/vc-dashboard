import { useEffect, useState } from 'react'

// 라이트/다크 테마 훅. 선택값은 사용자 브라우저(localStorage)에만 저장.
export function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('vc_theme')
      if (saved) return saved
    } catch (e) { /* localStorage 미지원 환경 무시 */ }
    return 'dark' // 기본값: 다크 (기기 설정과 무관하게 어둡게 시작)
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem('vc_theme', theme) } catch (e) { /* 무시 */ }
  }, [theme])

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  return { theme, toggle }
}
