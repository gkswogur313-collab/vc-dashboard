// 반도체 교과서 도식 → SVG → PNG (워드용). 화면은 src/components/SemiBriefing.jsx 의 Diagram 컴포넌트가 HTML로 그린다.
// 도식 형식(textbook.json 절.도식):
//   { 종류: '흐름', 제목, 단계: [{ 이름, 설명 }] }           — 왼쪽→오른쪽 순서도(4개 넘으면 줄바꿈)
//   { 종류: '층',   제목, 층:   [{ 이름, 설명, 색 }] }        — 위→아래 단면 적층도
// 색: metal | oxide | si | n | p | poly | pkg | pr
export const LAYER_COLORS = {
  metal: ['#E7D7A6', '#7A5C00'], oxide: ['#D6E9F8', '#1F4E79'], si: ['#D9DCE1', '#344054'], n: ['#C9DAF8', '#1D3F8F'],
  p: ['#F6D3DC', '#8A1C3B'], poly: ['#F8DDC2', '#8A4B0F'], pkg: ['#CFE8D8', '#1E5B3A'], pr: ['#E4D7F5', '#4B2A7B'],
}
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
// 글자 폭 대략 계산(한글·전각 1, 영문·숫자 0.55) 기준 줄바꿈
const cw = (ch) => (/[\u0000-ÿ]/.test(ch) ? 0.55 : 1)
function wrap(text, max) {
  const out = []; let line = ''; let w = 0
  for (const word of String(text || '').split(/(\s+)/)) {
    const ww = [...word].reduce((a, c) => a + cw(c), 0)
    if (w + ww > max && line.trim()) { out.push(line.trim()); line = ''; w = 0 }
    if (ww > max) { for (const c of word) { if (w + cw(c) > max) { out.push(line); line = ''; w = 0 } line += c; w += cw(c) } continue }
    line += word; w += ww
  }
  if (line.trim()) out.push(line.trim())
  return out
}

export function diagramSvg(d) {
  const W = 1200; const FONT = 'Noto Sans CJK KR, Noto Sans KR, Malgun Gothic, sans-serif'
  let g = ''; let H
  const title = d.제목 ? `<text x="24" y="40" font-size="24" font-weight="700" fill="#1F3864">${esc(d.제목)}</text>` : ''
  const top = d.제목 ? 64 : 20
  if (d.종류 === '흐름') {
    const steps = d.단계 || []
    const perRow = steps.length <= 4 ? steps.length : Math.ceil(steps.length / Math.ceil(steps.length / 4))
    const rows = Math.ceil(steps.length / perRow)
    const gap = 38; const bw = (W - 48 - gap * (perRow - 1)) / perRow
    const maxChars = Math.floor(bw / 17)
    const boxes = steps.map((s) => ({ ...s, nl: wrap(s.이름, maxChars - 1), dl: wrap(s.설명, maxChars + 2) }))
    const bh = Math.max(...boxes.map((b) => 34 + b.nl.length * 26 + b.dl.length * 22)) + 12
    boxes.forEach((b, i) => {
      const r = Math.floor(i / perRow); const c = i % perRow
      const x = 24 + c * (bw + gap); const y = top + r * (bh + 34)
      g += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="12" fill="#EEF3FB" stroke="#9DB4DA" stroke-width="2"/>`
      g += `<circle cx="${x + 22}" cy="${y + 22}" r="13" fill="#1F3864"/><text x="${x + 22}" y="${y + 28}" font-size="15" font-weight="700" fill="#fff" text-anchor="middle">${i + 1}</text>`
      b.nl.forEach((t, k) => { g += `<text x="${x + bw / 2}" y="${y + 52 + k * 26}" font-size="21" font-weight="700" fill="#1A2233" text-anchor="middle">${esc(t)}</text>` })
      b.dl.forEach((t, k) => { g += `<text x="${x + bw / 2}" y="${y + 52 + b.nl.length * 26 + 6 + k * 22}" font-size="17" fill="#475467" text-anchor="middle">${esc(t)}</text>` })
      if (i < boxes.length - 1) {
        if (c < perRow - 1) { const ax = x + bw + 6; const ay = y + bh / 2; g += `<path d="M${ax} ${ay - 11} L${ax + gap - 12} ${ay} L${ax} ${ay + 11} Z" fill="#7C93BD"/>` }
        else { const ax = x + bw / 2; const ay = y + bh + 6; g += `<path d="M${ax - 11} ${ay} L${ax} ${ay + 22} L${ax + 11} ${ay} Z" fill="#7C93BD"/>` }
      }
    })
    H = top + rows * bh + (rows - 1) * 34 + 24
  } else {
    const layers = d.층 || []
    const nameW = 330; const maxChars = Math.floor((W - 48 - nameW - 30) / 17)
    let y = top
    for (const l of layers) {
      const [fill, ink] = LAYER_COLORS[l.색] || LAYER_COLORS.si
      const dl = wrap(l.설명 || '', maxChars); const nl = wrap(l.이름, 17)
      const h = Math.max(58, 22 + Math.max(nl.length * 26, dl.length * 24) + 12)
      g += `<rect x="24" y="${y}" width="${W - 48}" height="${h}" fill="${fill}" stroke="#FFFFFF" stroke-width="3"/>`
      nl.forEach((t, k) => { g += `<text x="44" y="${y + 36 + k * 26 - (nl.length - 1) * 13}" font-size="21" font-weight="700" fill="${ink}">${esc(t)}</text>` })
      dl.forEach((t, k) => { g += `<text x="${24 + nameW + 20}" y="${y + 35 + k * 24 - (dl.length - 1) * 12}" font-size="18" fill="#1A2233">${esc(t)}</text>` })
      y += h
    }
    g += `<text x="${W - 24}" y="${y + 26}" font-size="15" fill="#98A2B3" text-anchor="end">▲ 위 · 아래 ▼ (개념도, 실제 비율 아님)</text>`
    H = y + 40
  }
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="${FONT}"><rect width="${W}" height="${H}" fill="#FFFFFF"/>${title}${g}</svg>`, width: W, height: H }
}

export async function diagramPng(d) {
  const { svg, width, height } = diagramSvg(d)
  try {
    const { Resvg } = await import('@resvg/resvg-js')
    const png = new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: 'Noto Sans CJK KR' } }).render().asPng()
    return { png: Buffer.from(png), width, height }
  } catch (e) { console.warn('도식 그림 생성 실패:', e.message); return null }
}
