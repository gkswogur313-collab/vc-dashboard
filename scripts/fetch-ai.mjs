// AI 브리핑 수집기 — 전문지·뉴스레터·기업 블로그 RSS와 구글 뉴스 검색 피드를 매일 모아 누적한다.
// GitHub Actions(fetch-ai)에서 실행 → public/data/ai/feed.json 커밋 → 주간 예약 작업이 재료로 쓴다.
// 피드 목록: scripts/ai/feeds.json  (filter:true 인 종합 매체는 AI 키워드가 있는 글만 남긴다)
// 정책: 피드 하나가 실패해도 그 피드의 기존 항목은 그대로 둔다. 최근 180일·최대 4000건만 유지.
// 실행: node scripts/fetch-ai.mjs   (Node 18+ 내장 fetch, 외부 의존성 없음)
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const OUT = 'public/data/ai/feed.json'
const KEEP_DAYS = 180
const MAX_ITEMS = 4000
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const KST = 9 * 3600e3
const idOf = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12)
const today = new Date(Date.now() + KST).toISOString().slice(0, 10)

// 종합 매체에서 AI 글만 고르는 키워드(제목+요약 기준)
const KW = /인공지능|생성형|AI|LLM|거대언어|언어모델|파운데이션 모델|에이전트|챗GPT|ChatGPT|오픈AI|OpenAI|앤트로픽|Anthropic|제미나이|Gemini|클로드|Claude|딥시크|DeepSeek|GPU|엔비디아|NVIDIA|데이터센터|data center|datacenter|hyperscale|휴머노이드|humanoid|로봇|robot|자율주행|machine learning|neural|inference|추론|학습|LLaMA|Llama|Mistral|xAI|Grok|Copilot/

const decode = (s = '') => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
const strip = (s = '') => decode(decode(s)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const tag = (chunk, name) => { const m = chunk.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i')); return m ? m[1] : '' }
const toDate = (s) => { const t = Date.parse(strip(s)); return Number.isFinite(t) ? new Date(t + KST).toISOString().slice(0, 10) : '' }

function parse(xml) {
  const out = []
  const isAtom = !/<item[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml)
  const chunks = xml.split(isAtom ? /<entry[\s>]/i : /<item[\s>]/i).slice(1)
  for (const c of chunks) {
    let title = strip(tag(c, 'title'))
    let link = strip(tag(c, 'link'))
    if (!link) link = (c.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || ''
    const date = toDate(tag(c, 'pubDate') || tag(c, 'published') || tag(c, 'updated') || tag(c, 'dc:date'))
    const desc = strip(tag(c, 'description') || tag(c, 'summary') || tag(c, 'content:encoded')).slice(0, 500)
    let source = strip(tag(c, 'source'))
    if (title && link) out.push({ title, link: decode(link), date, desc, source })
  }
  return out
}

async function fetchFeed(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8', 'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8', Cookie: 'CONSENT=YES+cb' },
    redirect: 'follow', signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const xml = await res.text()
  if (!/<(item|entry)[\s>]/i.test(xml)) throw new Error('피드 형식 아님')
  return parse(xml)
}

const feeds = JSON.parse(await readFile(new URL('./ai/feeds.json', import.meta.url), 'utf-8'))
let prev = { items: [] }
try { prev = JSON.parse(await readFile(OUT, 'utf-8')) } catch { /* 첫 실행 */ }
const byId = new Map(prev.items.map((i) => [i.id, i]))
const sources = []

for (const f of feeds) {
  try {
    let list = await fetchFeed(f.url)
    if (f.filter) list = list.filter((x) => KW.test(`${x.title} ${x.desc}`))
    let added = 0
    for (const x of list) {
      let title = x.title, 매체 = f.매체
      if (f.google) { // 구글 뉴스: "제목 - 매체" 꼴, 요약은 쓸모없음
        const m = title.match(/^(.*) - ([^-]+)$/)
        if (m) { title = m[1].trim(); 매체 = x.source || m[2].trim() }
        x.desc = ''
      }
      const id = idOf(f.google ? `${title}|${매체}` : x.link)
      if (byId.has(id)) continue
      byId.set(id, { id, src: f.id, 분류: f.분류, 매체, 제목: title, 링크: x.link, 날짜: x.date || today, 요약: x.desc, 수집일: today, 구글경유: !!f.google })
      added++
    }
    sources.push({ id: f.id, 매체: f.매체, 분류: f.분류, ok: true, count: list.length, added })
    console.log(`✓ ${f.매체}: ${list.length}건 (신규 ${added})`)
  } catch (e) {
    sources.push({ id: f.id, 매체: f.매체, 분류: f.분류, ok: false, error: String(e.message || e).slice(0, 80) })
    console.log(`✗ ${f.매체}: ${e.message}`)
  }
}

const cutoff = new Date(Date.now() + KST - KEEP_DAYS * 86400e3).toISOString().slice(0, 10)
const items = [...byId.values()].filter((i) => (i.날짜 || i.수집일) >= cutoff)
  .sort((a, b) => (b.날짜 || '').localeCompare(a.날짜 || '')).slice(0, MAX_ITEMS)
await mkdir('public/data/ai', { recursive: true })
await writeFile(OUT, JSON.stringify({ generated_at: new Date().toISOString(), count: items.length, sources, items }, null, 1))
console.log(`총 ${items.length}건 저장 · 피드 ${sources.filter((s) => s.ok).length}/${sources.length} 정상`)
