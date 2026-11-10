import { clean, normDate } from '../gen.mjs'
// 삼성SDS 인사이트리포트 — 목록(#insightReportList)은 JS 렌더링. 정적 HTML에는 '추천(인기) 5건'만 있어 사용 안 함.
// 인라인 스크립트: var dataUrl = '/kr/insights/insights.txt'; fetchData(dataUrl) → JSON 배열 allData.
// 각 항목 필드(getArtListHtml 기준): title, detailLink, releaseDate, eyebrowCopy, content, id ...
// 국문은 _.sortBy(..,'releaseDate').reverse() 로 정렬. 최신 12건 반환.
const N = 12
export default {
  ids: [24],
  unverified: true,
  board() { return '인사이트리포트' },
  fetchUrl(i, url) { return new URL('/kr/insights/insights.txt', url).href },
  fetchOpts: { headers: { Accept: 'application/json, text/plain, */*', 'X-Requested-With': 'XMLHttpRequest' } },
  parse(text, url) {
    let data
    try { data = JSON.parse(String(text).replace(/^﻿/, '').trim()) } catch { return [] }
    if (!Array.isArray(data)) data = data?.result || data?.list || data?.data || []
    const base = 'https://www.samsungsds.com/kr/insights/index.html'
    const rows = data.map(o => {
      const d = normDate(String(o.releaseDate ?? o.dateValue ?? '')) || (String(o.releaseDate || '').match(/^(20\d\d)[.\-/](\d{1,2})$/) ? String(o.releaseDate).replace(/^(20\d\d)[.\-/](\d{1,2})$/, (_, y, m) => `${y}-${m.padStart(2, '0')}`) : '')
      let 링크 = ''
      try { 링크 = o.detailLink ? new URL(o.detailLink, base).href : '' } catch {}
      return { 제목: clean(String(o.title || '')), 날짜: d, 링크 }
    }).filter(r => r.제목 && r.링크)
    rows.sort((a, b) => (b.날짜 || '').localeCompare(a.날짜 || ''))
    const seen = new Set(); const out = []
    for (const r of rows) { if (seen.has(r.링크)) continue; seen.add(r.링크); out.push(r); if (out.length >= N) break }
    return out
  }
}
