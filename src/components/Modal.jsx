import { useRef } from 'react'

// 공용 모달 래퍼 — 바깥(오버레이)을 '클릭'했을 때만 닫힘.
// 창 안에서 눌러 바깥에서 떼는(드래그) 경우엔 닫히지 않도록 press/release 위치를 모두 확인.
export default function Modal({ onClose, children }) {
  const downOnOverlay = useRef(false)
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => { downOnOverlay.current = e.target === e.currentTarget }}
      onMouseUp={(e) => { if (downOnOverlay.current && e.target === e.currentTarget) onClose(); downOnOverlay.current = false }}
    >
      <div className="modal">{children}</div>
    </div>
  )
}
