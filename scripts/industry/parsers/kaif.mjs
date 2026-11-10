import { clean, strip, attr } from '../gen.mjs'
// KAIF 원자력산업(월간지) ?c=195. div.publish_list .thk-col > a[data=<ix>][title="2026년 10월호"].
// 상세는 POST ajax(/common/plugin/kaif/ax.195.php, gbn=list&gubun=A&ix=<ix>)로 팝업 → GET 상세 URL 없음.
// 링크는 목록 URL + '#ix=<ix>' (브라우저에서 목록이 열리고, 항목별 고유키 유지). 날짜는 제목의 'YYYY년 M월호'에서 YYYY-MM.
export default {
  ids: [43],
  board: () => '원자력산업',
  parse(html, url) {
    const h = strip(html); const out = [], seen = new Set()
    const s = h.indexOf('publish_list'); if (s < 0) return []
    for (const m of h.slice(s).matchAll(/<a\b([^>]*\bdata="(\d+)"[^>]*)>([\s\S]*?)<\/a>/g)) {
      const ix = m[2]; if (seen.has(ix)) continue; seen.add(ix)
      const sub = m[3].match(/class="publish_subject">([\s\S]*?)<\/div>/)
      const t = clean(sub ? sub[1] : '') || attr(m[1], 'title')
      const ym = t.match(/(20\d\d)\s*년\s*(\d{1,2})\s*월/)
      out.push({ 제목: `원자력산업 ${t}`, 날짜: ym ? `${ym[1]}-${ym[2].padStart(2, '0')}` : '', 링크: url.replace(/#.*$/, '') + '#ix=' + ix })
    }
    return out
  }
}
