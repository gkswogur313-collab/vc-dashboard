import { clean, normDate, strip, attr } from '../gen.mjs'
// KISTEP: 26 = reportList.es (연구보고서, ul.report_list), 27~29 = board.es bid=0031 (KISTEP 브리프, ul.board_pdf)
// 두 형태 모두 <strong class="title"><a href="상세URL">제목</a></strong> + 날짜(span.date / 등록일)를 정적 HTML에 포함.
const boardName = (html) => {
  const m = (html || '').match(/<title>([\s\S]*?)<\/title>/i); if (!m) return ''
  const p = clean(m[1]).split('|').map(s => s.trim()).filter(s => s && s !== '목록')
  return p[0] || ''
}
export default {
  ids: [26, 27, 28, 29],
  board(i, html) { return boardName(html) || ({ 26: '미래예측', 27: '이슈페이퍼', 28: '기술동향브리프', 29: '기술주권브리프' })[i] },
  parse(html, url) {
    const h = strip(html); const out = []; const seen = new Set()
    const s = h.indexOf('class="board_list"'); const body = s >= 0 ? h.slice(s) : h
    const parts = body.split(/<strong class="title">/).slice(1)
    for (const b of parts) {
      const am = b.match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i); if (!am) continue
      const href = attr(am[1], 'href'); if (!href || href.startsWith('#')) continue
      const t = clean(am[2]) || attr(am[1], 'title')
      const seg = b
      const dm = seg.match(/class="date"[^>]*>([^<]+)/) || seg.match(/등록일<\/em>\s*<span[^>]*>([^<]+)/) || [null, clean(seg)]
      const u = new URL(href, url)
      for (const k of ['nPage', 'keyField', 'orderby', 'b_list']) u.searchParams.delete(k)
      const 링크 = u.href
      if (!t || seen.has(링크)) continue; seen.add(링크)
      out.push({ 제목: t, 날짜: normDate(dm[1]), 링크 })
    }
    return out
  }
}
