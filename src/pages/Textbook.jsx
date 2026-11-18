import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useData } from '../useData.js'
import { Textbook } from '../components/SemiBriefing.jsx'

// 교과서 탭 — 산업별 교과서를 모아 보는 곳. 현재는 반도체 교과서 1권.
// 데이터: public/data/semi/textbook.json (매주 월요일 반도체 브리핑 예약 작업이 15장 갱신), 워드: public/briefs/semi/textbook.docx
// 열람 중인 장은 주소(#/textbook?ch=<장 id>)에 남겨 링크·새로고침·뒤로가기로 그대로 열린다.
export default function TextbookPage() {
  const { data: tb, error } = useData('semi/textbook.json')
  const [sp, setSp] = useSearchParams()
  const openCh = sp.get('ch')
  const topRef = useRef(null)
  const setOpenCh = (id) => setSp(id ? { ch: id } : {})
  useEffect(() => {
    if (openCh) topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [openCh])
  return (
    <div className="wb sb" ref={topRef}>
      <Textbook tb={tb} error={error} openCh={openCh} setOpenCh={setOpenCh} />
    </div>
  )
}
