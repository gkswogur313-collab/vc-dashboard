// Cloudflare Pages Function — 산업 트래킹 보조 수집(해외 IP에서 막히는 게시판)
// GitHub Actions(해외 IP)에서 403이 나는 게시판을 Cloudflare 엣지에서 대신 읽어 산업 트래킹 형식으로 돌려준다.
// 고정된 게시판만 요청한다(임의 URL 프록시 아님). 결과는 1시간 엣지 캐시.
//  · SK하이닉스 뉴스룸 TECH&AI — WordPress RSS (2026-11 서울 POP에서 200 확인)
//  · 한국수출입은행 해외경제연구소는 원 서버 인증서 문제로 Cloudflare에서도 526 → 여기서 처리 불가(별도 수집 필요)
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const TTL = 3600

const SOURCES = [
  {
    id: 2, 테마: '반도체', 기관: 'SK하이닉스', 게시판: 'TECH&AI',
    url: 'https://news.skhynix.co.kr/category/tech-and-ai/',
    feed: 'https://news.skhynix.co.kr/category/tech-and-ai/feed/',
  },
]

const dec = (s) => (s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#8216;|&#8217;/g, "'").replace(/&#8220;|&#8221;/g, '"')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/&amp;/g, '&')
const clean = (s) => dec(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

// 크롤러(scripts/fetch-industry.mjs)의 id 규칙과 동일: sha1(`${링크}|${제목}`) 앞 12자리
async function idOf(s) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 12)
}

async function runFeed(src) {
  const base = { id: src.id, 테마: src.테마, 기관: src.기관, 게시판: src.게시판, url: src.url }
  try {
    const r = await fetch(src.feed, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9', Accept: 'application/rss+xml,application/xml,*/*' } })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const xml = await r.text()
    const items = []
    for (const it of xml.match(/<item>[\s\S]*?<\/item>/gi) || []) {
      const g = (t) => { const m = it.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`, 'i')); return m ? m[1] : '' }
      const 제목 = clean(g('title'))
      const 링크 = dec(g('link')).trim()
      if (!제목 || !링크) continue
      const d = new Date(dec(g('pubDate')))
      items.push({
        id: await idOf(`${링크}|${제목}`), 테마: src.테마, 세부: [], 기관: src.기관, 게시판: src.게시판,
        날짜: isNaN(d) ? '' : new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10), // KST 기준 날짜
        제목, 링크, src: src.id,
      })
    }
    if (!items.length) throw new Error('목록 0건')
    return { ...base, ok: true, items }
  } catch (e) {
    return { ...base, ok: false, error: String(e.message || e).slice(0, 60), items: [] }
  }
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url)
  const cache = caches.default
  const key = new Request(`${url.origin}/api/industry-kr`)
  if (!url.searchParams.has('fresh')) { const hit = await cache.match(key); if (hit) return hit }

  const results = await Promise.all(SOURCES.map(runFeed))
  const body = {
    generated_at: new Date().toISOString(),
    colo: context.request.cf?.colo || '',
    sources: results.map(({ items, ...s }) => ({ ...s, count: items.length })),
    items: results.flatMap((r) => r.items),
  }
  const res = Response.json(body, { headers: { 'Cache-Control': `public, max-age=${TTL}` } })
  if (results.some((r) => r.ok)) context.waitUntil(cache.put(key, res.clone()))
  return res
}
