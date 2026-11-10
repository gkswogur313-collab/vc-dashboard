// Cloudflare Pages Function — 네이버 + 스타트업 매체 뉴스 크롤링
// 카테고리 키워드 + 포트폴리오 회사명 → 중복 제거 → 최근 2주 → JSON
// 소스별 상태(ok/차단/실패)를 sources[]로 함께 반환.
// 참고: 구글 뉴스 RSS는 Cloudflare 서버 IP를 차단(403/빈 응답)해 제외함.

const NAVER_QUERIES = ['벤처투자', '투자유치', '스타트업 투자', 'IPO 상장', '인수합병', '모태펀드', '성장금융', '벤처투자법', '세컨더리 구주']
const MEDIA = [
  { name: '플래텀', url: 'https://platum.kr/feed' },
  { name: '벤처스퀘어', url: 'https://www.venturesquare.net/feed' },
  { name: '바이라인', url: 'https://byline.network/feed' },
  { name: '스타트업레시피', url: 'https://startuprecipe.co.kr/feed' },
]
// 구글 뉴스는 여기(엣지)가 아니라 GitHub Actions가 public/data/news-google.json 으로 미리 긁고,
// 클라이언트(News.jsx)가 그 정적 파일을 읽어 여기 결과와 병합한다(비공개 저장소라 raw 대신 빌드 동봉).
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

export async function onRequestGet(context) {
  const url = new URL(context.request.url)
  const portfolio = (url.searchParams.get('portfolio') || '').split(',').map((s) => s.trim()).filter(Boolean)
  const fresh = url.searchParams.get('fresh')
  const env = context.env || {}

  const canonical = new URL(url.toString()); canonical.searchParams.delete('fresh')
  const cache = caches.default
  const cacheKey = new Request(canonical.toString())
  if (!fresh) { const hit = await cache.match(cacheKey); if (hit) return hit }

  // 소스별 실행 (병렬). 네이버·매체는 여기서 실시간 수집(구글은 클라이언트가 별도 병합).
  const jobs = []
  if (env.NAVER_CLIENT_ID && env.NAVER_CLIENT_SECRET) {
    jobs.push(runNaver([...NAVER_QUERIES, ...portfolio.slice(0, 12)], env))
  } else {
    jobs.push(Promise.resolve({ name: '네이버', ok: false, error: 'API 키 미설정', articles: [] }))
  }
  MEDIA.forEach((m) => jobs.push(runFeed(m)))

  const results = await Promise.all(jobs)
  const sources = results.map((r) => ({ name: r.name, ok: r.ok, count: r.articles.length, error: r.error || '' }))
  const merged = dedupe(results.flatMap((r) => r.articles))
  const cutoff = Date.now() - 14 * 86400000 // 최근 2주
  const recent = merged.filter((a) => a.ts && a.ts >= cutoff).sort((a, b) => b.ts - a.ts)

  // 문제 상태(어떤 소스든 실패)는 짧게 캐시(2분)해서 빨리 자가치유, 전부 정상이면 30분
  const maxAge = sources.every((s) => s.ok) ? 1800 : 120
  const resp = new Response(JSON.stringify({ articles: recent, sources, updated: new Date().toISOString() }), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${maxAge}` },
  })
  context.waitUntil(cache.put(cacheKey, resp.clone()))
  return resp
}

async function runNaver(queries, env) {
  let anyOk = false, blocked = false
  const arts = []
  await Promise.all(queries.map(async (q) => {
    const u = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(q)}&display=50&sort=date`
    try {
      const res = await fetch(u, { headers: { 'X-Naver-Client-Id': env.NAVER_CLIENT_ID, 'X-Naver-Client-Secret': env.NAVER_CLIENT_SECRET } })
      if (res.status === 429) { blocked = true; return }
      if (!res.ok) return
      anyOk = true
      const data = await res.json()
      for (const it of (data.items || [])) {
        const 제목 = decode(stripTags(it.title || ''))
        const 링크 = it.originallink || it.link || ''
        const ts = it.pubDate ? Date.parse(it.pubDate) : 0
        if (제목 && 링크) arts.push({ 제목, 링크, 출처: hostname(링크), 날짜: ts ? isoDate(ts) : '', ts })
      }
    } catch (e) { /* skip */ }
  }))
  return { name: '네이버', ok: anyOk, error: !anyOk ? (blocked ? '호출 한도' : '응답 없음') : '', articles: arts }
}

async function runFeed(m) {
  try {
    const res = await fetch(m.url, { headers: { 'User-Agent': UA } })
    if (res.status === 403 || res.status === 429) return { name: m.name, ok: false, error: `차단(${res.status})`, articles: [] }
    if (!res.ok) return { name: m.name, ok: false, error: `HTTP ${res.status}`, articles: [] }
    return { name: m.name, ok: true, error: '', articles: parseRss(await res.text(), m.name) }
  } catch (e) {
    return { name: m.name, ok: false, error: '연결 실패', articles: [] }
  }
}

// RSS 파서. sourceName이 있으면 그걸 출처로, 없으면(구글) 제목 뒤 " - 출처"에서 추출.
function parseRss(xml, sourceName) {
  const items = xml.split('<item>').slice(1)
  const out = []
  for (const chunk of items) {
    let title = decode(((chunk.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '').trim())
    const link = ((chunk.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '').trim()
    const pub = ((chunk.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '').trim()
    let source = sourceName || ''
    if (!sourceName) {
      source = decode(((chunk.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1] || '').trim())
      if (source && title.endsWith(' - ' + source)) title = title.slice(0, -(source.length + 3))
      else { const i = title.lastIndexOf(' - '); if (i > 0 && title.length - i < 30) title = title.slice(0, i) }
    }
    const ts = pub ? Date.parse(pub) : 0
    if (title && link) out.push({ 제목: stripTags(title), 링크: link, 출처: source, 날짜: ts ? isoDate(ts) : '', ts })
  }
  return out
}

function stripTags(s) { return s.replace(/<[^>]*>/g, '') }
function hostname(u) { try { return new URL(u).hostname.replace(/^www\./, '') } catch (e) { return '' } }
function isoDate(ts) { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function decode(s) {
  return s.replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim()
}
function dedupe(arr) {
  const seen = new Set(); const out = []
  for (const a of arr) {
    const key = a.제목.toLowerCase().replace(/[^가-힣a-z0-9]/g, '').slice(0, 40)
    if (!key || seen.has(key)) continue
    seen.add(key); out.push(a)
  }
  return out
}
