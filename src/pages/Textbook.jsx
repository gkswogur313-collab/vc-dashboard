import { useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useData } from '../useData.js'
import { Textbook, DOMAINS } from '../components/SemiBriefing.jsx'

// 교과서 탭 — 산업별 교과서를 모아 보는 곳(현재 반도체·AI 2권).
// 데이터: public/data/<semi|ai>/textbook.json, 워드: public/briefs/<semi|ai>/textbook.docx
// 매주 월요일 각 분야 브리핑 예약 작업이 '최신 기술동향' 장과 장별 '최근 업데이트'를 갱신하고, 분기마다 본문에 통합한다.
// 주소: #/textbook?book=<semi|ai>&ch=<장 id> — 링크·새로고침·뒤로가기로 그대로 열린다(book 생략 시 반도체).
const BOOK_KEYS = ['semi', 'ai']

export default function TextbookPage() {
  const semi = useData('semi/textbook.json')
  const ai = useData('ai/textbook.json')
  const all = { semi, ai }
  const [sp, setSp] = useSearchParams()
  const book = BOOK_KEYS.includes(sp.get('book')) ? sp.get('book') : 'semi'
  const openCh = sp.get('ch')
  const topRef = useRef(null)
  const go = (b, ch) => setSp(ch ? { book: b, ch } : { book: b })
  const otherTitles = useMemo(() => Object.fromEntries(BOOK_KEYS.map((k) => [k, Object.fromEntries((all[k].data?.장 || []).map((c) => [c.id, `${c.번호}장 ${c.제목}`]))])), [semi.data, ai.data]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (openCh) topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [openCh, book])
  const cur = all[book]
  return (
    <div className="wb sb" ref={topRef}>
      <div className="tabs" role="tablist" aria-label="교과서 선택">
        {BOOK_KEYS.map((k) => {
          const tb = all[k].data
          return (
            <button key={k} role="tab" aria-selected={book === k} className={'tab-btn' + (book === k ? ' active' : '')} onClick={() => go(k)}>
              {DOMAINS[k].icon} {DOMAINS[k].name} 교과서{tb ? <span className="muted" style={{ fontWeight: 500, marginLeft: 4 }}>v{tb.버전}</span> : null}
            </button>
          )
        })}
      </div>
      <Textbook
        key={book}
        book={book}
        tb={cur.data}
        error={cur.error}
        openCh={openCh}
        setOpenCh={(id) => go(book, id)}
        otherTitles={otherTitles}
        onOpenOther={(b, ch) => go(b, ch)}
      />
    </div>
  )
}
