import { useState } from 'react'
import Modal from './Modal.jsx'

// 포트폴리오(투자기업) 편집 모달 — 투자 시 / Exit 정보를 그룹으로 입력
export default function PortfolioModal({ item, onSave, onClose, onDelete, isNew }) {
  const [f, setF] = useState(() => ({ ...item, inv: { ...item.inv }, exit: { ...item.exit } }))
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const setLeg = (leg, k, v) => setF((s) => ({ ...s, [leg]: { ...s[leg], [k]: v } }))
  const save = () => { if (!f.기업명.trim()) { alert('기업명을 입력하세요.'); return } onSave(f) }

  const Leg = ({ leg, dateLabel }) => (
    <>
      <div className="modal-row">
        <div><label>{dateLabel}</label><input type="date" value={f[leg].일자} onChange={(e) => setLeg(leg, '일자', e.target.value)} /></div>
        <div><label>금액 (백만원)</label><input value={f[leg].금액} onChange={(e) => setLeg(leg, '금액', e.target.value)} placeholder="예: 1000" /></div>
      </div>
      <div className="modal-row3">
        <div><label>주식수</label><input value={f[leg].주식수} onChange={(e) => setLeg(leg, '주식수', e.target.value)} placeholder="예: 5000" /></div>
        <div><label>단가 (원)</label><input value={f[leg].단가} onChange={(e) => setLeg(leg, '단가', e.target.value)} placeholder="예: 200000" /></div>
        <div><label>Value</label><input value={f[leg].value} onChange={(e) => setLeg(leg, 'value', e.target.value)} placeholder="예: 200억" /></div>
      </div>
    </>
  )

  return (
    <Modal onClose={onClose}>
        <h2 style={{ marginBottom: 4 }}>{isNew ? '포트폴리오 추가' : '포트폴리오 편집'}</h2>

        <div className="modal-row">
          <div><label>기업명</label><input value={f.기업명} onChange={(e) => set('기업명', e.target.value)} placeholder="기업명" /></div>
          <div><label>투자 조합명</label><input value={f.조합명} onChange={(e) => set('조합명', e.target.value)} placeholder="예: 1호 벤처투자조합" /></div>
        </div>
        <label>뉴스 검색어 (별칭, 쉼표로 여러 개 · 선택)</label>
        <input value={f.뉴스검색어 || ''} onChange={(e) => set('뉴스검색어', e.target.value)} placeholder="예: 영문사명/약칭 등 (예: NVIDIA → 엔비디아)" />

        <label style={{ marginTop: 16, color: 'var(--accent)', fontWeight: 700 }}>투자 시</label>
        <Leg leg="inv" dateLabel="투자일" />

        <label style={{ marginTop: 16, color: 'var(--good)', fontWeight: 700 }}>Exit (회수)</label>
        <Leg leg="exit" dateLabel="Exit 날짜" />

        <label style={{ marginTop: 16 }}>메모</label>
        <textarea rows={2} value={f.메모} onChange={(e) => set('메모', e.target.value)} placeholder="메모" />

        <div className="modal-actions">
          {!isNew && <button className="btn-danger" onClick={() => onDelete(f.id)}>삭제</button>}
          <button className="btn-ghost" onClick={onClose}>취소</button>
          <button className="btn-primary" onClick={save}>저장</button>
        </div>
    </Modal>
  )
}
