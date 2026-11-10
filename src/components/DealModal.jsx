import { useState } from 'react'
import Modal from './Modal.jsx'
import { STAGES } from '../useDeals.js'

// 딜 편집 모달 — 회사 정보 + 단계별 날짜 입력 + DROP
export default function DealModal({ deal, onSave, onClose, onDelete, isNew }) {
  const [form, setForm] = useState(() => ({ ...deal, stages: { ...deal.stages } }))

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const setStage = (s, v) => setForm((f) => ({ ...f, stages: { ...f.stages, [s]: v } }))

  const save = () => {
    if (!form.회사명.trim()) { alert('회사명을 입력하세요.'); return }
    onSave(form)
  }

  return (
    <Modal onClose={onClose}>
        <h2 style={{ marginBottom: 4 }}>{isNew ? '딜 추가' : '딜 편집'}</h2>

        <label>회사명</label>
        <input value={form.회사명} onChange={(e) => set('회사명', e.target.value)} placeholder="회사명" />

        <div className="modal-row3">
          <div><label>섹터</label><input value={form.섹터} onChange={(e) => set('섹터', e.target.value)} placeholder="예: AI/SaaS" /></div>
          <div><label>라운드·규모</label><input value={form.라운드} onChange={(e) => set('라운드', e.target.value)} placeholder="예: Series A / 30억" /></div>
          <div><label>밸류</label><input value={form.밸류 || ''} onChange={(e) => set('밸류', e.target.value)} placeholder="예: 200억" /></div>
        </div>

        <label>메모</label>
        <textarea rows={2} value={form.메모} onChange={(e) => set('메모', e.target.value)} placeholder="검토 메모" />

        <label>Drive 폴더 링크 (선택)</label>
        <input value={form.driveUrl} onChange={(e) => set('driveUrl', e.target.value)} placeholder="https://drive.google.com/..." />

        <label style={{ marginTop: 16, color: 'var(--text)', fontWeight: 700 }}>단계별 날짜 (입력한 마지막 단계로 카드가 이동)</label>
        <div className="stage-dates">
          {STAGES.map((s) => (
            <div key={s}>
              <label>{s}</label>
              <input type="date" value={form.stages[s] || ''} onChange={(e) => setStage(s, e.target.value)} />
            </div>
          ))}
        </div>

        <label style={{ marginTop: 16, color: 'var(--bad)', fontWeight: 700 }}>DROP (중단) — 날짜 입력 시 DROP 처리</label>
        <div className="modal-row">
          <div><label>DROP 날짜</label><input type="date" value={form.dropDate || ''} onChange={(e) => set('dropDate', e.target.value)} /></div>
          <div><label>사유</label><input value={form.dropReason} onChange={(e) => set('dropReason', e.target.value)} placeholder="중단 사유" /></div>
        </div>

        <div className="modal-actions">
          {!isNew && <button className="btn-danger" onClick={() => onDelete(form.id)}>삭제</button>}
          <button className="btn-ghost" onClick={onClose}>취소</button>
          <button className="btn-primary" onClick={save}>저장</button>
        </div>
    </Modal>
  )
}
