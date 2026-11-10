import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import { LPPage, GPPage, IPOPage, DealMarketPage, DartPage, SourcingPage } from './pages/VC.jsx'
import Stocks from './pages/Stocks.jsx'
import News from './pages/News.jsx'
import IndustryTracking from './components/IndustryTracking.jsx'
import WeeklyReport from './pages/WeeklyReport.jsx'

// GitHub Pages(하위 경로 배포)에서는 HashRouter 가 새로고침 404 문제가 없어 가장 안전합니다.
// 홈 화면은 2026-10 폐지 — '/'와 예전 주소(#/vc 등)는 첫 메뉴(IPO)로 보낸다.
// 예전 Market(#/stocks)은 Post-IPO(#/post-ipo)로 이름이 바뀌었다.
export default function App() {
  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/ipo" replace />} />
          <Route path="/lp" element={<LPPage />} />
          <Route path="/gp" element={<GPPage />} />
          <Route path="/sourcing" element={<SourcingPage />} />
          <Route path="/ipo" element={<IPOPage />} />
          <Route path="/deals" element={<DealMarketPage />} />
          <Route path="/dart" element={<DartPage />} />
          <Route path="/post-ipo" element={<Stocks />} />
          <Route path="/stocks" element={<Navigate to="/post-ipo" replace />} />
          <Route path="/news" element={<News />} />
          <Route path="/industry" element={<IndustryTracking />} />
          <Route path="/weekly" element={<WeeklyReport />} />
          <Route path="*" element={<Navigate to="/ipo" replace />} />
        </Routes>
      </Layout>
    </HashRouter>
  )
}
