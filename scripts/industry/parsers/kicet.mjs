import { clean, strip, blocks, attr } from '../gen.mjs'
// KICET 세라믹 기술백서 (00126.web). 전자책 갤러리 div.gallery1ebook1 li.column: strong.t1 제목, 다운로드 링크(/00296.web?amode=view&cfgCode=1&gcode=..&name=<pdf>)
// 상세페이지·날짜 없음. 링크는 다운로드(설문 후 PDF) 팝업 URL — 항목별 고유. 없으면 목록 URL.
export default {
  ids: [44],
  board: () => '세라믹 기술백서',
  parse(html, url) {
    const h = strip(html); const out = [], seen = new Set()
    const s = h.indexOf('gallery1ebook1'); if (s < 0) return []
    for (const li of blocks(h.slice(s), 'li')) {
      const t = li.match(/<strong class="t1">([\s\S]*?)<\/strong>/); if (!t) continue
      const 제목 = clean(t[1]); if (!제목 || seen.has(제목)) continue; seen.add(제목)
      const a = li.match(/<a\b([^>]*href="[^"]*amode=view[^"]*"[^>]*)>/)
      const 링크 = a ? new URL(attr(a[1], 'href'), url).href : url
      out.push({ 제목, 날짜: '', 링크 })
    }
    return out
  }
}
