import { clean, strip, blocks } from '../gen.mjs'
// KDIA 정책연구/보고서 infomation_defReport_list.do. table tbody tr: td.subject > a onclick="submitForm('<id>')", td.data = 발행년도(연도만).
// 상세: postForm(method=POST, action=/kdia/defReport/infomation_defReport_view.do, id=<id>) → GET 재구성 ?id=<id> (미검증; POST 전용이면 목록으로 열림).
// 날짜: 연도만 있어 계약상 '' (연도는 발행년도 필드로 별도 제공).
export default {
  ids: [47],
  board: () => '연구/보고서',
  parse(html, url) {
    const h = strip(html); const out = [], seen = new Set()
    const tb = (h.match(/<tbody[\s\S]*?<\/tbody>/i) || [''])[0]
    for (const tr of blocks(tb, 'tr')) {
      const a = tr.match(/submitForm\('(\d+)'\)[^>]*>([\s\S]*?)<\/a>/); if (!a) continue
      if (seen.has(a[1])) continue; seen.add(a[1])
      const y = tr.match(/<td class="data">\s*(20\d\d)/)
      out.push({ 제목: clean(a[2]), 날짜: y ? y[1] : '', 링크: new URL('/kdia/defReport/infomation_defReport_view.do?id=' + a[1], url).href })
    }
    return out
  }
}
