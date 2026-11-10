import { clean, normDate, strip, attr } from '../gen.mjs'
// KEEI board.es (bid=0002 간행물, bid=0001 연구보고서). ul.report_list > li: span.label(시리즈 라벨), span.cate, span.tit > a[href=act=view&list_no=..], span.date
export default {
  ids: [41, 42],
  board: (i) => ({ 41: '간행물', 42: '연구보고서' })[i],
  parse(html, url) {
    const h = strip(html)
    const s = h.indexOf('class="report_list"'); if (s < 0) return []
    const seg = h.slice(s, h.indexOf('class="paging', s) > 0 ? h.indexOf('class="paging', s) : undefined)
    const out = [], seen = new Set()
    for (const chunk of seg.split(/<li>/).slice(1)) {
      const a = chunk.match(/<span class="tit">\s*<a\b([^>]*)>([\s\S]*?)<\/a>/); if (!a) continue
      const u = new URL(attr(a[1], 'href'), url)
      u.searchParams.delete('nPage')
      const 링크 = u.href
      if (seen.has(링크)) continue; seen.add(링크)
      const d = chunk.match(/<span class="date">([\s\S]*?)<\/span>/)
      out.push({ 제목: clean(a[2]), 날짜: normDate(d ? clean(d[1]) : ''), 링크 })
    }
    return out
  }
}
