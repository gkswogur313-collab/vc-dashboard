// 대시보드 최상위 섹션 정의 (사이드바 + 모바일 하단 탭바 공용)
// 순서 = 메뉴 표시 순서. 첫 번째 항목이 기본 화면('/' 접속 시 이동)
export const SECTIONS = [
  { path: '/weekly',   label: 'JH Weekly Report', short: '위클리', icon: '🗞️' },
  { path: '/ipo',      label: 'IPO',         short: 'IPO',  icon: '📅' },
  { path: '/post-ipo', label: 'Post-IPO',    short: '상장후', icon: '📈' },
  { path: '/dart',     label: '공시분석',    short: '공시', icon: '📑' },
  { path: '/deals',    label: 'Deal Market', short: '딜',   icon: '🤝' },
  { path: '/industry', label: '산업 트래킹', short: '산업', icon: '🏭' },
  { path: '/news',     label: 'News',        short: '뉴스', icon: '📰' },
  { path: '/gp',       label: 'GP 검색',     short: 'GP',   icon: '🔎' },
  { path: '/sourcing', label: '세컨더리·소싱', short: '소싱', icon: '🔄' },
  { path: '/lp',       label: '출자사업',    short: '출자', icon: '🏛️' },
]
