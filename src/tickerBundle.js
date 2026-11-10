// 국내 상장 전체 종목 목록(tickers-kr.json)을 1회 로드해 로컬 검색에 사용.
// 원격 검색 API가 느리거나 실패해도, 모든 국내 종목의 이름↔티커가 로컬에서 연동됨.
// 파일이 아직 없으면(크롤러 미실행) 조용히 빈 목록 — 내장 60종목 + 원격으로 폴백.

const norm = (s) => (s || '').normalize('NFC').replace(/\s+/g, '').toLowerCase()
let cache = null
let loading = null

export function loadTickerBundle() {
  if (cache) return Promise.resolve(cache)
  if (loading) return loading
  loading = fetch(`${import.meta.env.BASE_URL}data/tickers-kr.json`)
    .then((r) => (r.ok ? r.json() : []))
    .then((l) => { cache = Array.isArray(l) ? l : (l.items || []); return cache })
    .catch(() => { cache = []; return cache })
  return loading
}

export function searchBundle(q, limit = 12) {
  if (!cache) return []
  const k = norm(q)
  if (!k) return []
  const out = []
  for (const t of cache) {
    if (norm(t.name).includes(k) || String(t.code).includes(k)) {
      out.push({ name: t.name, code: t.code, market: t.market })
      if (out.length >= limit) break
    }
  }
  return out
}

export function lookupBundleByName(name) {
  if (!cache) return null
  const k = norm(name)
  const hit = cache.find((t) => norm(t.name) === k)
  return hit ? { name: hit.name, code: hit.code, market: hit.market } : null
}

export function lookupBundleByCode(code) {
  if (!cache) return null
  const k = norm(code)
  const hit = cache.find((t) => norm(t.code) === k)
  return hit ? { name: hit.name, code: hit.code, market: hit.market } : null
}
