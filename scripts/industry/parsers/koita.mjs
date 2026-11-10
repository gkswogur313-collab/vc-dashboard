import { clean, normDate, strip, attr } from '../gen.mjs'
// KOITA 기술동향 자료 — table.tb > tbody > tr (순번, 분야, 제목, 출처, 등록일)
// 링크: javascript: page_move('commBoardPublct003View', { no: 68326 }) — page_move는 외부 common.js에 있어
// 확인 불가. 같은 페이지 인라인 스크립트가 갤러리 상세를 '/board/commBoardGalleryView.do?no=' + NO 로
// 만드는 패턴을 근거로 /board/{view}.do?no={no} GET URL로 재구성(추정).
export default {
  ids: [35],
  board(i, html) { const m = (html || '').match(/<h3 class="h3_tit[^"]*">([\s\S]*?)<\/h3>/i); return m ? clean(m[1]) : '기술동향 자료' },
  parse(html, url) {
    const h = strip(html); const out = []; const seen = new Set(); const origin = new URL(url).origin
    const tb = h.match(/<tbody>([\s\S]*?)<\/tbody>/i); if (!tb) return out
    for (const tr of tb[1].match(/<tr\b[\s\S]*?<\/tr>/gi) || []) {
      const am = tr.match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i); if (!am) continue
      const href = attr(am[1], 'href')
      const pm = href.match(/page_move\(\s*'([^']+)'\s*,\s*\{\s*no\s*:\s*'?(\d+)/)
      const 링크 = pm ? `${origin}/board/${pm[1]}.do?no=${pm[2]}` : new URL(href, url).href
      const dm = tr.match(/class="td_date"[^>]*>([^<]+)/)
      const t = clean(am[2])
      if (!t || seen.has(링크)) continue; seen.add(링크)
      out.push({ 제목: t, 날짜: normDate(dm ? dm[1] : clean(tr)), 링크 })
    }
    return out
  }
}
