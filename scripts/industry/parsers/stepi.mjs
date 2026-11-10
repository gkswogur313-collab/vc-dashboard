import { clean, normDate, strip, attr } from '../gen.mjs'
// STEPI: 31/32/34 = report/List.do (table.list, td.title > a href="View.do?reIdx=..")
//        33 = PeriodicReportList.do (썸네일 li > a href="PeriodicReportView.do?reIdx=..", <b>호수</b> + span.date)
const boardName = (html) => {
  const m = (html || '').match(/<title>([\s\S]*?)<\/title>/i); if (!m) return ''
  const p = clean(m[1]).split('>').map(s => s.trim()).filter(Boolean); return p[p.length - 1] || ''
}
const norm = (href, url) => {
  const u = new URL(href.replace(/&amp;/g, '&'), url)
  const keep = new URLSearchParams()
  for (const k of ['reIdx', 'cateCont']) if (u.searchParams.get(k)) keep.set(k, u.searchParams.get(k))
  return `${u.origin}${u.pathname}?${keep}`
}
export default {
  ids: [31, 32, 33, 34],
  board(i, html) { return boardName(html) || ({ 31: 'STEPI Insight', 32: '과학기술정책 Brief', 33: 'Future Horizon+', 34: 'STEPI Outlook' })[i] },
  parse(html, url) {
    const h = strip(html); const out = []; const seen = new Set(); const bn = boardName(html)
    const push = (t, d, l) => { if (t && !seen.has(l)) { seen.add(l); out.push({ 제목: t, 날짜: normDate(d), 링크: l }) } }
    // 표 형태
    for (const tr of h.match(/<tr\b[\s\S]*?<\/tr>/gi) || []) {
      const am = tr.match(/<td class="title">\s*<a\b([^>]*)>([\s\S]*?)<\/a>/i); if (!am) continue
      const tds = tr.match(/<td\b[^>]*>[\s\S]*?<\/td>/gi) || []
      const dtd = tds.map(clean).find(x => /^20\d\d[.-]\d{1,2}[.-]\d{1,2}$/.test(x)) || ''
      push(clean(am[2]), dtd, norm(attr(am[1], 'href'), url))
    }
    if (out.length) return out
    // 썸네일(정기간행물) 형태
    for (const m of h.matchAll(/<a\b[^>]*href="([^"]*PeriodicReportView\.do[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const b = m[2]
      const tm = b.replace(/<div class="hoverBox">[\s\S]*?<\/div>/i, '').match(/<b>([\s\S]*?)<\/b>/i)
      let t = tm ? clean(tm[1]) : ''
      if (t && bn && !t.toLowerCase().includes(bn.toLowerCase().replace(/\+$/, ''))) t = `${bn} ${t}`
      const dm = b.match(/class="date"[^>]*>([^<]+)/)
      push(t, dm ? dm[1] : '', norm(m[1], url))
    }
    return out
  }
}
