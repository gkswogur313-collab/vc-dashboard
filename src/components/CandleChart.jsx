// 가벼운 자체 SVG 캔들(봉) 차트 — 외부 라이브러리 없음.
// candles: [{ d:'YYYY-MM-DD', o, h, l, c }] 오름차순.
// 한국식 색상: 종가≥시가 = 빨강(양봉), 종가<시가 = 파랑(음봉).
// us=true 이면 미국식: 양봉=초록 / 음봉=빨강.
export default function CandleChart({ candles, height = 300, us = false }) {
  const UP = us ? '#16a34a' : '#e5484d'
  const DN = us ? '#e5484d' : '#3d7bf0'
  const data = (candles || []).filter((k) => k && k.h != null && k.l != null)
  if (data.length < 2) return <div className="mc-empty" style={{ height }} />

  const W = 1000                 // viewBox 가로(고정) — preserveAspectRatio=none으로 가로 채움
  const padT = 10, padB = 22, padR = 52
  const H = height
  const plotH = H - padT - padB
  const plotW = W - padR

  const hi = Math.max(...data.map((k) => k.h))
  const lo = Math.min(...data.map((k) => k.l))
  const rng = hi - lo || 1
  const y = (v) => padT + plotH * (1 - (v - lo) / rng)
  const n = data.length
  const step = plotW / n
  const bw = Math.max(1, Math.min(step * 0.66, 14)) // 봉 몸통 너비

  // 가격 눈금 4개
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => lo + rng * t)
  const fmt = (v) => (v >= 10000 ? Math.round(v).toLocaleString('ko-KR') : v.toFixed(v < 100 ? 2 : 0))
  // x축 날짜 라벨 (양끝 + 중간 몇 개)
  const labelIdx = [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n - 1]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: H, display: 'block' }}>
      {/* 가격 그리드 + 눈금 */}
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1="0" x2={plotW} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <text x={W - padR + 6} y={y(v) + 3} fontSize="11" fill="var(--text-dim)" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(v)}</text>
        </g>
      ))}
      {/* 캔들 */}
      {data.map((k, i) => {
        const cx = step * (i + 0.5)
        const up = k.c >= k.o
        const color = up ? UP : DN
        const yO = y(k.o), yC = y(k.c)
        const top = Math.min(yO, yC)
        const bh = Math.max(1, Math.abs(yC - yO))
        return (
          <g key={i}>
            <line x1={cx} x2={cx} y1={y(k.h)} y2={y(k.l)} stroke={color} strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <rect x={cx - bw / 2} y={top} width={bw} height={bh} fill={color} />
          </g>
        )
      })}
      {/* x축 날짜 */}
      {labelIdx.map((i) => (
        <text key={i} x={Math.min(Math.max(step * (i + 0.5), 16), plotW - 16)} y={H - 6}
              fontSize="10.5" fill="var(--text-dim)" textAnchor="middle">{(data[i].d || '').slice(2)}</text>
      ))}
    </svg>
  )
}
