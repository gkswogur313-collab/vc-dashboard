import { readFileSync } from 'node:fs'
const dec=(s)=>(s||'').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#0?39;/g,"'").replace(/&#x27;/g,"'").replace(/&middot;/g,'·').replace(/&amp;/g,'&').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(n))
export const clean=(s)=>dec((s||'').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim()
const DATE=/(20[0-3]\d)\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/
export function normDate(s){const m=(s||'').match(DATE);if(!m)return'';return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`}
export function strip(h){return h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->|<head[\s>][\s\S]*?<\/head>/gi,'')}
export function blocks(h,tag){const re=new RegExp(`<${tag}[\\s>][\\s\\S]*?<\\/${tag}>`,'gi');return h.match(re)||[]}
// 가장 안쪽 블록만 쓰도록 li 안 li 문제는 무시(대부분 평탄)
export function generic(html,{block='tr|li',minLen=6}={}){
  const h=strip(html); const out=[]
  for(const tag of block.split('|')){
    for(const b of blocks(h,tag)){
      const txt=clean(b); const dm=txt.match(DATE); if(!dm) continue
      if(txt.length>600) continue
      // 후보 anchor
      let best=null
      for(const m of b.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)){
        let t=clean(m[2]).replace(DATE,'').trim()
        if(t.length<minLen) continue
        if(!best||t.length>best.t.length) best={t,attrs:m[1]}
      }
      if(!best) continue
      out.push({제목:best.t,날짜:normDate(dm[0]),attrs:best.attrs,block:b})
    }
    if(out.length>=3) break
  }
  return out
}
export const attr=(a,n)=>{const m=(a||'').match(new RegExp(`${n}\\s*=\\s*("([^"]*)"|'([^']*)')`,'i'));return m?dec(m[2]??m[3]):''}
