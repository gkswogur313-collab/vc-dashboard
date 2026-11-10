// 과기정통부 ITSTAT — ICT통계분석(BOARD05). 한 페이지에 호(issue) 4개, 호마다 개별 기사 PDF 4~6개.
// 항목 = 호 안의 개별 기사(실제 보고서 제목). 날짜 = 호 발행일.
// 상세페이지가 없고 PDF 미리보기는 bodyForm(POST, _csrf)을 /itstat/kor/board/viewPdfPreview.html?type=file 로 submit 하는 방식.
// → 같은 필드(board_class, board_seq, real_name)를 쿼리스트링으로 붙인 GET URL로 재구성. [GET 허용 여부 미검증]
const dec=(s)=>(s||"").replace(/&nbsp;/g," ").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,"\"").replace(/&#0?39;/g,"'").replace(/&#x27;/g,"'").replace(/&middot;/g,"·").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(n)).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16))).replace(/&amp;/g,"&")
const clean=(s)=>dec((s||"").replace(/<[^>]*>/g," ")).replace(/\s+/g," ").trim()
const DATE=/(20[0-3]\d|19\d\d)\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/
const normDate=(s)=>{const m=(s||"").match(DATE);return m?`${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`:""}
const strip=(h)=>(h||"").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->|<head[\s>][\s\S]*?<\/head>/gi,"")
const dedupe=(rows)=>{const seen=new Set();return rows.filter(r=>{if(!r.제목)return false;const k=r.링크+"|"+r.제목;if(seen.has(k))return false;seen.add(k);return true})}

export default {
  ids: [17],
  board: () => 'ICT통계분석',
  parse(html, url) {
    const h = strip(html)
    const boardClass = (url.match(/board_class=(\w+)/) || h.match(/id="board_class"[^>]*value="(\w+)"/) || [])[1] || 'BOARD05'
    const origin = (() => { try { return new URL(url).origin } catch { return 'https://www.itstat.go.kr' } })()
    // PDF 미리보기는 CSRF 토큰이 필요한 POST라 직접 링크가 열리지 않음(2026-11 확인) → 목록 페이지로 연결
    const link = () => url
    const rows = []
    for (const b of h.split(/<div class="cover">/i).slice(1)) {
      const d = b.match(/class="date"[^>]*>([\s\S]*?)<\/span>/i)
      const 날짜 = normDate(d ? clean(d[1]) : '')
      const issue = clean((b.match(/<p class="title"[^>]*>([\s\S]*?)<\/p>/i) || [])[1] || '') // 예: [25 - 04호] ICT 통계분석
      let n = 0
      for (const f of b.matchAll(/<li class="files">([\s\S]*?)<\/li>/gi)) {
        const t = f[1].match(/<span title="([^"]*)"/i) || f[1].match(/<span[^>]*>([\s\S]*?)<\/span>/i)
        const p = f[1].match(/data-realNm="([^"]+)"[^>]*data-seq="(\d+)"/i) || f[1].match(/data-seq="(\d+)"[^>]*data-realNm="([^"]+)"/i)
        if (!t || !p) continue
        const [real, seq] = /^\d+$/.test(p[1]) ? [p[2], p[1]] : [p[1], p[2]]
        rows.push({ 제목: clean(t[1]), 날짜, 링크: link(seq, real) })
        n++
      }
      if (!n && issue) { // 개별 기사 목록이 없으면 호 합본으로
        const p = b.match(/id="pubPreview\d*"[^>]*data-realNm="([^"]+)"[^>]*data-seq="(\d+)"/i)
        if (p) rows.push({ 제목: issue, 날짜, 링크: link(p[2], p[1]) })
      }
    }
    return dedupe(rows)
  },
}
