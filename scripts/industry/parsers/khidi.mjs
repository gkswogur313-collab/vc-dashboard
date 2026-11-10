import { clean, normDate, strip, blocks, attr } from '../gen.mjs'
// KHIDI 브리프 board?menuId=MENU01783. table tbody tr: td.ellipsis > a[href=/board/view?...linkId=..], 등록일 td.
// 링크는 페이지 상태 파라미터(maxIndex 등)를 제거하고 linkId+menuId만 남긴 GET URL로 정규화
// (원본 href는 새 글이 올라오면 maxIndex가 변해 같은 글의 URL이 달라짐).
export default {
  ids: [40],
  board: () => 'KHIDI 브리프',
  parse(html, url) {
    const h = strip(html); const out = [], seen = new Set()
    const tb = (h.match(/<tbody[\s\S]*?<\/tbody>/i) || [''])[0]
    for (const tr of blocks(tb, 'tr')) {
      const a = tr.match(/<a\b([^>]*href="[^"]*\/board\/view\?[^"]*"[^>]*)>([\s\S]*?)<\/a>/); if (!a) continue
      const href = attr(a[1], 'href'); const u = new URL(href, url)
      const linkId = u.searchParams.get('linkId'), menuId = u.searchParams.get('menuId')
      const 링크 = linkId ? `${u.origin}/board/view?linkId=${linkId}&menuId=${menuId}` : u.href
      if (seen.has(링크)) continue; seen.add(링크)
      const 제목 = attr(a[1], 'title') || clean(a[2])
      const tds = blocks(tr, 'td').map(clean)
      const 날짜 = normDate(tds.find(x => /^20\d\d-\d\d-\d\d$/.test(x)) || '')
      out.push({ 제목, 날짜, 링크 })
    }
    return out
  }
}
