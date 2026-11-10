import { clean, normDate, strip, blocks } from '../gen.mjs'
// KIRIA 로봇 동향자료 portalRefTrendList.do. a.title href="#link" onclick="fn_detail('RETR_...')".
// 인라인 스크립트: fn_detail → document.frm(method=post).retrCode=<code>, action=/portal/reference/portalRefTrendDetail.do
// → GET 재구성: /portal/reference/portalRefTrendDetail.do?retrCode=<code> (eGov/Spring 컨트롤러는 GET 파라미터도 바인딩; 미검증).
// 목록 제목은 서버에서 '..'로 잘림 → '…'로 표시.
export default {
  ids: [45],
  board: () => '동향자료',
  parse(html, url) {
    const h = strip(html); const out = [], seen = new Set()
    const tb = (h.match(/<tbody[\s\S]*?<\/tbody>/i) || [''])[0]
    for (const tr of blocks(tb, 'tr')) {
      const a = tr.match(/fn_detail\('([^']+)'\)[^>]*>([\s\S]*?)<\/a>/); if (!a) continue
      const code = a[1]; if (seen.has(code)) continue; seen.add(code)
      const 제목 = clean(a[2]).replace(/\.\.$/, '…')
      const d = clean(tr).match(/20\d\d-\d\d-\d\d/)
      out.push({ 제목, 날짜: normDate(d ? d[0] : ''), 링크: new URL('/portal/reference/portalRefTrendDetail.do?retrCode=' + code, url).href })
    }
    return out
  }
}
