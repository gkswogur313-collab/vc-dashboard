// SK하이닉스 뉴스룸 카테고리 목록 (WordPress)
const dec=(s)=>(s||"").replace(/&nbsp;/g," ").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,"\"").replace(/&#0?39;/g,"'").replace(/&#x27;/g,"'").replace(/&middot;/g,"·").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(n)).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16))).replace(/&amp;/g,"&")
const clean=(s)=>dec((s||"").replace(/<[^>]*>/g," ")).replace(/\s+/g," ").trim()
const DATE=/(20[0-3]\d|19\d\d)\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/
const normDate=(s)=>{const m=(s||"").match(DATE);return m?`${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`:""}
const strip=(h)=>(h||"").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->|<head[\s>][\s\S]*?<\/head>/gi,"")
const abs=(href,base)=>{try{return new URL(dec(href).trim(),base).href}catch{return ""}}
const dedupe=(rows)=>{const seen=new Set();return rows.filter(r=>{if(!r.제목)return false;const k=r.링크+"|"+r.제목;if(seen.has(k))return false;seen.add(k);return true})}

export default {
  ids: [2],
  board: () => 'TECH&AI',
  // 목록 HTML은 GitHub Actions(해외 IP)에서 403이 잦아 WordPress RSS 피드를 먼저 읽는다(실패 시 목록 HTML).
  async crawl(i, url, { fetchText }) {
    try { return await fetchText(url.replace(/\/?$/, '/') + 'feed/', { headers: { Accept: 'application/rss+xml,application/xml,*/*' } }) } catch { /* 다음 방법 */ }
    try { return await fetchText(url) } catch { /* 다음 방법 */ }
    // 마지막: 대시보드 엣지 함수(Cloudflare)가 대신 읽은 결과(functions/api/industry-kr.js) — 주소는 Secrets(SITE_URL)
    const site = (process.env.SITE_URL || '').replace(/\/+$/, '')
    if (!site) throw new Error('SITE_URL 미설정 — 엣지 함수 우회 생략')
    return fetchText(site + '/api/industry-kr', { headers: { Accept: 'application/json' } })
  },
  parse(html, url) {
    if (/^\s*\{/.test(html)) {
      const j = JSON.parse(html)
      return (j.items || []).filter((x) => x.src === 2).map((x) => ({ 제목: x.제목, 날짜: x.날짜, 링크: x.링크 }))
    }
    if (/<rss[\s>]/i.test(html)) {
      const rows = []
      for (const it of html.match(/<item>[\s\S]*?<\/item>/gi) || []) {
        const g = (t) => { const m = it.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`, 'i')); return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '') : '' }
        const d = new Date(g('pubDate'))
        rows.push({ 제목: clean(g('title')), 날짜: isNaN(d) ? '' : new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10), 링크: g('link').trim() })
      }
      return dedupe(rows)
    }
    const h = strip(html)
    const rows = []
    for (const b of h.split(/<article\b/i).slice(1)) {
      const a = b.match(/<a\s[^>]*href="([^"]+)"[^>]*class="item-link"/i) || b.match(/<a\s[^>]*class="item-link"[^>]*href="([^"]+)"/i)
      const t = b.match(/class="text-inner"[^>]*>([\s\S]*?)<\/span>/i) || b.match(/class="title"[^>]*>([\s\S]*?)<\/div>/i)
      if (!a || !t) continue
      const d = b.match(/class="date"[^>]*>([^<]*)</i)
      rows.push({ 제목: clean(t[1]), 날짜: normDate(d ? d[1] : ''), 링크: abs(a[1], url) })
    }
    return dedupe(rows)
  },
}
