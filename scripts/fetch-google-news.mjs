// 구글 뉴스 RSS를 미리 긁어 public/data/news-google.json 으로 저장하는 스크립트.
// GitHub Actions(러너 IP는 구글이 차단하지 않음)에서 3시간마다 실행 → 커밋 → 빌드에 동봉.
// 클라이언트(News.jsx)가 /data/news-google.json 을 읽어 네이버·매체(/api/news)와 병합.
// (비공개 저장소라 raw.githubusercontent 불가 → public/data 빌드 동봉 방식)
// 실행: node scripts/fetch-google-news.mjs   (Node 18+ 내장 fetch 사용, 외부 의존성 없음)

import { writeFile, mkdir } from 'node:fs/promises'

const QUERIES = [
  '투자 OR 회수 OR 엑싯 OR Exit OR 세컨더리 OR 구주거래 OR 구주매각 OR 투자유치',
  '상장 OR IPO',
  'M&A OR 인수 OR 합병 OR 인수합병',
  '벤처기업 OR 스타트업 OR 모태펀드 OR 성장금융',
  '중기부 OR 중소벤처기업부 OR 벤처투자촉진법 OR 벤처투자법',
]
const WINDOW_DAYS = 14
const PER_QUERY_CAP = 40 // 쿼리당 최신 40건까지만
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

async function fetchQuery(q) {
  const u = `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:14d')}&hl=ko&gl=KR&ceid=KR:ko`
  const res = await fetch(u, {
    headers: {
      'User-Agent': UA,
      'Accept': 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      'Cookie': 'CONSENT=YES+cb',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const xml = await res.text()
  if (!xml.includes('<item>')) throw new Error('빈 응답(동의/차단 페이지)')
  return parseRss(xml).slice(0, PER_QUERY_CAP)
}

function parseRss(xml) {
  const items = xml.split('<item>').slice(1)
  const out = []
  for (const chunk of items) {
    let title = decode(((chunk.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '').trim())
    const link = ((chunk.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '').trim()
    const pub = ((chunk.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '').trim()
    // 구글 RSS 제목은 "제목 - 출처" 형태 + <source> 태그로 출처를 줌
    let source = decode(((chunk.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1] || '').trim())
    if (source && title.endsWith(' - ' + source)) title = title.slice(0, -(source.length + 3))
    else { const i = title.lastIndexOf(' - '); if (i > 0 && title.length - i < 30) { source = source || title.slice(i + 3); title = title.slice(0, i) } }
    const ts = pub ? Date.parse(pub) : 0
    if (title && link) out.push({ 제목: stripTags(title), 링크: link, 출처: source, 날짜: ts ? isoDate(ts) : '', ts })
  }
  return out
}

function stripTags(s) { return s.replace(/<[^>]*>/g, '') }
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

async function main() {
  const settled = await Promise.allSettled(QUERIES.map(fetchQuery))
  const arts = []
  let okCount = 0
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') { okCount++; arts.push(...r.value) }
    else console.error(`쿼리 실패 [${QUERIES[i].slice(0, 20)}…]: ${r.reason?.message || r.reason}`)
  })
  const cutoff = Date.now() - WINDOW_DAYS * 86400000
  const articles = dedupe(arts).filter((a) => a.ts && a.ts >= cutoff).sort((a, b) => b.ts - a.ts)

  const payload = {
    generated_at: new Date().toISOString(),
    window_days: WINDOW_DAYS,
    ok: okCount > 0,
    queries_ok: okCount,
    queries_total: QUERIES.length,
    total: articles.length,
    articles,
  }
  await mkdir('public/data', { recursive: true })
  await writeFile('public/data/news-google.json', JSON.stringify(payload, null, 0))
  console.log(`구글 뉴스 ${articles.length}건 저장 (쿼리 ${okCount}/${QUERIES.length} 성공)`)
  if (okCount === 0) process.exitCode = 1 // 전부 실패면 워크플로 로그에 실패 표시(기존 파일은 유지)
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
