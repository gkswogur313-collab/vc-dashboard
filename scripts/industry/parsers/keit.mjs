// KEIT: 0 = 테크포커스(techfocus.kr 월간지 호별 페이지), 1 = S-ROME KEIT 이슈픽 목록
const dec=(s)=>(s||"").replace(/&nbsp;/g," ").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,"\"").replace(/&#0?39;/g,"'").replace(/&#x27;/g,"'").replace(/&middot;/g,"·").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(n)).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16))).replace(/&amp;/g,"&")
const clean=(s)=>dec((s||"").replace(/<[^>]*>/g," ")).replace(/\s+/g," ").trim()
const DATE=/(20[0-3]\d|19\d\d)\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/
const normDate=(s)=>{const m=(s||"").match(DATE);return m?`${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`:""}
const strip=(h)=>(h||"").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->|<head[\s>][\s\S]*?<\/head>/gi,"")
const abs=(href,base)=>{try{return new URL(dec(href).trim(),base).href}catch{return ""}}
const dedupe=(rows)=>{const seen=new Set();return rows.filter(r=>{if(!r.제목)return false;const k=r.링크+"|"+r.제목;if(seen.has(k))return false;seen.add(k);return true})}

// 테크포커스: 한 호(volNN) 메인 페이지의 기사 카드들. 날짜는 호 발행월(YYYY-MM)만 있음.
function techfocus(html, url) {
  const ym = html.match(/<span>\s*(20\d\d)\.(\d{1,2})\s*<\/span>\s*_?\s*Vol/i) || html.match(/class="date">\s*(20\d\d)\.(\d{1,2})\s*</)
  const 날짜 = ym ? `${ym[1]}-${ym[2].padStart(2, '0')}` : ''
  const h = strip(html)
  const body = h.slice(Math.max(0, h.indexOf('id="content"')))
  const rows = []
  const seen = new Set()
  for (const m of body.matchAll(/<a\s[^>]*href="([^"]*s_\d+_\d+\.html)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const sub = m[2].match(/class="subject[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
    if (!sub) continue // 비주얼 배너/이미지 배너는 subject가 없음 → 아래 본문 카드에서 수집
    const 링크 = abs(m[1], url)
    if (seen.has(링크)) continue
    seen.add(링크)
    rows.push({ 제목: clean(sub[1]), 날짜, 링크 })
  }
  return dedupe(rows)
}

// S-ROME 이슈픽: f_detail(blltSeq) → searchForm(method=get) action=retrieveKeitIssuInfoView.do
function srome(html, url) {
  const h = strip(html)
  const prgmId = (() => { try { return new URL(url).searchParams.get('prgmId') || '' } catch { return '' } })() || (html.match(/name="prgmId"\s+value="([^"]*)"/) || [])[1] || ''
  const rows = []
  for (const b of h.split(/class="thumbnail_box"/).slice(1)) {
    const a = b.match(/f_detail\('(\d+)'\)"[^>]*class="thumbnail_link"[^>]*>([\s\S]*?)<\/a>/i) || b.match(/f_detail\('(\d+)'\)"[^>]*>([^<]{4,}?)<\/a>/i)
    if (!a) continue
    const d = b.match(/등록일<\/span>\s*<span class="value">([^<]*)</)
    const 링크 = `https://srome.keit.re.kr/srome/biz/info/keitPub/retrieveKeitIssuInfoView.do?blltSeq=${a[1]}${prgmId ? `&prgmId=${encodeURIComponent(prgmId)}` : ''}`
    rows.push({ 제목: clean(a[2]), 날짜: normDate(d ? d[1] : b), 링크 })
  }
  return dedupe(rows)
}

export default {
  ids: [0, 1],
  board: (i) => ({ 0: 'TECH FOCUS', 1: 'KEIT 이슈픽' })[i] || '',
  parse(html, url, id) {
    if (id === 0 || /techfocus\.kr/i.test(url || '')) return techfocus(html, url || 'https://techfocus.kr/')
    return srome(html, url || 'https://srome.keit.re.kr/')
  },
}
