// IPO 파이프라인 크롤러 — KIND(kind.krx.co.kr) 3개 목록을 회사명으로 병합.
//  · 예비심사기업 (청구/승인)      listinvstgcom.do   method=searchListInvstgCorpSub
//  · 공모기업현황 (신고서~청약)    pubofrprogcom.do   method=searchPubofrProgComSub
//  · 신규상장기업현황 (상장 완료)  listingcompany.do  method=searchListingTypeSub
// 유가(marketType=1)·코스닥(2)만, 2020년~현재. 회사명 기준 병합 → 단계별 날짜 한 줄.
// GitHub Actions에서 매일 실행 → public/data/ipo.json 커밋 → 빌드 동봉 → 클라이언트가 렌더.
// 실행: node scripts/fetch-ipo.mjs   (Node 18+ 내장 fetch, 외부 의존성 없음)

import { writeFile, mkdir } from 'node:fs/promises'

const BASE = 'https://kind.krx.co.kr/listinvstg'
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const FROM = '2020-01-01'
const TO = (() => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` })()
const MARKETS = [{ code: '1', name: 'KS' }, { code: '2', name: 'KQ' }] // KS=유가증권, KQ=코스닥
const PAGE = 100        // KIND 페이지 크기
const MAX_PAGES = 80    // 안전 상한

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
function stripTags(s) { return (s || '').replace(/<[^>]*>/g, '') }
function decode(s) {
  return (s || '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
}
const clean = (s) => decode(stripTags(s)).replace(/\s+/g, ' ').trim()
const dateOf = (s) => { const m = (s || '').match(/\d{4}-\d{2}-\d{2}/); return m ? m[0] : '' }
// "2026-07-13 ~ 2026-07-14" → {start,end}
const rangeOf = (s) => { const m = (s || '').match(/\d{4}-\d{2}-\d{2}/g); return m ? { start: m[0], end: m[1] || m[0] } : null }

async function post(path, params, tries = 3) {
  let lastErr
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${BASE}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' },
        body: new URLSearchParams(params),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch (e) { lastErr = e; await sleep(400 * (i + 1)) }
  }
  throw lastErr
}

// <tr> 별 <td> 텍스트 배열 (데이터 행만)
function rowsOf(html) {
  const trs = html.split(/<tr[\s>]/i).slice(1).map((s) => '<tr ' + s.split(/<\/tr>/i)[0])
  const out = []
  for (const tr of trs) {
    const cells = []
    const re = /<td[^>]*>([\s\S]*?)<\/td>/gi
    let m
    while ((m = re.exec(tr))) cells.push(clean(m[1]))
    if (cells.length) out.push(cells)
  }
  return out
}
const isCorp = (s) => s && !/^(회사명|합계|조회된|데이터|번호)/.test(s)

// 페이지 순회하며 모든 행 수집
async function crawl(path, buildParams, market) {
  const rows = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    let html
    try { html = await post(path, buildParams(market.code, page)) }
    catch (e) { console.error(`${path} ${market.name} p${page} 실패: ${e.message}`); break }
    const rs = rowsOf(html).filter((c) => c.length >= 5 && isCorp(c[0]))
    if (!rs.length) break
    rows.push(...rs)
    if (rs.length < PAGE) break
    await sleep(120)
  }
  return rows
}

// ---------- 파라미터 빌더 ----------
const preParams = (mkt, page) => ({
  method: 'searchListInvstgCorpSub', currentPageSize: String(PAGE), pageIndex: String(page),
  orderMode: '2', orderStat: 'D', forward: 'listinvstgcom_sub', bizProcNo: '', listClssCd: '', comAbbrv: '',
  listTypeArrStr: '01|02|03|04|05|06|07|', invstgRsltArrStr: '01|02|03|04|05|08|07|06|', seq: '0',
  searchMode: '', searchCodeType: '', searchCorpName: '', isurCd: '', repIsuSrtCd: '',
  marketType: mkt, searchCorpNameTmp: '', fromDate: FROM, toDate: TO,
})
const ofrParams = (mkt, page) => ({
  method: 'searchPubofrProgComSub', currentPageSize: String(PAGE), pageIndex: String(page),
  orderMode: '1', orderStat: 'D', forward: 'pubofrprogcom_sub', searchMode: '', searchCodeType: '',
  searchCorpName: '', isurCd: '', repIsuSrtCd: '', bzProcsNo: '', detailMarket: '',
  marketType: mkt, searchCorpNameTmp: '', repMajAgntDesignAdvserComp: '', repMajAgntComp: '', designAdvserComp: '',
  fromDate: FROM, toDate: TO,
})
const lstParams = (mkt, page) => ({
  method: 'searchListingTypeSub', currentPageSize: String(PAGE), pageIndex: String(page),
  orderMode: '1', orderStat: 'D', forward: 'listingtype_sub',
  // listTypeArrStr: 01 신규상장, 02 이전상장(KIND 상장유형 체크박스 값)
  listTypeArrStr: '01|02|', choicTypeArrStr: '', secuGrpArrStr: '0|ST|FS|MF|SC|RT|IF|DR|',
  marketType: mkt, fromDate: FROM, toDate: TO,
  searchCodeType: '', searchCorpName: '', searchCorpNameTmp: '', country: '', industry: '',
  repMajAgntDesignAdvserComp: '', repMajAgntComp: '', designAdvserComp: '', repIsuSrtCd: '', isurCd: '',
})

// 파이프라인에 포함할 상장유형 — 코넥스 기업의 코스닥 이전상장(예: 진코스텍 2026-10-15)도 공모를 거치므로 포함
const LIST_TYPES = /신규상장|이전상장/

// 공모 단계와 상장 단계의 회사명이 다른 경우(예: 공모 '씨메스로보틱스' → 상장 '씨메스') 한 행으로 합친다.
// 조건: 같은 시장, 상장예정일 = 상장일, 이름 앞 2글자 일치(또는 한쪽이 다른 쪽을 포함). 후보가 하나일 때만 합친다.
function reconcileNames(map) {
  const listed = [...map.values()].filter((r) => r.상장일)
  for (const [key, r] of map) {
    if (r.상장일 || !r.상장예정일) continue
    const cands = listed.filter((x) => x.시장 === r.시장 && x.상장일 === r.상장예정일 && x !== r &&
      (x.회사명.slice(0, 2) === r.회사명.slice(0, 2) || x.회사명.includes(r.회사명) || r.회사명.includes(x.회사명)))
    if (cands.length !== 1) continue
    const t = cands[0]
    for (const k in r) if (r[k] && !t[k]) t[k] = r[k]
    t.회사명 = t.회사명 // 상장 시점 이름을 유지
    if (r.회사명 !== t.회사명) t.공모명 = r.회사명
    map.delete(key)
  }
}

// ---------- 병합 ----------
function main2(map, 회사명, 시장, patch) {
  if (!회사명) return
  const key = 회사명 + '@' + 시장
  const cur = map.get(key) || { 회사명, 시장 }
  for (const k in patch) if (patch[k] && !cur[k]) cur[k] = patch[k]
  map.set(key, cur)
}

async function main() {
  const map = new Map()
  for (const m of MARKETS) {
    // 예비심사: [회사명, 상장유형, 청구일, 승인일, 심사상태, 주관사]
    for (const c of await crawl('listinvstgcom.do', preParams, m)) {
      if (c[1] && !LIST_TYPES.test(c[1])) continue // 신규상장·이전상장(코넥스→코스닥 등)만
      main2(map, c[0], m.name, { 청구일: dateOf(c[2]), 승인일: dateOf(c[3]), 심사상태: c[4] || '', 주관사: c[5] || '' })
    }
    // 공모기업현황: [회사명, 신고서제출일, 수요예측, 청약, 납입일, 확정공모가, 공모금액, 상장예정일, 주관사]
    for (const c of await crawl('pubofrprogcom.do', ofrParams, m)) {
      const 수요 = rangeOf(c[2]) || {}, 청약 = rangeOf(c[3]) || {}
      main2(map, c[0], m.name, {
        신고서제출일: dateOf(c[1]), 수요예측시작: 수요.start || '', 수요예측종료: 수요.end || '',
        청약시작: 청약.start || '', 청약종료: 청약.end || '', 납입일: dateOf(c[4]),
        확정공모가: c[5] || '', 공모금액: c[6] || '', 상장예정일: dateOf(c[7]), 주관사: c[8] || '',
      })
    }
    // 신규상장: [회사명, 상장일, 상장유형, 증권구분, 업종, 국적, 주관사]
    for (const c of await crawl('listingcompany.do', lstParams, m)) {
      // 신규상장·이전상장. 그 밖의 유형이라도 이미 공모 일정이 잡힌 회사면 상장일을 채운다(상장예정일만 남아 '예정'으로 보이는 문제 방지)
      if (c[2] && !LIST_TYPES.test(c[2]) && !map.has(c[0] + '@' + m.name)) continue
      main2(map, c[0], m.name, { 상장일: dateOf(c[1]), 업종: c[4] || '', 주관사: c[6] || '' })
    }
  }

  reconcileNames(map)
  const items = [...map.values()].sort((a, b) => {
    const da = a.상장일 || a.상장예정일 || a.청약시작 || a.신고서제출일 || a.청구일 || ''
    const db = b.상장일 || b.상장예정일 || b.청약시작 || b.신고서제출일 || b.청구일 || ''
    return db.localeCompare(da) // 최신순
  })
  const payload = { generated_at: new Date().toISOString(), source: 'KIND (kind.krx.co.kr)', from: FROM, count: items.length, items }
  await mkdir('public/data', { recursive: true })
  await writeFile('public/data/ipo.json', JSON.stringify(payload))
  console.log(`IPO ${items.length}종목 저장 (${FROM}~${TO})`)
  if (!items.length) process.exitCode = 1
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
