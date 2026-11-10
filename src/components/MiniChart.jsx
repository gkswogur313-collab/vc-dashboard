// 가벼운 자체 SVG 라인 차트 (외부 라이브러리 없음).
// series: [{ data:[숫자...], color, name }]  — 여러 라인을 한 좌표계에 그림.
// preserveAspectRatio=none 으로 가로를 꽉 채우고, non-scaling-stroke 로 선 두께 유지.
export default function MiniChart({ series, height = 46, area = false, pad = 2 }) {
  const clean = (series || []).filter((s) => Array.isArray(s.data) && s.data.length > 1)
  if (clean.length === 0) return <div className="mc-empty" style={{ height }} />
  const all = clean.flatMap((s) => s.data)
  const min = Math.min(...all), max = Math.max(...all)
  const rng = max - min || 1
  const W = 100
  const H = height
  const y = (v) => pad + (H - pad * 2) * (1 - (v - min) / rng)
  const x = (i, n) => (n > 1 ? (i / (n - 1)) * W : 0)
  const line = (data) => data.map((v, i) => `${x(i, data.length).toFixed(2)},${y(v).toFixed(2)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: H, display: 'block' }}>
      {clean.map((s, i) => (
        <g key={i}>
          {area && (
            <polygon
              points={`0,${H} ${line(s.data)} ${W},${H}`}
              fill={s.color} opacity="0.10"
            />
          )}
          <polyline
            points={line(s.data)} fill="none" stroke={s.color}
            strokeWidth="1.4" vectorEffect="non-scaling-stroke"
            strokeLinejoin="round" strokeLinecap="round"
          />
        </g>
      ))}
    </svg>
  )
}
