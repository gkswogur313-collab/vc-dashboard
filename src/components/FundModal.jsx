import { useState } from 'react'
import Modal from './Modal.jsx'

// 운용 펀드 편집 모달
export default function FundModal({ fund, onSave, onClose, onDelete, isNew }) {
  const [f, setF] = useState(() => ({ ...fund }))
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const save = () => { if (!f.펀드명.trim()) { alert('펀드명을 입력하세요.'); return } onSave(f) }

  return (
    <Modal onClose={onClose}>
        <h2 style={{ marginBottom: 4 }}>{isNew ? '펀드 추가' : '펀드 편집'}</h2>

        <label>펀드명</label>
        <input value={f.펀드명} onChange={(e) => set('펀드명', e.target.value)} placeholder="예: 1호 벤처투자조합" />

        <div className="modal-row">
          <div><label>결성금액 (백만원)</label><input value={f.결성금액} onChange={(e) => set('결성금액', e.target.value)} placeholder="예: 30000" /></div>
          <div><label>투자금액 (백만원)</label><input value={f.투자금액} onChange={(e) => set('투자금액', e.target.value)} placeholder="예: 12000" /></div>
        </div>
        <div className="modal-row">
          <div><label>결성일</label><input type="date" value={f.결성일} onChange={(e) => set('결성일', e.target.value)} /></div>
          <div><label>만기일</label><input type="date" value={f.만기일} onChange={(e) => set('만기일', e.target.value)} /></div>
        </div>
        <div className="modal-row3">
          <div><label>기준수익률</label><input value={f.기준수익률} onChange={(e) => set('기준수익률', e.target.value)} placeholder="예: 8%" /></div>
          <div><label>관리보수</label><input value={f.관리보수} onChange={(e) => set('관리보수', e.target.value)} placeholder="예: 2.0%" /></div>
          <div><label>성과보수</label><input value={f.성과보수} onChange={(e) => set('성과보수', e.target.value)} placeholder="예: 20%" /></div>
        </div>
        <label>보고주기</label>
        <input value={f.보고주기} onChange={(e) => set('보고주기', e.target.value)} placeholder="예: 분기 / 반기" />

        <label>메모</label>
        <textarea rows={2} value={f.메모} onChange={(e) => set('메모', e.target.value)} placeholder="메모" />

        <div className="modal-actions">
          {!isNew && <button className="btn-danger" onClick={() => onDelete(f.id)}>삭제</button>}
          <button className="btn-ghost" onClick={onClose}>취소</button>
          <button className="btn-primary" onClick={save}>저장</button>
        </div>
    </Modal>
  )
}
