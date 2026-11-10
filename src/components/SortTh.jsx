// 정렬 가능한 표 머리글 — 누르면 그 열 기준으로 큰 순(▼) → 다시 누르면 작은 순(▲)
export default function SortTh({ k, sort, dir, onSort, children, style, title }) {
  const on = sort === k
  return (
    <th
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', ...style, ...(on ? { fontWeight: 800 } : null) }}
      title={title || '눌러서 정렬 (높은 순 ↔ 낮은 순)'}
      aria-sort={on ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      onClick={() => onSort(k)}
    >
      {children}
      <span style={{ fontSize: 10, marginLeft: 3, opacity: on ? 1 : 0.35 }}>{on ? (dir === 'asc' ? '▲' : '▼') : '↕'}</span>
    </th>
  )
}
