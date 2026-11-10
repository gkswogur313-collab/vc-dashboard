// KISDI 보고서 목록 (report/list.do). 항목 onclick="goView(masterId, artId)" →
// frm(POST) action = /report/view.do?key=<key>&masterId=<masterId>&arrMasterId=<arr>&artId=<artId>
// 모든 식별 파라미터가 action 쿼리스트링에 있으므로 GET URL로 재구성.
const dec=(s)=>(s||"").replace(/&nbsp;/g," ").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,"\"").replace(/&#0?39;/g,"'").replace(/&#x27;/g,"'").replace(/&middot;/g,"·").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(n)).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16))).replace(/&amp;/g,"&")
const clean=(s)=>dec((s||"").replace(/<[^>]*>/g," ")).replace(/\s+/g," ").trim()
const DATE=/(20[0-3]\d|19\d\d)\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/
const normDate=(s)=>{const m=(s||"").match(DATE);return m?`${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`:""}
const strip=(h)=>(h||"").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->|<head[\s>][\s\S]*?<\/head>/gi,"")
const dedupe=(rows)=>{const seen=new Set();return rows.filter(r=>{if(!r.제목)return false;const k=r.링크+"|"+r.제목;if(seen.has(k))return false;seen.add(k);return true})}

export default {
  ids: [18, 19],
  board: (i) => ({ 18: '기본연구', 19: 'KISDI Premium Report' })[i] || '',
  parse(html, url) {
    let key = '', arr = ''
    try { const u = new URL(url); key = u.searchParams.get('key') || ''; arr = u.searchParams.get('arrMasterId') || '' } catch { /* noop */ }
    const sk = html.match(/view\.do\?key=(m\d+)/); if (!key && sk) key = sk[1]
    const h = strip(html)
    const list = h.slice(Math.max(0, h.indexOf('id="dataList"')))
    const rows = []
    for (const m of list.matchAll(/goView\('(\d+)',\s*'(\d+)'\);?"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const [, masterId, artId, inner] = m
      const t = inner.match(/<strong>([\s\S]*?)<\/strong>/i)
      const d = inner.match(/발행일<\/strong>([^<]*)/i)
      const q = new URLSearchParams({ key, masterId, arrMasterId: arr || masterId, artId })
      rows.push({ 제목: clean(t ? t[1] : ''), 날짜: normDate(d ? d[1] : inner), 링크: 'https://www.kisdi.re.kr/report/view.do?' + q })
    }
    return dedupe(rows)
  },
}
