import { clean, normDate, strip, blocks, attr } from '../gen.mjs'
// 한국바이오협회 브리프 (bo_table=brief). 카드형 ul.board_list_skin5 > li.
// 상세페이지가 없음: 각 카드는 제목/날짜/PDF 다운로드 링크만 가짐 → 링크는 PDF 다운로드 URL(항목별 고유).
export default {
  ids: [36],
  board: () => '브리프',
  parse(html, url) {
    const h = strip(html)
    const s = h.indexOf('board_list_skin5'); if (s < 0) return []
    const seg = h.slice(s, h.indexOf('class="paging"', s) > 0 ? h.indexOf('class="paging"', s) : undefined)
    const out = [], seen = new Set()
    for (const b of blocks(seg, 'li')) {
      const t = b.match(/class="title"[^>]*>([\s\S]*?)<\/div>/); if (!t) continue
      const 제목 = clean(t[1]); if (!제목) continue
      const d = b.match(/class="date"[^>]*>([\s\S]*?)<\/div>/)
      const a = b.match(/<a\b([^>]*class="download"[^>]*)>/)
      const href = a ? attr(a[1], 'href') : ''
      const 링크 = href ? new URL(href, url).href : url
      const k = 링크 + '|' + 제목; if (seen.has(k)) continue; seen.add(k)
      out.push({ 제목, 날짜: normDate(d ? clean(d[1]) : ''), 링크 })
    }
    return out
  }
}
