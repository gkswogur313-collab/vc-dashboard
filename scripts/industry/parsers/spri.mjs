import { clean, normDate, strip } from '../gen.mjs'
// SPRi 전체자료 — div.com_list_box > ul.list > li > div.box (카테고리 뱃지, 날짜, div.title > a)
// 간행물(월간 SW중심사회 / AI 브리프 등)은 제목이 "2026년 10월호"뿐이라 카테고리명을 앞에 붙임.
export default {
  ids: [23],
  board() { return '전체자료' },
  parse(html, url) {
    const h = strip(html); const out = []; const seen = new Set()
    const s = h.indexOf('com_list_box'); if (s < 0) return out
    const parts = h.slice(s).split(/<div class="box">/).slice(1)
    for (const b of parts) {
      const tm = b.match(/<div class="title">\s*<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
      if (!tm) continue
      const cm = b.match(/<li class="bg_c\d*"[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i)
      const cat = cm ? clean(cm[1]) : ''
      let t = clean(tm[2])
      if (cat && /^(\d{4}\s*년\s*)?\d{1,2}\s*월\s*호$|^(vol|제)\.?\s*\d+/i.test(t) && !t.includes(cat)) t = `${cat} ${t}`
      const dm = b.match(/날짜<\/span>\s*([^<]+)/)
      const u = new URL(tm[1].replace(/&amp;/g, '&'), url)
      const id = u.pathname.match(/\/posts\/view\/(\d+)/)
      const 링크 = id ? `${u.origin}/posts/view/${id[1]}?code=${u.searchParams.get('code') || ''}` : u.href
      if (seen.has(링크)) continue; seen.add(링크)
      out.push({ 제목: t, 날짜: normDate(dm ? dm[1] : ''), 링크 })
    }
    return out
  }
}
