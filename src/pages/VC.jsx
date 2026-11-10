import { useState } from 'react'
import { useData } from '../useData.js'
import LPNotices from '../components/LPNotices.jsx'
import GPSearch from '../components/GPSearch.jsx'
import IPOTable from '../components/IPOTable.jsx'
import FundingList from '../components/FundingList.jsx'
import FundingFollowup from '../components/FundingFollowup.jsx'
import DartScreener from '../components/DartScreener.jsx'
import Sourcing from '../components/Sourcing.jsx'

// VC 관련 화면 — 예전 'Venture Capital' 탭의 하위 탭들을 각각 좌측 메뉴의 독립 페이지로 분리(2026-10).
// 라우트·메뉴 정의는 src/App.jsx, src/nav.js 참고.

// 출자사업 — KVIC·KVCA 출자 공고
export function LPPage() {
  const { data: lp } = useData('lp-notices.json')
  return <LPNotices lp={lp} />
}

// GP 검색 — DIVA GP 공시
export function GPPage() {
  const { data: diva } = useData('diva.json')
  return <GPSearch diva={diva} />
}

// IPO 일정·파이프라인
export function IPOPage() {
  return <IPOTable />
}

// Deal Market — 펀딩 List / 신주 후보(펀딩 기반)
export function DealMarketPage() {
  const [dmSub, setDmSub] = useState('funding')
  return (
    <div>
      <div className="tabs">
        <button className={'tab-btn' + (dmSub === 'funding' ? ' active' : '')} onClick={() => setDmSub('funding')}>펀딩 List</button>
        <button className={'tab-btn' + (dmSub === 'followup' ? ' active' : '')} onClick={() => setDmSub('followup')}>신주 후보</button>
      </div>
      {dmSub === 'funding' && <FundingList />}
      {dmSub === 'followup' && <FundingFollowup />}
    </div>
  )
}

// 공시분석 — 스타트업 스크리너 + 잠재 LP
export function DartPage() {
  return <DartScreener />
}

// 세컨더리·소싱 — 구주 매도 제안 / 신주 투자 의향 대상 발굴 (운용사 포트폴리오 × DIVA 조합 만기 × 투자 라운드)
export function SourcingPage() {
  return <Sourcing />
}
