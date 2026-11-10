// 정보통신기획평가원(IITP) — 목록이 Vue+axios로 그려져 정적 HTML에는 항목이 없다. (2026-11 Chrome에서 실제 호출 확인)
//  · 11~15 (itfind 정기간행물): POST /program-svc/api/itfind/itfindInfo.do {cms_menu_seq}
//        → itfindInfo.api_list_url·api_cat → POST /program-svc/api/itfind/list.do (JSON) → xmldata(<row>…)
//        상세: <목록 경로>/view.do?seq=<identifier>&cpage=1&rows=10&searchTarget=all
//  · 16 (bbs 연차보고서): POST /board-svc/api/bbs/A/list.do {cms_menu_seq:70,…} → list[{article_seq,title,reg_dt}]
//        상세: <목록 경로>/view.do?article_seq=<n>&sort=latest&cpage=1&rows=10
const ORIGIN = 'https://iitp.kr'
const MENU = { 11: 65, 12: 66, 13: 67, 14: 68, 15: 69, 16: 70 }
const NAMES = { 11: 'AI·ICT Brief', 12: '주간기술동향', 13: 'IITP 디지털 아웃룩', 14: 'ICT SPOT Issue', 15: 'ICT 10대 이슈', 16: '정보통신산업진흥 연차보고서' }
const dec = (s) => (s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&')
const txt = (s) => dec(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
const tag = (row, t) => { const m = row.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)); return m ? txt(m[1]) : '' }
const day = (s) => { const m = (s || '').match(/(20\d\d)[.\-/]?(\d\d)[.\-/]?(\d\d)/); return m ? `${m[1]}-${m[2]}-${m[3]}` : '' }

async function post(path, body, UA, referer) {
  const r = await fetch(ORIGIN + path, {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Accept: 'application/json', Referer: referer, Origin: ORIGIN },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

export default {
  ids: [11, 12, 13, 14, 15, 16],
  board: (i, html) => {
    const m = (html || '').match(/<title>\s*([^|<]+?)\s*\|/)
    return m ? m[1].trim() : NAMES[i] || ''
  },
  async crawl(i, url, { UA }) {
    const seq = MENU[i]
    // 게시판 이름은 목록 HTML <title>에 있어 함께 반환(파싱 단계에서 사용)
    if (i === 16) {
      const j = await post('/board-svc/api/bbs/A/list.do', { cms_menu_seq: seq, cpage: 1, rows: 15, keyword: '', condition: '', sort: 'latest' }, UA, url)
      return JSON.stringify({ kind: 'bbs', list: [...(j.notice_list || []), ...(j.list || [])] })
    }
    const info = (await post('/program-svc/api/itfind/itfindInfo.do', { cms_menu_seq: seq }, UA, url)).itfindInfo || {}
    if (!info.api_list_url) throw new Error('itfindInfo 응답에 api_list_url 없음')
    const j = await post('/program-svc/api/itfind/list.do', { pageIndex: 0, pageSize: 15, searchText: '', searchTarget: 'all', searClassCode: info.api_cat, url: info.api_list_url }, UA, url)
    return JSON.stringify({ kind: 'itfind', xml: j.xmldata || '' })
  },
  parse(body, url) {
    const d = JSON.parse(body)
    const dir = url.split('?')[0].replace(/[^/]*$/, '')
    const out = []
    const seen = new Set()
    if (d.kind === 'bbs') {
      for (const it of d.list) {
        if (!it.article_seq || seen.has(it.article_seq)) continue
        seen.add(it.article_seq)
        out.push({ 제목: txt(it.title), 날짜: day(it.reg_dt), 링크: `${dir}view.do?article_seq=${it.article_seq}&sort=latest&cpage=1&rows=10` })
      }
      return out
    }
    for (const row of d.xml.match(/<row>[\s\S]*?<\/row>/g) || []) {
      const id = tag(row, 'identifier')
      if (!id || seen.has(id)) continue
      seen.add(id)
      out.push({ 제목: tag(row, 'title'), 요약: tag(row, 'abstracts').slice(0, 1500), 날짜: day(tag(row, 'issued') || tag(row, 'created')), 링크: `${dir}view.do?seq=${encodeURIComponent(id)}&cpage=1&rows=10&searchTarget=all` })
    }
    return out
  },
}
