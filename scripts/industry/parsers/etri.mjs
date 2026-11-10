// ETRI 정적 홍보물 페이지. 20 = Easy IT 시리즈(도서 목록, 상세 링크 없음), 21 = ETRI Technology Report(연도별 PDF).
const dec=(s)=>(s||"").replace(/&nbsp;/g," ").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,"\"").replace(/&#0?39;/g,"'").replace(/&#x27;/g,"'").replace(/&middot;/g,"·").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(n)).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16))).replace(/&amp;/g,"&")
const clean=(s)=>dec((s||"").replace(/<[^>]*>/g," ")).replace(/\s+/g," ").trim()
const strip=(h)=>(h||"").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->|<head[\s>][\s\S]*?<\/head>/gi,"")
const abs=(href,base)=>{try{return new URL(dec(href).trim(),base).href}catch{return ""}}
const dedupe=(rows)=>{const seen=new Set();return rows.filter(r=>{if(!r.제목)return false;const k=r.링크+"|"+r.제목;if(seen.has(k))return false;seen.add(k);return true})}
const content = (h) => { const s = h.indexOf('class="cont_title"'); const e = h.indexOf('id="footer"', s); return s < 0 ? h : h.slice(s, e > s ? e : undefined) }

// 표지 이미지 파일명에 날짜가 있는 경우만: easy_20180423 / easy_160121_2 → YYYY-MM-DD
function imgDate(src) {
  let m = src.match(/easy_(20[0-3]\d)(\d{2})(\d{2})/)
  if (!m) { const k = src.match(/easy_(\d{2})(\d{2})(\d{2})(?:_|\.|\s)/); if (k && +k[1] >= 10 && +k[2] >= 1 && +k[2] <= 12 && +k[3] >= 1 && +k[3] <= 31) m = [0, '20' + k[1], k[2], k[3]] }
  if (!m || +m[2] < 1 || +m[2] > 12) return ''
  return `${m[1]}-${m[2]}-${m[3]}`
}

function easyIt(html, url) {
  const c = content(strip(html))
  const rows = []
  for (const b of c.split(/<li>\s*<div class="sum_img">/i).slice(1)) {
    const t = b.match(/<p class="title"[^>]*>([\s\S]*?)<\/p>/i)
    if (!t) continue
    const src = (b.match(/<img[^>]*src="([^"]*)"/i) || [])[1] || ''
    rows.push({ 제목: clean(t[1]), 날짜: imgDate(src), 링크: url }) // 개별 상세페이지 없음 → 목록 URL
  }
  return dedupe(rows)
}

function techReport(html, url) {
  const c = content(strip(html))
  const rows = []
  for (const m of c.matchAll(/<p class="title"[^>]*>([\s\S]*?)<\/p>([\s\S]*?)(?=<p class="title"|$)/gi)) {
    const 제목 = clean(m[1])
    const pdf = m[2].match(/href="([^"]*predicalFile[^"]*)"/i) || m[2].match(/href="([^"]*\.pdf)"/i)
    const y = 제목.match(/(19|20)\d\d/)
    rows.push({ 제목, 날짜: y ? y[0] : '', 링크: pdf ? encodeURI(abs(pdf[1], url).replace(/%20/g, ' ')) : url })
  }
  return dedupe(rows)
}

export default {
  ids: [20, 21],
  board: (i) => ({ 20: 'Easy IT 시리즈', 21: 'ETRI Technology Report' })[i] || '',
  parse(html, url, id) {
    const i = id ?? (/0405/.test(url) ? 21 : 20)
    return i === 21 ? techReport(html, url) : easyIt(html, url)
  },
}
