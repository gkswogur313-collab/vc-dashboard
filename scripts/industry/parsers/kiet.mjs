import { clean, normDate, strip } from '../gen.mjs'
// KIET research/issueList (i-KIET 산업경제이슈), trends/ecolookList (경제·산업 전망). ul.list_box > li.item: div.rpt_tit > a[href=./issueView?issue_no=..] > strong, span.date
export default {
  ids: [48, 49],
  board: (i) => ({ 48: 'i-KIET 산업경제이슈', 49: 'KIET 경제·산업 전망' })[i],
  parse(html, url) {
    const h = strip(html); const out = [], seen = new Set()
    const s = h.indexOf('class="list_box"'); if (s < 0) return []
    for (const chunk of h.slice(s).split(/<li class="item/).slice(1)) {
      const a = chunk.match(/<div class="rpt_tit">\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/); if (!a) continue
      const u = new URL(a[1], url)
      for (const k of ['skey', 'sval', 'pg', 'pp']) u.searchParams.delete(k)
      const 링크 = u.href; if (seen.has(링크)) continue; seen.add(링크)
      const d = chunk.match(/<span class="date">([^<]*)/)
      out.push({ 제목: clean(a[2]), 날짜: normDate(d ? d[1] : ''), 링크 })
    }
    return out
  }
}
