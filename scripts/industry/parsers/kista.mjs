import { clean, normDate, strip } from '../gen.mjs'
// KISTA 간행물 (gallery_pdf) — div.li > p.tit + 등록일. 게시물별 상세페이지 링크가 없음(카드에 PDF 다운로드
// 버튼 fn_egov_downFile(atchFileId, fileSn)만 존재). 상세페이지가 없으므로 인라인 스크립트의
// window.open("/cmm/fms/FileDown.do?atchFileId=..&fileSn=..") GET URL을 링크로 사용(항목별 고유).
export default {
  ids: [30],
  board() { return '간행물' },
  parse(html, url) {
    const h = strip(html); const out = []; const seen = new Set(); const origin = new URL(url).origin
    const s = h.indexOf('gallery_li'); if (s < 0) return out
    const parts = h.slice(s).split(/<div class="li">/).slice(1)
    for (const b of parts) {
      const tm = b.match(/<p class="tit[^"]*">([\s\S]*?)<\/p>/i); if (!tm) continue
      const dm = b.match(/등록일<\/span>\s*<span>([^<]+)/)
      const fm = b.match(/fn_egov_downFile\('([^']+)'\s*,\s*'([^']*)'\)/)
      const 링크 = fm ? `${origin}/cmm/fms/FileDown.do?atchFileId=${fm[1]}&fileSn=${fm[2] || 0}` : url
      const t = clean(tm[1])
      const key = 링크 + '|' + t
      if (!t || seen.has(key)) continue; seen.add(key)
      out.push({ 제목: t, 날짜: normDate(dm ? dm[1] : ''), 링크 })
    }
    return out
  }
}
