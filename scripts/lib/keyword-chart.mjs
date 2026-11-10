// 키워드 흐름(세부 테마 등장 건수, 이번 주 vs 지난주) → PNG 막대그래프
// 워드(주간 브리핑·JH Weekly Report)에 그림으로 붙인다. 실패하면 null을 돌려주고 호출 쪽이 표로 대체한다.
// 렌더러: @resvg/resvg-js(SVG→PNG), 글꼴: 시스템 Noto Sans CJK
const NOW = '#2F5597'
const PREV = '#C5CCD8'
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export async function keywordChartPng(keywords, { top = 12 } = {}) {
  const rows = (keywords || []).slice(0, top)
  if (!rows.length) return null
  const W = 1200, labelW = 260, numW = 120, rowH = 46, padT = 70, padB = 30
  const H = padT + rows.length * rowH + padB
  const max = Math.max(1, ...rows.map((k) => Math.max(k.count, k.prev)))
  const barW = W - labelW - numW - 40
  const y0 = (i) => padT + i * rowH
  let g = ''
  // 세로 눈금
  const step = Math.max(1, Math.ceil(max / 5))
  for (let v = 0; v <= max; v += step) {
    const x = labelW + (v / max) * barW
    g += `<line x1="${x}" y1="${padT - 8}" x2="${x}" y2="${H - padB + 4}" stroke="#E3E8EF" stroke-width="1"/>`
    g += `<text x="${x}" y="${H - padB + 24}" font-size="16" fill="#98A2B3" text-anchor="middle">${v}</text>`
  }
  rows.forEach((k, i) => {
    const y = y0(i)
    const diff = k.count - k.prev
    g += `<text x="${labelW - 14}" y="${y + 27}" font-size="20" fill="#1A2233" text-anchor="end">${esc(k.tag)}</text>`
    g += `<rect x="${labelW}" y="${y + 6}" width="${Math.max(3, (k.count / max) * barW)}" height="16" rx="4" fill="${NOW}"/>`
    g += `<rect x="${labelW}" y="${y + 25}" width="${Math.max(3, (k.prev / max) * barW)}" height="12" rx="4" fill="${PREV}"/>`
    g += `<text x="${labelW + barW + 14}" y="${y + 27}" font-size="19" fill="#1A2233" font-weight="700">${k.count}<tspan fill="#98A2B3" font-weight="400"> / ${k.prev}</tspan></text>`
    if (diff) g += `<text x="${W - 16}" y="${y + 27}" font-size="16" fill="${diff > 0 ? '#2F5597' : '#98A2B3'}" text-anchor="end">${diff > 0 ? '+' : ''}${diff}</text>`
  })
  const legend = `<rect x="${labelW}" y="22" width="22" height="14" rx="3" fill="${NOW}"/><text x="${labelW + 30}" y="35" font-size="18" fill="#344054">이번 주</text>`
    + `<rect x="${labelW + 120}" y="24" width="22" height="10" rx="3" fill="${PREV}"/><text x="${labelW + 150}" y="35" font-size="18" fill="#344054">지난주</text>`
    + `<text x="${W - 16}" y="35" font-size="16" fill="#98A2B3" text-anchor="end">세부 테마 등장 건수</text>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Noto Sans CJK KR, Noto Sans KR, Malgun Gothic, sans-serif"><rect width="${W}" height="${H}" fill="#FFFFFF"/>${legend}${g}</svg>`
  try {
    const { Resvg } = await import('@resvg/resvg-js')
    const png = new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: 'Noto Sans CJK KR' } }).render().asPng()
    return { png: Buffer.from(png), width: W, height: H }
  } catch (e) {
    console.warn('키워드 그래프 생성 실패 — 표로 대체:', e.message)
    return null
  }
}
