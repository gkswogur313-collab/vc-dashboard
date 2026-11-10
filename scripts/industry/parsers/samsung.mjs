// 삼성전자 반도체 뉴스룸 카테고리 목록 (WordPress)
const dec=(s)=>(s||"").replace(/&nbsp;/g," ").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,"\"").replace(/&#0?39;/g,"'").replace(/&#x27;/g,"'").replace(/&middot;/g,"·").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(n)).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16))).replace(/&amp;/g,"&")
const clean=(s)=>dec((s||"").replace(/<[^>]*>/g," ")).replace(/\s+/g," ").trim()
const DATE=/(20[0-3]\d|19\d\d)\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/
const normDate=(s)=>{const m=(s||"").match(DATE);return m?`${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`:""}
const strip=(h)=>(h||"").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->|<head[\s>][\s\S]*?<\/head>/gi,"")
const abs=(href,base)=>{try{return new URL(dec(href).trim(),base).href}catch{return ""}}
const dedupe=(rows)=>{const seen=new Set();return rows.filter(r=>{if(!r.제목)return false;const k=r.링크+"|"+r.제목;if(seen.has(k))return false;seen.add(k);return true})}

export default {
  ids: [3],
  board: () => '기술',
  parse(html, url) {
    const h = strip(html)
    const rows = []
    for (const b of h.split(/<li class="article_item/i).slice(1)) {
      const a = b.match(/<a\s[^>]*href="([^"]+)"/i)
      const t = b.match(/<p class="title"[^>]*>([\s\S]*?)<\/p>/i)
      if (!a || !t) continue
      const d = b.match(/class="date"[^>]*>([^<]*)</i)
      rows.push({ 제목: clean(t[1]), 날짜: normDate(d ? d[1] : ''), 링크: abs(a[1], url) })
    }
    return dedupe(rows)
  },
}
