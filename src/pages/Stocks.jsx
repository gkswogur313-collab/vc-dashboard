import PostIPO from './PostIPO.jsx'

// Market — 국내·해외 시세(Korea/Global Market, Overview)는 2026-10 폐지.
// GitHub Actions 무료 한도 절약을 위해 시세 크롤러와 화면을 걷어내고 Post-IPO만 남겼다.
export default function Stocks() {
  return (
    <div>
      <PostIPO />
    </div>
  )
}
