import { clean, normDate, strip, blocks } from '../gen.mjs'
// KIAT 정책간행물 boardContentsListPage.do?board_id=71. 정적 HTML의 <div id="contentsList">는 비어 있음:
// 인라인 스크립트 $(document).ready → search() → boardLiat(): $.ajax POST boardContentsListUrl="/front/board/boardContentsListAjax.do",
// data=$("#listFrm").serialize(), dataType html → #contentsList 에 주입.
// listFrm 필드: miv_pageNo, miv_pageSize(=#pageSize 기본 15), total_cnt, LISTOP, mode=W, contents_id, board_id=71, cate_id, field_id,
//   intropage_boardUseYn, MenuId, state_filter=W, contents_year, searchkey=T, searchtxt.
// 응답(HTML 조각) 속 항목은 contentsView('<contents_id>') 호출 → listFrm POST boardContentsView.do.
// 상세 GET 재구성: /front/board/boardContentsView.do?board_id=71&contents_id=<id>&MenuId=<MenuId>
// unverified: 응답 마크업을 보지 못해 tr/li 블록 + contentsView 패턴으로 일반화 파싱.
const qp = (url, k, d = '') => { try { return new URL(url).searchParams.get(k) || d } catch { return d } }
export default {
  ids: [46],
  unverified: true,
  board: () => '정책간행물',
  fetchUrl: (i, url) => new URL('/front/board/boardContentsListAjax.do', url).href,
  fetchOpts(i, url) {
    const board_id = qp(url, 'board_id', '71'), MenuId = qp(url, 'MenuId')
    const body = new URLSearchParams({ miv_pageNo: '1', miv_pageSize: '15', total_cnt: '', LISTOP: '', mode: 'W', contents_id: '',
      board_id, cate_id: '', field_id: '', intropage_boardUseYn: '', MenuId, state_filter: 'W', contents_year: '', searchkey: 'T', searchtxt: '' }).toString()
    return { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', Referer: url, Accept: 'text/html, */*; q=0.01' } }
  },
  parse(html, url) {
    // url은 원래 목록 URL(board_id/MenuId 추출용)이 넘어온다고 가정; ajax URL이 넘어와도 기본값 사용
    const board_id = qp(url, 'board_id', '71'), MenuId = qp(url, 'MenuId', '878cb9b6d5ec41bf914ad5c0f590ed14')
    const h = strip(html); const out = [], seen = new Set()
    for (const tag of ['tr', 'li']) {
      for (const b of blocks(h, tag)) {
        const m = b.match(/<a\b([^>]*contentsView\(\s*['"]?([\w-]+)['"]?\s*\)[^>]*)>([\s\S]*?)<\/a>/); if (!m) continue
        const id = m[2]; if (seen.has(id)) continue
        let 제목 = clean(m[3]).replace(/\s*(새글|NEW|new|첨부)\s*$/g, '').trim()
        if (!제목) { const t = m[1].match(/title="([^"]+)"/); 제목 = t ? clean(t[1]) : '' }
        if (!제목) continue
        seen.add(id)
        const 날짜 = normDate(clean(b).replace(clean(m[3]), ''))
        out.push({ 제목, 날짜, 링크: new URL(`/front/board/boardContentsView.do?board_id=${board_id}&contents_id=${id}&MenuId=${MenuId}`, 'https://www.kiat.or.kr').href })
      }
      if (out.length) break
    }
    return out
  }
}
