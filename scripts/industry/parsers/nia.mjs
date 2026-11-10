import { clean, normDate, strip, attr } from '../gen.mjs'
// NIA (한국지능정보사회진흥원) 간행물 게시판 — div.board_type01 > ul > li
// 링크: onclick="doBbsFView(cbIdx,bcIdx,Gbn,parentSeq)" → 인라인 스크립트가 form.action을
// /site/nia_kor/ex/bbs/View.do?cbIdx=..&bcIdx=..&parentSeq=.. 로 설정 후 submit(POST). 쿼리스트링에
// 모든 파라미터가 있으므로 GET으로도 열림(jsessionid 제외).
export default {
  ids: [22],
  board(i, html) {
    const m = (html || '').match(/<title>([\s\S]*?)<\/title>/i)
    if (m) { const p = clean(m[1]).split('|')[0].split('>').map(s => s.trim()).filter(Boolean); if (p.length) return p[p.length - 1] }
    return 'IT&Future Strategy'
  },
  parse(html, url) {
    const h = strip(html); const out = []; const seen = new Set()
    const origin = new URL(url).origin
    for (const m of h.matchAll(/<li\b[^>]*>\s*<a\b([^>]*doBbsFView[^>]*)>([\s\S]*?)<\/a>/gi)) {
      const a = m[1], body = m[2]
      const f = attr(a, 'onclick').match(/doBbsFView\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'/)
      if (!f) continue
      const sm = body.match(/<span class="subject[^"]*"[^>]*>([\s\S]*?)<\/span>\s*<span class="src"/i)
      let t = sm ? clean(sm[1].replace(/<em>[\s\S]*?<\/em>/gi, '')) : attr(a, 'title').replace(/-첨부파일 있음$/, '')
      t = t.replace(/첨부파일 있음/g, '').replace(/^\[[^\]]*\]\s*/, '').trim()
      const dm = body.match(/<span class="src">\s*<em>([^<]*)<\/em>/i)
      const 링크 = `${origin}/site/nia_kor/ex/bbs/View.do?cbIdx=${f[1]}&bcIdx=${f[2]}&parentSeq=${f[4]}`
      if (!t || seen.has(링크)) continue; seen.add(링크)
      out.push({ 제목: t, 날짜: normDate(dm ? dm[1] : clean(body)), 링크 })
    }
    return out
  }
}
