import { clean, normDate, strip } from '../gen.mjs'
// LG경영연구원 Reports — div.search_result > ul > li > a href="javascript:fnView(19747)" > dl > dd(span 카테고리, strong 제목, p "저자 | 날짜 | 유형")
// fnView는 외부 /asset/js/search.js에 정의(스냅샷에서 확인 불가). 대신 목록 페이지 인라인 스크립트가
// document.ready에서 ?viewidx= 파라미터를 읽어 fnView(viewid)를 호출하므로
// list.do?viewidx={id} GET URL은 브라우저에서 해당 보고서 상세를 확실히 연다.
export default {
  ids: [25],
  board(i, html) { const m = (html || '').match(/<div class="sub_nav">[\s\S]*?<li class="on">\s*<a[^>]*>([\s\S]*?)<\/a>/i); return m ? clean(m[1]) : '비즈니스&테크놀로지' },
  parse(html, url) {
    const h = strip(html); const out = []; const seen = new Set()
    const u0 = new URL(url)
    for (const m of h.matchAll(/<a\b[^>]*href="javascript:fnView\((\d+)\)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const id = m[1], b = m[2]
      const tm = b.match(/<strong>([\s\S]*?)<\/strong>/i); if (!tm) continue
      const pm = b.match(/<p>([\s\S]*?)<\/p>/i)
      const u = new URL(u0.origin + u0.pathname); u.searchParams.set('viewidx', id)
      const 링크 = u.href
      if (seen.has(링크)) continue; seen.add(링크)
      out.push({ 제목: clean(tm[1]), 날짜: normDate(pm ? clean(pm[1]) : clean(b)), 링크 })
    }
    return out
  }
}
