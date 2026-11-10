import { clean, normDate, strip } from '../gen.mjs'
// BioIN board.do?bid=tech|industry|tot_know. ul.blog_list > li, 각 li: <a href="/board/<bid>/<no>?..."> em(분야/BioINwatch 등 라벨) + strong.title
// 날짜: '작성일'(등록일) 사용. tech/industry에는 '자료발간일'도 있으나 미래일자 등 이상값이 있어 등록일 우선.
const NAMES = { 37: '기술', 38: '산업', 39: '전체' }
export default {
  ids: [37, 38, 39],
  board: (i) => NAMES[i],
  parse(html, url) {
    const h = strip(html)
    const s = h.search(/<ul class="blog_list/); if (s < 0) return []
    const seg = h.slice(s, h.indexOf('class="paging', s) > 0 ? h.indexOf('class="paging', s) : undefined)
    const out = [], seen = new Set()
    for (const chunk of seg.split(/<li class="ltst\s*"|<li class="\s*"/).slice(1)) {
      const t = chunk.match(/<strong class="title">([\s\S]*?)<\/strong>/); if (!t) continue
      const a = chunk.match(/href="(\/board\/[a-z_]+\/\d+)[^"]*"/); if (!a) continue
      const 링크 = new URL(a[1], url).href
      if (seen.has(링크)) continue; seen.add(링크)
      const 제목 = clean(t[1])
      const d = chunk.match(/작성일<\/strong>\s*<span class="date">([^<]*)/) || chunk.match(/<span class="date">([^<]*)/)
      out.push({ 제목, 날짜: normDate(d ? d[1] : ''), 링크 })
    }
    return out
  }
}
